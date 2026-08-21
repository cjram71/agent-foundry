import type { OpenAiJsonSchema } from '@foundry/knowledge-model';

export type ExtractionEntity = { localId: string; entityType: string; name: string; canonicalKey: string; attributes: Record<string, unknown>; confidence: number; excerpt: string; sourceLocation: string };
export type ExtractionRelation = { fromLocalId: string; toLocalId: string; relationType: string; attributes: Record<string, unknown>; confidence: number; excerpt: string; sourceLocation: string };
export type ExtractionAlias = { surfaceForm: string; localId: string | null; confidence: number };
export type ExtractionResult = { entities: ExtractionEntity[]; relations: ExtractionRelation[]; aliases: ExtractionAlias[] };

const MAX_ENTITIES = 30;
const MAX_RELATIONS = 60;
const MAX_ALIASES = 40;

/** For generateKnowledge's OpenAI fallback leg — see OpenAiJsonSchema's doc
 * comment for why this exists and why it's non-strict. */
export const EXTRACTION_JSON_SCHEMA: OpenAiJsonSchema = {
  name: 'knowledge_extraction_result',
  schema: {
    type: 'object',
    properties: {
      entities: { type: 'array', maxItems: MAX_ENTITIES, items: { type: 'object', properties: { localId: { type: 'string' }, entityType: { type: 'string' }, name: { type: 'string' }, canonicalKey: { type: 'string' }, attributes: { type: 'object' }, confidence: { type: 'number' }, excerpt: { type: 'string' }, sourceLocation: { type: 'string' } }, required: ['localId', 'entityType', 'name', 'canonicalKey', 'attributes', 'confidence', 'excerpt', 'sourceLocation'] } },
      relations: { type: 'array', maxItems: MAX_RELATIONS, items: { type: 'object', properties: { fromLocalId: { type: 'string' }, toLocalId: { type: 'string' }, relationType: { type: 'string' }, attributes: { type: 'object' }, confidence: { type: 'number' }, excerpt: { type: 'string' }, sourceLocation: { type: 'string' } }, required: ['fromLocalId', 'toLocalId', 'relationType', 'attributes', 'confidence', 'excerpt', 'sourceLocation'] } },
      aliases: { type: 'array', maxItems: MAX_ALIASES, items: { type: 'object', properties: { surfaceForm: { type: 'string' }, localId: { type: ['string', 'null'] }, confidence: { type: 'number' } }, required: ['surfaceForm', 'localId', 'confidence'] } },
    },
    required: ['entities', 'relations', 'aliases'],
  },
};

export function buildExtractionPrompt(document: { title: string; namespace: string; content: string }): string {
  return `You are a provenance-first knowledge extraction agent. Read the document below and propose structured facts. Every fact MUST be traceable to a short verbatim excerpt from the document text below — never infer beyond what the text states, and never invent entities, relationships, or aliases that are not grounded in the text.

DOCUMENT
Title: ${document.title}
Namespace: ${document.namespace}
---
${document.content}
---

Return ONLY valid JSON with exactly this shape, nothing else, no markdown fences:
{
  "entities": [{"localId": string, "entityType": string, "name": string, "canonicalKey": string, "attributes": object, "confidence": number (0-1), "excerpt": string (verbatim from the document), "sourceLocation": string (e.g. a paragraph or line reference)}],
  "relations": [{"fromLocalId": string, "toLocalId": string, "relationType": string, "attributes": object, "confidence": number (0-1), "excerpt": string (verbatim), "sourceLocation": string}],
  "aliases": [{"surfaceForm": string, "localId": string or null, "confidence": number (0-1)}]
}
localId values are your own temporary identifiers used only to link relations/aliases to entities within this response — they are not stored. canonicalKey should be a normalized, stable identifier for the entity (lowercase, hyphen-separated, no punctuation). Return at most ${MAX_ENTITIES} entities, ${MAX_RELATIONS} relations, and ${MAX_ALIASES} aliases. If nothing in the text can be grounded this way, return empty arrays rather than guessing.`;
}

const isFiniteConfidence = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const nonEmptyString = (value: unknown, limit: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const asAttributes = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** Throws with a descriptive message on any schema violation. generateKnowledge()
 * treats a thrown validate() as retryable and falls back to the next provider —
 * a malformed or ungrounded response is never silently accepted. */
export function parseExtraction(text: string): ExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Extraction response was not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Extraction response must be a JSON object');
  const { entities, relations, aliases } = parsed as Record<string, unknown>;
  if (!Array.isArray(entities) || entities.length > MAX_ENTITIES) throw new Error(`entities must be an array of at most ${MAX_ENTITIES}`);
  if (!Array.isArray(relations) || relations.length > MAX_RELATIONS) throw new Error(`relations must be an array of at most ${MAX_RELATIONS}`);
  if (!Array.isArray(aliases) || aliases.length > MAX_ALIASES) throw new Error(`aliases must be an array of at most ${MAX_ALIASES}`);

  const seenLocalIds = new Set<string>();
  const safeEntities: ExtractionEntity[] = entities.map((raw, index) => {
    const e = raw as Record<string, unknown>;
    if (!nonEmptyString(e.localId, 100)) throw new Error(`entities[${index}].localId is required`);
    if (seenLocalIds.has(e.localId)) throw new Error(`entities[${index}].localId is duplicated`);
    seenLocalIds.add(e.localId);
    if (!nonEmptyString(e.entityType, 80)) throw new Error(`entities[${index}].entityType is required`);
    if (!nonEmptyString(e.name, 300)) throw new Error(`entities[${index}].name is required`);
    if (!nonEmptyString(e.canonicalKey, 300)) throw new Error(`entities[${index}].canonicalKey is required`);
    if (!isFiniteConfidence(e.confidence)) throw new Error(`entities[${index}].confidence must be a number in [0,1]`);
    if (!nonEmptyString(e.excerpt, 2000)) throw new Error(`entities[${index}].excerpt is required`);
    if (!nonEmptyString(e.sourceLocation, 200)) throw new Error(`entities[${index}].sourceLocation is required`);
    return { localId: e.localId, entityType: e.entityType, name: e.name, canonicalKey: e.canonicalKey, attributes: asAttributes(e.attributes), confidence: e.confidence, excerpt: e.excerpt, sourceLocation: e.sourceLocation };
  });

  const safeRelations: ExtractionRelation[] = relations.map((raw, index) => {
    const r = raw as Record<string, unknown>;
    if (!nonEmptyString(r.fromLocalId, 100) || !seenLocalIds.has(r.fromLocalId)) throw new Error(`relations[${index}].fromLocalId must reference a declared entity`);
    if (!nonEmptyString(r.toLocalId, 100) || !seenLocalIds.has(r.toLocalId)) throw new Error(`relations[${index}].toLocalId must reference a declared entity`);
    if (!nonEmptyString(r.relationType, 80)) throw new Error(`relations[${index}].relationType is required`);
    if (!isFiniteConfidence(r.confidence)) throw new Error(`relations[${index}].confidence must be a number in [0,1]`);
    if (!nonEmptyString(r.excerpt, 2000)) throw new Error(`relations[${index}].excerpt is required`);
    if (!nonEmptyString(r.sourceLocation, 200)) throw new Error(`relations[${index}].sourceLocation is required`);
    return { fromLocalId: r.fromLocalId, toLocalId: r.toLocalId, relationType: r.relationType, attributes: asAttributes(r.attributes), confidence: r.confidence, excerpt: r.excerpt, sourceLocation: r.sourceLocation };
  });

  const safeAliases: ExtractionAlias[] = aliases.map((raw, index) => {
    const a = raw as Record<string, unknown>;
    if (!nonEmptyString(a.surfaceForm, 300)) throw new Error(`aliases[${index}].surfaceForm is required`);
    if (a.localId !== null && (!nonEmptyString(a.localId, 100) || !seenLocalIds.has(a.localId))) throw new Error(`aliases[${index}].localId must be null or reference a declared entity`);
    if (!isFiniteConfidence(a.confidence)) throw new Error(`aliases[${index}].confidence must be a number in [0,1]`);
    return { surfaceForm: a.surfaceForm, localId: (a.localId as string | null) ?? null, confidence: a.confidence };
  });

  return { entities: safeEntities, relations: safeRelations, aliases: safeAliases };
}
