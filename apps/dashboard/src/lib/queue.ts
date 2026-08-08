import { Queue, type Job } from 'bullmq';
import IORedis from 'ioredis';
import {
  EXECUTE_JOB_OPTIONS,
  PLAN_JOB_OPTIONS,
  decideEnqueue,
  executeJobId,
  planJobId,
  type FoundryJobOptions,
} from '@/lib/queue-policy';

const globalForQueue = globalThis as unknown as { foundryQueue?: Queue; executionQueue?: Queue; foundryRedis?: IORedis };

function connection() {
  if (!globalForQueue.foundryRedis) {
    globalForQueue.foundryRedis = new IORedis({
      host: '127.0.0.1', port: 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return globalForQueue.foundryRedis;
}

export function getTaskQueue() {
  if (!globalForQueue.foundryQueue) globalForQueue.foundryQueue = new Queue('foundry-tasks', { connection: connection() });
  return globalForQueue.foundryQueue;
}

export function getExecutionQueue() {
  if (!globalForQueue.executionQueue) globalForQueue.executionQueue = new Queue('foundry-execution', { connection: connection() });
  return globalForQueue.executionQueue;
}

export interface EnqueueResult {
  job: Job;
  /** True when a live job already held the deterministic id and nothing new was added. */
  deduplicated: boolean;
}

/**
 * Idempotent enqueue: deterministic job id + explicit handling for a
 * pre-existing id. BullMQ's server-side dedup is the hard guarantee against
 * duplicate adds; this wrapper adds the replace-finished-job behavior and a
 * truthful `deduplicated` flag for auditing. See docs/QUEUE.md.
 */
async function enqueueWithDedupe(
  queue: Queue,
  name: string,
  data: { action: string; taskId: string },
  jobId: string,
  options: FoundryJobOptions,
): Promise<EnqueueResult> {
  const existing = await queue.getJob(jobId);
  const decision = decideEnqueue(existing ? await existing.getState() : null);
  if (decision === 'reuse' && existing) return { job: existing, deduplicated: true };
  if (decision === 'replace' && existing) await existing.remove();
  const job = await queue.add(name, data, { ...options, jobId });
  return { job, deduplicated: false };
}

export async function enqueuePlan(taskId: string): Promise<EnqueueResult> {
  return enqueueWithDedupe(getTaskQueue(), 'plan', { action: 'plan', taskId }, planJobId(taskId), PLAN_JOB_OPTIONS);
}

export async function enqueueExecution(taskId: string): Promise<EnqueueResult> {
  return enqueueWithDedupe(getExecutionQueue(), 'execute', { action: 'execute', taskId }, executeJobId(taskId), EXECUTE_JOB_OPTIONS);
}
