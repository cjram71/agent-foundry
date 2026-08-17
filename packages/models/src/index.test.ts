import assert from 'node:assert/strict';
import test from 'node:test';
import { LiteLLMClient, RollbackModelClient, buildModelGenerationEvidence, isTransientModelError, type ModelClient } from './index';

test('LiteLLM client sends an authenticated role-pinned request and accounts usage', async () => {
  let auth = '', body = '';
  const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => { auth = String((init?.headers as Record<string,string>).authorization); body = String(init?.body); return new Response(JSON.stringify({ model:'planner-v1', choices:[{message:{content:' ok '}}], usage:{prompt_tokens:100,completion_tokens:20} }), { status:200, headers:{'content-type':'application/json'} }); }) as typeof fetch;
  const client = new LiteLLMClient({ baseUrl:'http://litellm:4000/', apiKey:'secret-key', models:{planner:'planner-v1'}, ratesPerMillionUsd:{'planner-v1':{input:2,output:4}}, fetch:fakeFetch });
  const result = await client.generate({role:'planner',input:'plan',responseFormat:'json'});
  assert.equal(auth,'Bearer secret-key'); assert.match(body,/json_object/); assert.equal(result.text,'ok'); assert.equal(result.estimatedCostUsd,0.00028);
});
test('fails closed for missing role mapping and empty responses', async () => {
  const client = new LiteLLMClient({baseUrl:'http://litellm',apiKey:'secret-key',models:{},fetch:(async()=>new Response('{}',{status:200})) as typeof fetch});
  await assert.rejects(client.generate({role:'coder',input:'x'}),/No model configured/);
});
test('rollback occurs only on classified transient failures', async () => {
  const rollback: ModelClient={generate:async()=>({provider:'direct',model:'safe',text:'ok'})};
  const transient: ModelClient={generate:async()=>{throw new Error('HTTP 503 unavailable')}};
  assert.equal((await new RollbackModelClient(transient,rollback,isTransientModelError).generate({role:'planner',input:'x'})).fallbackCount,1);
  const permanent: ModelClient={generate:async()=>{throw new Error('invalid request')}};
  await assert.rejects(new RollbackModelClient(permanent,rollback,isTransientModelError).generate({role:'planner',input:'x'}),/invalid request/);
});
test('generation evidence hashes prompts and excludes prompt/output payloads',()=>{const evidence=buildModelGenerationEvidence({role:'planner',input:'secret prompt',correlationId:'corr-1'},{provider:'litellm',model:'planner-v1',inputTokens:3,outputTokens:2,estimatedCostUsd:0.01,latencyMs:12},'success');assert.equal(evidence.correlationId,'corr-1');assert.equal(evidence.promptHash.length,64);assert.equal('text' in evidence,false);assert.equal('input' in evidence,false);});
