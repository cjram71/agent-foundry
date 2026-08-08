// Dashboard-side loading of the ACTIVE project policy.
//
// Precedence: the project's active ProjectPolicy row wins; projects without
// any policy rows (possible only outside the migration backfill and the
// creation hook) fall back to DEFAULT_POLICY, which reproduces pre-P6
// behavior exactly.
//
// Failure policy is FAIL-CLOSED: if the policy cannot be read, the error
// propagates and the caller's request fails instead of silently admitting a
// task under a ceiling that may have been tightened.

import prisma from '@/lib/prisma';
import { DEFAULT_POLICY, isPolicyCeiling, type ProjectPolicyValues } from '@foundry/policy';

type PolicyReader = Pick<typeof prisma, 'projectPolicy'>;

export async function loadActivePolicy(db: PolicyReader, projectId: string): Promise<ProjectPolicyValues> {
  const row = await db.projectPolicy.findFirst({
    where: { projectId, active: true },
    orderBy: { version: 'desc' },
  });
  if (!row || !isPolicyCeiling(row.maxTaskRisk)) return { ...DEFAULT_POLICY };
  return {
    maxTaskRisk: row.maxTaskRisk,
    requirePlanApproval: row.requirePlanApproval,
    requireMergeApproval: row.requireMergeApproval,
  };
}
