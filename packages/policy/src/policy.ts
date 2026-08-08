// Project policy values and the deterministic admission decision.
//
// A project's ACTIVE ProjectPolicy row (latest activated version) supplies
// these values. When a project has no policy rows (created before P6 and
// not covered by the migration backfill), DEFAULT_POLICY applies — and the
// defaults reproduce pre-P6 behavior exactly: every declarable risk level
// is admitted, both approval gates stay mandatory.

import { riskRank, type RiskLevel } from './risk';

export type PolicyCeiling = 'low' | 'medium' | 'high';

export interface ProjectPolicyValues {
  /** Maximum effective task risk the platform will create or advance. */
  maxTaskRisk: PolicyCeiling;
  /** These gates mirror current product invariants; false is reserved for future autonomous modes. */
  requirePlanApproval: boolean;
  requireMergeApproval: boolean;
}

export const DEFAULT_POLICY: ProjectPolicyValues = {
  maxTaskRisk: 'high',
  requirePlanApproval: true,
  requireMergeApproval: true,
};

export function isPolicyCeiling(value: unknown): value is PolicyCeiling {
  return value === 'low' || value === 'medium' || value === 'high';
}

export interface PolicyDecision {
  allowed: boolean;
  /** Human-readable, user-text-free reasons for a block. Empty when allowed. */
  reasons: string[];
  /** The rule ids that produced the effective risk (ids only). */
  matchedRules: string[];
}

export function evaluateTaskAgainstPolicy(
  policy: ProjectPolicyValues,
  risk: { level: RiskLevel; matched: { id: string }[] },
): PolicyDecision {
  const matchedRules = risk.matched.map((rule) => rule.id);
  if (risk.level === 'prohibited') {
    return {
      allowed: false,
      reasons: [
        'This request matches prohibited-work rules. Agent Foundry never schedules prohibited work, regardless of project policy. Offending patterns must be removed, not administratively overridden.',
      ],
      matchedRules,
    };
  }
  if (riskRank(risk.level) > riskRank(policy.maxTaskRisk)) {
    return {
      allowed: false,
      reasons: [
        `Effective risk '${risk.level}' exceeds this project's active policy ceiling ('${policy.maxTaskRisk}'). Narrow the task, or have an administrator activate a new policy version with a higher ceiling.`,
      ],
      matchedRules,
    };
  }
  return { allowed: true, reasons: [], matchedRules };
}
