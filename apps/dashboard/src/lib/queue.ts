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

const globalForQueue = globalThis as unknown as { foundryQueue?: Queue; executionQueue?: Queue; agentQueue?: Queue; foundryRedis?: IORedis };

function connection() {
  if (!globalForQueue.foundryRedis) {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL is required to connect to Redis (no host/port fallback is used).');
    }
    globalForQueue.foundryRedis = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
  }
  return globalForQueue.foundryRedis;
}

export function getTaskQueue() {
  if (!globalForQueue.foundryQueue) globalForQueue.foundryQueue = new Queue('foundry-tasks', { connection: connection() });
  return globalForQueue.foundryQueue;
}

/** Shared Redis handle for non-queue flags (emergency stop, P14). */
export function getRedis() {
  return connection();
}
export function getAgentQueue() {
  if (!globalForQueue.agentQueue) globalForQueue.agentQueue = new Queue('foundry-agent-runs', { connection: connection() });
  return globalForQueue.agentQueue;
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

export async function enqueueAgentExecution(taskId: string): Promise<EnqueueResult> {
  return enqueueWithDedupe(
    getAgentQueue(),
    'agent-execute',
    { action: 'agent-execute', taskId },
    `agent-execute-${taskId}`,
    EXECUTE_JOB_OPTIONS,
  );
}
