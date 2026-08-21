import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { BOOSTA_COMPANY_ID } from '@/lib/company';
import { requireApiAdmin as admin } from '@/lib/dashboard/auth';
import { hashMasterPlan, normalizeMasterPlan, validRepositoryPart } from '@/lib/project-governance';

export async function GET() {
  const auth = await admin(); if (auth.error) return auth.error;
  return NextResponse.json(await prisma.project.findMany({
    where: { companyId: BOOSTA_COMPANY_ID }, orderBy: { createdAt: 'desc' },
    include: { sourceOpportunity: { select: { id: true, title: true, status: true } }, plans: { orderBy: { version: 'desc' }, take: 1 }, _count: { select: { tasks: true } } },
  }));
}

export async function POST(request: Request) {
  const auth = await admin(request); if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (body.action !== 'create_from_opportunity') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    const opportunity = await prisma.opportunity.findFirst({ where: { id: String(body.opportunityId), companyId: BOOSTA_COMPANY_ID }, include: { decisions: { orderBy: { decidedAt: 'desc' }, take: 1 }, project: true } });
    if (!opportunity) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
    if (opportunity.status !== 'APPROVE' || opportunity.decisions[0]?.decision !== 'APPROVE') return NextResponse.json({ error: 'A recorded human APPROVE decision is required.' }, { status: 409 });
    if (opportunity.project) return NextResponse.json({ project: opportunity.project, deduplicated: true });
    if (!validRepositoryPart(body.githubOwner) || !validRepositoryPart(body.githubRepo)) return NextResponse.json({ error: 'Valid GitHub owner and repository are required.' }, { status: 400 });
    const project = await prisma.$transaction(async tx => {
      const existing = await tx.project.findUnique({ where: { sourceOpportunityId: opportunity.id } });
      if (existing) return existing;
      const created = await tx.project.create({ data: { companyId: BOOSTA_COMPANY_ID, sourceOpportunityId: opportunity.id, name: String(body.name ?? opportunity.title).trim().slice(0, 200), githubOwner: body.githubOwner, githubRepo: body.githubRepo, defaultBranch: String(body.defaultBranch ?? 'main').slice(0, 100), projectType: String(body.projectType ?? 'other').slice(0, 100), authorisedStatus: false, spendingLimit: Math.max(0, Math.min(100000, Number(body.spendingLimit ?? 0))), governanceStatus: 'DRAFT_PLAN' } });
      await tx.projectPolicy.create({ data: { projectId: created.id, version: 1, active: true, maxTaskRisk: 'medium', requirePlanApproval: true, requireMergeApproval: true, autonomousMode: false, autoApproveMaxRisk: 'low', maxParallelTasks: 1, maxRepairAttempts: 2, maxTasksPerRun: 20, maxTaskCost: 2, maxProjectRunCost: 20, createDraftPullRequests: true, createdBy: auth.session!.userId } });
      await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: 'project.created_from_opportunity', target: created.id, result: 'success', metadata: { opportunityId: opportunity.id, governanceStatus: 'DRAFT_PLAN', externalAction: false } } });
      return created;
    });
    return NextResponse.json({ project, deduplicated: false }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Project creation failed' }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  const auth = await admin(request); if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const project = await prisma.project.findFirst({ where: { id: String(body.projectId), companyId: BOOSTA_COMPANY_ID }, include: { plans: { orderBy: { version: 'desc' }, take: 1 } } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (body.action === 'submit_plan') {
      const content = normalizeMasterPlan(body.plan); const contentHash = hashMasterPlan(content); const latest = project.plans[0];
      if (latest?.contentHash === contentHash) return NextResponse.json({ plan: latest, deduplicated: true });
      const materialChange = project.approvedPlanVersion !== null && project.approvedPlanVersion !== undefined;
      const row = await prisma.$transaction(async tx => {
        await tx.projectPlan.updateMany({ where: { projectId: project.id, status: { in: ['DRAFT','PENDING_APPROVAL','APPROVED'] } }, data: { status: 'SUPERSEDED' } });
        const plan = await tx.projectPlan.create({ data: { projectId: project.id, version: project.planVersion + 1, status: 'PENDING_APPROVAL', content, contentHash, materialChange, changeSummary: materialChange ? String(body.changeSummary ?? 'Master Project Plan changed after approval').slice(0, 2000) : null, createdBy: auth.session!.userId, supersedesId: latest?.id } });
        await tx.project.update({ where: { id: project.id }, data: { planVersion: plan.version, governanceStatus: 'PLAN_PENDING_APPROVAL', authorisedStatus: false, pausedReason: materialChange ? 'Material plan change requires renewed approval' : null } });
        await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: materialChange ? 'project.material_change_detected' : 'project.plan_submitted', target: project.id, result: 'success', metadata: { version: plan.version, contentHash, materialChange, executionPaused: true } } });
        return plan;
      });
      return NextResponse.json({ plan: row, deduplicated: false });
    }
    if (body.action === 'approve_plan' || body.action === 'reject_plan') {
      const latest = project.plans[0];
      if (!latest || latest.status !== 'PENDING_APPROVAL') return NextResponse.json({ error: 'No Master Project Plan is awaiting approval.' }, { status: 409 });
      const approved = body.action === 'approve_plan';
      await prisma.$transaction(async tx => {
        await tx.projectPlan.update({ where: { id: latest.id }, data: { status: approved ? 'APPROVED' : 'REJECTED', approvedBy: auth.session!.userId, approvedAt: new Date() } });
        await tx.project.update({ where: { id: project.id }, data: approved ? { governanceStatus: 'APPROVED', authorisedStatus: true, approvedPlanVersion: latest.version, planApprovedAt: new Date(), planApprovedBy: auth.session!.userId, pausedReason: null } : { governanceStatus: 'PLAN_REJECTED', authorisedStatus: false, pausedReason: 'Master Project Plan rejected' } });
        await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: approved ? 'project.plan_approved' : 'project.plan_rejected', target: project.id, result: 'success', metadata: { version: latest.version, separateFromOpportunityApproval: true, externalAction: false } } });
      });
      return NextResponse.json({ message: approved ? 'Master Project Plan approved. Governed task creation is unlocked.' : 'Master Project Plan rejected. Execution remains locked.' });
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Governance update failed' }, { status: 400 }); }
}
