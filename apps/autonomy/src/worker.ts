import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient, TaskState } from '@prisma/client';
import { buildTaskDrafts, parseManagerPlan } from '@foundry/manager';
import { classifyTaskRisk, asDeclaredRisk, evaluateAutonomy, isAutoApproveRisk, type AutonomyPolicyValues } from '@foundry/policy';
import { EMERGENCY_STOP_KEY } from '@foundry/ops';
import { emitTaskEvent, transitionTask } from '@foundry/state-machine';

const prisma = new PrismaClient();
const connection = process.env.REDIS_URL ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null }) : new IORedis({ host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD || undefined, maxRetriesPerRequest: null });
const planQueue = new Queue('foundry-tasks', { connection });
const executionQueue = new Queue('foundry-execution', { connection });
const activeStates: TaskState[] = ['QUEUED','PLANNING','RUNNING','VALIDATING','REVIEWING','REPAIRING'];

export function normalizeAutonomyPolicy(row: any): AutonomyPolicyValues {
  return {
    autonomousMode: row?.autonomousMode === true,
    autoApproveMaxRisk: isAutoApproveRisk(row?.autoApproveMaxRisk) ? row.autoApproveMaxRisk : 'medium',
    maxParallelTasks: Math.min(Math.max(row?.maxParallelTasks ?? 2, 1), 5),
    maxRepairAttempts: Math.min(Math.max(row?.maxRepairAttempts ?? 2, 0), 5),
    maxTasksPerRun: Math.min(Math.max(row?.maxTasksPerRun ?? 20, 1), 50),
    maxTaskCost: Math.min(Math.max(row?.maxTaskCost ?? 2, 0), 100),
    maxProjectRunCost: Math.min(Math.max(row?.maxProjectRunCost ?? 20, 0), 1000),
    createDraftPullRequests: row?.createDraftPullRequests !== false,
  };
}

async function enqueue(queue: Queue, name: string, action: string, taskId: string): Promise<void> {
  const jobId = `${action}-${taskId}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (!['completed','failed'].includes(state)) return;
    await existing.remove();
  }
  await queue.add(name, { action, taskId }, { jobId, attempts: action === 'plan' ? 3 : 1, removeOnComplete: 100, removeOnFail: 200 });
}

async function processManager(task: any, policyRow: any): Promise<void> {
  const plannerRun = task.agentRuns[0];
  const parsed = parseManagerPlan(plannerRun?.outputSummary ?? null);
  const policy = normalizeAutonomyPolicy(policyRow);
  const draftPlan = buildTaskDrafts({ parse: parsed, projectName: task.project.name, evaluationTaskId: task.id, policy: { maxTaskRisk: policyRow.maxTaskRisk, requirePlanApproval: false, requireMergeApproval: true } });
  const allowedDrafts = draftPlan.drafts.slice(0, policy.maxTasksPerRun);
  const createdIds: string[] = [];
  await prisma.$transaction(async tx => {
    await transitionTask(tx, { taskId: task.id, to: 'COMPLETED', actor: 'autonomy-controller', actorType: 'system', reason: 'bounded manager evaluation automatically accepted', legacyStatus: 'completed', extraTaskData: { completedAt: new Date(), assignedAgent: 'AI Project Manager' } });
    await tx.approval.updateMany({ where: { taskId: task.id, approvalType: 'plan', decision: 'pending' }, data: { decision: 'approved', approvedBy: 'autonomy-controller', approvedAt: new Date(), comments: 'Auto-approved bounded manager evaluation' } });
    await emitTaskEvent(tx, { taskId: task.id, type: 'plan_approved', actor: 'autonomy-controller', actorType: 'system', payload: { gate: 'plan', autonomous: true, evaluationOnly: true } });
    await emitTaskEvent(tx, { taskId: task.id, type: 'task_completed', actor: 'autonomy-controller', actorType: 'system', payload: { via: 'autonomous_manager_evaluation' } });
    for (const draft of allowedDrafts) {
      const created = await tx.task.create({ data: { projectId: task.projectId, projectRunId: task.projectRunId, title: draft.title, completeInstruction: draft.completeInstruction, riskLevel: draft.effectiveRisk } });
      createdIds.push(created.id);
      await emitTaskEvent(tx, { taskId: created.id, type: 'task_created', actor: 'autonomy-controller', actorType: 'system', payload: { projectRunId: task.projectRunId, evaluationTaskId: task.id } });
      await transitionTask(tx, { taskId: created.id, to: 'PLANNING', actor: 'autonomy-controller', actorType: 'system', reason: 'authorized autonomous project run', legacyStatus: 'planning', extraTaskData: { startedAt: new Date() } });
    }
    await tx.projectRun.update({ where: { id: task.projectRunId }, data: { tasksTotal: allowedDrafts.length } });
    await tx.auditEvent.create({ data: { actor: 'autonomy-controller', action: 'project_run.tasks_created', target: task.projectRunId, result: 'success', metadata: { evaluationTaskId: task.id, created: allowedDrafts.length, policySkipped: draftPlan.skipped.length, capped: draftPlan.drafts.length - allowedDrafts.length } } });
  });
  for (const id of createdIds) await enqueue(planQueue, 'plan', 'plan', id);
}

async function processTask(task: any, policyRow: any, emergencyStop: boolean): Promise<void> {
  const policy = normalizeAutonomyPolicy(policyRow);
  const risk = classifyTaskRisk({ declaredRisk: asDeclaredRisk(task.riskLevel), title: task.title, instruction: task.completeInstruction });
  const [tasksInRun, activeTasks, runCost, repairAttempts] = await Promise.all([
    prisma.task.count({ where: { projectRunId: task.projectRunId, NOT: { id: task.id } } }),
    prisma.task.count({ where: { projectRunId: task.projectRunId, state: { in: activeStates }, NOT: { id: task.id } } }),
    prisma.task.aggregate({ where: { projectRunId: task.projectRunId }, _sum: { estimatedCost: true } }),
    prisma.taskAttempt.count({ where: { taskId: task.id } }),
  ]);
  const decision = evaluateAutonomy(policy, { projectAuthorized: task.project.authorisedStatus, risk: risk.level, taskEstimatedCost: task.estimatedCost, runEstimatedCost: runCost._sum.estimatedCost ?? 0, tasksInRun, activeTasks, repairAttempts: Math.max(0, repairAttempts - 1), emergencyStop });
  if (decision.decision !== 'AUTO_APPROVE') return;
  await prisma.$transaction(async tx => {
    await transitionTask(tx, { taskId: task.id, to: 'QUEUED', actor: 'autonomy-controller', actorType: 'system', reason: decision.reason, legacyStatus: 'queued', extraTaskData: { assignedAgent: 'Agent Foundry Runner' } });
    await tx.approval.updateMany({ where: { taskId: task.id, approvalType: 'plan', decision: 'pending' }, data: { decision: 'approved', approvedBy: 'autonomy-controller', approvedAt: new Date(), comments: decision.reason } });
    await emitTaskEvent(tx, { taskId: task.id, type: 'plan_approved', actor: 'autonomy-controller', actorType: 'system', payload: { autonomous: true, risk: risk.level } });
    await tx.auditEvent.create({ data: { actor: 'autonomy-controller', action: 'task.plan_auto_approved', target: task.id, result: 'success', metadata: { projectRunId: task.projectRunId, risk: risk.level, reason: decision.reason, policyVersion: policyRow.version } } });
  });
  try { await enqueue(executionQueue, 'execute', 'execute', task.id); }
  catch (error) {
    await prisma.$transaction(async tx => {
      await transitionTask(tx, { taskId: task.id, to: 'AWAITING_APPROVAL', actor: 'autonomy-controller', actorType: 'system', reason: 'execution queue unavailable; automatic approval rolled back', legacyStatus: 'awaiting_plan_approval' });
      await tx.approval.updateMany({ where: { taskId: task.id, approvalType: 'plan', decision: 'approved', approvedBy: 'autonomy-controller' }, data: { decision: 'pending', approvedBy: null, approvedAt: null } });
    });
    throw error;
  }
}

function planEvidence(task: any) {
  const planner = task.agentRuns.find((run: any) => run.role === 'planner' && run.status === 'success');
  try { const parsed = JSON.parse(planner?.outputSummary ?? '{}'); return { planSummary: typeof parsed.summary === 'string' ? parsed.summary : null, planSteps: Array.isArray(parsed.steps) ? parsed.steps.slice(0, 12).map((step: any) => ({ order: step.order, title: step.title, description: step.description, validation: step.validation })) : [] }; } catch { return { planSummary: null, planSteps: [] }; }
}

export function buildRunReport(run: any, tasks: any[]) {
  const work = tasks.filter(task => !task.title.startsWith('AI Project Manager Evaluation'));
  const completed = work.filter(task => task.state === 'COMPLETED').length;
  const failed = work.filter(task => ['FAILED','SECURITY_BLOCKED','INFRASTRUCTURE_FAILED','CODE_FAILED','REJECTED','CANCELLED'].includes(task.state)).length;
  const awaitingHuman = work.filter(task => task.state === 'AWAITING_APPROVAL').length;
  const estimatedCost = work.reduce((sum, task) => sum + task.estimatedCost, 0);
  const recommendations = [
    ...(failed ? [`Review and repair ${failed} failed task(s) before merge.`] : []),
    ...(awaitingHuman ? [`Review ${awaitingHuman} draft pull request or approval gate(s).`] : []),
    ...(estimatedCost === 0 ? ['Configure model pricing to make cost reports enforceable.'] : []),
    'Merge only reviewed pull requests with passing GitHub checks.',
  ];
  return { generatedAt: new Date().toISOString(), projectRunId: run.id, objective: run.objective, summary: { total: work.length, completed, failed, awaitingHuman, estimatedCost }, tasks: work.map(task => ({ id: task.id, title: task.title, status: task.status, state: task.state, risk: task.riskLevel, branch: task.branchName, pullRequest: task.pullRequestUrl, preview: task.previewUrl, tokens: task.tokenUsage, estimatedCost: task.estimatedCost, agents: task.agentRuns.map((agent: any) => ({ role: agent.role, provider: agent.provider, model: agent.model, status: agent.status, tokens: agent.tokenUsage })), attempts: task.attempts.map((attempt: any) => ({ number: attempt.attemptNumber, status: attempt.status, commit: attempt.commitSha, outcome: attempt.outcomeSummary })), ...planEvidence(task) })), recommendations };
}

async function finalizeRuns(): Promise<void> {
  const runs = await prisma.projectRun.findMany({ where: { status: 'RUNNING' }, include: { tasks: { include: { agentRuns: true, attempts: true } } } });
  for (const run of runs) {
    const work = run.tasks.filter(task => !task.title.startsWith('AI Project Manager Evaluation'));
    if (run.tasks.some(task => activeStates.includes(task.state))) continue;
    const report = buildRunReport(run, run.tasks);
    await prisma.projectRun.update({ where: { id: run.id }, data: { status: 'READY_FOR_REVIEW', report, recommendations: report.recommendations, tasksTotal: report.summary.total, tasksCompleted: report.summary.completed, tasksFailed: report.summary.failed, estimatedCost: report.summary.estimatedCost, finishedAt: new Date() } });
    await prisma.auditEvent.create({ data: { actor: 'autonomy-controller', action: 'project_run.ready_for_review', target: run.id, result: 'success', metadata: report.summary } });
  }
}

async function tick(): Promise<void> {
  const emergencyStop = (await connection.get(EMERGENCY_STOP_KEY)) != null;
  if (emergencyStop) return;
  const tasks = await prisma.task.findMany({ where: { projectRunId: { not: null }, state: 'AWAITING_APPROVAL', approvals: { some: { approvalType: 'plan', decision: 'pending' } } }, include: { project: { include: { policies: { where: { active: true }, take: 1 } } }, projectRun: { select: { executionApprovedAt: true } }, agentRuns: { where: { role: 'planner', status: 'success' }, orderBy: { createdAt: 'desc' }, take: 1 } }, take: 10, orderBy: { createdAt: 'asc' } });
  for (const task of tasks) {
    const policy = task.project.policies[0];
    if (!policy?.autonomousMode) continue;
    if (task.title.startsWith('AI Project Manager Evaluation')) await processManager(task, policy);
    else if (task.projectRun?.executionApprovedAt) await processTask(task, policy, emergencyStop);
  }
  await finalizeRuns();
}

if (require.main === module) {
  setInterval(() => tick().catch(error => console.error('[autonomy] tick failed', error instanceof Error ? error.message : error)), 15_000).unref();
  void tick();
  console.log('Autonomy controller active; RED remains human-only and automatic merge is disabled.');
}
