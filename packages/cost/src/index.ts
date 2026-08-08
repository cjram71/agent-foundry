// @foundry/cost — deterministic cost accounting primitives (P14).
// Pure functions only; each app owns its Prisma aggregate queries.

export const RATE_ENV = 'TOKEN_COST_PER_MILLION_USD';

/** Parse the configured per-million-token rate. Unset/invalid/negative → 0,
 *  which the guard treats as "accounting without enforcement teeth" (see
 *  docs/OPERATIONS.md). Operators set the rate from their provider contract —
 *  Agent Foundry does not hardcode a price for a moving market. */
export function parseRatePerMillion(raw: string | undefined): number {
  if (!raw || !raw.trim()) return 0;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

/** Dollars for a token count at a per-million rate. */
export function estimateUsd(tokens: number, ratePerMillionUsd: number): number {
  if (!Number.isFinite(tokens) || tokens < 0) return 0;
  return (tokens / 1_000_000) * ratePerMillionUsd;
}

/** UTC first-of-month for the rolling accounting window. Deterministic per
 *  instant — tests pin `now`. */
export function monthWindowStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface SpendGuardInput {
  limitUsd: number;
  monthToDateUsd: number;
  /** False when TOKEN_COST_PER_MILLION_USD is unset/zero: spend computes to
   *  $0 and the guard stays permissive — visible, never silent. */
  rateConfigured: boolean;
}

export interface SpendGuardDecision {
  allowed: boolean;
  monthToDateUsd: number;
  limitUsd: number;
  reason?: string;
}

/** The spending limit is a BRAKE, not a forecast: work that would spend
 *  tokens is blocked once month-to-date spend has reached the ceiling.
 *  limitUsd <= 0 means "no limit configured" (allowed). */
export function evaluateSpendGuard(input: SpendGuardInput): SpendGuardDecision {
  const { limitUsd, monthToDateUsd } = input;
  if (limitUsd <= 0) return { allowed: true, monthToDateUsd, limitUsd };
  if (monthToDateUsd >= limitUsd) {
    return {
      allowed: false,
      monthToDateUsd,
      limitUsd,
      reason: `Month-to-date provider spend $${monthToDateUsd.toFixed(2)} has reached the project limit of $${limitUsd.toFixed(2)}. Raise the limit or wait for the next calendar month (UTC).`,
    };
  }
  return { allowed: true, monthToDateUsd, limitUsd };
}
