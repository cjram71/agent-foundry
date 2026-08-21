import prisma from '@/lib/prisma';
import { estimateUsd, parseRatePerMillion, RATE_ENV } from '@foundry/cost';
import { routeModel, utcDayStart } from '@foundry/model-router';

/**
 * generateKnowledge() (@foundry/knowledge-model) has no pre-call token/cost
 * gate of its own. routeModel()'s cloud/local provider split doesn't match
 * generateKnowledge's three-provider chain, so we reuse it only for its
 * projected-usage math (with cloudAvailable/localAvailable pinned true) and
 * derive `allowed` ourselves by comparing those projections against this
 * run's own limits — see docs/CRM_KNOWLEDGE_GRAPH_ROADMAP.md.
 */

const positive = (raw: string | undefined, fallback: number) => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export function defaultTokenLimit(): number {
  return positive(process.env.KNOWLEDGE_EXTRACTION_TOKEN_LIMIT, 24_000);
}
export function defaultCostLimitMinor(): number {
  return Math.round(positive(process.env.KNOWLEDGE_EXTRACTION_MAX_TASK_COST_USD, 1) * 100);
}

/** Rough estimate: ~4 characters per token, plus fixed prompt overhead. */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4) + 1_000;
}

export type BudgetCheck = {
  allowed: boolean;
  reason: string;
  projectedTaskTokens: number;
  projectedDailyTokens: number;
  projectedTaskCostUsd: number;
  projectedDailyCostUsd: number;
};

type ExtractionOutcome = { tokensUsed?: number };

export async function preCallBudgetCheck(companyId: string, estimatedTokens: number, tokenLimit: number, costLimitMinor: number): Promise<BudgetCheck> {
  const day = utcDayStart(new Date());
  const todaysRuns = await prisma.knowledgeExtractionRun.findMany({ where: { companyId, createdAt: { gte: day } }, select: { outcome: true } });
  const dailyTokens = todaysRuns.reduce((sum, run) => sum + Number((run.outcome as ExtractionOutcome | null)?.tokensUsed || 0), 0);
  const rate = parseRatePerMillion(process.env[RATE_ENV]);
  const dailyTokenLimit = positive(process.env.KNOWLEDGE_EXTRACTION_DAILY_TOKEN_LIMIT, 200_000);
  const dailyCostLimitUsd = positive(process.env.KNOWLEDGE_EXTRACTION_MAX_DAILY_COST_USD, 20);
  const costLimitUsd = costLimitMinor / 100;

  const decision = routeModel({
    role: 'research',
    risk: 'medium',
    privacySensitive: true,
    complexity: 'complex',
    estimatedTokens,
    cloudRatePerMillionUsd: rate,
    cloudAvailable: true,
    localAvailable: true,
    cloudModel: 'n/a',
    localModel: 'n/a',
    budget: { tokenLimit, dailyTokenLimit, maximumTaskCostUsd: costLimitUsd, maximumDailyCostUsd: dailyCostLimitUsd },
    usage: { taskTokens: 0, dailyTokens, taskCloudCostUsd: 0, dailyCloudCostUsd: estimateUsd(dailyTokens, rate) },
  });

  const withinTaskTokens = decision.projectedTaskTokens <= tokenLimit;
  const withinDailyTokens = decision.projectedDailyTokens <= dailyTokenLimit;
  const withinTaskCost = rate <= 0 || decision.projectedTaskCostUsd <= costLimitUsd;
  const withinDailyCost = rate <= 0 || decision.projectedDailyCostUsd <= dailyCostLimitUsd;
  const allowed = withinTaskTokens && withinDailyTokens && withinTaskCost && withinDailyCost;
  const reason = !withinTaskTokens
    ? "Estimated tokens would exceed this run's token limit."
    : !withinDailyTokens
      ? "Estimated tokens would exceed today's extraction token limit for this company."
      : !withinTaskCost
        ? "Estimated cost would exceed this run's cost limit."
        : !withinDailyCost
          ? "Estimated cost would exceed today's extraction cost limit for this company."
          : decision.reason;

  return {
    allowed,
    reason,
    projectedTaskTokens: decision.projectedTaskTokens,
    projectedDailyTokens: decision.projectedDailyTokens,
    projectedTaskCostUsd: decision.projectedTaskCostUsd,
    projectedDailyCostUsd: decision.projectedDailyCostUsd,
  };
}

/** Returns a failure reason if actual usage exceeded the run's limits, else null. Never trust the pre-call estimate alone. */
export function postCallOverage(actualTokens: number, tokenLimit: number, costLimitMinor: number): string | null {
  if (actualTokens > tokenLimit) return `Actual token usage (${actualTokens}) exceeded this run's token limit (${tokenLimit}).`;
  const rate = parseRatePerMillion(process.env[RATE_ENV]);
  if (rate > 0) {
    const actualCostUsd = estimateUsd(actualTokens, rate);
    if (Math.round(actualCostUsd * 100) > costLimitMinor) {
      return `Actual cost ($${actualCostUsd.toFixed(4)}) exceeded this run's cost limit ($${(costLimitMinor / 100).toFixed(2)}).`;
    }
  }
  return null;
}
