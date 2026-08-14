import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import prisma from '@/lib/prisma';
import { getSession, isSameOrigin } from '@/lib/auth';
import { enqueueAgentExecution, enqueueExecution, enqueuePlan, getTaskQueue, getExecutionQueue, getAgentQueue } from '@/lib/queue';
import { transitionTask, emitTaskEvent, isValidTransition } from '@foundry/state-machine';
import { classifyTaskRisk, evaluateTaskAgainstPolicy, asDeclaredRisk } from '@foundry/policy';
import { parseManagerPlan, buildTaskDrafts } from '@foundry/manager';
import { loadActivePolicy } from '@/lib/policy';
import { parseChangeRequestNote } from '@/lib/change-request';
import { checkSpendGuard } from '@/lib/cost';
import { BOOSTA_COMPANY_ID } from '@/lib/company';
import { planJobId, executeJobId } from '@/lib/queue-policy';
type PullRequestStatus = { state: string; mergedAt: string | null; isDraft: boolean; statusCheckRollup: Array<{ status?: string; conclusion?: string; state?: string }> };
function runGitHub(args: string[]): Promise<string> { return new Promise((resolve,reject)=>{const child=spawn('gh',args,{shell:false,windowsHide:true,env:{...process.env,GH_PROMPT_DISABLED:'1'},stdio:['ignore','pipe','pipe'],timeout:30000});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c.toString());child.stderr.on('data',c=>stderr+=c.toString());child.on('error',reject);child.on('close',code=>code===0?resolve(stdout):reject(new Error(stderr.slice(0,500))));}); }
async function readPullRequestStatus(url:string,owner:string,repo:string){const match=/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/.exec(url);if(!match||match[1].toLowerCase()!==owner.toLowerCase()||match[2].toLowerCase()!==repo.toLowerCase())throw new Error('PR repository mismatch');const output=await runGitHub(['pr','view',match[3],'--repo',`${owner}/${repo}`,'--json','state,mergedAt,isDraft,statusCheckRollup']);const pr=JSON.parse(output) as PullRequestStatus;const checks=pr.statusCheckRollup||[];const failed=checks.filter(c=>['FAILURE','ERROR','CANCELLED','TIMED_OUT','ACTION_REQUIRED'].includes(c.conclusion||c.state||'')).length;const pending=checks.filter(c=>['QUEUED','IN_PROGRESS','PENDING','EXPECTED'].includes(c.status||c.state||'')).length;return{state:pr.state,mergedAt:pr.mergedAt,isDraft:pr.isDraft,checks:{total:checks.length,failed,pending,passed:Math.max(0,checks.length-failed-pending)}};}

async function authorize(request: Request) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'ADMIN') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (!isSameOrigin(request)) return { error: NextResponse.json({ error: 'Invalid origin' }, { status: 403 }) };
  return { session };
}
async function projectAgentFor(task: { projectId: string; assignedAgent: string | null }) {
  if (!task.assignedAgent) return null;
  return prisma.projectAgent.findFirst({
    where: { projectId: task.projectId, status: { in: ['supervised', 'certified'] }, agentVersion: { agentId: task.assignedAgent } },
    include: { agentVersion: true },
  });
}


export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request); if (auth.error) return auth.error;
  const { id } = await params; const body = await request.json();
  const current = await prisma.task.findFirst({ where: { id, project: { companyId: BOOSTA_COMPANY_ID } }, include: { project: true } });
  if (!current) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  if (body.action === 'check_status') {
    if (!current.pullRequestUrl) return NextResponse.json({ error: 'This task does not have a pull request yet.' }, { status: 409 });
    try {
      const repository = await readPullRequestStatus(current.pullRequestUrl, current.project.githubOwner, current.project.githubRepo); let status = current.status;
      // P13: completion on external merge is accepted only when the transition
      // table allows it from the CURRENT state (a terminal task — e.g. FAILED,
      // REJECTED — must not be resurrected by an out-of-band merge).
      if (repository.state === 'MERGED' && current.status !== 'completed' && isValidTransition(current.state, 'COMPLETED')) { await prisma.$transaction(async tx => { await transitionTask(tx, { taskId: id, to: 'COMPLETED', actor: 'task-checker', actorType: 'system', reason: 'pull request merged by a human on GitHub', legacyStatus: 'completed', metadata: { pullRequestUrl: current.pullRequestUrl }, extraTaskData: { completedAt: repository.mergedAt ? new Date(repository.mergedAt) : new Date() } }); await emitTaskEvent(tx, { taskId: id, type: 'task_completed', actor: 'task-checker', payload: { pullRequestUrl: current.pullRequestUrl, via: 'merge' } }); await tx.auditEvent.create({ data: { actor: 'task-checker', action: 'task.pull_request_merged', target: id, result: 'success', metadata: { pullRequestUrl: current.pullRequestUrl } } }); }); status = 'completed'; }
      const checkLabel = repository.checks.failed ? `${repository.checks.failed} checks failed` : repository.checks.pending ? `${repository.checks.pending} checks running` : repository.checks.total ? 'All checks passed' : 'No checks reported';
      return NextResponse.json({ status, repository, message: repository.state === 'MERGED' ? 'Pull request merged. Task marked completed.' : `${checkLabel}. Pull request is ${repository.isDraft ? 'draft' : repository.state.toLowerCase()}.` });
    } catch { return NextResponse.json({ error: 'GitHub status is temporarily unavailable. The task was not changed.' }, { status: 503 }); }
  }

  if (body.action === 'cancel_task') {
    // P14 cancellation driver: the machine decides which states are
    // cancellable (terminal states and APPROVED have no CANCELLED edge).

    if (!isValidTransition(current.state, 'CANCELLED')) return NextResponse.json({ error: `Task is already ${current.status.replaceAll('_', ' ')} and cannot be cancelled.` }, { status: 409 });
    const reason = typeof body.comments === 'string' && body.comments.trim() ? body.comments.trim().slice(0, 2000) : 'Cancelled by administrator';
    await prisma.$transaction(async tx => {
      await transitionTask(tx, { taskId: id, to: 'CANCELLED', actor: auth.session!.userId, actorType: 'human', reason: reason.slice(0, 300), legacyStatus: 'cancelled', metadata: { previousState: current.state } });
      await tx.approval.updateMany({ where: { taskId: id, decision: 'pending' }, data: { decision: 'cancelled', approvedBy: auth.session!.userId, approvedAt: new Date() } });
      await emitTaskEvent(tx, { taskId: id, type: 'task_cancelled', actor: auth.session!.userId, actorType: 'human', payload: { previousState: current.state } });
      await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: 'task.cancelled', target: id, result: 'success', metadata: { previousState: current.state } } });
    });
    // Best-effort aftermath, deliberately OUTSIDE the atomic state change:
    // drop any still-queued BullMQ jobs. Active sandbox cleanup is delegated
    // to the restricted Runner
    // broker; the dashboard intentionally has no Docker control.
    let removedJobs = 0;
    try { removedJobs += await getTaskQueue().remove(planJobId(id)); } catch { /* queue absent */ }
    try { removedJobs += await getExecutionQueue().remove(executeJobId(id)); } catch { /* queue absent */ }
    try { removedJobs += await getAgentQueue().remove(`agent-execute-${id}`); } catch { /* queue absent */ }
    return NextResponse.json({ message: `Task cancelled.${removedJobs ? ` Removed ${removedJobs} queued job(s).` : ''} Active sandbox cleanup is handled by the Runner boundary.` });
  }

  if (body.action === 'request_plan') {
    if (current.status !== 'draft' && current.status !== 'failed') return NextResponse.json({ error: `Task is already ${current.status.replaceAll('_', ' ')}.` }, { status: 409 });
    const planSpend = await checkSpendGuard(current.projectId);
    if (!planSpend.allowed) {
      await prisma.auditEvent.create({ data: { actor: auth.session!.userId, action: 'cost.spend_blocked', target: id, result: 'rejected', metadata: { stage: 'request_plan', spendUsd: planSpend.spendUsd, limitUsd: planSpend.limitUsd } } });
      return NextResponse.json({ error: planSpend.reason }, { status: 409 });
    }
    const projectAgent = await projectAgentFor(current);
    if (projectAgent) {
      const manifest = projectAgent.agentVersion.manifest as any;
      const contract = manifest.contract;
      if (!contract) return NextResponse.json({ error: 'The assigned agent does not have an Agent Contract v2.' }, { status: 409 });
      const plan = {
        summary: `Supervised ${manifest.name} run under Agent Contract v2`,
        steps: contract.operatingLoop.map((description: string, index: number) => ({ order: index + 1, description })),
        deliverables: contract.deliverables,
        selfChecks: contract.selfChecks,
        exclusions: contract.exclusions,
        limits: { maximumRuntimeMinutes: contract.maximumRuntimeMinutes, maximumToolCalls: contract.maximumToolCalls, memoryWriteMode: contract.memoryWriteMode },
      };
      await prisma.$transaction(async tx => {
        await transitionTask(tx, { taskId: id, to: 'PLANNING', actor: auth.session!.userId, actorType: 'human', reason: 'deterministic Agent Contract plan requested', legacyStatus: 'planning', extraTaskData: { startedAt: current.startedAt || new Date() } });
        await tx.agentRun.create({ data: { taskId: id, provider: 'policy', model: 'agent-contract-v2', role: 'planner', promptHash: projectAgent.agentVersion.checksum, status: 'success', outputSummary: JSON.stringify(plan) } });
        await transitionTask(tx, { taskId: id, to: 'AWAITING_APPROVAL', actor: 'agent-contract-compiler', actorType: 'system', reason: 'Agent Contract plan compiled', legacyStatus: 'awaiting_plan_approval' });
        await tx.approval.create({ data: { taskId: id, approvalType: 'plan' } });
        await emitTaskEvent(tx, { taskId: id, type: 'plan_generated', actor: 'agent-contract-compiler', actorType: 'system', payload: { agentId: manifest.id, deterministic: true, steps: plan.steps.length } });
        await emitTaskEvent(tx, { taskId: id, type: 'plan_approval_requested', actor: 'agent-contract-compiler', actorType: 'system', payload: { gate: 'plan' } });
        await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: 'agent_team.plan_compiled', target: id, result: 'success', metadata: { projectAgentId: projectAgent.id, agentId: manifest.id, version: manifest.version } } });
      });
      return NextResponse.json({ message: 'Agent Contract plan compiled. Review and approve it before the supervised run.' });
    }
    await transitionTask(prisma, { taskId: id, to: 'PLANNING', actor: auth.session!.userId, actorType: 'human', reason: 'plan requested', legacyStatus: 'planning', extraTaskData: { startedAt: current.startedAt || new Date() } });
    try {
      const { job, deduplicated } = await enqueuePlan(id);
      await prisma.auditEvent.create({ data: { actor: auth.session!.userId, action: 'task.plan_queued', target: id, result: 'success', metadata: { jobId: job.id, deduplicated } } });
      return NextResponse.json({ message: 'Planning started. This page will update automatically.' });
    } catch (error) {
      await transitionTask(prisma, { taskId: id, to: current.status === 'failed' ? 'FAILED' : 'DRAFT', actor: auth.session!.userId, actorType: 'human', reason: 'planning queue unavailable; returning to prior state', legacyStatus: current.status });
      await prisma.auditEvent.create({ data: { actor: auth.session!.userId, action: 'task.plan_queued', target: id, result: 'failed' } });
      return NextResponse.json({ error: 'The planning queue is unavailable. No work was started.' }, { status: 503 });
    }
  }

  if (body.action === 'approve_plan' || body.action === 'reject_plan') {
    if (current.status !== 'awaiting_plan_approval') return NextResponse.json({ error: `Task is already ${current.status.replaceAll('_', ' ')}.` }, { status: 409 });
    const approved = body.action === 'approve_plan';
    const evaluationOnly = current.title.startsWith('AI Project Manager Evaluation');
    const assignedProjectAgent = approved ? await projectAgentFor(current) : null;
    if (approved) {
      const policy = await loadActivePolicy(prisma, current.projectId);
      const risk = evaluationOnly
        ? { level: asDeclaredRisk(current.riskLevel), matched: [] as Array<{ id: string }> }
        : classifyTaskRisk({ declaredRisk: asDeclaredRisk(current.riskLevel), title: current.title, instruction: current.completeInstruction });
      const decision = evaluateTaskAgainstPolicy(policy, risk);
      if (!decision.allowed) {
        await prisma.auditEvent.create({ data: { actor: auth.session!.userId, action: 'policy.task_blocked', target: id, result: 'rejected', metadata: { stage: 'plan_approval', level: risk.level, rules: decision.matchedRules, policyCeiling: policy.maxTaskRisk, evaluationOnly } } });
        return NextResponse.json({ error: 'Approval was blocked by the project policy.', reasons: decision.reasons }, { status: 409 });
      }
    }
    if (approved) {
      const spend = await checkSpendGuard(current.projectId);
      if (!spend.allowed) {
        await prisma.auditEvent.create({ data: { actor: auth.session!.userId, action: 'cost.spend_blocked', target: id, result: 'rejected', metadata: { stage: 'approve_plan', evaluationOnly, spendUsd: spend.spendUsd, limitUsd: spend.limitUsd } } });
        return NextResponse.json({ error: spend.reason }, { status: 409 });
      }
    }
    if (approved && !evaluationOnly && !assignedProjectAgent && process.env.GITHUB_CLI_ENABLED !== 'true' && (!process.env.GITHUB_INSTALLATION_ID || !process.env.GITHUB_PRIVATE_KEY_PATH)) {
      return NextResponse.json({ error: 'Plan saved, but execution is locked until the GitHub App installation and private key are configured.' }, { status: 503 });
    }
    await prisma.$transaction(async tx => {
      await transitionTask(tx, {
        taskId: id,
        to: approved ? (evaluationOnly ? 'COMPLETED' : 'QUEUED') : 'REJECTED',
        actor: auth.session!.userId, actorType: 'human',
        reason: approved ? 'plan approved' : 'plan rejected',
        legacyStatus: approved ? (evaluationOnly ? 'completed' : 'queued') : 'rejected',
        extraTaskData: {
          assignedAgent: approved ? (evaluationOnly ? 'AI Project Manager' : assignedProjectAgent ? current.assignedAgent : 'Agent Foundry Runner') : current.assignedAgent,
          completedAt: approved && evaluationOnly ? new Date() : current.completedAt,
        },
      });
      await tx.approval.updateMany({ where: { taskId: id, approvalType: 'plan', decision: 'pending' }, data: { decision: approved ? 'approved' : 'rejected', approvedBy: auth.session!.userId, approvedAt: new Date(), comments: typeof body.comments === 'string' ? body.comments.slice(0, 2000) : null } });
      await emitTaskEvent(tx, { taskId: id, type: approved ? 'plan_approved' : 'plan_rejected', actor: auth.session!.userId, actorType: 'human', payload: { gate: 'plan', evaluationOnly } });
      if (approved && evaluationOnly) await emitTaskEvent(tx, { taskId: id, type: 'task_completed', actor: auth.session!.userId, actorType: 'human', payload: { via: 'manager_evaluation' } });
      await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: approved ? 'task.plan_approved' : 'task.plan_rejected', target: id, result: 'success' } });
    });
    if (approved && evaluationOnly) {
      // Deterministic Manager: convert the approved evaluation plan into
      // policy-screened DRAFT tasks (see docs/MANAGER.md). Best-effort in a
      // separate transaction — evaluation completion is already committed
      // and must not depend on draft creation.
      let draftsCreated = 0; let draftsSkipped = 0;
      try {
        const plannerRun = await prisma.agentRun.findFirst({ where: { taskId: id, role: 'planner', status: 'success' }, orderBy: { createdAt: 'desc' }, select: { outputSummary: true } });
        const parse = parseManagerPlan(plannerRun?.outputSummary ?? null);
        const managerPolicy = await loadActivePolicy(prisma, current.projectId);
        const draftPlan = buildTaskDrafts({ parse, projectName: current.project.name, evaluationTaskId: id, policy: managerPolicy });
        draftsCreated = draftPlan.drafts.length; draftsSkipped = draftPlan.skipped.length;
        await prisma.$transaction(async tx => {
          for (const draft of draftPlan.drafts) {
            const created = await tx.task.create({ data: { projectId: current.projectId, title: draft.title, completeInstruction: draft.completeInstruction, riskLevel: draft.effectiveRisk } });
            await emitTaskEvent(tx, { taskId: created.id, type: 'task_created', actor: 'ai-project-manager', actorType: 'system', payload: { evaluationTaskId: id, source: 'manager_evaluation' } });
          }
          await tx.auditEvent.create({ data: { actor: 'ai-project-manager', action: 'manager.drafts_created', target: current.projectId, result: 'success', metadata: { evaluationTaskId: id, created: draftPlan.drafts.length, skipped: draftPlan.skipped.length, droppedAtParse: draftPlan.droppedAtParse, parseFailed: !parse, skippedRules: [...new Set(draftPlan.skipped.flatMap((s) => s.matchedRules))] } } });
        });
      } catch (error) {
        await prisma.auditEvent.create({ data: { actor: 'ai-project-manager', action: 'manager.drafts_created', target: current.projectId, result: 'failed', metadata: { evaluationTaskId: id, error: error instanceof Error ? error.message.slice(0, 500) : 'unknown' } } }).catch(() => {});
      }
      const skippedNote = draftsSkipped ? ` ${draftsSkipped} steps were blocked by the project policy and were not created.` : '';
      return NextResponse.json({ message: `AI Project Manager evaluation approved and completed. ${draftsCreated} draft tasks were created for your review.${skippedNote} No coding work was executed.` });
    }
    if (approved) {
      try {
        const { job, deduplicated } = assignedProjectAgent ? await enqueueAgentExecution(id) : await enqueueExecution(id);
        await prisma.auditEvent.create({ data: { actor: auth.session!.userId, action: assignedProjectAgent ? 'agent_team.execution_queued' : 'task.execution_queued', target: id, result: 'success', metadata: { jobId: job.id, deduplicated, projectAgentId: assignedProjectAgent?.id } } });
        await emitTaskEvent(prisma, { taskId: id, type: 'task_queued', actor: auth.session!.userId, actorType: 'human', correlationId: job.id ?? null, payload: { jobId: job.id ?? null, deduplicated } });
      } catch {
        await prisma.$transaction(async tx => {
          await transitionTask(tx, { taskId: id, to: 'AWAITING_APPROVAL', actor: auth.session!.userId, actorType: 'human', reason: 'execution queue unavailable; approval rolled back', legacyStatus: 'awaiting_plan_approval', extraTaskData: { assignedAgent: current.assignedAgent } });
          await tx.approval.updateMany({ where: { taskId: id, approvalType: 'plan', decision: 'approved' }, data: { decision: 'pending', approvedBy: null, approvedAt: null } });
          await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: 'task.execution_queued', target: id, result: 'failed' } });
        });
        return NextResponse.json({ error: 'The execution queue is unavailable. Approval was safely rolled back.' }, { status: 503 });
      }
    }
    return NextResponse.json({ message: approved ? 'Plan approved. The guarded runner has started.' : 'Plan rejected.' });
  }

  if (body.action === 'request_changes') {
    // P12 human loop: instead of approve/reject at the merge gate, record
    // what must change and park the task in CHANGES_REQUESTED. Resubmission
    // re-executes under the SAME approved plan (see resubmit_changes).
    if (current.state !== 'AWAITING_APPROVAL') return NextResponse.json({ error: `Task is already ${current.status.replaceAll('_', ' ')}.` }, { status: 409 });
    const pendingMerge = await prisma.approval.findFirst({ where: { taskId: id, approvalType: 'merge', decision: 'pending' } });
    if (!pendingMerge) return NextResponse.json({ error: 'The merge gate is not open for this task.' }, { status: 409 });
    const parsed = parseChangeRequestNote(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    await prisma.$transaction(async tx => {
      await transitionTask(tx, {
        taskId: id, to: 'CHANGES_REQUESTED',
        actor: auth.session!.userId, actorType: 'human',
        reason: `changes requested at the merge gate: ${parsed.note.slice(0, 200)}`,
        legacyStatus: 'awaiting_human_review',
      });
      await tx.approval.update({ where: { id: pendingMerge.id }, data: { decision: 'changes_requested', approvedBy: auth.session!.userId, approvedAt: new Date(), comments: parsed.note } });
      await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: 'task.changes_requested', target: id, result: 'success', metadata: { gate: 'merge', noteLength: parsed.note.length } } });
    });
    return NextResponse.json({ message: 'Changes requested and recorded. Resubmit when you want the guarded runner to address them.' });
  }

  if (body.action === 'resubmit_changes') {
    if (current.state !== 'CHANGES_REQUESTED') return NextResponse.json({ error: `Task is already ${current.status.replaceAll('_', ' ')}.` }, { status: 409 });
    const resubmitSpend = await checkSpendGuard(current.projectId);
    if (!resubmitSpend.allowed) {
      await prisma.auditEvent.create({ data: { actor: auth.session!.userId, action: 'cost.spend_blocked', target: id, result: 'rejected', metadata: { stage: 'resubmit_changes', spendUsd: resubmitSpend.spendUsd, limitUsd: resubmitSpend.limitUsd } } });
      return NextResponse.json({ error: resubmitSpend.reason }, { status: 409 });
    }
    const resubmitProjectAgent = await projectAgentFor(current);
    if (!resubmitProjectAgent && process.env.GITHUB_CLI_ENABLED !== 'true' && (!process.env.GITHUB_INSTALLATION_ID || !process.env.GITHUB_PRIVATE_KEY_PATH)) {
      return NextResponse.json({ error: 'Execution is locked until the GitHub App installation and private key are configured.' }, { status: 503 });
    }
    // Enqueue first, transition second: if the state update fails after the
    // job exists, the runner's QUEUED guard skips it cleanly and the task
    // simply stays in CHANGES_REQUESTED for another resubmit. The reverse
    // order could orphan a QUEUED task with no job behind it.
    try {
      const { job, deduplicated } = resubmitProjectAgent ? await enqueueAgentExecution(id) : await enqueueExecution(id);
      await prisma.$transaction(async tx => {
        await transitionTask(tx, {
          taskId: id, to: 'QUEUED',
          actor: auth.session!.userId, actorType: 'human',
          reason: 'changes resubmitted for re-execution under the approved plan',
          legacyStatus: 'queued',
        });
        await emitTaskEvent(tx, { taskId: id, type: 'task_queued', actor: auth.session!.userId, actorType: 'human', correlationId: job.id ?? null, payload: { jobId: job.id ?? null, deduplicated, source: 'changes_requested' } });
        await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: 'task.execution_requeued', target: id, result: 'success', metadata: { jobId: job.id, deduplicated, source: 'changes_requested' } } });
      });
      return NextResponse.json({ message: 'Resubmitted. The guarded runner is re-executing with your feedback.' });
    } catch {
      await prisma.auditEvent.create({ data: { actor: auth.session!.userId, action: 'task.execution_requeued', target: id, result: 'failed' }, }).catch(() => {});
      return NextResponse.json({ error: 'Resubmission failed. The task remains in the change-requested state; try again.' }, { status: 503 });
    }
  }

  if (body.action === 'approve_final' || body.action === 'reject_final') {
    // State-machine guards (P12): CHANGES_REQUESTED shares the legacy status
    // string 'awaiting_human_review'. Approval is legal only from
    // AWAITING_APPROVAL; rejection is also legal from CHANGES_REQUESTED
    // (the table allows abandoning a change request).
    const approved = body.action === 'approve_final';
    if (current.state !== 'AWAITING_APPROVAL' && !(current.state === 'CHANGES_REQUESTED' && !approved)) {
      return NextResponse.json({ error: current.state === 'CHANGES_REQUESTED' ? 'Changes were requested; resubmit for re-execution first.' : `Task is already ${current.status.replaceAll('_', ' ')}.` }, { status: 409 });
    }
    await prisma.$transaction(async tx => {
      await transitionTask(tx, {
        taskId: id, to: approved ? 'APPROVED' : 'REJECTED',
        actor: auth.session!.userId, actorType: 'human',
        reason: approved ? 'final result approved (merge remains manual)' : 'final result rejected',
        legacyStatus: approved ? 'approved_for_merge' : 'rejected',
      });
      await tx.approval.updateMany({ where: { taskId: id, approvalType: 'merge', decision: 'pending' }, data: { decision: approved ? 'approved' : 'rejected', approvedBy: auth.session!.userId, approvedAt: new Date(), comments: typeof body.comments === 'string' ? body.comments.slice(0, 2000) : null } });
      await emitTaskEvent(tx, { taskId: id, type: approved ? 'final_approved' : 'final_rejected', actor: auth.session!.userId, actorType: 'human', payload: { gate: 'merge', automaticMerge: false } });
      await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: approved ? 'task.final_approved' : 'task.final_rejected', target: id, result: 'success', metadata: { automaticMerge: false } } });
    });
    return NextResponse.json({ message: approved ? 'Final result approved. It is ready for a deliberate merge; no automatic merge occurred.' : 'Final result rejected. The draft PR remains unmerged.' });
  }
  return NextResponse.json({ error: 'Invalid task action.' }, { status: 400 });
}
