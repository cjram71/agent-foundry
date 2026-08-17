export type ModelRole = 'planner' | 'coder' | 'reviewer' | 'researcher' | 'summarizer' | 'embedding' | 'classifier';
import { createHash } from 'node:crypto';
export interface ModelGenerationEvidence { correlationId?: string; provider: string; model: string; role: ModelRole; promptHash: string; status: 'success' | 'failed'; inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number; latencyMs?: number; fallbackCount?: number; errorCode?: string }
export interface ModelRequest { role: ModelRole; input: string; maxOutputTokens?: number; correlationId?: string; responseFormat?: 'text' | 'json' }
export interface ModelResult { provider: string; model: string; text: string; inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number; latencyMs?: number; fallbackCount?: number }
export function buildModelGenerationEvidence(request: ModelRequest, result: Pick<ModelResult, 'provider'|'model'|'inputTokens'|'outputTokens'|'estimatedCostUsd'|'latencyMs'|'fallbackCount'>, status: ModelGenerationEvidence['status'] = 'success', errorCode?: string): ModelGenerationEvidence { return { correlationId: request.correlationId, provider: result.provider, model: result.model, role: request.role, promptHash: createHash('sha256').update(request.input).digest('hex'), status, inputTokens: result.inputTokens, outputTokens: result.outputTokens, estimatedCostUsd: result.estimatedCostUsd, latencyMs: result.latencyMs, fallbackCount: result.fallbackCount, errorCode }; }
export interface ModelClient { generate(request: ModelRequest): Promise<ModelResult> }
export interface LiteLLMClientOptions { baseUrl: string; apiKey: string; models: Partial<Record<ModelRole, string>>; timeoutMs?: number; fetch?: typeof fetch; ratesPerMillionUsd?: Partial<Record<string, { input: number; output: number }>> }

const roles: ModelRole[] = ['planner','coder','reviewer','researcher','summarizer','embedding','classifier'];
const cleanUrl = (value: string) => value.replace(/\/+$/, '');
export class LiteLLMClient implements ModelClient {
  private readonly request: typeof fetch;
  constructor(private readonly options: LiteLLMClientOptions) {
    if (!options.baseUrl.startsWith('http://') && !options.baseUrl.startsWith('https://')) throw new Error('LiteLLM base URL must be HTTP(S)');
    if (!options.apiKey || options.apiKey.length < 8) throw new Error('LiteLLM API key is required');
    this.request = options.fetch || fetch;
  }
  async generate(request: ModelRequest): Promise<ModelResult> {
    if (!roles.includes(request.role)) throw new Error('Unsupported model role');
    if (!request.input.trim()) throw new Error('Model input is required');
    if (request.input.length > 2_000_000) throw new Error('Model input exceeds safety bound');
    const model = this.options.models[request.role];
    if (!model) throw new Error(`No model configured for role ${request.role}`);
    const started = Date.now();
    const response = await this.request(`${cleanUrl(this.options.baseUrl)}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.options.apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: request.input }], max_tokens: request.maxOutputTokens, response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined }),
      signal: AbortSignal.timeout(this.options.timeoutMs || 600_000),
    });
    if (!response.ok) throw new Error(`LiteLLM request failed with HTTP ${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
    const text = body.choices?.[0]?.message?.content?.trim() || '';
    if (!text) throw new Error('LiteLLM returned no content');
    const inputTokens = body.usage?.prompt_tokens || 0, outputTokens = body.usage?.completion_tokens || 0;
    const rate = this.options.ratesPerMillionUsd?.[model];
    const estimatedCostUsd = rate ? (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000 : undefined;
    return { provider: 'litellm', model: body.model || model, text, inputTokens, outputTokens, estimatedCostUsd, latencyMs: Date.now() - started, fallbackCount: 0 };
  }
}

export class RollbackModelClient implements ModelClient {
  constructor(private readonly primary: ModelClient, private readonly rollback: ModelClient, private readonly isTransient: (error: unknown) => boolean) {}
  async generate(request: ModelRequest): Promise<ModelResult> {
    try { return await this.primary.generate(request); }
    catch (error) {
      if (!this.isTransient(error)) throw error;
      const result = await this.rollback.generate(request);
      return { ...result, fallbackCount: (result.fallbackCount || 0) + 1 };
    }
  }
}

export const isTransientModelError = (error: unknown): boolean => /(?:408|429|5\d\d|timeout|temporar|unavailable|ECONN|fetch failed)/i.test(error instanceof Error ? error.message : String(error));
