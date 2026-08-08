import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import prisma from '@/lib/prisma';
import { getSession, isSameOrigin } from '@/lib/auth';
import { enqueueExecution, enqueuePlan } from '@/lib/queue';
import { transitionTask, emitTaskEvent } from '@foundry/state-machine';
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request); if (auth.error) return auth.error;
  const { id } = await params; const body = await request.json();
  const current = await prisma.task.findUnique({ where: { id }, include: { project: true } });
  if (!current) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  if (body.action === 'check_status') {
    if (!current.pullRequestUrl) return NextResponse.json({ error: 'This task does not have a pull request yet.' }, { status: 409 });
    try {
      const repository = await readPullRequestStatus(current.pullRequestUrl, current.project.githubOwner, current.project.githubRepo); let status = current.status;
      if (repository.state === 'MERGED' && current.status !== 'completed') { await prisma.$transaction(async tx => { await transitionTask(tx, { taskId: id, to: 'COMPLETED', actor: 'task-checker', actorType: 'system', reason: 'pull request merged by a human on GitHub', legacyStatus: 'completed', metadata: { pullRequestUrl: current.pullRequestUrl }, extraTaskData: { completedAt: repository.mergedAt ? new Date(repository.mergedAt) : new Date() } }); await emitTaskEvent(tx, { taskId: id, type: 'task_completed', actor: 'task-checker', payload: { pullRequestUrl: current.pullRequestUrl, via: 'merge' } }); await tx.auditEvent.create({ data: { actor: 'task-checker', action: 'task.pull_request_merged', target: id, result: 'success', metadata: { pullRequestUrl: current.pullRequestUrl } } }); }); status = 'completed'; }
      const checkLabel = repository.checks.failed ? `${repository.checks.failed} checks failed` : repository.checks.pending ? `${repository.checks.pending} checks running` : repository.checks.total ? 'All checks passed' : 'No checks reported';
      return NextResponse.json({ status, repository, message: repository.state === 'MERGED' ? 'Pull request merged. Task marked completed.' : `${checkLabel}. Pull request is ${repository.isDraft ? 'draft' : repository.state.toLowerCase()}.` });
    } catch { return NextResponse.json({ error: 'GitHub status is temporarily unavailable. The task was not changed.' }, { status: 503 }); }
  }

  if (body.action === 'request_plan') {
    if (current.status !== 'draft' && current.status !== 'failed') return NextResponse.json({ error: `Task is already ${current.status.replaceAll('_', ' ')}.` }, { status: 409 });
    await transitionTask(prisma, { taskId: id, to: 'PLANNING', actor: auth.session!.userId, actorType: 'human', reason: 'plan requested', legacyStatus: 'planning', extraTaskData: { startedAt: current.startedAt || new Date() } });
    try {
      const job = await enqueuePlan(id);
      await prisma.auditEvent.create({ data: { actor: auth.session!.userId, action: 'task.plan_queued', target: id, result: 'success', metadata: { jobId: job.id } } });
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
    if (approved && !evaluationOnly && process.env.GITHUB_CLI_ENABLED !== 'true' && (!process.env.GITHUB_INSTALLATION_ID || !process.env.GITHUB_PRIVATE_KEY_PATH)) {
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
          assignedAgent: approved ? (evaluationOnly ? 'AI Project Manager' : 'Agent Foundry Runner') : current.assignedAgent,
          completedAt: approved && evaluationOnly ? new Date() : current.completedAt,
        },
      });
      await tx.approval.updateMany({ where: { taskId: id, approvalType: 'plan', decision: 'pending' }, data: { decision: approved ? 'approved' : 'rejected', approvedBy: auth.session!.userId, approvedAt: new Date(), comments: typeof body.comments === 'string' ? body.comments.slice(0, 2000) : null } });
      await emitTaskEvent(tx, { taskId: id, type: approved ? 'plan_approved' : 'plan_rejected', actor: auth.session!.userId, actorType: 'human', payload: { gate: 'plan', evaluationOnly } });
      if (approved && evaluationOnly) await emitTaskEvent(tx, { taskId: id, type: 'task_completed', actor: auth.session!.userId, actorType: 'human', payload: { via: 'manager_evaluation' } });
      await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: approved ? 'task.plan_approved' : 'task.plan_rejected', target: id, result: 'success' } });
    });
    if (approved && evaluationOnly) return NextResponse.json({ message: 'AI Project Manager evaluation approved and completed. No coding work was executed.' });
    if (approved) {
      try {
        const job = await enqueueExecution(id);
        await prisma.auditEvent.create({ data: { actor: auth.session!.userId, action: 'task.execution_queued', target: id, result: 'success', metadata: { jobId: job.id } } });
        await emitTaskEvent(prisma, { taskId: id, type: 'task_queued', actor: auth.session!.userId, actorType: 'human', correlationId: job.id ?? null, payload: { jobId: job.id ?? null } });
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

  if (body.action === 'approve_final' || body.action === 'reject_final') {
    if (current.status !== 'awaiting_human_review') return NextResponse.json({ error: `Task is already ${current.status.replaceAll('_', ' ')}.` }, { status: 409 });
    const approved = body.action === 'approve_final';
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
