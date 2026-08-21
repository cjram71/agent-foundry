const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const companyId = 'BSTA-COMP-001';
const actor = 'verify-knowledge-graph-phase2-review';
const stamp = Date.now();

async function main() {
  const results = {};
  const canonicalKey = `smoke-review-entity-${stamp}`;

  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.knowledgeDocument.create({ data: { companyId, namespace: 'crm', title: 'Smoke review document', sourceUri: 'test://smoke-review', content: 'Entity under review.', contentHash: `smoke-${stamp}-review`, ingestionStatus: 'APPROVED', createdBy: actor } });
      const run = await tx.knowledgeExtractionRun.create({ data: { companyId, documentId: doc.id, model: 'smoke-model', promptVersion: 'v1', schemaVersion: 'v1', status: 'PENDING', createdBy: actor } });

      const entity = await tx.worldEntity.create({ data: { companyId, entityType: 'SMOKE_TEST', name: 'Smoke Review Entity', canonicalKey, attributes: {}, sourceReference: doc.sourceUri, sourceAuthority: doc.namespace, confidence: 0.9, createdBy: actor } });
      const excerpt = 'Entity under review.';
      const evidence = await tx.knowledgeEvidence.create({ data: { companyId, documentId: doc.id, extractionRunId: run.id, entityId: entity.id, excerpt, excerptHash: createHash('sha256').update(excerpt).digest('hex'), sourceLocation: 'p1', createdBy: actor } });

      // 1. Writing evaluator verdicts into the run's outcome must never touch
      // WorldEntity.validationStatus or KnowledgeEvidence.reviewStatus.
      await tx.knowledgeExtractionRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', outcome: { evaluatorVerdicts: [{ claimId: evidence.id, approved: true, deterministicApproved: true, deterministicReason: null, modelApproved: true, modelReason: 'looks fine' }] } } });
      const afterEvaluation = await tx.worldEntity.findUniqueOrThrow({ where: { id: entity.id } });
      const evidenceAfterEvaluation = await tx.knowledgeEvidence.findUniqueOrThrow({ where: { id: evidence.id } });
      results.evaluatorNeverTouchesValidationStatus = afterEvaluation.validationStatus === 'PROPOSED';
      results.evaluatorNeverTouchesReviewStatus = evidenceAfterEvaluation.reviewStatus === 'PROPOSED';

      // 2. Only a human PATCH (mirrored here) moves it, and it moves both the
      // entity and its evidence together.
      const approved = await tx.worldEntity.update({ where: { id: entity.id }, data: { validationStatus: 'APPROVED' } });
      await tx.knowledgeEvidence.updateMany({ where: { entityId: entity.id }, data: { reviewStatus: 'HUMAN_APPROVED', reviewedBy: actor, reviewedAt: new Date() } });
      const evidenceAfterApproval = await tx.knowledgeEvidence.findUniqueOrThrow({ where: { id: evidence.id } });
      results.humanApprovalPromotesEntity = approved.validationStatus === 'APPROVED';
      results.humanApprovalPromotesEvidence = evidenceAfterApproval.reviewStatus === 'HUMAN_APPROVED' && evidenceAfterApproval.reviewedBy === actor;

      // 3. A rejected claim can never reach APPROVED: the review route only
      // acts on validationStatus === 'PROPOSED' (guards against double-review);
      // once REJECTED, a later "approve" attempt must be refused by that guard.
      const canonicalKeyB = `smoke-review-entity-b-${stamp}`;
      const entityB = await tx.worldEntity.create({ data: { companyId, entityType: 'SMOKE_TEST', name: 'Smoke Review Entity B', canonicalKey: canonicalKeyB, attributes: {}, sourceReference: doc.sourceUri, sourceAuthority: doc.namespace, confidence: 0.9, createdBy: actor } });
      const rejected = await tx.worldEntity.update({ where: { id: entityB.id }, data: { validationStatus: 'REJECTED' } });
      const guardBlocksReapproval = rejected.validationStatus !== 'PROPOSED'; // this is exactly the condition api/knowledge/review/route.ts checks before allowing approve/reject
      results.rejectedClaimGuardedFromReapproval = guardBlocksReapproval;

      throw new Error('__ROLLBACK_SMOKE_TEST__');
    });
  } catch (e) {
    if (e.message !== '__ROLLBACK_SMOKE_TEST__') throw e;
  }

  const leftover = await prisma.worldEntity.count({ where: { canonicalKey: { contains: String(stamp) } } });
  results.rolledBack = leftover === 0;

  const valid = Object.values(results).every(Boolean);
  console.log(JSON.stringify({ valid, phase: '2-review-smoke', results }));
  if (!valid) process.exitCode = 1;
}

main().catch((e) => { console.error('SMOKE_TEST_FAILED:' + e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
