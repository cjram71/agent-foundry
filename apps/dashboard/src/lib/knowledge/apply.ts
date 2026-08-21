import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { resolveAlias } from '@/lib/knowledge/resolve';
import type { ExtractionResult } from '@/lib/knowledge/extract';

type Document = { id: string; sourceUri: string; namespace: string };
type Generation = { tokens: number; provider: string; model: string; fallbackCount: number };

/**
 * Writes one extraction result to the graph inside the caller's transaction.
 * Entities/relations are upserted by their unique (canonicalKey) / (from,to,type)
 * keys so re-extracting the same document accumulates evidence on the existing
 * row instead of creating a duplicate. Every entity/relation gets exactly one
 * KnowledgeEvidence row (the CHECK constraint from phase 1 requires exactly
 * one of entityId/relationId). Unmatched aliases are written with entityId:
 * null, never dropped. Nothing here ever sets validationStatus/reviewStatus
 * away from its PROPOSED default — only the human review PATCH (sub-PR 3) does.
 */
export async function applyExtractionResult(
  tx: Prisma.TransactionClient,
  params: { companyId: string; document: Document; runId: string; actor: string; parsed: ExtractionResult; generation: Generation },
) {
  const { companyId, document, runId, actor, parsed, generation } = params;
  const localIdToEntityId = new Map<string, string>();

  for (const entity of parsed.entities) {
    const canonicalKey = entity.canonicalKey.trim().toLowerCase();
    const worldEntity = await tx.worldEntity.upsert({
      where: { companyId_canonicalKey: { companyId, canonicalKey } },
      update: {},
      create: { companyId, entityType: entity.entityType, name: entity.name, canonicalKey, attributes: JSON.parse(JSON.stringify(entity.attributes)), sourceReference: document.sourceUri, sourceAuthority: document.namespace, confidence: entity.confidence, createdBy: actor },
    });
    localIdToEntityId.set(entity.localId, worldEntity.id);
    await tx.knowledgeEvidence.create({ data: { companyId, documentId: document.id, extractionRunId: runId, entityId: worldEntity.id, excerpt: entity.excerpt, excerptHash: createHash('sha256').update(entity.excerpt).digest('hex'), sourceLocation: entity.sourceLocation, createdBy: actor } });
  }

  let relationCount = 0;
  for (const relation of parsed.relations) {
    const fromEntityId = localIdToEntityId.get(relation.fromLocalId);
    const toEntityId = localIdToEntityId.get(relation.toLocalId);
    if (!fromEntityId || !toEntityId) continue;
    const worldRelation = await tx.worldRelation.upsert({
      where: { companyId_fromEntityId_toEntityId_relationType: { companyId, fromEntityId, toEntityId, relationType: relation.relationType } },
      update: {},
      create: { companyId, fromEntityId, toEntityId, relationType: relation.relationType, attributes: JSON.parse(JSON.stringify(relation.attributes)), sourceReference: document.sourceUri, confidence: relation.confidence, createdBy: actor },
    });
    relationCount++;
    await tx.knowledgeEvidence.create({ data: { companyId, documentId: document.id, extractionRunId: runId, relationId: worldRelation.id, excerpt: relation.excerpt, excerptHash: createHash('sha256').update(relation.excerpt).digest('hex'), sourceLocation: relation.sourceLocation, createdBy: actor } });
  }

  for (const alias of parsed.aliases) {
    let entityId: string | null = alias.localId ? localIdToEntityId.get(alias.localId) ?? null : null;
    if (!entityId) {
      const matched = await resolveAlias(tx, companyId, alias.surfaceForm);
      entityId = matched.entityId;
    }
    await tx.knowledgeAlias.create({ data: { companyId, surfaceForm: alias.surfaceForm, entityId, extractionRunId: runId, resolutionStatus: entityId ? 'RESOLVED' : 'UNMATCHED', confidence: alias.confidence, createdBy: actor } });
  }

  const completed = await tx.knowledgeExtractionRun.update({
    where: { id: runId },
    data: { status: 'COMPLETED', outcome: { tokensUsed: generation.tokens, provider: generation.provider, model: generation.model, fallbackCount: generation.fallbackCount }, proposedEntityCount: localIdToEntityId.size, proposedEdgeCount: relationCount, completedAt: new Date() },
  });
  await tx.auditEvent.create({ data: { actor, action: 'knowledge.extraction_completed', target: completed.id, result: 'success', metadata: { proposedEntityCount: completed.proposedEntityCount, proposedEdgeCount: completed.proposedEdgeCount, aliasCount: parsed.aliases.length, executionEnabled: false } } });
  return completed;
}
