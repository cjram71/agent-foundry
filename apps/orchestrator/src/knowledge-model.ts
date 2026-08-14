export type KnowledgeWork = 'public-research' | 'private-analysis' | 'synthesis';
class InvalidModelOutput extends Error {}

export type KnowledgeGeneration = { text: string; tokens: number; provider: 'openai' | 'nvidia' | 'ollama'; model: string; fallbackCount: number };

type ChatBody = { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string; error?: { message?: string } };
type ResponsesBody = { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; usage?: { total_tokens?: number }; model?: string; error?: { message?: string } };

const timeout = () => AbortSignal.timeout(Number(process.env.KNOWLEDGE_MODEL_TIMEOUT_MS || 900_000));
const transient = (error: unknown) => /(?:408|409|429|5\d\d|timeout|temporar|unavailable|quota|rate.?limit|fetch failed)/i.test(error instanceof Error ? error.message : String(error));

async function nvidia(prompt: string): Promise<KnowledgeGeneration> {
  const key = process.env.NVIDIA_NIM_API_KEY;
  if (!key) throw new Error('NVIDIA_NIM_API_KEY is not configured');
  const model = process.env.NVIDIA_NIM_MODEL || 'nvidia/nemotron-3-nano-30b-a3b';
  const base = (process.env.NVIDIA_NIM_API_BASE || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
  const response = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.2 }), signal: timeout() });
  const body = await response.json() as ChatBody;
  if (!response.ok) throw new Error(`NVIDIA NIM HTTP ${response.status}: ${body.error?.message || 'request failed'}`);
  const text = body.choices?.[0]?.message?.content?.trim() || '';
  if (!text) throw new Error('NVIDIA NIM returned no content');
  return { text, tokens: (body.usage?.prompt_tokens || 0) + (body.usage?.completion_tokens || 0), provider: 'nvidia', model: body.model || model, fallbackCount: 0 };
}

async function ollama(prompt: string, reasoning = false): Promise<KnowledgeGeneration> {
  const model = reasoning ? (process.env.OLLAMA_REASONING_MODEL || 'deepseek-r1:8b') : (process.env.OLLAMA_KNOWLEDGE_MODEL || 'qwen3:8b');
  const base = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const response = await fetch(`${base}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, stream: false, format: 'json', options: { temperature: 0.2, num_ctx: 16_384 } }), signal: timeout() });
  const body = await response.json() as { response?: string; prompt_eval_count?: number; eval_count?: number; error?: string };
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${body.error || 'request failed'}`);
  const text = body.response?.trim() || '';
  if (!text) throw new Error('Ollama returned no content');
  return { text, tokens: (body.prompt_eval_count || 0) + (body.eval_count || 0), provider: 'ollama', model, fallbackCount: 0 };
}

async function openai(prompt: string, webSearch: boolean): Promise<KnowledgeGeneration> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not configured');
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
  const schema = { type: 'object', additionalProperties: false, required: ['completed', 'waitingForApproval', 'uncertain', 'evidence', 'memoryCandidates', 'artifact'], properties: { completed: { type: 'array', items: { type: 'string' }, maxItems: 30 }, waitingForApproval: { type: 'array', items: { type: 'string' }, maxItems: 30 }, uncertain: { type: 'array', items: { type: 'string' }, maxItems: 30 }, evidence: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 60 }, memoryCandidates: { type: 'array', maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['summary', 'content', 'sourceReference', 'confidence'], properties: { summary: { type: 'string', maxLength: 500 }, content: { type: 'string', maxLength: 4000 }, sourceReference: { type: 'string', maxLength: 2000 }, confidence: { type: 'number', minimum: 0, maximum: 1 } } } }, artifact: { type: 'string', maxLength: 120000 } } };
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, input: prompt, tools: webSearch ? [{ type: 'web_search' }] : undefined, text: { format: { type: 'json_schema', name: 'knowledge_agent_result', strict: true, schema } } }), signal: timeout() });
  const body = await response.json() as ResponsesBody;
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${body.error?.message || 'request failed'}`);
  const text = body.output_text || body.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text || '';
  if (!text.trim()) throw new Error('OpenAI returned no content');
  return { text: text.trim(), tokens: body.usage?.total_tokens || 0, provider: 'openai', model: body.model || model, fallbackCount: 0 };
}

export async function generateKnowledge(prompt: string, work: KnowledgeWork, validate?: (text: string) => void): Promise<KnowledgeGeneration> {
  const routes = work === 'public-research'
    ? [() => openai(prompt, true)]
    : work === 'private-analysis'
      ? [() => ollama(prompt), () => nvidia(prompt), () => openai(prompt, false)]
      : [() => nvidia(prompt), () => ollama(prompt, true), () => openai(prompt, false)];
  let last: unknown;
  for (let index = 0; index < routes.length; index++) {
    try {
      const result = await routes[index]();
      if (validate) { try { validate(result.text); } catch (error) { throw new InvalidModelOutput(error instanceof Error ? error.message : 'invalid model output'); } }
      return { ...result, fallbackCount: index };
    } catch (error) {
      last = error;
      if (!(error instanceof InvalidModelOutput) && !transient(error) && !/not configured/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
  throw last instanceof Error ? last : new Error('No knowledge model was available');
}
