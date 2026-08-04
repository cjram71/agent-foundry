import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
import * as path from 'path';

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
  const project = await prisma.project.findUnique({
    where: { id: 'around-town-stockholm-id' }
  });

  if (!project) {
    console.error('Around Town Stockholm project not found in database.');
    process.exit(1);
  }

  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      title: 'Add Footer Version Badge Component',
      completeInstruction: 'Create a small React component displaying the current build timestamp and version in the footer, verify with npm run build.',
      status: 'draft',
      riskLevel: 'low'
    }
  });

  console.log(`Created Around Town task: ${task.id} ("${task.title}")`);

  await taskQueue.add('execute-task', {
    taskId: task.id,
    action: 'plan'
  });

  console.log('Task successfully queued for AI planning.');
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
