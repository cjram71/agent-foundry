export type ModelRole = 'planner' | 'coder' | 'reviewer' | 'researcher' | 'summarizer' | 'embedding' | 'classifier';
export interface ModelRequest {
    role: ModelRole;
    input: string;
    maxOutputTokens?: number;
    correlationId?: string;
    responseFormat?: 'text' | 'json';
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
export interface LiteLLMClientOptions {
    baseUrl: string;
    apiKey: string;
    models: Partial<Record<ModelRole, string>>;
    timeoutMs?: number;
    fetch?: typeof fetch;
    ratesPerMillionUsd?: Partial<Record<string, {
        input: number;
        output: number;
    }>>;
}
export declare class LiteLLMClient implements ModelClient {
    private readonly options;
    private readonly request;
    constructor(options: LiteLLMClientOptions);
    generate(request: ModelRequest): Promise<ModelResult>;
}
export declare class RollbackModelClient implements ModelClient {
    private readonly primary;
    private readonly rollback;
    private readonly isTransient;
    constructor(primary: ModelClient, rollback: ModelClient, isTransient: (error: unknown) => boolean);
    generate(request: ModelRequest): Promise<ModelResult>;
}
export declare const isTransientModelError: (error: unknown) => boolean;
