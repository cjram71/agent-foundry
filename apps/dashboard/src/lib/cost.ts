import prisma from '@/lib/prisma';
import { estimateUsd, evaluateSpendGuard, monthWindowStart, parseRatePerMillion, RATE_ENV } from '@foundry/cost';

export interface SpendGuardResult {
  allowed: boolean;
  reason?: string;
  spendUsd: number;
  limitUsd: number;
  rateConfigured: boolean;
}

/**
 * The project monthly spending brake (P14, docs/OPERATIONS.md): sums the
 * current UTC month's priced-provider tokens for the project and blocks new
 * spend-triggering actions once the ceiling is reached. Deterministic; the
 * math lives in @foundry/cost, this file owns the aggregate query.
 */
export async function checkSpendGuard(projectId: string): Promise<SpendGuardResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { spendingLimit: true } });
  if (!project) return { allowed: false, reason: 'Project not found.', spendUsd: 0, limitUsd: 0, rateConfigured: false };
  const rate = parseRatePerMillion(process.env[RATE_ENV]);
  const monthStart = monthWindowStart(new Date());
  const sum = await prisma.agentRun.aggregate({
    _sum: { tokenUsage: true },
    where: { provider: 'google', createdAt: { gte: monthStart }, task: { projectId } },
  });
  const spendUsd = estimateUsd(sum._sum.tokenUsage ?? 0, rate);
  const decision = evaluateSpendGuard({ limitUsd: project.spendingLimit, monthToDateUsd: spendUsd, rateConfigured: rate > 0 });
  return { ...decision, spendUsd, limitUsd: project.spendingLimit, rateConfigured: rate > 0 };
}
