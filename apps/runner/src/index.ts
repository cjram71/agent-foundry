import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import { Worker, UnrecoverableError } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { GitHubClient } from '@foundry/github';
import { transitionTask, emitTaskEvent, tryEmitTaskEvent } from '@foundry/state-machine';
import { ReviewerAgent } from './reviewer';
import { SandboxController } from './sandbox';
import { runValidationPipeline, deriveValidationPlan, ValidationStageError } from './validation';
import { parseRepairBudget, buildCoderPrompt, buildRepairPrompt, ReviewRejectedError } from './repair';
import { applyChanges, validateCoderResult, SecurityViolationError, SAFE_EXTENSIONS, BLOCKED_NAMES } from './coder';
import { createStopSupervisor, deferJobWhileStopped, parseWedgeTimeoutMinutes, WEDGEABLE_STATES } from '@foundry/ops';
import { estimateUsd, parseRatePerMillion, RATE_ENV } from '@foundry/cost';
import { generateRouted } from './model-routing';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../packages/database/.env') });

const prisma = new PrismaClient();
if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required to connect to Redis (no host/port fallback is used).');
const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const MAX_CONTEXT_BYTES = 24_000;
const MAX_FILE_BYTES = 80_000;
const CODER_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    changes: { type: 'array', minItems: 1, maxItems: 20, items: {
      type: 'object',
      properties: { path: { type: 'string' }, edits: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', properties: { find: { type: 'string' }, replace: { type: 'string' } }, required: ['find', 'replace'], additionalProperties: false } }, reason: { type: 'string' } },
      required: ['path', 'edits', 'reason'],
      additionalProperties: false,
    } },
    validationNotes: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'changes', 'validationNotes'],
  additionalProperties: false,
} as const;

async function repositoryContext(root: string, preferredFiles: string[] = []): Promise<string> {
  const preferred = new Set(preferredFiles.map(value => value.replace(/\\/g, '/')));
  const chunks: string[] = []; let used = 0;
  async function walk(directory: string) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a,b) => {
      const aPath = path.relative(root, path.join(directory, a.name)).replace(/\\/g,'/');
      const bPath = path.relative(root, path.join(directory, b.name)).replace(/\\/g,'/');
      return Number(preferred.has(bPath)) - Number(preferred.has(aPath)) || a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (used >= MAX_CONTEXT_BYTES) return;
      if (['.git','node_modules','.next','dist','coverage'].includes(entry.name) || BLOCKED_NAMES.has(entry.name) || entry.name.startsWith('.env')) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) { await walk(absolute); continue; }
      if (!entry.isFile()) continue;
      const relative = path.relative(root, absolute).replace(/\\/g,'/');
      const basename = path.posix.basename(relative);
      if (!SAFE_EXTENSIONS.has(path.extname(entry.name)) && !['Dockerfile','Procfile'].includes(basename)) continue;
      const stat = await fs.stat(absolute); if (stat.size > MAX_FILE_BYTES) continue;
      const content = (await fs.readFile(absolute, 'utf8'))
        .replace(/AIzaSy[0-9A-Za-z_-]{33}/g, '[REDACTED_API_KEY]')
        .replace(/(?:ghp|github_pat)_[0-9A-Za-z_]{20,}/g, '[REDACTED_GITHUB_TOKEN]')
        .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
        .replace(/((?:password|secret|api[_-]?key|token)\s*[:=]\s*["'])[^"]{8,}(["'])/gi, '$1[REDACTED]$2');
      const block = `\n--- FILE ${relative} ---\n${content}\n`;
      if (used + Buffer.byteLength(block) > MAX_CONTEXT_BYTES) return;
      chunks.push(block); used += Buffer.byteLength(block);
    }
  }
  await walk(root);
  return chunks.join('');
}

async function executeTask(taskId: string, jobId: string | undefined) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { project: true, approvals: true, agentRuns: { orderBy: { createdAt: 'desc' } } } });
  if (!task) throw new UnrecoverableError(`Task ${taskId} not found`);
  if (!task.project.authorisedStatus) throw new UnrecoverableError('Project is not authorised');
  // Duplicate/redelivery tolerance: only QUEUED tasks hold unconsumed
  // execution work. Any other state means a prior delivery is processing or
  // a human moved the task on — clean completion, never an error (P5 made
  // mid-run re-entry dangerous: it would have failed a healthy attempt).
  if (task.state !== 'QUEUED') {
    await prisma.auditEvent.create({ data: { actor: 'runner', action: 'queue.duplicate_execution_skipped', target: task.id, result: 'success', metadata: { jobId, state: task.state } } }).catch(() => {});
    return { skipped: true, state: task.state };
  }
  if (!task.approvals.some(a => a.approvalType === 'plan' && a.decision === 'approved')) throw new UnrecoverableError('Task is not approved and queued');
  const planner = task.agentRuns.find(run => run.role === 'planner' && run.status === 'success' && run.outputSummary);
  if (!planner?.outputSummary) throw new UnrecoverableError('Approved task has no valid planner output');
  const allowed = new Set((await prisma.project.findMany({ where: { authorisedStatus: true }, select: { githubOwner: true, githubRepo: true } })).map(project => `${project.githubOwner}/${project.githubRepo}`));
  const github = new GitHubClient(allowed);
  const repository = { owner: task.project.githubOwner, repo: task.project.githubRepo };
  const run = await prisma.agentRun.create({ data: { taskId, provider: 'policy', model: 'pending', role: 'coder', promptHash: 'pending', status: 'running' } });
  let repoPath = ''; let branchName = ''; let headOwner = '';
  let repairCycle = 0;
  const attempt = await prisma.$transaction(async tx => {
    const previous = await tx.taskAttempt.count({ where: { taskId } });
    const correlationId = jobId || `execute-${taskId}-${Date.now()}`;
    const createdAttempt = await tx.taskAttempt.create({ data: { taskId, attemptNumber: previous + 1, correlationId } });
    await tx.task.update({ where: { id: taskId }, data: { currentAttemptId: createdAttempt.id } });
    await emitTaskEvent(tx, { taskId, type: 'execution_started', actor: 'runner', actorType: 'worker', attemptId: createdAttempt.id, correlationId, payload: { attemptNumber: previous + 1 } });
    return createdAttempt;
  });
  const transition = (to: Parameters<typeof transitionTask>[1]['to'], options: Pick<Parameters<typeof transitionTask>[1], 'reason' | 'legacyStatus' | 'extraTaskData' | 'metadata' | 'expectCurrentAttemptId'> = {}) =>
    transitionTask(prisma, {
      taskId, to, actor: 'runner', actorType: 'worker',
      attemptId: attempt.id, correlationId: jobId,
      expectCurrentAttemptId: attempt.id,
      ...options,
    });
  try {
    await transition('RUNNING', { reason: 'execution started', legacyStatus: 'coding' });
    ({ repoPath, branchName, headOwner } = await github.prepareWorkspace(taskId, repository, task.project.defaultBranch));
    await prisma.$transaction([
      prisma.task.update({ where: { id: taskId }, data: { branchName } }),
      prisma.taskAttempt.update({ where: { id: attempt.id }, data: { branchName, workspacePath: repoPath } }),
    ]);
    const plannedFiles = (() => {
      try {
        const value = JSON.parse(planner.outputSummary || '{}') as { steps?: Array<{ files?: unknown }> };
        return (value.steps || []).flatMap(step => Array.isArray(step.files) ? step.files : []).filter((file): file is string => typeof file === 'string' && !/[*?[]]/.test(file)).slice(0, 8);
      } catch { return [] as string[]; }
    })();
    const context = await repositoryContext(repoPath, plannedFiles);
    // P12 human loop: after "request changes" + resubmit, the newest note is
    // injected into the coder prompt (bounded in the builder), addressing the
    // same approved plan instead of restarting planning.
    const latestChangeNote = task.approvals
      .filter(approval => approval.approvalType === 'merge' && approval.decision === 'changes_requested' && approval.comments)
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0]?.comments || undefined;
    const promptParts = { repository: `${task.project.githubOwner}/${task.project.githubRepo}`, title: task.title, instruction: task.completeInstruction, planSummary: planner.outputSummary, context, humanFeedback: latestChangeNote };
    const repairBudget = parseRepairBudget(process.env.MAX_REPAIR_ATTEMPTS);
    const changedPaths = new Set<string>();
    const validationPlan = await deriveValidationPlan(repoPath);
    const commands = validationPlan.commands;
    const sandbox = new SandboxController();

    // One coder invocation per cycle: cycle 0 builds, later cycles repair a
    // specific failure. Every cycle is validated by the same bounds; the
    // latest cycle's summary is what ships in the draft PR.
    const runCoder = async (basePrompt: string, cycle: number): Promise<{ summary: string; tokens: number }> => {
      let prompt = basePrompt;
      let totalTokens = 0;
      for (let formatAttempt = 0; formatAttempt < 2; formatAttempt += 1) {
        const response = await generateRouted(prisma, taskId, 'coder', prompt, { jsonSchema: CODER_JSON_SCHEMA });
        totalTokens += response.totalTokens;
        try {
          const text = response.text?.trim(); if (!text) throw new Error('Coder returned no changes');
          const parsed = validateCoderResult(JSON.parse(text));
          await applyChanges(repoPath, parsed.changes);
          for (const change of parsed.changes) changedPaths.add(change.path);
          await prisma.agentRun.update({ where: { id: run.id }, data: { provider: response.provider, model: response.model, promptHash: createHash('sha256').update(basePrompt).digest('hex'), tokenUsage: { increment: totalTokens }, outputSummary: parsed.summary } });
          await tryEmitTaskEvent(prisma, { taskId, type: 'code_generated', actor: 'runner', actorType: 'worker', attemptId: attempt.id, correlationId: jobId, payload: { provider: response.provider, model: response.model, files: parsed.changes.length, repairCycle: cycle, formatAttempts: formatAttempt + 1 } });
          return { summary: parsed.summary, tokens: totalTokens };
        } catch (error) {
          if (error instanceof SecurityViolationError || formatAttempt === 1) throw error;
          const detail = error instanceof Error ? error.message.slice(0, 500) : 'invalid response';
          prompt = `${basePrompt}

Your previous response could not be applied: ${detail}. Return the complete result again as schema-valid JSON only. For an ambiguous or missing exact edit, copy a longer unique find string verbatim from the repository context. Do not use Markdown fences or full-file rewrites.`;
        }
      }
      throw new Error('Coder failed to produce schema-valid JSON');
    };

    let { summary: changeSummary, tokens: cycleTokens } = await runCoder(buildCoderPrompt(promptParts), 0);

    // P11 bounded repair loop (docs/REPAIR.md): validation failures route
    // VALIDATING -> REPAIRING -> VALIDATING, review rejections route
    // REVIEWING -> REPAIRING -> VALIDATING. Infrastructure failures and
    // exhausted budgets are terminal (ValidationStageError carries the report
    // to the catch block). The budget is enforced here, deterministically —
    // never by the model.
    let reviewFeedback = '';
    for (;;) {
      await transition('VALIDATING', { reason: repairCycle ? `repair cycle ${repairCycle}: validating revised changes` : 'coder returned changes; running validation', legacyStatus: 'testing', extraTaskData: { tokenUsage: { increment: cycleTokens } } });
      await tryEmitTaskEvent(prisma, { taskId, type: 'validation_started', actor: 'runner', actorType: 'worker', attemptId: attempt.id, correlationId: jobId, payload: { repairCycle } });
      const report = await runValidationPipeline({ sandbox, taskId, repoPath, commands: commands.slice(0, -1), install: validationPlan.install });
      if (!report.ok) {
        const failedStage = report.failedStage!;
        await tryEmitTaskEvent(prisma, { taskId, type: 'validation_failed', actor: 'runner', actorType: 'worker', attemptId: attempt.id, correlationId: jobId, payload: { stage: failedStage.stage, command: failedStage.command, exitCode: failedStage.exitCode, durationMs: failedStage.durationMs, repairCycle } });
        if (failedStage.infraFailure || repairCycle >= repairBudget) throw new ValidationStageError(report, failedStage);
        repairCycle += 1;
        await transition('REPAIRING', { reason: `validation failed at ${failedStage.stage} (exit ${failedStage.exitCode}); repair cycle ${repairCycle}/${repairBudget}`, legacyStatus: 'testing', metadata: { stage: failedStage.stage, command: failedStage.command, repairCycle, repairBudget } });
        await prisma.auditEvent.create({ data: { actor: 'runner', action: 'task.repair_attempted', target: taskId, result: 'started', metadata: { jobId, cycle: repairCycle, budget: repairBudget, stage: failedStage.stage, command: failedStage.command, exitCode: failedStage.exitCode } } });
        ({ summary: changeSummary, tokens: cycleTokens } = await runCoder(buildRepairPrompt({ ...promptParts, previousSummary: changeSummary, failureStage: failedStage.stage, feedback: failedStage.outputTail, cycle: repairCycle, budget: repairBudget }), repairCycle));
        continue;
      }
      const diff = await github.getDiff(repoPath, [...changedPaths]);
      if (!diff.trim()) throw new Error('Coding agent produced no diff');
      await tryEmitTaskEvent(prisma, { taskId, type: 'validation_passed', actor: 'runner', actorType: 'worker', attemptId: attempt.id, correlationId: jobId, payload: { commands: commands.map(command => `${command.executable} ${command.args.join(' ')}`), stages: report.stages.map(stage => ({ stage: stage.stage, command: stage.command, exitCode: stage.exitCode, durationMs: stage.durationMs })), repairCyclesCompleted: repairCycle } });
      await transition('REVIEWING', { reason: 'validation produced a diff; safety review starting', legacyStatus: 'reviewing' });
      await tryEmitTaskEvent(prisma, { taskId, type: 'review_started', actor: 'runner', actorType: 'worker', attemptId: attempt.id, correlationId: jobId, payload: { repairCycle } });
      const review = await new ReviewerAgent().reviewAndValidate(taskId, repoPath, commands[commands.length - 1], diff, { title: task.title, instruction: task.completeInstruction, planSummary: planner.outputSummary });
      if (!review.passed) {
        // Split reviews (P12): report exactly which lens(es) failed.
        const failedLenses = Object.entries(review.lenses).filter(([, verdict]) => verdict === false).map(([lens]) => lens);
        await tryEmitTaskEvent(prisma, { taskId, type: 'review_failed', actor: 'runner', actorType: 'worker', attemptId: attempt.id, correlationId: jobId, payload: { feedback: review.feedback.slice(0, 1000), failedLenses, repairCycle } });
        if (repairCycle >= repairBudget) throw new ReviewRejectedError(review.feedback);
        repairCycle += 1;
        await transition('REPAIRING', { reason: `safety review requested changes; repair cycle ${repairCycle}/${repairBudget}`, legacyStatus: 'testing', metadata: { stage: 'review', repairCycle, repairBudget } });
        await prisma.auditEvent.create({ data: { actor: 'runner', action: 'task.repair_attempted', target: taskId, result: 'started', metadata: { jobId, cycle: repairCycle, budget: repairBudget, stage: 'review' } } });
        ({ summary: changeSummary, tokens: cycleTokens } = await runCoder(buildRepairPrompt({ ...promptParts, previousSummary: changeSummary, failureStage: 'review', feedback: review.feedback, cycle: repairCycle, budget: repairBudget }), repairCycle));
        continue;
      }
      reviewFeedback = review.feedback;
      await tryEmitTaskEvent(prisma, { taskId, type: 'review_passed', actor: 'runner', actorType: 'worker', attemptId: attempt.id, correlationId: jobId, payload: { repairCycle } });
      break;
    }

    const commit = await github.commitTaskChanges(repoPath, [...changedPaths], task.title);
    await github.pushTaskBranch(repoPath, branchName);
    const pr = await github.createDraftPullRequest(repository, task.title, branchName, task.project.defaultBranch, `## What changed\n${changeSummary}\n\n## Why\n${task.completeInstruction}\n\n## Validation\n${commands.map(command => `- ${command.executable} ${command.args.join(' ')}`).join('\n')}\n\n## Review\n${reviewFeedback}\n\nThis pull request is a draft. Agent Foundry does not merge automatically.`, headOwner);
    // P13: the success path drives PR_CREATED before opening the final gate.
    // (Pre-P13 this committed a single REVIEWING -> AWAITING_APPROVAL jump
    // that the transition table never contained — transitionTask rejected
    // it, rolling back this whole transaction AFTER the PR was already open.
    // That is also why createDraftPullRequest is idempotent-by-branch now.)
    await prisma.$transaction(async tx => {
      await tx.agentRun.update({ where: { id: run.id }, data: { status: 'success', outputSummary: `${changeSummary}\n\n${reviewFeedback}` } });
      await transitionTask(tx, {
        taskId, to: 'PR_CREATED', actor: 'runner', actorType: 'worker',
        reason: 'draft pull request opened', legacyStatus: 'pull_request_open',
        attemptId: attempt.id, correlationId: jobId, expectCurrentAttemptId: attempt.id,
        metadata: { pullRequestUrl: pr.url, branchName, commit },
        extraTaskData: { pullRequestUrl: pr.url },
      });
      await tx.taskAttempt.update({ where: { id: attempt.id }, data: { status: 'succeeded', endedAt: new Date(), commitSha: commit, outcomeSummary: `Draft PR ${pr.url}` } });
      await emitTaskEvent(tx, { taskId, type: 'draft_pr_opened', actor: 'runner', actorType: 'worker', attemptId: attempt.id, correlationId: jobId, payload: { pullRequestUrl: pr.url, branchName, commit } });
      // The PREVIEW states are intentionally skipped: no preview/provisioning
      // infrastructure exists in the beta (docs/GITHUB-IDEMPOTENCY.md), and
      // the table allows PR_CREATED -> AWAITING_APPROVAL directly.
      await transitionTask(tx, {
        taskId, to: 'AWAITING_APPROVAL', actor: 'runner', actorType: 'worker',
        reason: 'final merge gate opened', legacyStatus: 'awaiting_human_review',
        attemptId: attempt.id, correlationId: jobId, expectCurrentAttemptId: attempt.id,
        metadata: { gate: 'merge', pullRequestUrl: pr.url },
      });
      await tx.approval.create({ data: { taskId, approvalType: 'merge' } });
      await emitTaskEvent(tx, { taskId, type: 'final_approval_requested', actor: 'runner', actorType: 'worker', attemptId: attempt.id, correlationId: jobId, payload: { gate: 'merge', pullRequestUrl: pr.url } });
      await tx.auditEvent.create({ data: { actor: 'runner', action: 'task.draft_pr_opened', target: taskId, result: 'success', metadata: { jobId, branchName, commit, pullRequestUrl: pr.url, automaticMerge: false } } });
    });
    await persistCostEstimate(taskId).catch(() => {});
    return { pullRequestUrl: pr.url, branchName, commit };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0,4000) : 'Unknown runner error';
    // P11 terminal routing (docs/REPAIR.md): a validation failure with the
    // repair budget exhausted (or zero) lands in CODE_FAILED; sandbox
    // machinery failures (image, daemon, spawn — never payload behavior)
    // land in INFRASTRUCTURE_FAILED; an exhausted review rejection lands in
    // FAILED with stage 'review' (the transition table has no
    // REVIEWING -> CODE_FAILED edge by design).
    let terminalState: 'FAILED' | 'CODE_FAILED' | 'INFRASTRUCTURE_FAILED' | 'SECURITY_BLOCKED' = 'FAILED';
    let failureStage = repoPath ? 'workspace' : 'setup';
    let failureKind: 'code' | 'infrastructure' | 'security' | 'unknown' = 'unknown';
    if (error instanceof ValidationStageError) {
      failureStage = `validation:${error.failingStage.stage}`;
      if (error.failingStage.infraFailure) {
        terminalState = 'INFRASTRUCTURE_FAILED';
        failureKind = 'infrastructure';
      } else {
        terminalState = 'CODE_FAILED';
        failureKind = 'code';
      }
    } else if (error instanceof ReviewRejectedError) {
      failureStage = 'review';
      failureKind = 'code';
    } else if (error instanceof SecurityViolationError) {
      // P16 (docs/THREAT-MODEL.md): a DETERMINISTIC violation of the coder
      // output invariants — protected file targeted, invalid/escaping path,
      // disallowed file class, symlink overwrite — quarantines the task in
      // SECURITY_BLOCKED instead of ordinary failure. No model verdict ever
      // lands here; SECURITY_BLOCKED is reserved for proof-grade signals so
      // the operator knows a blocked task needs investigation, not a retry.
      terminalState = 'SECURITY_BLOCKED';
      failureStage = 'coder_output';
      failureKind = 'security';
    }
    await prisma.$transaction(async tx => {
      await tx.agentRun.update({ where: { id: run.id }, data: { status: 'failed', errorInfo: message } });
      try {
        await transitionTask(tx, {
          taskId, to: terminalState, actor: 'runner', actorType: 'worker',
          reason: message.slice(0, 500), legacyStatus: 'failed',
          attemptId: attempt.id, correlationId: jobId,
        });
      } catch {
        // A concurrent controller may already hold the task (e.g. a human
        // cancellation); the machine has logged the rejection/conflict and
        // the task was left in its authoritative state. The failure is
        // still recorded on the attempt and agent run below.
      }
      await tx.taskAttempt.update({ where: { id: attempt.id }, data: { status: 'failed', endedAt: new Date(), outcomeSummary: `repair cycles completed: ${repairCycle}. ${message}`.slice(0, 1000) } });
      await emitTaskEvent(tx, { taskId, type: 'task_failed', actor: 'runner', actorType: 'worker', attemptId: attempt.id, correlationId: jobId, payload: { stage: failureStage, kind: failureKind, repairCycles: repairCycle, error: message.slice(0, 1000) } });
      await tx.auditEvent.create({ data: { actor: 'runner', action: 'task.execution_failed', target: taskId, result: 'failed', metadata: { jobId, stage: failureStage, kind: failureKind, repairCycles: repairCycle } } });
    });
    await persistCostEstimate(taskId).catch(() => {});
    throw error;
  }
}

/**
 * P14 wedge sweeper (docs/OPERATIONS.md): BullMQ cannot recover an
 * attempts:1 execution job whose process died mid-flight — the job is
 * marked stalled/failed while the task stays in an active state forever.
 * Anything silent past WEDGE_TIMEOUT_MINUTES is recovered to
 * INFRASTRUCTURE_FAILED. transitionTask's conditional update makes the
 * sweep safe against a racing live worker; QUEUED/PLANNING are never
 * swept (their jobs are durable and a restarted worker resumes them).
 */
async function sweepWedgedTasks(now = new Date()): Promise<number> {
  const timeoutMs = parseWedgeTimeoutMinutes(process.env.WEDGE_TIMEOUT_MINUTES) * 60_000;
  const cutoff = new Date(now.getTime() - timeoutMs);
  const stuck = await prisma.task.findMany({
    where: { state: { in: [...WEDGEABLE_STATES] }, updatedAt: { lt: cutoff } },
    select: { id: true, state: true, updatedAt: true, currentAttemptId: true },
    take: 25,
  });
  let recovered = 0;
  for (const task of stuck) {
    try {
      await prisma.$transaction(async tx => {
        await transitionTask(tx, {
          taskId: task.id, to: 'INFRASTRUCTURE_FAILED', actor: 'wedge-sweeper', actorType: 'system',
          reason: `wedged in ${task.state}: no state progress for over ${Math.round(timeoutMs / 60000)} minutes (worker presumed dead)`, legacyStatus: 'failed',
          metadata: { wedgedState: task.state , staleMinutes: Math.round((now.getTime() - task.updatedAt.getTime()) / 60000) },
        });
        if (task.currentAttemptId) await tx.taskAttempt.updateMany({ where: { id: task.currentAttemptId, status: 'running' }, data: { status: 'failed', endedAt: now, outcomeSummary: 'Recovered by the wedge sweeper after the worker stopped making progress' } });
        await emitTaskEvent(tx, { taskId: task.id, type: 'task_failed', actor: 'wedge-sweeper', actorType: 'system', payload: { stage: 'sweep', kind: 'infrastructure', wedgedState: task.state } });
        await tx.auditEvent.create({ data: { actor: 'wedge-sweeper', action: 'task.wedge_recovered', target: task.id, result: 'success', metadata: { wedgedState: task.state } } });
      });
      recovered += 1;
      console.warn(`[Sweeper] recovered wedged task ${task.id} (was ${task.state})`);
    } catch (error) {
      // A live worker moved the task between the query and the sweep — the
      // machine records the conflict; nothing to do.
      console.warn(`[Sweeper] skipped ${task.id}:`, error instanceof Error ? error.message : error);
    }
  }
  return recovered;
}

/** P14 cost accounting: persist the priced-token estimate at terminal
 *  points. Unset rate persists $0 by design (accounting without teeth —
 *  the health endpoint surfaces the missing configuration). */
async function persistCostEstimate(taskId: string): Promise<void> {
  const rate = parseRatePerMillion(process.env[RATE_ENV]);
  const sum = await prisma.agentRun.aggregate({ _sum: { tokenUsage: true }, where: { taskId, provider: 'google' } });
  await prisma.task.update({ where: { id: taskId }, data: { estimatedCost: estimateUsd(sum._sum.tokenUsage ?? 0, rate) } });
}

const worker = new Worker('foundry-execution', async job => {
  if (job.data.action !== 'execute' || typeof job.data.taskId !== 'string') throw new UnrecoverableError('Unsupported execution job');
  // Emergency stop (P14): re-park instead of executing when the flag is
  // set. Check/deferral failures propagate (fail-closed inside deferJobWhileStopped).
  if (await deferJobWhileStopped(connection, job)) {
    console.log(`[Execution ${job.id}] deferred: emergency stop is engaged`);
    return { deferred: true };
  }
  return executeTask(job.data.taskId, job.id);
}, { connection, concurrency: 1 });

// Stop supervisor pauses fetching (in-flight jobs always complete) and the
// wedge sweeper recovers mid-flight corpses. docs/OPERATIONS.md
createStopSupervisor({ store: connection, worker, log: (message) => console.log(message) }).start();
setInterval(() => { sweepWedgedTasks().catch((error) => console.warn('[Sweeper] sweep failed:', error instanceof Error ? error.message : error)); }, 10 * 60_000).unref();
void sweepWedgedTasks().catch(() => {});

worker.on('completed', job => console.log(`[Execution ${job?.id}] Draft PR ready.`));
worker.on('failed', (job, error) => {
  console.error(`[Execution ${job?.id}] Failed:`, error.message);
  // Dead-letter surface: no retries left -> exactly one queue-level marker.
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    prisma.auditEvent.create({
      data: {
        actor: 'runner', action: 'queue.job_exhausted', target: typeof job.data?.taskId === 'string' ? job.data.taskId : 'unknown',
        result: 'failed',
        metadata: { jobId: job.id, queue: 'foundry-execution', attempts: job.attemptsMade, error: (error instanceof Error ? error.message : 'unknown').slice(0, 500) },
      },
    }).catch(() => {});
  }
});
console.log('Runner listening on foundry-execution; automatic merge is disabled.');