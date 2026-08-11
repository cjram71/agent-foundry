import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession, isSameOrigin } from '@/lib/auth';
import { compileOperatorMission } from '@/lib/mission-policy';

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
    const project = await prisma.project.findUnique({ where: { id: body.projectId }, include: { policies: { where: { active: true }, orderBy: { version: 'desc' }, take: 1 } } });
    if (!project?.authorisedStatus) return NextResponse.json({ error: 'Project must be authorized' }, { status: 409 });
    const policy = project.policies[0];
    if (!policy) return NextResponse.json({ error: 'Active project policy is required' }, { status: 409 });
    const contract = compileOperatorMission(body, project.id, auth.session!.userId, policy);
    const mission = await prisma.$transaction(async tx => {
      const created = await tx.mission.create({ data: { ...contract, deadline: contract.deadline ? new Date(contract.deadline) : null, createdBy: auth.session!.userId } });
      await tx.missionEvent.create({ data: { missionId: created.id, type: 'mission_created', actor: auth.session!.userId, actorType: 'human', payload: { version: created.version, riskLevel: created.riskLevel } } });
      await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: 'mission.created', target: created.id, result: 'success', metadata: { projectId: project.id, riskLevel: created.riskLevel, budgetUsd: created.budgetUsd, tokenBudget: created.tokenBudget } } });
      return created;
    });
    return NextResponse.json(mission, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid mission contract' }, { status: 400 });
  }
}
