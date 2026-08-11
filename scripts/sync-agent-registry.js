const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { assertValidRegistry } = require('../packages/agent-contracts/dist');

const root = path.resolve(__dirname, '..');
const agents = JSON.parse(fs.readFileSync(path.join(root, 'config/agents/registry.json'), 'utf8'));
const tools = JSON.parse(fs.readFileSync(path.join(root, 'config/tools/registry.json'), 'utf8'));
assertValidRegistry(agents, tools);
const actorArg = process.argv.find((value) => value.startsWith('--actor='));
const actor = actorArg ? actorArg.slice('--actor='.length) : 'operator-import';
const prisma = new PrismaClient();

async function main() {
  let created = 0;
  let unchanged = 0;
  for (const manifest of agents) {
    const checksum = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    await prisma.agentDefinition.upsert({ where: { id: manifest.id }, create: { id: manifest.id, name: manifest.name, mission: manifest.mission }, update: { name: manifest.name, mission: manifest.mission } });
    const existing = await prisma.agentVersion.findUnique({ where: { agentId_version: { agentId: manifest.id, version: manifest.version } } });
    if (existing) {
      if (existing.checksum !== checksum) throw new Error(`Refusing to overwrite changed immutable version ${manifest.id}@${manifest.version}`);
      unchanged += 1;
      continue;
    }
    const version = await prisma.agentVersion.create({ data: { agentId: manifest.id, version: manifest.version, status: 'STAGING', manifest, checksum, createdBy: actor } });
    await prisma.auditEvent.create({ data: { actor, action: 'agent.version_staged', target: version.id, result: 'success', metadata: { agentId: manifest.id, version: manifest.version, checksum } } });
    created += 1;
  }
  console.log(`agent_registry_sync=PASS created=${created} unchanged=${unchanged}`);
}

main().finally(() => prisma.$disconnect());
