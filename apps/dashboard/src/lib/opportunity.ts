export const opportunityDecisions = ['APPROVE','REJECT','RESEARCH_MORE','NO_ACTION'] as const;
export type OpportunityDecision = typeof opportunityDecisions[number];
export const scoreKeys = ['marketDemand','customerPain','revenuePotential','profitMargin','strategicFit','technicalFeasibility','speedToMarket','competitiveAdvantage','risk','cost','aiAutomationPotential','ipPotential','scalability'] as const;
export type ScoreInput = Record<typeof scoreKeys[number], number>;

export function scoreOpportunity(input: ScoreInput) {
  for (const key of scoreKeys) if (!Number.isFinite(input[key]) || input[key] < 0 || input[key] > 10) throw new Error(`${key} must be between 0 and 10`);
  const positive = scoreKeys.filter((key) => key !== 'risk' && key !== 'cost');
  const value = positive.reduce((sum, key) => sum + input[key], 0) + (10 - input.risk) * 1.5 + (10 - input.cost);
  const total = Math.round(value / (positive.length + 2.5) * 10);
  return Math.max(0, Math.min(100, total));
}
export function isOpportunityDecision(value: unknown): value is OpportunityDecision { return opportunityDecisions.includes(value as OpportunityDecision); }
export function validateEvidence(value: unknown, minimum = 2): string[] { if (!Array.isArray(value) || value.length < minimum || value.some((item) => typeof item !== 'string' || item.trim().length < 3)) throw new Error(`At least ${minimum} evidence references are required`); return value.map((item) => item.trim()); }
