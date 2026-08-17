const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const [missingOwners, unlockedWithoutPlan, approvedWithoutVersion, duplicateSources] = await Promise.all([
    prisma.task.count({ where: { OR: [{ assignedAgent: '' }] } }),
    prisma.project.count({ where: { sourceOpportunityId: { not: null }, governanceStatus: { notIn: ['APPROVED'] }, authorisedStatus: true } }),
    prisma.project.count({ where: { sourceOpportunityId: { not: null }, governanceStatus: 'APPROVED', approvedPlanVersion: null } }),
    prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM (SELECT "sourceOpportunityId" FROM "Project" WHERE "sourceOpportunityId" IS NOT NULL GROUP BY "sourceOpportunityId" HAVING COUNT(*) > 1) duplicates`,
  ]);
  const failures = [];
  if (missingOwners) failures.push(`${missingOwners} tasks have empty owners`);
  if (unlockedWithoutPlan) failures.push(`${unlockedWithoutPlan} Phase 4 projects are unlocked without approval`);
  if (approvedWithoutVersion) failures.push(`${approvedWithoutVersion} approved projects lack approved plan versions`);
  if (Number(duplicateSources[0]?.count ?? 0)) failures.push('duplicate opportunity-to-project provenance exists');
  if (failures.length) throw new Error(failures.join('; '));
  console.log(JSON.stringify({ ok: true, checks: { taskOwners: true, planGate: true, approvedVersion: true, opportunityIdempotency: true } }));
})().finally(() => prisma.$disconnect()).catch(error => { console.error(error.message); process.exit(1); });
