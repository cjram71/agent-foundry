export type ModelProvider = 'cloud' | 'local';
export type WorkRole = 'planner' | 'coder' | 'reviewer' | 'research' | 'writer';
export type WorkRisk = 'low' | 'medium' | 'high' | 'prohibited';
export interface ModelBudget { tokenLimit: number; dailyTokenLimit: number; maximumTaskCostUsd: number; maximumDailyCostUsd: number }
export interface ModelUsage { taskTokens: number; dailyTokens: number; taskCloudCostUsd: number; dailyCloudCostUsd: number }
export interface RouteInput { role: WorkRole; risk: WorkRisk; privacySensitive: boolean; complexity: 'simple' | 'complex'; estimatedTokens: number; cloudRatePerMillionUsd: number; cloudAvailable: boolean; localAvailable: boolean; cloudModel: string; localModel: string; budget: ModelBudget; usage: ModelUsage }
export interface RouteDecision { allowed: boolean; provider?: ModelProvider; model?: string; reason: string; projectedTaskTokens: number; projectedDailyTokens: number; projectedTaskCostUsd: number; projectedDailyCostUsd: number }
const safe = (value: number) => Number.isFinite(value) && value >= 0 ? value : 0;
export function utcDayStart(now: Date): Date { return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); }
export function routeModel(input: RouteInput): RouteDecision {
  const estimate = safe(input.estimatedTokens), projectedTaskTokens = safe(input.usage.taskTokens) + estimate, projectedDailyTokens = safe(input.usage.dailyTokens) + estimate;
  const rate = safe(input.cloudRatePerMillionUsd), incrementalCost = estimate / 1_000_000 * rate;
  const projectedTaskCostUsd = safe(input.usage.taskCloudCostUsd) + incrementalCost, projectedDailyCostUsd = safe(input.usage.dailyCloudCostUsd) + incrementalCost;
  const base = { projectedTaskTokens, projectedDailyTokens, projectedTaskCostUsd, projectedDailyCostUsd };
  if (input.risk === 'prohibited') return { allowed: false, reason: 'Prohibited work is never routed to a model.', ...base };
  if (input.budget.tokenLimit <= 0 || projectedTaskTokens > input.budget.tokenLimit) return { allowed: false, reason: 'Task token limit would be exceeded.', ...base };
  if (input.budget.dailyTokenLimit <= 0 || projectedDailyTokens > input.budget.dailyTokenLimit) return { allowed: false, reason: 'Daily token limit would be exceeded.', ...base };
  const localPreferred = input.privacySensitive || input.complexity === 'simple' || input.risk === 'low';
  if (localPreferred && input.localAvailable) return { allowed: true, provider: 'local', model: input.localModel, reason: input.privacySensitive ? 'Privacy-sensitive work is routed locally.' : 'Simple or low-risk work is routed locally.', ...base, projectedTaskCostUsd: input.usage.taskCloudCostUsd, projectedDailyCostUsd: input.usage.dailyCloudCostUsd };
  const cloudConfigured = rate > 0 && input.budget.maximumTaskCostUsd > 0 && input.budget.maximumDailyCostUsd > 0;
  const cloudWithinBudget = cloudConfigured && projectedTaskCostUsd <= input.budget.maximumTaskCostUsd && projectedDailyCostUsd <= input.budget.maximumDailyCostUsd;
  if (input.cloudAvailable && cloudWithinBudget) return { allowed: true, provider: 'cloud', model: input.cloudModel, reason: 'Complex work is within configured cloud task and daily budgets.', ...base };
  if (input.localAvailable) return { allowed: true, provider: 'local', model: input.localModel, reason: cloudConfigured ? 'Cloud budget is unavailable or exhausted; routed locally.' : 'Cloud pricing or cost limits are not configured; routed locally.', ...base, projectedTaskCostUsd: input.usage.taskCloudCostUsd, projectedDailyCostUsd: input.usage.dailyCloudCostUsd };
  return { allowed: false, reason: cloudConfigured ? 'No model is available within budget.' : 'Cloud pricing/cost limits are unconfigured and no local model is available.', ...base };
}
