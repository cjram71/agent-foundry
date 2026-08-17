import { NextResponse } from 'next/server';
import { getSession, isSameOrigin } from '@/lib/auth';
import prisma from '@/lib/prisma';

const transitions: Record<string, { from: string[]; to: 'APPROVED'|'CHANGES_REQUESTED'|'INBOX'|'PUBLISHED' }> = {
  approve: { from: ['AWAITING_REVIEW'], to: 'APPROVED' },
  changes: { from: ['AWAITING_REVIEW'], to: 'CHANGES_REQUESTED' },
  retry: { from: ['FAILED'], to: 'INBOX' },
  published: { from: ['READY_TO_PUBLISH'], to: 'PUBLISHED' },
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  const { id } = await context.params, body = await request.json().catch(() => null), rule = transitions[body?.action];
  if (!rule) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  const job = await prisma.editorialJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: 'Editorial job not found' }, { status: 404 });
  if (!rule.from.includes(job.status)) return NextResponse.json({ error: `Cannot ${body.action} from ${job.status}` }, { status: 409 });
  const now = new Date(), updated = await prisma.$transaction(async tx => {
    const result = await tx.editorialJob.update({ where: { id }, data: { status: rule.to, instructions: typeof body?.instructions === 'string' ? body.instructions.slice(0, 4000) : job.instructions, errorMessage: body.action === 'retry' ? null : job.errorMessage, approvedAt: body.action === 'approve' ? now : job.approvedAt, approvedBy: body.action === 'approve' ? session.userId : job.approvedBy, publishedAt: body.action === 'published' ? now : job.publishedAt } });
    if (job.missionId && body.action === 'approve') {
      await tx.missionApproval.updateMany({ where: { missionId: job.missionId, approvalType: 'campaign-draft', decision: 'pending' }, data: { decision: 'approved', decidedBy: session.userId, decidedAt: now } });
      await tx.mission.update({ where: { id: job.missionId }, data: { status: 'approved' } });
      await tx.missionEvent.create({ data: { missionId: job.missionId, type: 'campaign_draft_approved', actor: session.userId, actorType: 'human', correlationId: job.id } });
    }
    if (job.missionId && body.action === 'changes') {
      await tx.missionApproval.updateMany({ where: { missionId: job.missionId, approvalType: 'campaign-draft', decision: 'pending' }, data: { decision: 'changes_requested', decidedBy: session.userId, decidedAt: now, comments: typeof body?.instructions === 'string' ? body.instructions.slice(0, 4000) : null } });
      await tx.mission.update({ where: { id: job.missionId }, data: { status: 'active' } });
      await tx.missionEvent.create({ data: { missionId: job.missionId, type: 'campaign_changes_requested', actor: session.userId, actorType: 'human', correlationId: job.id } });
    }
    if (job.missionId && body.action === 'retry') await tx.mission.update({ where: { id: job.missionId }, data: { status: 'active' } });
    await tx.auditEvent.create({ data: { actor: session.userId, action: `editorial.${body.action}`, target: id, result: 'success', metadata: { missionId: job.missionId, from: job.status, to: rule.to } } });
    return result;
  });
  return NextResponse.json({ id: updated.id, missionId: updated.missionId, status: updated.status });
}
