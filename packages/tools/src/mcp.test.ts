import assert from 'node:assert/strict';
import test from 'node:test';
import { McpClient, registerMcpTool } from './mcp';
import { ToolGateway, type ToolAudit } from './index';

test('MCP client sends an authenticated JSON-RPC tool call', async () => {
  let request: RequestInit | undefined;
  const client = new McpClient({ endpoint: 'https://connect.composio.dev/mcp', apiKey: 'test-key-123', fetch: (async (_url, init) => { request = init; return new Response(JSON.stringify({ result: { structuredContent: { ok: true } } }), { status: 200 }); }) as typeof fetch });
  assert.deepEqual(await client.call('GITHUB_LIST_REPOS', { owner: 'x' }), { ok: true });
  assert.equal((request?.headers as Record<string, string>)['x-api-key'], 'test-key-123');
  assert.equal(JSON.parse(String(request?.body)).method, 'tools/call');
});

test('MCP client rejects non-HTTPS endpoints and malformed tool names', async () => {
  assert.throws(() => new McpClient({ endpoint: 'http://localhost/mcp', apiKey: 'test-key-123' }), /HTTPS/);
  const client = new McpClient({ endpoint: 'https://example.test/mcp', apiKey: 'test-key-123', fetch: (async () => new Response('{}')) as typeof fetch });
  await assert.rejects(client.call('bad-name', {}), /Invalid MCP tool name/);
});

test('registered MCP tools retain Tool Gateway approval and audit controls', async () => {
  const events: ToolAudit[] = [];
  const gateway = new ToolGateway(async event => { events.push(event); });
  const client = new McpClient({ endpoint: 'https://example.test/mcp', apiKey: 'test-key-123', fetch: (async () => new Response(JSON.stringify({ result: { structuredContent: { ok: true } } }), { status: 200 })) as typeof fetch });
  registerMcpTool(gateway, client, { name: 'GITHUB_CREATE_ISSUE', description: 'Create issue', action: 'github.issue.create', permission: 'github:write', risk: 'high', approvalRequired: true });
  await assert.rejects(gateway.invoke('mcp-github-create-issue', {}, { actor: 'agent', permissions: ['github:write'], purpose: 'test' }), /approval required/);
  assert.equal(events[0]?.result, 'denied');
});
