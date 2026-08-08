import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRedis, getTaskQueue, getExecutionQueue } from '@/lib/queue';
import { EMERGENCY_STOP_KEY } from '@foundry/ops';
import { parseRatePerMillion, RATE_ENV } from '@foundry/cost';

export const dynamic = 'force-dynamic';

/**
 * Unauthenticated operational health surface (P14, docs/OPERATIONS.md).
 * Intentionally leaks nothing sensitive: booleans, job counters, and flags —
 * no config values, no tokens, no task content. 200 when db+redis answer,
 * 503 otherwise (PM2/uptime monitors key off the status code).
 */
export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch { /* reported below */ }

  let redis = false;
  try {
    redis = (await getRedis().ping()) === 'PONG';
  } catch { /* reported below */ }

  let queues: Record<string, unknown> = {};
  if (redis) {
    try {
      const [plan, execution] = await Promise.all([
        getTaskQueue().getJobCounts('waiting', 'active', 'delayed', 'failed'),
        getExecutionQueue().getJobCounts('waiting', 'active', 'delayed', 'failed'),
      ]);
      queues = { plan, execution };
    } catch { /* counters are advisory */ }
  }

  let emergencyStop: boolean | null = null;
  if (redis) {
    try {
      emergencyStop = (await getRedis().get(EMERGENCY_STOP_KEY)) != null;
    } catch { /* reported as null */ }
  }

  const ok = db && redis;
  return NextResponse.json(
    {
      ok,
      checks: { db, redis },
      queues,
      emergencyStop,
      costRateConfigured: parseRatePerMillion(process.env[RATE_ENV]) > 0,
      now: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
