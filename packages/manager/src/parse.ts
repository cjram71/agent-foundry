// Deterministic parsing of an AI Project Manager evaluation plan.
//
// The evaluation is produced by the planning worker and stored as JSON in
// AgentRun.outputSummary. Like every AI work product it is UNTRUSTED DATA:
// this module treats it as bytes, validates it defensively, caps every
// dimension, and returns plain descriptors — it never executes, fetches,
// or interprets content as instructions. Anything that fails validation is
// dropped (and counted), never repaired.

/** Hard caps (mirrors the planner's 1-12 step bound; titles match task-create rules). */
export const MANAGER_LIMITS = {
  maxSteps: 12,
  maxTitleLength: 160,
  minTitleLength: 3,
  maxDescriptionLength: 4000,
  maxValidationLength: 1000,
  maxAcceptanceCriteria: 12,
  maxCriterionLength: 500,
} as const;

export interface ManagerStepDescriptor {
  order: number;
  title: string;
  description: string;
  validation: string | null;
}

export interface ManagerPlanParse {
  /** Accepted steps, in plan order, re-sequenced 1..n. */
  steps: ManagerStepDescriptor[];
  /** Top-level acceptance criteria (bounded, sanitized). */
  acceptanceCriteria: string[];
  /** How many candidate items were dropped as malformed/over-limit/duplicated. */
  dropped: number;
}

/** Strip control characters (prompt-injection hygiene for downstream assembly). */
export function sanitizeText(value: string): string {
  return value.replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function asBoundedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = sanitizeText(value);
  if (!cleaned || cleaned.length > max) return null;
  return cleaned;
}

/**
 * Parse a stored planner output into bounded step descriptors.
 * `raw` is untrusted (any string). Returns null only when the document is
 * not a plan object at all; malformed individual steps are dropped and
 * counted rather than failing the whole parse.
 */
export function parseManagerPlan(raw: unknown): ManagerPlanParse | null {
  let doc: unknown;
  try {
    doc = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const record = doc as Record<string, unknown>;
  const rawSteps = Array.isArray(record.steps) ? record.steps : [];
  const rawCriteria = Array.isArray(record.acceptanceCriteria) ? record.acceptanceCriteria : [];

  const steps: ManagerStepDescriptor[] = [];
  let dropped = 0;
  const seenTitles = new Set<string>();

  for (const candidate of rawSteps.slice(0, MANAGER_LIMITS.maxSteps)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) { dropped++; continue; }
    const step = candidate as Record<string, unknown>;
    const title = asBoundedString(step.title, MANAGER_LIMITS.maxTitleLength);
    const description = asBoundedString(step.description, MANAGER_LIMITS.maxDescriptionLength) ?? '';
    if (!title || title.length < MANAGER_LIMITS.minTitleLength) { dropped++; continue; }
    const dedupeKey = title.toLowerCase();
    if (seenTitles.has(dedupeKey)) { dropped++; continue; }
    seenTitles.add(dedupeKey);
    const validation = asBoundedString(step.validation, MANAGER_LIMITS.maxValidationLength);
    steps.push({ order: steps.length + 1, title, description, validation });
  }
  dropped += Math.max(0, rawSteps.length - MANAGER_LIMITS.maxSteps);

  const acceptanceCriteria: string[] = [];
  for (const criterion of rawCriteria.slice(0, MANAGER_LIMITS.maxAcceptanceCriteria)) {
    const cleaned = asBoundedString(criterion, MANAGER_LIMITS.maxCriterionLength);
    if (cleaned) acceptanceCriteria.push(cleaned);
  }

  return { steps, acceptanceCriteria, dropped };
}
