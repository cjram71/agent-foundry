import { NextResponse } from 'next/server';
import type { AgentManifest } from '@foundry/agent-contracts';
import prisma from '@/lib/prisma';
import { getSession, isSameOrigin } from '@/lib/auth';
import { changeAgentStatus, isLifecycleAction, stageAgentVersion } from '@/lib/agent-registry';

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
  const agents = await prisma.agentDefinition.findMany({
    orderBy: { id: 'asc' },
    include: { versions: { orderBy: { createdAt: 'desc' }, select: { id: true, version: true, status: true, checksum: true, createdBy: true, createdAt: true, activatedAt: true, retiredAt: true } } },
  });
  return NextResponse.json(agents);
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const manifest = await request.json() as AgentManifest;
    const version = await stageAgentVersion(prisma, manifest, auth.session!.userId);
    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    return NextResponse.json({ error: code === 'P2002' ? 'That agent version already exists' : error instanceof Error ? error.message : 'Invalid agent manifest' }, { status: code === 'P2002' ? 409 : 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (typeof body.agentId !== 'string' || typeof body.version !== 'string' || !isLifecycleAction(body.action)) return NextResponse.json({ error: 'agentId, version, and a valid action are required' }, { status: 400 });
    const changed = await changeAgentStatus(prisma, { agentId: body.agentId, version: body.version, action: body.action, actor: auth.session!.userId });
    return NextResponse.json(changed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent lifecycle update failed';
    return NextResponse.json({ error: message }, { status: message === 'Agent version not found' ? 404 : 409 });
  }
}
