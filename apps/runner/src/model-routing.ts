import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import type { PrismaClient } from '@prisma/client';
import { estimateUsd, parseRatePerMillion, RATE_ENV } from '@foundry/cost';
import { routeModel, utcDayStart, type WorkRisk } from '@foundry/model-router';

export type RoutedRole = 'coder' | 'reviewer-safety' | 'reviewer-fidelity';
export type RoutedResult = { text: string; totalTokens: number; provider: string; model: string };
export class ModelBudgetError extends Error {}
const positive = (raw: string | undefined, fallback: number) => { const value = Number(raw); return Number.isFinite(value) && value > 0 ? value : fallback; };
const normalizeRisk = (value: string): WorkRisk => value === 'low' || value === 'medium' || value === 'high' || value === 'prohibited' ? value : 'high';
const transient = (error: unknown) => /(?:429|503|unavailable|resource.?exhausted|quota|rate.?limit|high demand|temporar|fetch failed|ECONN|ETIMEDOUT)/i.test(error instanceof Error ? error.message : String(error));

async function localGenerate(prompt: string, model: string, format?: object): Promise<RoutedResult> {
  const response = await fetch(`${process.env.OLLAMA_URL || 'http://127.0.0.1:11434'}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, stream: true, ...(format ? { format } : {}), options: { temperature: 0.1, num_ctx: 8192 } }), signal: AbortSignal.timeout(600_000) });
  if (!response.ok) throw new Error(`Ollama request failed with HTTP ${response.status}`);
  const parts = (await response.text()).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as { response?: string; prompt_eval_count?: number; eval_count?: number; done?: boolean });
  const text = parts.map(part => part.response || '').join('').trim(), final = [...parts].reverse().find(part => part.done) || parts[parts.length - 1];
  if (!text) throw new Error('Ollama returned no response');
  return { text, totalTokens: (final?.prompt_eval_count || 0) + (final?.eval_count || 0), provider: 'ollama', model };
}

export async function generateRouted(prisma: PrismaClient, taskId: string, role: RoutedRole, prompt: string, options: { jsonSchema?: object; recordRun?: boolean } = {}): Promise<RoutedResult> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { riskLevel: true } });
  if (!task) throw new ModelBudgetError('Task not found for model routing.');
  const day = utcDayStart(new Date()), runnerRoles = ['coder', 'reviewer-safety', 'reviewer-fidelity'];
  const [taskTokens, dailyTokens, taskCloud, dailyCloud] = await Promise.all([
    prisma.agentRun.aggregate({ _sum: { tokenUsage: true }, where: { taskId } }),
    prisma.agentRun.aggregate({ _sum: { tokenUsage: true }, where: { role: { in: runnerRoles }, createdAt: { gte: day } } }),
    prisma.agentRun.aggregate({ _sum: { tokenUsage: true }, where: { taskId, provider: 'google' } }),
    prisma.agentRun.aggregate({ _sum: { tokenUsage: true }, where: { role: { in: runnerRoles }, provider: 'google', createdAt: { gte: day } } }),
  ]);
  const rate = parseRatePerMillion(process.env[RATE_ENV]);
  const localModel = role === 'coder' ? (process.env.OLLAMA_MODEL || 'deepseek-coder-v2:16b-lite-instruct-q4_K_M') : (process.env.OLLAMA_REVIEWER_MODEL || 'deepseek-coder-v2:16b-lite-instruct-q4_K_M');
  const decision = routeModel({ role: role === 'coder' ? 'coder' : 'reviewer', risk: normalizeRisk(task.riskLevel), privacySensitive: false, localFirst: process.env.RUNNER_LOCAL_FIRST === 'true', complexity: 'complex', estimatedTokens: positive(process.env.RUNNER_ESTIMATED_TOKENS, role === 'coder' ? 32_768 : 8_192), cloudRatePerMillionUsd: rate, cloudAvailable: Boolean(process.env.GEMINI_API_KEY), localAvailable: process.env.OLLAMA_DISABLED !== 'true', cloudModel: process.env.GEMINI_RUNNER_MODEL || 'gemini-3-flash-preview', localModel, budget: { tokenLimit: positive(process.env.DEVELOPER_TASK_TOKEN_LIMIT, 180_000), dailyTokenLimit: positive(process.env.DEVELOPER_DAILY_TOKEN_LIMIT, 720_000), maximumTaskCostUsd: positive(process.env.DEVELOPER_MAX_TASK_COST_USD, 8), maximumDailyCostUsd: positive(process.env.DEVELOPER_MAX_DAILY_COST_USD, 40) }, usage: { taskTokens: taskTokens._sum.tokenUsage || 0, dailyTokens: dailyTokens._sum.tokenUsage || 0, taskCloudCostUsd: estimateUsd(taskCloud._sum.tokenUsage || 0, rate), dailyCloudCostUsd: estimateUsd(dailyCloud._sum.tokenUsage || 0, rate) } });
  await prisma.auditEvent.create({ data: { actor: 'runner', action: 'model.route_decided', target: taskId, result: decision.allowed ? 'success' : 'rejected', metadata: { role, provider: decision.provider ?? null, model: decision.model ?? null, reason: decision.reason, projectedTaskTokens: decision.projectedTaskTokens, projectedDailyTokens: decision.projectedDailyTokens, projectedTaskCostUsd: decision.projectedTaskCostUsd, projectedDailyCostUsd: decision.projectedDailyCostUsd } } });
  if (!decision.allowed || !decision.provider || !decision.model) throw new ModelBudgetError(decision.reason);
  let result: RoutedResult;
  if (decision.provider === 'local') result = await localGenerate(prompt, decision.model, options.jsonSchema);
  else {
    const key = process.env.GEMINI_API_KEY; if (!key) throw new ModelBudgetError('Cloud route selected without credentials.');
    try { const response = await new GoogleGenAI({ apiKey: key }).models.generateContent({ model: decision.model, contents: prompt, config: options.jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: options.jsonSchema, maxOutputTokens: 32768 } : undefined }); result = { text: response.text?.trim() || '', totalTokens: response.usageMetadata?.totalTokenCount || 0, provider: 'google', model: decision.model }; }
    catch (error) { if (!transient(error) || process.env.OLLAMA_DISABLED === 'true') throw error; result = await localGenerate(prompt, localModel, options.jsonSchema); }
  }
  if (options.recordRun) await prisma.agentRun.create({ data: { taskId, provider: result.provider, model: result.model, role, promptHash: createHash('sha256').update(prompt).digest('hex'), status: 'success', tokenUsage: result.totalTokens, outputSummary: result.text.slice(0, 1000) } });
  return result;
}
