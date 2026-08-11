export type ModelRole = 'planner' | 'coder' | 'reviewer' | 'researcher' | 'summarizer' | 'embedding' | 'classifier';

export interface ModelRequest {
  role: ModelRole;
  input: string;
  maxOutputTokens?: number;
  correlationId?: string;
}

export interface ModelResult {
  provider: string;
  model: string;
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
  fallbackCount?: number;
}

export interface ModelClient {
  generate(request: ModelRequest): Promise<ModelResult>;
}
