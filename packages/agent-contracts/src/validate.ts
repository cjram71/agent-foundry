import fs from 'node:fs';
import path from 'node:path';
import { assertValidRegistry, type AgentManifest, type ToolDefinition } from './index';

const root = path.resolve(__dirname, '../../..');
const agents = JSON.parse(fs.readFileSync(path.join(root, 'config/agents/registry.json'), 'utf8')) as AgentManifest[];
const tools = JSON.parse(fs.readFileSync(path.join(root, 'config/tools/registry.json'), 'utf8')) as ToolDefinition[];
assertValidRegistry(agents, tools);
console.log(`agent_registry=PASS agents=${agents.length} tools=${tools.length}`);
