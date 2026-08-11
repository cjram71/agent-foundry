"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const index_1 = require("./index");
(0, node_test_1.default)('LiteLLM client sends an authenticated role-pinned request and accounts usage', async () => {
    let auth = '', body = '';
    const fakeFetch = (async (_input, init) => { auth = String((init?.headers).authorization); body = String(init?.body); return new Response(JSON.stringify({ model: 'planner-v1', choices: [{ message: { content: ' ok ' } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } }); });
    const client = new index_1.LiteLLMClient({ baseUrl: 'http://litellm:4000/', apiKey: 'secret-key', models: { planner: 'planner-v1' }, ratesPerMillionUsd: { 'planner-v1': { input: 2, output: 4 } }, fetch: fakeFetch });
    const result = await client.generate({ role: 'planner', input: 'plan', responseFormat: 'json' });
    strict_1.default.equal(auth, 'Bearer secret-key');
    strict_1.default.match(body, /json_object/);
    strict_1.default.equal(result.text, 'ok');
    strict_1.default.equal(result.estimatedCostUsd, 0.00028);
});
(0, node_test_1.default)('fails closed for missing role mapping and empty responses', async () => {
    const client = new index_1.LiteLLMClient({ baseUrl: 'http://litellm', apiKey: 'secret-key', models: {}, fetch: (async () => new Response('{}', { status: 200 })) });
    await strict_1.default.rejects(client.generate({ role: 'coder', input: 'x' }), /No model configured/);
});
(0, node_test_1.default)('rollback occurs only on classified transient failures', async () => {
    const rollback = { generate: async () => ({ provider: 'direct', model: 'safe', text: 'ok' }) };
    const transient = { generate: async () => { throw new Error('HTTP 503 unavailable'); } };
    strict_1.default.equal((await new index_1.RollbackModelClient(transient, rollback, index_1.isTransientModelError).generate({ role: 'planner', input: 'x' })).fallbackCount, 1);
    const permanent = { generate: async () => { throw new Error('invalid request'); } };
    await strict_1.default.rejects(new index_1.RollbackModelClient(permanent, rollback, index_1.isTransientModelError).generate({ role: 'planner', input: 'x' }), /invalid request/);
});
