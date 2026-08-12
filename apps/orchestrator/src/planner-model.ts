import { GoogleGenAI } from '@google/genai';
import type { PrismaClient } from '@prisma/client';
import { estimateUsd, parseRatePerMillion, RATE_ENV } from '@foundry/cost';
import { routeModel, utcDayStart, type RouteDecision, type WorkRisk } from '@foundry/model-router';
import { LiteLLMClient, isTransientModelError } from '@foundry/models';

export type GenerationResult = { text: string; totalTokens: number; provider: string; model: string };
export class ModelBudgetError extends Error {}

const positive = (raw: string | undefined, fallback: number) => { const value = Number(raw); return Number.isFinite(value) && value > 0 ? value : fallback; };
const risk = (value: string): WorkRisk => value === 'low' || value === 'medium' || value === 'high' || value === 'prohibited' ? value : 'high';
const transient = (error: unknown) => /(429|503|unavailable|resource.?exhausted|quota|rate.?limit|high demand|temporar)/i.test(error instanceof Error ? error.message : String(error));

async function decide(prisma: PrismaClient, task: { id: string; riskLevel: string }): Promise<RouteDecision> {
  const day = utcDayStart(new Date());
  const [taskTokens, dailyTokens, taskCloud, dailyCloud] = await Promise.all([
    prisma.agentRun.aggregate({ _sum: { tokenUsage: true }, where: { taskId: task.id } }),
    prisma.agentRun.aggregate({ _sum: { tokenUsage: true }, where: { role: 'planner', createdAt: { gte: day } } }),
    prisma.agentRun.aggregate({ _sum: { tokenUsage: true }, where: { taskId: task.id, provider: 'google' } }),
    prisma.agentRun.aggregate({ _sum: { tokenUsage: true }, where: { role: 'planner', provider: 'google', createdAt: { gte: day } } }),
  ]);
  const rate = parseRatePerMillion(process.env[RATE_ENV]);
  return routeModel({
    role: 'planner', risk: risk(task.riskLevel), privacySensitive: process.env.PLANNER_LOCAL_FIRST === 'true', complexity: task.riskLevel === 'low' ? 'simple' : 'complex',
    estimatedTokens: positive(process.env.PLANNER_ESTIMATED_TOKENS, 16_000), cloudRatePerMillionUsd: rate,
    cloudAvailable: Boolean(process.env.GEMINI_API_KEY), localAvailable: process.env.OLLAMA_DISABLED !== 'true',
    cloudModel: process.env.GEMINI_PLANNER_MODEL || 'gemini-3-flash-preview', localModel: task.riskLevel === 'high' ? (process.env.OLLAMA_REASONING_MODEL || process.env.OLLAMA_PLANNER_MODEL || 'deepseek-r1:8b') : (process.env.OLLAMA_PLANNER_MODEL || process.env.OLLAMA_MODEL || 'qwen3:8b'),
    budget: { tokenLimit: positive(process.env.ORCHESTRATOR_TASK_TOKEN_LIMIT, 120_000), dailyTokenLimit: positive(process.env.ORCHESTRATOR_DAILY_TOKEN_LIMIT, 480_000), maximumTaskCostUsd: positive(process.env.ORCHESTRATOR_MAX_TASK_COST_USD, 5), maximumDailyCostUsd: positive(process.env.ORCHESTRATOR_MAX_DAILY_COST_USD, 25) },
    usage: { taskTokens: taskTokens._sum.tokenUsage || 0, dailyTokens: dailyTokens._sum.tokenUsage || 0, taskCloudCostUsd: estimateUsd(taskCloud._sum.tokenUsage || 0, rate), dailyCloudCostUsd: estimateUsd(dailyCloud._sum.tokenUsage || 0, rate) },
  });
}

async function localGenerate(prompt: string, model: string): Promise<GenerationResult> {
  const endpoint = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const response = await fetch(`${endpoint}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, stream: true, format: 'json', options: { temperature: 0.2, num_ctx: 16384 } }), signal: AbortSignal.timeout(900000) });
  if (!response.ok) throw new Error(`Ollama planner request failed with HTTP ${response.status}`);
  const parts = (await response.text()).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as { response?: string; prompt_eval_count?: number; eval_count?: number; done?: boolean });
  const text = parts.map(part => part.response || '').join('').trim(), final = [...parts].reverse().find(part => part.done) || parts[parts.length - 1];
  return { text, totalTokens: (final?.prompt_eval_count || 0) + (final?.eval_count || 0), provider: 'ollama', model };
}

export async function generatePlannerResponse(prisma: PrismaClient, task: { id: string; riskLevel: string }, prompt: string): Promise<GenerationResult> {
  const decision = await decide(prisma, task);
  await prisma.auditEvent.create({ data: { actor: 'orchestrator', action: 'model.route_decided', target: task.id, result: decision.allowed ? 'success' : 'rejected', metadata: { role: 'planner', provider: decision.provider ?? null, model: decision.model ?? null, reason: decision.reason, projectedTaskTokens: decision.projectedTaskTokens, projectedDailyTokens: decision.projectedDailyTokens, projectedTaskCostUsd: decision.projectedTaskCostUsd, projectedDailyCostUsd: decision.projectedDailyCostUsd } } });
  if (!decision.allowed || !decision.provider || !decision.model) throw new ModelBudgetError(decision.reason);
  if (process.env.LITELLM_PLANNER_ENABLED === 'true') {
    const apiKey = process.env.LITELLM_MASTER_KEY;
    if (!apiKey) throw new ModelBudgetError('LiteLLM planner canary enabled without LITELLM_MASTER_KEY.');
    const client = new LiteLLMClient({ baseUrl: process.env.LITELLM_URL || 'http://127.0.0.1:4000', apiKey, models: { planner: process.env.LITELLM_PLANNER_MODEL || decision.model }, timeoutMs: positive(process.env.LITELLM_TIMEOUT_MS, 900_000) });
    try {
      const result = await client.generate({ role: 'planner', input: prompt, responseFormat: 'json' });
      await prisma.auditEvent.create({ data: { actor: 'orchestrator', action: 'model.canary_succeeded', target: task.id, result: 'success', metadata: { role: 'planner', provider: result.provider, model: result.model, inputTokens: result.inputTokens || 0, outputTokens: result.outputTokens || 0, latencyMs: result.latencyMs || 0 } } });
      return { text: result.text, totalTokens: (result.inputTokens || 0) + (result.outputTokens || 0), provider: result.provider, model: result.model };
    } catch (error) {
      const rollbackAllowed = process.env.LITELLM_DIRECT_ROLLBACK === 'true' && isTransientModelError(error);
      await prisma.auditEvent.create({ data: { actor: 'orchestrator', action: 'model.canary_failed', target: task.id, result: rollbackAllowed ? 'rollback' : 'rejected', metadata: { role: 'planner', rollbackAllowed, errorClass: error instanceof Error ? error.constructor.name : 'unknown' } } });
      if (!rollbackAllowed) throw error;
    }
  }
  if (decision.provider === 'local') return localGenerate(prompt, decision.model);
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ModelBudgetError('Cloud route selected without configured credentials.');
  try {
    const response = await new GoogleGenAI({ apiKey: key }).models.generateContent({ model: decision.model, contents: prompt, config: { responseMimeType: 'application/json' } });
    return { text: response.text?.trim() || '', totalTokens: response.usageMetadata?.totalTokenCount || 0, provider: 'google', model: decision.model };
  } catch (error) {
    if (!transient(error) || process.env.OLLAMA_DISABLED === 'true') throw error;
    return localGenerate(prompt, task.riskLevel === 'high' ? (process.env.OLLAMA_REASONING_MODEL || process.env.OLLAMA_PLANNER_MODEL || 'deepseek-r1:8b') : (process.env.OLLAMA_PLANNER_MODEL || process.env.OLLAMA_MODEL || 'qwen3:8b'));
  }
}
