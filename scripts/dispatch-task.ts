import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const connection = new IORedis({
  host: '127.0.0.1',
  port: 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

const taskQueue = new Queue('foundry-tasks', { connection });

async function main() {
  // Find the draft task created for Around Town Stockholm
  const task = await prisma.task.findFirst({
    where: { status: 'draft' },
    orderBy: { createdAt: 'desc' }
  });

  if (!task) {
    console.error('No draft tasks found to dispatch.');
    process.exit(1);
  }

  console.log(`Dispatching task ${task.id} ("${task.title}") to queue...`);

  await taskQueue.add('execute-task', {
    taskId: task.id,
    action: 'plan'
  });

  console.log('Task successfully queued for orchestrator planning.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await taskQueue.close();
    await connection.quit();
    await prisma.$disconnect();
  });
