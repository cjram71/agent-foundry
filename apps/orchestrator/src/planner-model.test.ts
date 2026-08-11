import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { generatePlannerResponse } from './planner-model';

function fakePrisma(events: Array<Record<string, unknown>>): PrismaClient {
  return {
    agentRun: { aggregate: async () => ({ _sum: { tokenUsage: 0 } }) },
    auditEvent: { create: async ({ data }: { data: Record<string, unknown> }) => { events.push(data); return data; } },
  } as unknown as PrismaClient;
}

function configure() {
  process.env.LITELLM_PLANNER_ENABLED = 'true';
  process.env.LITELLM_MASTER_KEY = 'test-master-key';
  process.env.LITELLM_URL = 'http://litellm:4000';
  process.env.LITELLM_PLANNER_MODEL = 'planner-alias';
  process.env.GEMINI_API_KEY = 'configured-for-routing-only';
  process.env.MODEL_CLOUD_RATE_PER_MILLION_USD = '1';
}

test('planner canary uses LiteLLM and audits accounting metadata', async t => {
  configure();
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; delete process.env.LITELLM_DIRECT_ROLLBACK; });
  globalThis.fetch = (async input => {
    assert.match(String(input), /litellm:4000\/chat\/completions/);
    return new Response(JSON.stringify({ model: 'planner-alias', choices: [{ message: { content: '{"plan":[]}' } }], usage: { prompt_tokens: 12, completion_tokens: 3 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const events: Array<Record<string, unknown>> = [];
  const result = await generatePlannerResponse(fakePrisma(events), { id: 'task-1', riskLevel: 'medium' }, 'plan');
  assert.equal(result.provider, 'litellm'); assert.equal(result.totalTokens, 15);
  assert(events.some(event => event.action === 'model.canary_succeeded'));
});

test('transient canary failure rolls back only when explicitly enabled', async t => {
  configure(); process.env.LITELLM_DIRECT_ROLLBACK = 'true';
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; delete process.env.LITELLM_DIRECT_ROLLBACK; });
  globalThis.fetch = (async input => String(input).includes('/chat/completions')
    ? new Response('unavailable', { status: 503 })
    : new Response('{"response":"{\\"plan\\":[]}","prompt_eval_count":2,"eval_count":3,"done":true}\n', { status: 200 })) as typeof fetch;
  const events: Array<Record<string, unknown>> = [];
  const result = await generatePlannerResponse(fakePrisma(events), { id: 'task-2', riskLevel: 'low' }, 'plan');
  assert.equal(result.provider, 'ollama'); assert.equal(result.totalTokens, 5);
  assert(events.some(event => event.action === 'model.canary_failed' && event.result === 'rollback'));
});
