export type MissionRisk = 'low' | 'medium' | 'high';

export interface MissionContract {
  goal: string;
  contextSummary?: string;
  constraints: string[];
  deliverables: string[];
  definitionOfDone: string[];
  failureConditions: string[];
  riskLevel: MissionRisk;
  budgetUsd: number;
  tokenBudget: number;
  maxParallelTasks: number;
  allowedToolClasses: string[];
  approvalRules: string[];
  deadline?: string;
  projectId?: string;
  businessId?: string;
  provenance: string;
}

export const MISSION_CONTRACT_VERSION = 1;
