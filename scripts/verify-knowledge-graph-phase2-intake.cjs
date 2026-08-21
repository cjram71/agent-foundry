const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const companyId = 'BSTA-COMP-001';
const actor = 'verify-knowledge-graph-phase2-intake';
const stamp = Date.now();

async function main() {
  const results = {};
  const content = `Smoke test document body ${stamp}`;
  const contentHash = createHash('sha256').update(content).digest('hex');

  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.knowledgeDocument.create({ data: { companyId, namespace: 'crm', title: 'Smoke intake document', sourceUri: 'test://smoke-intake', content, contentHash, createdBy: actor } });
      results.contentRoundTrips = doc.content === content;
      results.defaultsPendingApproval = doc.ingestionStatus === 'PENDING_APPROVAL';

      const approved = await tx.knowledgeDocument.update({ where: { id: doc.id }, data: { ingestionStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date() } });
      results.approvalRecorded = approved.ingestionStatus === 'APPROVED' && approved.approvedBy === actor && approved.approvedAt !== null;

      let rejectedDuplicate = false;
      try {
        await tx.knowledgeDocument.create({ data: { companyId, namespace: 'crm', title: 'Duplicate content', sourceUri: 'test://smoke-intake-dup', content, contentHash, createdBy: actor } });
      } catch (e) { rejectedDuplicate = true; }
      results.uniqueContentHashPerCompanyEnforced = rejectedDuplicate;

      throw new Error('__ROLLBACK_SMOKE_TEST__');
    });
  } catch (e) {
    if (e.message !== '__ROLLBACK_SMOKE_TEST__') throw e;
  }

  const leftover = await prisma.knowledgeDocument.count({ where: { contentHash } });
  results.rolledBack = leftover === 0;

  const valid = Object.values(results).every(Boolean);
  console.log(JSON.stringify({ valid, phase: '2-intake-smoke', results }));
  if (!valid) process.exitCode = 1;
}

main().catch((e) => { console.error('SMOKE_TEST_FAILED:' + e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
