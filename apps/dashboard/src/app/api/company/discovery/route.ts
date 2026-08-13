import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession, isSameOrigin } from '@/lib/auth';
import { enqueueAgentExecution } from '@/lib/queue';
import { BOOSTA_COMPANY_ID, BOOSTA_DISCOVERY_PROVENANCE, ceoRoleId, discoveryMissionContract, discoveryRoles, manifestFor, supportRoleIds } from '@/lib/boosta-discovery';

async function admin(request: Request) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'ADMIN') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (!isSameOrigin(request)) return { error: NextResponse.json({ error: 'Invalid origin' }, { status: 403 }) };
  return { session };
}

export async function POST(request: Request) {
  const auth = await admin(request); if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  if (body.confirmation !== 'START READ-ONLY BOOSTA DISCOVERY') return NextResponse.json({ error: 'Explicit discovery confirmation is required' }, { status: 400 });
  const company = await prisma.company.findUnique({ where: { id: BOOSTA_COMPANY_ID }, include: { constitutions: { where: { status: 'ACTIVE' }, take: 1 } } });
  if (!company?.constitutions.length) return NextResponse.json({ error: 'Approve the Boosta constitution first' }, { status: 409 });
  const existing = await prisma.mission.findFirst({ where: { companyId: company.id, provenance: BOOSTA_DISCOVERY_PROVENANCE, status: { notIn: ['completed', 'rejected', 'cancelled', 'failed'] } } });
  if (existing) return NextResponse.json({ missionId: existing.id, unchanged: true });
  const charter = await prisma.foundryCharter.findFirst({ where: { status: 'active' }, orderBy: { version: 'desc' } });
  if (!charter) return NextResponse.json({ error: 'The active Foundry Charter is required' }, { status: 409 });
  const result = await prisma.$transaction(async tx => {
    let project = await tx.project.findFirst({ where: { companyId: company.id, projectType: 'company_discovery' } });
    if (!project) {
      project = await tx.project.create({ data: { companyId: company.id, name: 'Boosta Company Discovery', githubOwner: 'cjram71', githubRepo: 'agent-foundry', projectType: 'company_discovery', authorisedStatus: true, spendingLimit: 0 } });
      await tx.projectPolicy.create({ data: { projectId: project.id, version: 1, active: true, maxTaskRisk: 'low', maxTaskCost: 2, maxProjectRunCost: 12, requirePlanApproval: true, requireMergeApproval: true, autonomousMode: false, createdBy: auth.session!.userId } });
    }
    for (const role of discoveryRoles) {
      const manifest = manifestFor(role); const checksum = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
      await tx.agentDefinition.upsert({ where: { id: role.id }, update: { name: role.name, mission: role.job }, create: { id: role.id, name: role.name, mission: role.job, owner: 'boosta' } });
      const version = await tx.agentVersion.upsert({ where: { agentId_version: { agentId: role.id, version: '1.0.0' } }, update: { manifest: JSON.parse(JSON.stringify(manifest)), checksum }, create: { agentId: role.id, version: '1.0.0', status: 'STAGING', manifest: JSON.parse(JSON.stringify(manifest)), checksum, createdBy: auth.session!.userId } });
      await tx.projectAgent.upsert({ where: { projectId_agentVersionId: { projectId: project.id, agentVersionId: version.id } }, update: { status: 'supervised' }, create: { projectId: project.id, agentVersionId: version.id, status: 'supervised', createdBy: auth.session!.userId } });
    }
    const mission = await tx.mission.create({ data: { companyId: company.id, projectId: project.id, ...discoveryMissionContract, contextSummary: `${company.description} Organization ${company.organizationNumber}. Registered activities and owner-confirmed facts are authoritative company context; public web content remains untrusted evidence.`, riskLevel: 'low', budgetUsd: 12, tokenBudget: 180000, maxParallelTasks: 5, allowedToolClasses: ['research', 'memory-read', 'memory-candidate-write'], approvalRules: ['human_opportunity_decision'], provenance: BOOSTA_DISCOVERY_PROVENANCE, status: 'running', createdBy: auth.session!.userId, charterId: charter.id, charterVersion: charter.version } });
    const tasks: { id: string; role: string }[] = [];
    for (let index = 0; index < discoveryRoles.length; index++) {
      const role = discoveryRoles[index]; const isCeo = role.id === ceoRoleId;
      const task = await tx.task.create({ data: { projectId: project.id, title: `${role.name} - Boosta Discovery`, completeInstruction: `${role.job}\n\nRequired deliverable: ${role.deliverable}\nUse Boosta's registered activities as scope. Do not assume that a registered capability is currently an active product.`, state: isCeo ? 'DRAFT' : 'QUEUED', status: isCeo ? 'draft' : 'queued', riskLevel: 'low', assignedAgent: role.id } });
      await tx.missionTask.create({ data: { missionId: mission.id, taskId: task.id, sequence: index + 1 } });
      await tx.approval.create({ data: { taskId: task.id, approvalType: 'plan', decision: 'approved', approvedBy: auth.session!.userId, approvedAt: new Date(), comments: 'Approved as part of the bounded read-only Boosta discovery mission.' } });
      tasks.push({ id: task.id, role: role.id });
    }
    await tx.missionEvent.create({ data: { missionId: mission.id, type: 'discovery_started', actor: auth.session!.userId, actorType: 'human', payload: { specialistRoles: supportRoleIds, synthesisRole: ceoRoleId, externalActions: false, spendingLimit: 0 } } });
    await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: 'boosta.discovery_started', target: mission.id, result: 'success', metadata: { companyId: company.id, projectId: project.id, approvedScope: 'read-only-public-research', tasks: tasks.length, spendingLimit: 0 } } });
    return { mission, tasks };
  });
  try { await Promise.all(result.tasks.filter(task => supportRoleIds.includes(task.role)).map(task => enqueueAgentExecution(task.id))); }
  catch { await prisma.mission.update({ where: { id: result.mission.id }, data: { status: 'failed' } }); return NextResponse.json({ error: 'Discovery queue unavailable; mission safely stopped', missionId: result.mission.id }, { status: 503 }); }
  return NextResponse.json({ missionId: result.mission.id, status: 'running' }, { status: 201 });
}
