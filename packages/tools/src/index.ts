export type ToolRisk = 'low' | 'medium' | 'high';

export interface ToolContract {
  id: string;
  description: string;
  action: string;
  requiredPermission: string;
  risk: ToolRisk;
  approvalRequired: boolean;
  credentialReference?: string;
  timeoutMs: number;
  maxRetries: number;
  audit: boolean;
}

export interface ToolInvocationContext {
  missionId?: string;
  taskId?: string;
  actor: string;
  correlationId?: string;
  permissions: string[];
}
