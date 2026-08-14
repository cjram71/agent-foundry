const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const [opportunities, redTeams, decisions, unsafeDecisions] = await Promise.all([
    prisma.opportunity.count({ where: { companyId: 'BSTA-COMP-001' } }),
    prisma.opportunityRedTeam.count(),
    prisma.opportunityDecision.count(),
    prisma.opportunityDecision.count({ where: { decision: { notIn: ['APPROVE', 'REJECT', 'RESEARCH_MORE', 'NO_ACTION'] } } }),
  ]);
  const valid = unsafeDecisions === 0;
  console.log(JSON.stringify({ valid, opportunities, redTeams, decisions, unsafeDecisions, projectCreationEnabled: false, externalActionsEnabled: false }));
  if (!valid) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
