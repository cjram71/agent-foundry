import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession, isSameOrigin } from '@/lib/auth';
import { compileOperatorMission } from '@/lib/mission-policy';
import { charterCeiling, validateMissionContract } from '@foundry/mission';
import { BOOSTA_COMPANY_ID } from '@/lib/company';

async function requireAdmin(request?: Request) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'ADMIN') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (request && !isSameOrigin(request)) return { error: NextResponse.json({ error: 'Invalid origin' }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  return NextResponse.json(await prisma.mission.findMany({
    where: { companyId: BOOSTA_COMPANY_ID },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { project: { select: { name: true } }, _count: { select: { tasks: true, approvals: true, events: true } } },
  }));
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (typeof body.projectId !== 'string') return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const project = await prisma.project.findFirst({ where: { id: body.projectId, companyId: BOOSTA_COMPANY_ID }, include: { policies: { where: { active: true }, orderBy: { version: 'desc' }, take: 1 } } });
    if (!project?.authorisedStatus) return NextResponse.json({ error: 'Project must be authorized' }, { status: 409 });
    const charter = await prisma.foundryCharter.findFirst({ where: { status: 'active' } });
    if (!charter) return NextResponse.json({ error: 'An active Foundry Charter is required' }, { status: 409 });
    const policy = project.policies[0];
    if (!policy) return NextResponse.json({ error: 'Active project policy is required' }, { status: 409 });
    const candidate = compileOperatorMission(body, project.id, auth.session!.userId, policy);
    const contract = { ...candidate, approvalRules: [...new Set([...candidate.approvalRules, ...charter.requiredApprovalRules])] };
    const governance = validateMissionContract(contract, charterCeiling(charter));
    if (!governance.ok) return NextResponse.json({ error: 'Mission exceeds the active Foundry Charter', details: governance.errors }, { status: 409 });
    const mission = await prisma.$transaction(async tx => {
      const created = await tx.mission.create({ data: { ...contract, deadline: contract.deadline ? new Date(contract.deadline) : null, charterId: charter.id, charterVersion: charter.version, createdBy: auth.session!.userId } });
      await tx.missionEvent.create({ data: { missionId: created.id, type: 'mission_created', actor: auth.session!.userId, actorType: 'human', payload: { version: created.version, riskLevel: created.riskLevel } } });
      await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: 'mission.created', target: created.id, result: 'success', metadata: { projectId: project.id, riskLevel: created.riskLevel, budgetUsd: created.budgetUsd, tokenBudget: created.tokenBudget } } });
      return created;
    });
    return NextResponse.json(mission, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid mission contract' }, { status: 400 });
  }
}
