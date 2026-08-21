const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const [departments, agents, audit] = await Promise.all([
    prisma.companyDepartment.count({ where: { companyId: 'BSTA-COMP-001' } }),
    prisma.companyAgent.findMany({
      where: { companyId: 'BSTA-COMP-001' },
      select: { id: true, managerId: true, status: true, financialLimitMinor: true, externalActionLimit: true },
      orderBy: { id: 'asc' },
    }),
    prisma.auditEvent.count({ where: { action: 'executive_layer.registry_created', target: 'BSTA-COMP-001', result: 'success' } }),
  ]);
  const safe = agents.map((agent) => ({ ...agent, financialLimitMinor: agent.financialLimitMinor.toString() }));
  const exec1 = safe.find((agent) => agent.id === 'BSTA-EXEC-001');
  const exec2 = safe.find((agent) => agent.id === 'BSTA-EXEC-002');
  // PR #29 added the CRM department (BSTA-DEPT-CRM) and its two agents
  // (BSTA-CRM-001/002), which sort before BSTA-EXEC-* alphabetically, so
  // the executive layer must be located by id rather than array position.
  const valid = departments === 17 && audit === 1 && safe.length === 4 && !!exec1 && exec1.managerId === null && !!exec2 && exec2.managerId === 'BSTA-EXEC-001' && safe.every((agent) => agent.status === 'STAGING' && agent.financialLimitMinor === '0' && Object.values(agent.externalActionLimit).every((value) => value === false));
  console.log(JSON.stringify({ valid, departments, audit, agents: safe }));
  if (!valid) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
