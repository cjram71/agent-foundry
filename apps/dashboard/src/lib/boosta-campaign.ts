import type { MissionContract, MissionPolicyCeiling } from '@foundry/mission';

export interface CampaignRequest {
  title: string;
  objective: string;
  audience: string;
  offer: string;
  destinations: string[];
  targetLanguages: string[];
  constraints: string[];
}

const allowedDestinations = new Set(['website', 'linkedin', 'instagram', 'facebook', 'youtube', 'tiktok']);
const allowedLanguages = new Set(['sv', 'en']);

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  const result = value.trim();
  if (result.length > max) throw new Error(`${name} exceeds ${max} characters`);
  return result;
}

function list(value: unknown, allowed: Set<string>, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${name} is required`);
  const result = [...new Set(value.map(item => text(item, name, 40).toLowerCase()))];
  if (result.some(item => !allowed.has(item))) throw new Error(`${name} contains an unsupported value`);
  return result;
}

export function parseCampaignRequest(value: unknown): CampaignRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Campaign request must be an object');
  const input = value as Record<string, unknown>;
  const constraints = Array.isArray(input.constraints)
    ? input.constraints.map(item => text(item, 'constraint', 300)).slice(0, 10)
    : [];
  return {
    title: text(input.title, 'title', 140),
    objective: text(input.objective, 'objective', 2000),
    audience: text(input.audience, 'audience', 1000),
    offer: text(input.offer, 'offer', 1000),
    destinations: list(input.destinations, allowedDestinations, 'destinations'),
    targetLanguages: list(input.targetLanguages, allowedLanguages, 'targetLanguages'),
    constraints,
  };
}

export const campaignMissionCeiling: MissionPolicyCeiling = {
  maxRisk: 'medium',
  maxBudgetUsd: 10,
  maxTokenBudget: 50_000,
  maxParallelTasks: 1,
  allowedToolClasses: ['workflow', 'memory-candidate-write'],
  requiredApprovalRules: ['campaign-draft'],
};

export function campaignMission(request: CampaignRequest, actor: string): MissionContract {
  return {
    goal: `Prepare an approved campaign package: ${request.title}`,
    contextSummary: `${request.objective}\nAudience: ${request.audience}\nOffer: ${request.offer}`,
    constraints: ['No external publishing', 'Do not invent claims, rights, sources, or quotations', ...request.constraints],
    deliverables: ['Bilingual campaign draft', 'Verification evidence from the n8n campaign workflow', 'Publish-ready Markdown package'],
    definitionOfDone: ['Human approved the campaign draft', 'n8n verification returned verified', 'Audit and candidate memory evidence were recorded'],
    failureConditions: ['Draft cannot be generated', 'Approval is missing', 'n8n verification fails or returns malformed evidence'],
    riskLevel: 'medium',
    budgetUsd: 5,
    tokenBudget: 30_000,
    maxParallelTasks: 1,
    allowedToolClasses: ['workflow', 'memory-candidate-write'],
    approvalRules: ['campaign-draft'],
    businessId: 'BSTA-COMP-001',
    provenance: `operator:${actor}:boosta-campaign-v1`,
  };
}

export function campaignSource(request: CampaignRequest): string {
  return `# ${request.title}\n\n## Objective\n${request.objective}\n\n## Audience\n${request.audience}\n\n## Offer\n${request.offer}\n\n## Destinations\n${request.destinations.map(item => `- ${item}`).join('\n')}\n\n## Languages\n${request.targetLanguages.map(item => `- ${item}`).join('\n')}\n\n## Constraints\n${request.constraints.length ? request.constraints.map(item => `- ${item}`).join('\n') : '- Follow the approved Boosta company and publishing rules.'}\n`;
}
