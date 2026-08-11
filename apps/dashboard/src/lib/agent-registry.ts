import { createHash } from 'node:crypto';
import type { AgentLifecycleStatus, Prisma, PrismaClient } from '@prisma/client';
import { assertValidRegistry, type AgentManifest, type ToolDefinition } from '@foundry/agent-contracts';
import toolRegistry from '../../../../config/tools/registry.json' with { type: 'json' };

type Db = PrismaClient;
const tools = toolRegistry as ToolDefinition[];

export function manifestChecksum(manifest: AgentManifest): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

export function validateAgentManifest(manifest: AgentManifest): void {
  assertValidRegistry([manifest], tools);
}

export async function stageAgentVersion(db: Db, manifest: AgentManifest, actor: string) {
  validateAgentManifest(manifest);
  const checksum = manifestChecksum(manifest);
  return db.$transaction(async (tx) => {
    await tx.agentDefinition.upsert({
      where: { id: manifest.id },
      create: { id: manifest.id, name: manifest.name, mission: manifest.mission },
      update: { name: manifest.name, mission: manifest.mission },
    });
    const created = await tx.agentVersion.create({
      data: { agentId: manifest.id, version: manifest.version, status: 'STAGING', manifest: manifest as unknown as Prisma.InputJsonValue, checksum, createdBy: actor },
    });
    await tx.auditEvent.create({ data: { actor, action: 'agent.version_staged', target: created.id, result: 'success', metadata: { agentId: manifest.id, version: manifest.version, checksum } } });
    return created;
  });
}

export async function changeAgentStatus(db: Db, input: { agentId: string; version: string; action: 'activate' | 'retire'; actor: string }) {
  return db.$transaction(async (tx) => {
    const current = await tx.agentVersion.findUnique({ where: { agentId_version: { agentId: input.agentId, version: input.version } } });
    if (!current) throw new Error('Agent version not found');
    if (input.action === 'activate') {
      if (current.status === 'RETIRED') throw new Error('Retired agent versions cannot be reactivated; create a new version');
      const now = new Date();
      await tx.agentVersion.updateMany({ where: { agentId: input.agentId, status: 'ACTIVE', id: { not: current.id } }, data: { status: 'RETIRED', retiredAt: now } });
      const activated = await tx.agentVersion.update({ where: { id: current.id }, data: { status: 'ACTIVE', activatedAt: current.activatedAt ?? now, retiredAt: null } });
      await tx.auditEvent.create({ data: { actor: input.actor, action: 'agent.version_activated', target: current.id, result: 'success', metadata: { agentId: input.agentId, version: input.version, checksum: current.checksum } } });
      return activated;
    }
    const retired = await tx.agentVersion.update({ where: { id: current.id }, data: { status: 'RETIRED', retiredAt: new Date() } });
    await tx.auditEvent.create({ data: { actor: input.actor, action: 'agent.version_retired', target: current.id, result: 'success', metadata: { agentId: input.agentId, version: input.version } } });
    return retired;
  });
}

export function isLifecycleAction(value: unknown): value is 'activate' | 'retire' {
  return value === 'activate' || value === 'retire';
}

export const visibleStatuses: AgentLifecycleStatus[] = ['EXPERIMENTAL', 'STAGING', 'ACTIVE', 'RETIRED'];
