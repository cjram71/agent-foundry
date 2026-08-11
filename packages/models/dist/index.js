"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTransientModelError = exports.RollbackModelClient = exports.LiteLLMClient = void 0;
const roles = ['planner', 'coder', 'reviewer', 'researcher', 'summarizer', 'embedding', 'classifier'];
const cleanUrl = (value) => value.replace(/\/+$/, '');
class LiteLLMClient {
    options;
    request;
    constructor(options) {
        this.options = options;
        if (!options.baseUrl.startsWith('http://') && !options.baseUrl.startsWith('https://'))
            throw new Error('LiteLLM base URL must be HTTP(S)');
        if (!options.apiKey || options.apiKey.length < 8)
            throw new Error('LiteLLM API key is required');
        this.request = options.fetch || fetch;
    }
    async generate(request) {
        if (!roles.includes(request.role))
            throw new Error('Unsupported model role');
        if (!request.input.trim())
            throw new Error('Model input is required');
        if (request.input.length > 2_000_000)
            throw new Error('Model input exceeds safety bound');
        const model = this.options.models[request.role];
        if (!model)
            throw new Error(`No model configured for role ${request.role}`);
        const started = Date.now();
        const response = await this.request(`${cleanUrl(this.options.baseUrl)}/chat/completions`, {
            method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.options.apiKey}` },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: request.input }], max_tokens: request.maxOutputTokens, response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined }),
            signal: AbortSignal.timeout(this.options.timeoutMs || 600_000),
        });
        if (!response.ok)
            throw new Error(`LiteLLM request failed with HTTP ${response.status}`);
        const body = await response.json();
        const text = body.choices?.[0]?.message?.content?.trim() || '';
        if (!text)
            throw new Error('LiteLLM returned no content');
        const inputTokens = body.usage?.prompt_tokens || 0, outputTokens = body.usage?.completion_tokens || 0;
        const rate = this.options.ratesPerMillionUsd?.[model];
        const estimatedCostUsd = rate ? (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000 : undefined;
        return { provider: 'litellm', model: body.model || model, text, inputTokens, outputTokens, estimatedCostUsd, latencyMs: Date.now() - started, fallbackCount: 0 };
    }
}
exports.LiteLLMClient = LiteLLMClient;
class RollbackModelClient {
    primary;
    rollback;
    isTransient;
    constructor(primary, rollback, isTransient) {
        this.primary = primary;
        this.rollback = rollback;
        this.isTransient = isTransient;
    }
    async generate(request) {
        try {
            return await this.primary.generate(request);
        }
        catch (error) {
            if (!this.isTransient(error))
                throw error;
            const result = await this.rollback.generate(request);
            return { ...result, fallbackCount: (result.fallbackCount || 0) + 1 };
        }
    }
}
exports.RollbackModelClient = RollbackModelClient;
const isTransientModelError = (error) => /(?:408|429|5\d\d|timeout|temporar|unavailable|ECONN|fetch failed)/i.test(error instanceof Error ? error.message : String(error));
exports.isTransientModelError = isTransientModelError;
