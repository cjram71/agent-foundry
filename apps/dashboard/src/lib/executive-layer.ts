import type { PrismaClient } from '@prisma/client';
import { BOOSTA_COMPANY_ID } from '@/lib/company';

export const phaseTwoDepartmentCodes = [
  'EXECUTIVE','STRATEGY','INTELLIGENCE','OPPORTUNITY','PRODUCT','PRODUCTION','TECHNOLOGY','MARKETING','SALES','CUSTOMER_SUCCESS','FINANCE','IP_PUBLISHING','LEGAL_COMPLIANCE','SECURITY_RISK','SERVICE_OPERATIONS','AI_WORKFORCE',
] as const;

export const phaseTwoExecutiveIds = ['BSTA-EXEC-001', 'BSTA-EXEC-002'] as const;

export function validateExecutiveLayer(input: {
  departments: Array<{ code: string }>;
  agents: Array<{ id: string; managerId: string | null; status: string; financialLimitMinor: bigint; externalActionLimit: unknown }>;
}) {
  const errors: string[] = [];
  const codes = new Set(input.departments.map((row) => row.code));
  for (const code of phaseTwoDepartmentCodes) if (!codes.has(code)) errors.push(`missing department: ${code}`);
  const agents = new Map(input.agents.map((row) => [row.id, row]));
  for (const id of phaseTwoExecutiveIds) if (!agents.has(id)) errors.push(`missing executive: ${id}`);
  const ceo = agents.get('BSTA-EXEC-001');
  const coo = agents.get('BSTA-EXEC-002');
  if (ceo?.managerId !== null) errors.push('AI CEO must report only to the human owner');
  if (coo?.managerId !== 'BSTA-EXEC-001') errors.push('AI COO must report to the AI CEO');
  for (const agent of input.agents) {
    if (agent.status !== 'STAGING') errors.push(`${agent.id} must remain STAGING in Phase 2`);
    if (agent.financialLimitMinor !== BigInt(0)) errors.push(`${agent.id} must have zero financial authority`);
    const limits = agent.externalActionLimit as Record<string, unknown> | null;
    if (!limits || Object.values(limits).some(Boolean)) errors.push(`${agent.id} has an external action enabled`);
  }
  return errors;
}

export async function loadExecutiveLayer(db: PrismaClient) {
  const [departments, agents] = await Promise.all([
    db.companyDepartment.findMany({ where: { companyId: BOOSTA_COMPANY_ID }, orderBy: [{ authorityLevel: 'desc' }, { name: 'asc' }] }),
    db.companyAgent.findMany({ where: { companyId: BOOSTA_COMPANY_ID }, orderBy: { id: 'asc' }, include: { department: { select: { code: true, name: true } }, manager: { select: { id: true, name: true, role: true } }, _count: { select: { subordinates: true } } } }),
  ]);
  return { departments, agents, errors: validateExecutiveLayer({ departments, agents }) };
}
