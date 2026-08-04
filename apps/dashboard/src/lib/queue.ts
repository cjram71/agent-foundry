import { Queue } from 'bullmq';
import IORedis from 'ioredis';

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

export async function enqueuePlan(taskId: string) {
  return getTaskQueue().add('plan', { action: 'plan', taskId }, {
    jobId: `plan-${taskId}-${Date.now()}`, attempts: 2,
    backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 100,
  });
}

export function getExecutionQueue() {
  if (!globalForQueue.executionQueue) globalForQueue.executionQueue = new Queue('foundry-execution', { connection: connection() });
  return globalForQueue.executionQueue;
}

export async function enqueueExecution(taskId: string) {
  return getExecutionQueue().add('execute', { action: 'execute', taskId }, {
    jobId: `execute-${taskId}-${Date.now()}`, attempts: 1,
    removeOnComplete: 100, removeOnFail: 100,
  });
}