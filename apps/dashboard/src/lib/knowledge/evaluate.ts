import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { generateKnowledge } from '@foundry/knowledge-model';

type QueryClient = PrismaClient | Prisma.TransactionClient;

export type ClaimVerdict = { claimId: string; deterministicApproved: boolean; deterministicReason: string | null; modelApproved: boolean | null; modelReason: string | null; approved: boolean };
export type EvaluationResult = { verdicts: ClaimVerdict[]; approvedCount: number; rejectedCount: number };

export type EvidenceForEval = {
  id: string;
  companyId: string;
  excerpt: string;
  excerptHash: string;
  sourceLocation: string;
  entityId: string | null;
  relationId: string | null;
  entity: { companyId: string; confidence: number; name: string } | null;
  relation: { companyId: string; confidence: number; relationType: string } | null;
};

/**
 * Lens A — deterministic, always runs, no model call. Any violation rejects
 * that claim regardless of Lens B. Defense in depth on top of the DB CHECK
 * constraint and apply.ts's own writes, not a replacement for either.
 * Exported (unlike Lens B) because it's pure and worth unit-testing directly;
 * evaluateExtractionRun's own model call is not mocked in tests, so exercise
 * that path only through the DB-integration verify script.
 */
export function evaluateEvidenceDeterministically(row: EvidenceForEval): { approved: boolean; reason: string | null } {
  if (createHash('sha256').update(row.excerpt).digest('hex') !== row.excerptHash) return { approved: false, reason: 'excerpt hash does not match the stored excerpt' };
  if (!row.sourceLocation.trim()) return { approved: false, reason: 'missing source location' };
  const hasEntity = row.entityId !== null, hasRelation = row.relationId !== null;
  if (hasEntity === hasRelation) return { approved: false, reason: 'evidence must cite exactly one entity or relation' };
  const target = row.entity ?? row.relation;
  if (!target) return { approved: false, reason: 'cited entity or relation could not be loaded' };
  if (target.companyId !== row.companyId) return { approved: false, reason: 'cited entity/relation belongs to a different company' };
  if (!Number.isFinite(target.confidence) || target.confidence < 0 || target.confidence > 1) return { approved: false, reason: 'confidence is out of range' };
  return { approved: true, reason: null };
}

export function buildFidelityPrompt(rows: EvidenceForEval[]): string {
  const claims = rows.map((row) => ({ claimId: row.id, subject: row.entity ? `entity: ${row.entity.name}` : `relation: ${row.relation?.relationType}`, excerpt: row.excerpt }));
  return `You are an evidence-fidelity judge for a knowledge graph. For each claim below, judge only whether its excerpt textually supports the claim — do not use outside knowledge, do not guess.

CLAIMS
${JSON.stringify(claims, null, 2)}

Return ONLY a JSON array, nothing else, no markdown fences: [{"claimId": string, "verdict": "APPROVED" or "REJECTED", "reason": string}], with exactly one entry per claim above.`;
}

export function parseFidelityVerdicts(text: string, expectedClaimIds: string[]): Array<{ claimId: string; verdict: 'APPROVED' | 'REJECTED'; reason: string }> {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Fidelity verdict response was not valid JSON'); }
  if (!Array.isArray(parsed)) throw new Error('Fidelity verdict response must be a JSON array');
  const expected = new Set(expectedClaimIds);
  const seen = new Set<string>();
  const result = parsed.map((raw, index) => {
    const v = raw as Record<string, unknown>;
    if (typeof v.claimId !== 'string' || !expected.has(v.claimId)) throw new Error(`verdicts[${index}].claimId must reference a claim in this run`);
    if (seen.has(v.claimId)) throw new Error(`verdicts[${index}].claimId is duplicated`);
    seen.add(v.claimId);
    if (v.verdict !== 'APPROVED' && v.verdict !== 'REJECTED') throw new Error(`verdicts[${index}].verdict must be APPROVED or REJECTED`);
    const verdict: 'APPROVED' | 'REJECTED' = v.verdict;
    return { claimId: v.claimId, verdict, reason: typeof v.reason === 'string' ? v.reason.slice(0, 500) : '' };
  });
  if (seen.size !== expected.size) throw new Error('Fidelity verdict response must include exactly one entry per claim');
  return result;
}

/**
 * Runs once per extraction run (not per claim, to bound cost). A claim is
 * `approved` only when BOTH lenses agree. Verdicts are advisory display data
 * only — nothing here ever writes to WorldEntity/WorldRelation.validationStatus
 * or KnowledgeEvidence.reviewStatus. Only the human review PATCH does that.
 * If Lens B's model call fails outright, every claim simply has no model
 * verdict (modelApproved: null → approved: false) rather than the whole
 * evaluation throwing — a human can still review every claim manually.
 */
export async function evaluateExtractionRun(client: QueryClient, params: { runId: string; companyId: string }): Promise<EvaluationResult> {
  const rows = (await client.knowledgeEvidence.findMany({
    where: { extractionRunId: params.runId, companyId: params.companyId },
    include: { entity: { select: { companyId: true, confidence: true, name: true } }, relation: { select: { companyId: true, confidence: true, relationType: true } } },
  })) as EvidenceForEval[];

  const deterministic = new Map(rows.map((row) => [row.id, evaluateEvidenceDeterministically(row)]));

  let modelVerdicts = new Map<string, { approved: boolean; reason: string }>();
  if (rows.length) {
    try {
      const prompt = buildFidelityPrompt(rows);
      const claimIds = rows.map((row) => row.id);
      const response = await generateKnowledge(prompt, 'private-analysis', (text) => { parseFidelityVerdicts(text, claimIds); });
      modelVerdicts = new Map(parseFidelityVerdicts(response.text, claimIds).map((v) => [v.claimId, { approved: v.verdict === 'APPROVED', reason: v.reason }]));
    } catch {
      // Lens B unavailable this run — leave modelVerdicts empty; see doc comment above.
    }
  }

  const verdicts: ClaimVerdict[] = rows.map((row) => {
    const det = deterministic.get(row.id)!;
    const mod = modelVerdicts.get(row.id) ?? null;
    return { claimId: row.id, deterministicApproved: det.approved, deterministicReason: det.reason, modelApproved: mod ? mod.approved : null, modelReason: mod?.reason ?? null, approved: det.approved && mod?.approved === true };
  });

  return { verdicts, approvedCount: verdicts.filter((v) => v.approved).length, rejectedCount: verdicts.filter((v) => !v.approved).length };
}
