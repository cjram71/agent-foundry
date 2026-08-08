import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession, isSameOrigin } from '@/lib/auth';
import { getRedis } from '@/lib/queue';
import { EMERGENCY_STOP_KEY } from '@foundry/ops';

async function requireAdmin(request?: Request) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'ADMIN') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (request && !isSameOrigin(request)) return { error: NextResponse.json({ error: 'Invalid origin' }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const engaged = (await getRedis().get(EMERGENCY_STOP_KEY)) != null;
  return NextResponse.json({ emergencyStop: engaged });
}

/**
 * Emergency stop (P14, docs/OPERATIONS.md). Engaging pauses both workers
 * from fetching new jobs (in-flight work always completes) and re-parks
 * freshly picked jobs into the delayed set. It is a distributed pause, not
 * a task state change; use per-task cancel for a hard stop.
 */
export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  if (body.action !== 'emergency_stop' && body.action !== 'emergency_resume') {
    return NextResponse.json({ error: 'Invalid system action.' }, { status: 400 });
  }
  const engage = body.action === 'emergency_stop';
  const redis = getRedis();
  if (engage) {
    await redis.set(EMERGENCY_STOP_KEY, JSON.stringify({ by: auth.session!.userId, at: new Date().toISOString() }));
  } else {
    await redis.del(EMERGENCY_STOP_KEY);
  }
  await prisma.auditEvent.create({
    data: {
      actor: auth.session!.userId,
      action: engage ? 'system.emergency_stop' : 'system.emergency_resume',
      target: 'system',
      result: 'success',
    },
  });
  return NextResponse.json({
    emergencyStop: engage,
    message: engage
      ? 'Emergency stop engaged. Workers paused; in-flight jobs complete. Cancel tasks individually for a hard stop.'
      : 'Emergency stop cleared. Workers resumed.',
  });
}
