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
  const valid = departments === 16 && audit === 1 && safe.length === 2 && safe[0].id === 'BSTA-EXEC-001' && safe[0].managerId === null && safe[1].managerId === 'BSTA-EXEC-001' && safe.every((agent) => agent.status === 'STAGING' && agent.financialLimitMinor === '0' && Object.values(agent.externalActionLimit).every((value) => value === false));
  console.log(JSON.stringify({ valid, departments, audit, agents: safe }));
  if (!valid) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
