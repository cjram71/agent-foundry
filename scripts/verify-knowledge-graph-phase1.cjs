const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const companyId = 'BSTA-COMP-001';
const actor = 'verify-knowledge-graph-phase1';
const stamp = Date.now();

async function main() {
  const results = {};

  // Phase A: happy-path relation chain (document -> extraction run -> entity/alias/evidence),
  // rolled back deliberately so nothing persists from this smoke test.
  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.knowledgeDocument.create({ data: { companyId, namespace: 'crm', title: 'Smoke test document', sourceUri: 'test://smoke', contentHash: `smoke-${stamp}-a`, createdBy: actor } });
      const approvedDoc = await tx.knowledgeDocument.update({ where: { id: doc.id }, data: { ingestionStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date() } });
      const run = await tx.knowledgeExtractionRun.create({ data: { companyId, documentId: doc.id, model: 'smoke-model', promptVersion: 'v1', schemaVersion: 'v1', createdBy: actor } });
      const entity = await tx.worldEntity.create({ data: { companyId, entityType: 'SMOKE_TEST', name: 'Smoke Entity', canonicalKey: `smoke-entity-${stamp}-a`, attributes: {}, sourceReference: 'smoke', sourceAuthority: actor, createdBy: actor } });
      const matchedAlias = await tx.knowledgeAlias.create({ data: { companyId, surfaceForm: 'Smoke Alias', entityId: entity.id, extractionRunId: run.id, resolutionStatus: 'RESOLVED', createdBy: actor } });
      const unmatchedAlias = await tx.knowledgeAlias.create({ data: { companyId, surfaceForm: 'Unmatched Name', extractionRunId: run.id, resolutionStatus: 'UNMATCHED', createdBy: actor } });
      const evidence = await tx.knowledgeEvidence.create({ data: { companyId, documentId: doc.id, extractionRunId: run.id, entityId: entity.id, excerpt: 'smoke excerpt', excerptHash: 'hash-a', sourceLocation: 'p1', createdBy: actor } });

      results.documentApproved = approvedDoc.ingestionStatus === 'APPROVED';
      results.extractionRunLinked = run.documentId === doc.id;
      results.matchedAliasLinked = matchedAlias.entityId === entity.id;
      results.unmatchedAliasKept = unmatchedAlias.entityId === null && unmatchedAlias.resolutionStatus === 'UNMATCHED';
      results.evidenceLinkedToEntity = evidence.entityId === entity.id && evidence.relationId === null;

      throw new Error('__ROLLBACK_SMOKE_TEST__');
    });
  } catch (e) {
    if (e.message !== '__ROLLBACK_SMOKE_TEST__') throw e;
  }
  const leftover = await prisma.knowledgeDocument.count({ where: { contentHash: `smoke-${stamp}-a` } });
  results.phaseARolledBack = leftover === 0;

  // Phase B: KnowledgeEvidence_exactly_one_target_check must reject neither/both entityId+relationId set.
  // Fixtures are committed (each statement needs its own transaction to keep testing after a rejection),
  // then explicitly deleted at the end.
  const fixtureDoc = await prisma.knowledgeDocument.create({ data: { companyId, namespace: 'crm', title: 'Smoke check fixture', sourceUri: 'test://smoke-check', contentHash: `smoke-${stamp}-b`, createdBy: actor } });
  const fixtureRun = await prisma.knowledgeExtractionRun.create({ data: { companyId, documentId: fixtureDoc.id, model: 'smoke-model', promptVersion: 'v1', schemaVersion: 'v1', createdBy: actor } });
  const fixtureEntity = await prisma.worldEntity.create({ data: { companyId, entityType: 'SMOKE_TEST', name: 'Smoke Check Entity', canonicalKey: `smoke-entity-${stamp}-b`, attributes: {}, sourceReference: 'smoke', sourceAuthority: actor, createdBy: actor } });
  const fixtureRelation = await prisma.worldRelation.create({ data: { companyId, fromEntityId: fixtureEntity.id, toEntityId: fixtureEntity.id, relationType: 'SMOKE_SELF_TEST', attributes: {}, sourceReference: 'smoke', createdBy: actor } });

  let rejectedNeither = false;
  try {
    await prisma.knowledgeEvidence.create({ data: { companyId, documentId: fixtureDoc.id, extractionRunId: fixtureRun.id, excerpt: 'bad-neither', excerptHash: 'h', sourceLocation: 'p', createdBy: actor } });
  } catch (e) { rejectedNeither = true; }

  let rejectedBoth = false;
  try {
    await prisma.knowledgeEvidence.create({ data: { companyId, documentId: fixtureDoc.id, extractionRunId: fixtureRun.id, entityId: fixtureEntity.id, relationId: fixtureRelation.id, excerpt: 'bad-both', excerptHash: 'h', sourceLocation: 'p', createdBy: actor } });
  } catch (e) { rejectedBoth = true; }

  results.checkRejectsNeitherTarget = rejectedNeither;
  results.checkRejectsBothTargets = rejectedBoth;

  await prisma.worldRelation.delete({ where: { id: fixtureRelation.id } });
  await prisma.worldEntity.delete({ where: { id: fixtureEntity.id } });
  await prisma.knowledgeExtractionRun.delete({ where: { id: fixtureRun.id } });
  await prisma.knowledgeDocument.delete({ where: { id: fixtureDoc.id } });

  const valid = Object.values(results).every(Boolean);
  console.log(JSON.stringify({ valid, phase: '1-schema-smoke', results }));
  if (!valid) process.exitCode = 1;
}

main().catch((e) => { console.error('SMOKE_TEST_FAILED:' + e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
