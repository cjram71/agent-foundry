export interface SelectedAgent {
  catalogId: string;
  name: string;
  reason: string;
  responsibilities: string[];
}

export interface PlanStep {
  order: number;
  title: string;
  description: string;
  files: string[];
  validation: string;
}

export interface CatalogProvenance {
  repository: string;
  commit: string;
  pinned: boolean;
}

export interface Plan {
  summary: string;
  selectedAgents: SelectedAgent[];
  catalogSource: CatalogProvenance;
  steps: PlanStep[];
  risks: string[];
  acceptanceCriteria: string[];
}

export const CATALOG_REPOSITORY = 'https://github.com/cjram71/500-AI-Agents-Projects';

function reject(reason: string): never {
  throw new Error(`Planner response rejected: ${reason}`);
}

/**
 * Deterministic admission check for planner output. The model proposes; this
 * function owns what is acceptable. Rejection is never repaired — the planner
 * regenerates under the same prompt on the next queue attempt.
 *
 * Enforced constraints:
 *  - agent membership: every catalogId must come from the verified catalog
 *    whitelist; no duplicates; 1..maxAgents selections
 *  - shape + size bounds on every free-text field (prompt-injection and
 *    storage-hygiene bounds)
 *  - quality gate: the selected team must carry a code review AND a testing
 *    responsibility (the prompt demands it; here it is enforced)
 *  - provenance is stamped server-side; planner-supplied provenance is ignored
 */
export function validatePlan(value: unknown, allowedAgents: ReadonlySet<string>, provenance: CatalogProvenance, maxAgents = 5): Plan {
  if (!value || typeof value !== 'object') reject('not an object');
  const plan = value as Plan;
  if (typeof plan.summary !== 'string' || plan.summary.trim().length < 10 || plan.summary.length > 2000) reject('summary missing or out of bounds');
  if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 20) reject('steps missing or out of bounds (1-20)');
  if (!Array.isArray(plan.risks) || plan.risks.length > 10) reject('risks must be an array of at most 10 entries');
  if (plan.risks.some((risk) => typeof risk !== 'string' || !risk.trim() || risk.length > 300)) reject('a risk entry is invalid');
  if (!Array.isArray(plan.acceptanceCriteria) || plan.acceptanceCriteria.length < 1 || plan.acceptanceCriteria.length > 12) reject('acceptance criteria missing or out of bounds (1-12)');
  if (plan.acceptanceCriteria.some((criterion) => typeof criterion !== 'string' || !criterion.trim() || criterion.length > 300)) reject('an acceptance criterion is invalid');

  if (!Array.isArray(plan.selectedAgents) || plan.selectedAgents.length < 1 || plan.selectedAgents.length > maxAgents) reject(`must select between 1 and ${maxAgents} catalog agents`);
  const seen = new Set<string>();
  for (const agent of plan.selectedAgents) {
    if (!agent || typeof agent !== 'object') reject('an agent selection is not an object');
    if (typeof agent.catalogId !== 'string' || !allowedAgents.has(agent.catalogId)) reject(`agent "${String(agent?.catalogId)}" is not in the verified catalog`);
    if (seen.has(agent.catalogId)) reject(`agent "${agent.catalogId}" was selected twice`);
    seen.add(agent.catalogId);
    if (typeof agent.name !== 'string' || !agent.name.trim() || agent.name.length > 120) reject(`name for "${agent.catalogId}" is invalid`);
    if (typeof agent.reason !== 'string' || agent.reason.trim().length < 10 || agent.reason.length > 600) reject(`reason for "${agent.catalogId}" missing or out of bounds`);
    if (!Array.isArray(agent.responsibilities) || agent.responsibilities.length < 1 || agent.responsibilities.length > 10) reject(`responsibilities for "${agent.catalogId}" missing or out of bounds (1-10)`);
    if (agent.responsibilities.some((responsibility) => typeof responsibility !== 'string' || !responsibility.trim() || responsibility.length > 240)) reject(`a responsibility for "${agent.catalogId}" is invalid`);
  }

  for (const step of plan.steps) {
    if (!step || typeof step !== 'object') reject('a step is not an object');
    if (typeof step.order !== 'number' || !Number.isFinite(step.order)) reject('a step order is not a finite number');
    if (typeof step.title !== 'string' || !step.title.trim() || step.title.length > 160) reject('a step title is invalid');
    if (typeof step.description !== 'string' || !step.description.trim() || step.description.length > 600) reject('a step description is invalid');
    if (!Array.isArray(step.files) || step.files.length > 30 || step.files.some((file) => typeof file !== 'string' || file.length > 200)) reject('a step files list is invalid');
    if (typeof step.validation !== 'string' || !step.validation.trim() || step.validation.length > 300) reject('a step validation string is invalid');
  }

  // Quality gate: the planner prompt requires code review and testing
  // responsibilities in every team; enforce it deterministically.
  const responsibilityText = plan.selectedAgents.flatMap((agent) => agent.responsibilities).join('\n');
  if (!/review/i.test(responsibilityText)) reject('selected team must include a code review responsibility');
  if (!/test/i.test(responsibilityText)) reject('selected team must include a testing responsibility');

  plan.catalogSource = provenance;
  return plan;
}
