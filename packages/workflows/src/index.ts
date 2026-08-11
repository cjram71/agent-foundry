export interface WorkflowContract {
  id: string;
  version: string;
  trigger: string;
  filters: string[];
  normalization: string[];
  deterministicSteps: string[];
  aiDecisionSteps: string[];
  actions: string[];
  validation: string[];
  exceptionHandling: string[];
  retryStrategy: string;
  approvalGates: string[];
  expectedOutput: string;
  owner: string;
  projectId?: string;
  businessId?: string;
  enabled: boolean;
}
