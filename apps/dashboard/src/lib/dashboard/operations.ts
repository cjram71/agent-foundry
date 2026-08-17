import prisma from '@/lib/prisma';
import { BOOSTA_COMPANY_ID } from '@/lib/company';

const taskInclude = { project: true, missionLink: { include: { mission: true } }, attempts: { orderBy: { attemptNumber: 'desc' as const } }, agentRuns: { orderBy: { createdAt: 'desc' as const } }, approvals: { orderBy: { requestedAt: 'desc' as const } }, stateTransitions: { orderBy: { createdAt: 'desc' as const } }, events: { orderBy: { createdAt: 'desc' as const } } };

export async function listMissions() {
  return prisma.mission.findMany({ where: { companyId: BOOSTA_COMPANY_ID }, orderBy: { updatedAt: 'desc' }, include: { project: true, tasks: { include: { task: { include: { agentRuns: true } } } }, approvals: true } });
}

export async function getMission(id: string) {
  return prisma.mission.findFirst({ where: { id, companyId: BOOSTA_COMPANY_ID }, include: { project: true, approvals: { orderBy: { requestedAt: 'desc' } }, events: { orderBy: { createdAt: 'desc' } }, tasks: { orderBy: { sequence: 'asc' }, include: { task: { include: { attempts: true, agentRuns: true, approvals: true } } } } } });
}

export async function getTask(id: string) {
  return prisma.task.findFirst({ where: { id, project: { companyId: BOOSTA_COMPANY_ID } }, include: taskInclude });
}

export async function modelUsage(since: Date) {
  return prisma.agentRun.groupBy({ by: ['provider', 'model', 'role', 'status'], where: { createdAt: { gte: since }, task: { project: { companyId: BOOSTA_COMPANY_ID } } }, _count: { _all: true }, _sum: { tokenUsage: true } });
}

export async function auditSummary(since: Date) {
  const events = await prisma.auditEvent.findMany({ where: { timestamp: { gte: since } }, orderBy: { timestamp: 'desc' }, take: 250, select: { id: true, actor: true, action: true, target: true, result: true, timestamp: true } });
  return events;
}

export async function searchEntities(query: string) {
  if (!query.trim()) return { missions: [], projects: [], tasks: [], memory: [] };
  const contains = { contains: query.trim(), mode: 'insensitive' as const };
  const [missions, projects, tasks, memory] = await Promise.all([
    prisma.mission.findMany({ where: { OR: [{ goal: contains }, { id: contains }] }, take: 20, orderBy: { updatedAt: 'desc' } }),
    prisma.project.findMany({ where: { OR: [{ name: contains }, { id: contains }] }, take: 20, orderBy: { createdAt: 'desc' } }),
    prisma.task.findMany({ where: { OR: [{ title: contains }, { id: contains }] }, take: 20, orderBy: { updatedAt: 'desc' } }),
    prisma.memoryRecord.findMany({ where: { summary: contains }, take: 20, orderBy: { createdAt: 'desc' }, select: { id: true, summary: true, kind: true, provenance: true, sensitivity: true, createdAt: true } }),
  ]);
  return { missions, projects, tasks, memory };
}
