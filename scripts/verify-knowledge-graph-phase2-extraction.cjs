const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const companyId = 'BSTA-COMP-001';
const actor = 'verify-knowledge-graph-phase2-extraction';
const stamp = Date.now();

// Mirrors apps/dashboard/src/lib/knowledge/apply.ts's write shape so this
// script can exercise the same DB invariants without importing TypeScript
// application source (this repo's verify-*.cjs convention talks to Prisma
// directly — see scripts/verify-knowledge-graph-phase1.cjs).
async function applyOneClaim(tx, { entityCanonicalKey, sourceUri, namespace, documentId, runId, excerpt, sourceLocation }) {
  const entity = await tx.worldEntity.upsert({
    where: { companyId_canonicalKey: { companyId, canonicalKey: entityCanonicalKey } },
    update: {},
    create: { companyId, entityType: 'SMOKE_TEST', name: entityCanonicalKey, canonicalKey: entityCanonicalKey, attributes: {}, sourceReference: sourceUri, sourceAuthority: namespace, confidence: 0.9, createdBy: actor },
  });
  await tx.knowledgeEvidence.create({ data: { companyId, documentId, extractionRunId: runId, entityId: entity.id, excerpt, excerptHash: createHash('sha256').update(excerpt).digest('hex'), sourceLocation, createdBy: actor } });
  return entity;
}

async function main() {
  const results = {};
  const canonicalKeyA = `smoke-entity-a-${stamp}`;
  const canonicalKeyB = `smoke-entity-b-${stamp}`;

  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.knowledgeDocument.create({ data: { companyId, namespace: 'crm', title: 'Smoke extraction document', sourceUri: 'test://smoke-extraction', content: 'Entity A relates to Entity B.', contentHash: `smoke-${stamp}-extraction`, ingestionStatus: 'APPROVED', createdBy: actor } });
      const run = await tx.knowledgeExtractionRun.create({ data: { companyId, documentId: doc.id, model: 'smoke-model', promptVersion: 'v1', schemaVersion: 'v1', status: 'PENDING', createdBy: actor } });

      const entityA = await applyOneClaim(tx, { entityCanonicalKey: canonicalKeyA, sourceUri: doc.sourceUri, namespace: doc.namespace, documentId: doc.id, runId: run.id, excerpt: 'Entity A relates to Entity B.', sourceLocation: 'p1' });
      const entityB = await applyOneClaim(tx, { entityCanonicalKey: canonicalKeyB, sourceUri: doc.sourceUri, namespace: doc.namespace, documentId: doc.id, runId: run.id, excerpt: 'Entity A relates to Entity B.', sourceLocation: 'p1' });

      // Re-extraction of the same document (or a second document mentioning
      // the same entity) must accumulate evidence on the existing WorldEntity,
      // never create a duplicate row.
      const entityAAgain = await applyOneClaim(tx, { entityCanonicalKey: canonicalKeyA, sourceUri: doc.sourceUri, namespace: doc.namespace, documentId: doc.id, runId: run.id, excerpt: 'Entity A mentioned again.', sourceLocation: 'p2' });
      results.upsertIsIdempotentByCanonicalKey = entityAAgain.id === entityA.id;

      const entityCount = await tx.worldEntity.count({ where: { canonicalKey: { in: [canonicalKeyA, canonicalKeyB] } } });
      results.noDuplicateEntityCreated = entityCount === 2;

      const relation = await tx.worldRelation.upsert({
        where: { companyId_fromEntityId_toEntityId_relationType: { companyId, fromEntityId: entityA.id, toEntityId: entityB.id, relationType: 'SMOKE_RELATES_TO' } },
        update: {},
        create: { companyId, fromEntityId: entityA.id, toEntityId: entityB.id, relationType: 'SMOKE_RELATES_TO', attributes: {}, sourceReference: doc.sourceUri, confidence: 0.8, createdBy: actor },
      });
      const relationExcerpt = 'Entity A relates to Entity B.';
      await tx.knowledgeEvidence.create({ data: { companyId, documentId: doc.id, extractionRunId: run.id, relationId: relation.id, excerpt: relationExcerpt, excerptHash: createHash('sha256').update(relationExcerpt).digest('hex'), sourceLocation: 'p1', createdBy: actor } });

      const evidenceCount = await tx.knowledgeEvidence.count({ where: { extractionRunId: run.id } });
      // 3 entity-citing evidence rows (A, B, A-again) + 1 relation-citing evidence row = 4, one per claim.
      results.exactlyOneEvidencePerClaim = evidenceCount === 4;

      // Matched alias: resolves to an entity from this run.
      await tx.knowledgeAlias.create({ data: { companyId, surfaceForm: 'Entity A', entityId: entityA.id, extractionRunId: run.id, resolutionStatus: 'RESOLVED', confidence: 0.9, createdBy: actor } });
      // Unmatched alias: kept with entityId null, never dropped.
      await tx.knowledgeAlias.create({ data: { companyId, surfaceForm: 'An unresolved mention', entityId: null, extractionRunId: run.id, resolutionStatus: 'UNMATCHED', confidence: 0.4, createdBy: actor } });

      const unmatched = await tx.knowledgeAlias.findFirst({ where: { extractionRunId: run.id, resolutionStatus: 'UNMATCHED' } });
      results.unmatchedAliasKeptNotDropped = unmatched !== null && unmatched.entityId === null;

      await tx.knowledgeExtractionRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', outcome: { tokensUsed: 500 }, proposedEntityCount: 2, proposedEdgeCount: 1, completedAt: new Date() } });

      throw new Error('__ROLLBACK_SMOKE_TEST__');
    });
  } catch (e) {
    if (e.message !== '__ROLLBACK_SMOKE_TEST__') throw e;
  }

  const leftoverEntities = await prisma.worldEntity.count({ where: { canonicalKey: { in: [canonicalKeyA, canonicalKeyB] } } });
  results.rolledBack = leftoverEntities === 0;

  const valid = Object.values(results).every(Boolean);
  console.log(JSON.stringify({ valid, phase: '2-extraction-smoke', results }));
  if (!valid) process.exitCode = 1;
}

main().catch((e) => { console.error('SMOKE_TEST_FAILED:' + e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
