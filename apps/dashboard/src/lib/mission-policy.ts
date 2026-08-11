import { compileMission, type MissionContract, type MissionPolicyCeiling, type MissionRisk } from '@foundry/mission';

export interface ActiveProjectPolicy {
  maxTaskRisk: string;
  maxParallelTasks: number;
  maxProjectRunCost: number;
  requirePlanApproval: boolean;
  requireMergeApproval: boolean;
}

const serverToolClasses = ['github-read', 'github-write-draft', 'workspace', 'research', 'memory-read', 'memory-candidate-write', 'health'];

export function missionCeiling(policy: ActiveProjectPolicy): MissionPolicyCeiling {
  const maxRisk: MissionRisk = policy.maxTaskRisk === 'low' || policy.maxTaskRisk === 'medium' || policy.maxTaskRisk === 'high' ? policy.maxTaskRisk : 'low';
  const approvals = [policy.requirePlanApproval ? 'plan' : '', policy.requireMergeApproval ? 'merge' : ''].filter(Boolean);
  return {
    maxRisk,
    maxBudgetUsd: Math.max(0, Number(policy.maxProjectRunCost) || 0),
    maxTokenBudget: 200_000,
    maxParallelTasks: Math.max(1, Math.min(5, policy.maxParallelTasks)),
    allowedToolClasses: serverToolClasses,
    requiredApprovalRules: approvals,
  };
}

export function compileOperatorMission(input: unknown, projectId: string, actor: string, policy: ActiveProjectPolicy): MissionContract {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Mission request must be an object');
  return compileMission({ ...(input as Record<string, unknown>), projectId, businessId: undefined, provenance: `operator:${actor}` }, missionCeiling(policy));
}
