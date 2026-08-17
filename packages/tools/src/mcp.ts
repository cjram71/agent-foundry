import { ToolGateway, type ToolContract, type ToolInvocationContext } from './index';

export interface McpToolDefinition {
  name: string;
  description: string;
  action: string;
  permission: string;
  risk: 'low' | 'medium' | 'high';
  approvalRequired: boolean;
  idempotent?: boolean;
  inputSchema?: unknown;
}

export interface McpClientOptions {
  endpoint: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const validName = (name: string) => /^[A-Z][A-Z0-9_]{1,127}$/.test(name);
const validOutput = (value: unknown): boolean => value !== null && typeof value === 'object';

export class McpClient {
  private readonly request: typeof fetch;
  private nextId = 1;
  constructor(private readonly options: McpClientOptions) {
    if (!options.endpoint.startsWith('https://')) throw new Error('MCP endpoint must use HTTPS');
    if (!options.apiKey || options.apiKey.length < 8) throw new Error('MCP API key is required');
    this.request = options.fetch || fetch;
  }
  async call(name: string, args: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!validName(name)) throw new Error('Invalid MCP tool name');
    const response = await this.request(this.options.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-api-key': this.options.apiKey }, body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method: 'tools/call', params: { name, arguments: args } }), signal: signal || AbortSignal.timeout(this.options.timeoutMs || 120_000) });
    if (!response.ok) throw new Error(`MCP request failed with HTTP ${response.status}`);
    const body = await response.json() as { result?: { structuredContent?: unknown; content?: unknown }; error?: { message?: string } };
    if (body.error) throw new Error(`MCP tool failed: ${body.error.message || 'unknown error'}`);
    const result = body.result?.structuredContent ?? body.result?.content;
    if (!validOutput(result)) throw new Error('MCP tool returned invalid output');
    return result;
  }
}

export function registerMcpTool(gateway: ToolGateway, client: McpClient, definition: McpToolDefinition): void {
  if (!validName(definition.name)) throw new Error('Invalid MCP tool name');
  const contract: ToolContract = { id: `mcp-${definition.name.toLowerCase().replaceAll('_', '-')}`.slice(0, 64), description: definition.description, action: definition.action, requiredPermission: definition.permission, risk: definition.risk, approvalRequired: definition.approvalRequired, timeoutMs: 120_000, maxRetries: definition.idempotent ? 1 : 0, rateLimitPerMinute: 30, audit: true, idempotent: definition.idempotent === true, validateInput: () => true, validateOutput: validOutput };
  gateway.register(contract, async (input: unknown, _context: ToolInvocationContext, signal: AbortSignal) => client.call(definition.name, input, signal));
}
