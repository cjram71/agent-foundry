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

export interface MissionPolicyCeiling {
  maxRisk: MissionRisk;
  maxBudgetUsd: number;
  maxTokenBudget: number;
  maxParallelTasks: number;
  allowedToolClasses: string[];
  requiredApprovalRules?: string[];
}

export interface MissionValidationResult {
  ok: boolean;
  errors: string[];
}

export const MISSION_CONTRACT_VERSION = 1;
const riskRank: Record<MissionRisk, number> = { low: 0, medium: 1, high: 2 };
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function cleanString(value: unknown, name: string, errors: string[], max = 4000): string {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${name} must be a non-empty string`);
    return '';
  }
  const result = value.trim();
  if (result.length > max) errors.push(`${name} exceeds ${max} characters`);
  return result;
}

function cleanList(value: unknown, name: string, errors: string[], required = true): string[] {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    errors.push(`${name} must be ${required ? 'a non-empty' : 'an'} array`);
    return [];
  }
  if (value.length > 100) errors.push(`${name} exceeds 100 entries`);
  const result = value.map((item, index) => cleanString(item, `${name}[${index}]`, errors, 1000));
  if (new Set(result).size !== result.length) errors.push(`${name} contains duplicates`);
  return result;
}

function boundedNumber(value: unknown, name: string, errors: string[], integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    errors.push(`${name} must be a finite non-negative ${integer ? 'integer' : 'number'}`);
    return 0;
  }
  return value;
}

export function validateMissionContract(contract: MissionContract, ceiling?: MissionPolicyCeiling): MissionValidationResult {
  const errors: string[] = [];
  cleanString(contract.goal, 'goal', errors);
  cleanList(contract.constraints, 'constraints', errors);
  cleanList(contract.deliverables, 'deliverables', errors);
  cleanList(contract.definitionOfDone, 'definitionOfDone', errors);
  cleanList(contract.failureConditions, 'failureConditions', errors);
  cleanList(contract.allowedToolClasses, 'allowedToolClasses', errors, false);
  cleanList(contract.approvalRules, 'approvalRules', errors, false);
  cleanString(contract.provenance, 'provenance', errors, 500);
  if (!(contract.riskLevel in riskRank)) errors.push('riskLevel is invalid');
  boundedNumber(contract.budgetUsd, 'budgetUsd', errors);
  boundedNumber(contract.tokenBudget, 'tokenBudget', errors, true);
  boundedNumber(contract.maxParallelTasks, 'maxParallelTasks', errors, true);
  if (contract.maxParallelTasks < 1) errors.push('maxParallelTasks must be at least 1');
  for (const [name, id] of [['projectId', contract.projectId], ['businessId', contract.businessId]] as const) {
    if (id !== undefined && !idPattern.test(id)) errors.push(`${name} is invalid`);
  }
  if (contract.deadline !== undefined && (!Number.isFinite(Date.parse(contract.deadline)))) errors.push('deadline must be an ISO date');
  if (ceiling) {
    if (riskRank[contract.riskLevel] > riskRank[ceiling.maxRisk]) errors.push('riskLevel exceeds policy ceiling');
    if (contract.budgetUsd > ceiling.maxBudgetUsd) errors.push('budgetUsd exceeds policy ceiling');
    if (contract.tokenBudget > ceiling.maxTokenBudget) errors.push('tokenBudget exceeds policy ceiling');
    if (contract.maxParallelTasks > ceiling.maxParallelTasks) errors.push('maxParallelTasks exceeds policy ceiling');
    const allowed = new Set(ceiling.allowedToolClasses);
    if (contract.allowedToolClasses.some(tool => !allowed.has(tool))) errors.push('allowedToolClasses exceeds policy permissions');
    const approvals = new Set(contract.approvalRules);
    if ((ceiling.requiredApprovalRules || []).some(rule => !approvals.has(rule))) errors.push('required approval rule is missing');
  }
  return { ok: errors.length === 0, errors };
}

export function compileMission(candidate: unknown, ceiling: MissionPolicyCeiling): MissionContract {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('Mission candidate must be an object');
  const value = candidate as Record<string, unknown>;
  const contract: MissionContract = {
    goal: value.goal as string,
    contextSummary: value.contextSummary as string | undefined,
    constraints: value.constraints as string[],
    deliverables: value.deliverables as string[],
    definitionOfDone: value.definitionOfDone as string[],
    failureConditions: value.failureConditions as string[],
    riskLevel: value.riskLevel as MissionRisk,
    budgetUsd: value.budgetUsd as number,
    tokenBudget: value.tokenBudget as number,
    maxParallelTasks: value.maxParallelTasks as number,
    allowedToolClasses: value.allowedToolClasses as string[],
    approvalRules: value.approvalRules as string[],
    deadline: value.deadline as string | undefined,
    projectId: value.projectId as string | undefined,
    businessId: value.businessId as string | undefined,
    provenance: value.provenance as string,
  };
  const result = validateMissionContract(contract, ceiling);
  if (!result.ok) throw new Error(`Invalid Mission Contract: ${result.errors.join('; ')}`);
  return Object.freeze({ ...contract, constraints: [...contract.constraints], deliverables: [...contract.deliverables], definitionOfDone: [...contract.definitionOfDone], failureConditions: [...contract.failureConditions], allowedToolClasses: [...contract.allowedToolClasses], approvalRules: [...contract.approvalRules] });
}
