import { riskRank, type RiskLevel } from './risk';

export type AutoApproveRisk = 'low' | 'medium';
export type AutonomyDecision = 'AUTO_APPROVE' | 'REQUIRE_HUMAN' | 'REJECT';

export interface AutonomyPolicyValues {
  autonomousMode: boolean;
  autoApproveMaxRisk: AutoApproveRisk;
  maxParallelTasks: number;
  maxRepairAttempts: number;
  maxTasksPerRun: number;
  maxTaskCost: number;
  maxProjectRunCost: number;
  createDraftPullRequests: boolean;
}

export const DEFAULT_AUTONOMY_POLICY: AutonomyPolicyValues = {
  autonomousMode: false,
  autoApproveMaxRisk: 'medium',
  maxParallelTasks: 2,
  maxRepairAttempts: 2,
  maxTasksPerRun: 20,
  maxTaskCost: 2,
  maxProjectRunCost: 20,
  createDraftPullRequests: true,
};

export interface AutonomyContext {
  projectAuthorized: boolean;
  risk: RiskLevel;
  taskEstimatedCost: number;
  runEstimatedCost: number;
  tasksInRun: number;
  activeTasks: number;
  repairAttempts: number;
  emergencyStop: boolean;
  isManagerEvaluation?: boolean;
}

export interface AutonomyResult {
  decision: AutonomyDecision;
  reason: string;
}
export type AutonomyAction = 'internal-analysis' | 'draft-pr' | 'spending' | 'deployment' | 'communication' | 'contracting' | 'publishing' | 'agent-creation';
export interface ActionAuthorityResult { allowed: boolean; reason: string; requiresHuman: boolean }
export function evaluateActionAuthority(policy: AutonomyPolicyValues, action: AutonomyAction, context: Pick<AutonomyContext, 'projectAuthorized' | 'emergencyStop'>): ActionAuthorityResult {
  if (!context.projectAuthorized || !policy.autonomousMode) return { allowed: false, reason: 'autonomy is not enabled for this project', requiresHuman: true };
  if (context.emergencyStop) return { allowed: false, reason: 'emergency stop is engaged', requiresHuman: true };
  if (action !== 'internal-analysis' && action !== 'draft-pr') return { allowed: false, reason: `${action} requires explicit human authority`, requiresHuman: true };
  return { allowed: true, reason: 'bounded low-risk action is permitted by policy', requiresHuman: false };
}

export function evaluateAutonomy(policy: AutonomyPolicyValues, context: AutonomyContext): AutonomyResult {
  if (!context.projectAuthorized || !policy.autonomousMode) return { decision: 'REQUIRE_HUMAN', reason: 'project autonomy is not enabled' };
  if (context.emergencyStop) return { decision: 'REQUIRE_HUMAN', reason: 'emergency stop is engaged' };
  if (context.risk === 'prohibited') return { decision: 'REJECT', reason: 'prohibited work is never delegated' };
  if (context.isManagerEvaluation) return { decision: 'AUTO_APPROVE', reason: 'bounded manager evaluation may complete automatically' };
  if (riskRank(context.risk) > riskRank(policy.autoApproveMaxRisk)) return { decision: 'REQUIRE_HUMAN', reason: 'task risk exceeds the automatic approval ceiling' };
  if (context.tasksInRun >= policy.maxTasksPerRun) return { decision: 'REQUIRE_HUMAN', reason: 'project-run task limit reached' };
  if (context.activeTasks >= policy.maxParallelTasks) return { decision: 'REQUIRE_HUMAN', reason: 'parallel task limit reached' };
  if (context.repairAttempts >= policy.maxRepairAttempts) return { decision: 'REQUIRE_HUMAN', reason: 'repair-attempt limit reached' };
  if (context.taskEstimatedCost > policy.maxTaskCost) return { decision: 'REQUIRE_HUMAN', reason: 'task cost limit exceeded' };
  if (context.runEstimatedCost + context.taskEstimatedCost > policy.maxProjectRunCost) return { decision: 'REQUIRE_HUMAN', reason: 'project-run cost limit exceeded' };
  if (!policy.createDraftPullRequests) return { decision: 'REQUIRE_HUMAN', reason: 'draft pull requests are disabled' };
  return { decision: 'AUTO_APPROVE', reason: 'authorized project policy permits bounded execution' };
}

export function isAutoApproveRisk(value: unknown): value is AutoApproveRisk {
  return value === 'low' || value === 'medium';
}
