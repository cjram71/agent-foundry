import { createHash } from "node:crypto";
export type MemoryKind = "WORKING" | "CONVERSATION" | "SEMANTIC" | "STRUCTURED" | "ARTIFACT" | "OPERATIONAL";
export type MemoryDecision = "ALLOW" | "REQUIRE_APPROVAL" | "REJECT";
export interface MemoryWriteRequest { kind: MemoryKind; agentId: string; scopeType: "TASK" | "PROJECT" | "USER" | "SYSTEM"; scopeId: string; summary: string; content?: unknown; provenance: string; sensitivity?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET"; explicitlyRequested?: boolean; retentionDays?: number; }
export interface MemoryPolicyResult { decision: MemoryDecision; reason: string; retentionDays: number; contentHash?: string; }
const SECRET_PATTERN = /(api[_ -]?key|password|passwd|private[_ -]?key|bearer\s+[a-z0-9._-]+|token\s*[:=])/i;
const DEFAULT_RETENTION: Record<MemoryKind, number> = { WORKING: 1, CONVERSATION: 30, SEMANTIC: 90, STRUCTURED: 365, ARTIFACT: 90, OPERATIONAL: 180 };
export function evaluateMemoryWrite(request: MemoryWriteRequest): MemoryPolicyResult {
  if (!request.agentId || !request.scopeId || !request.provenance || !request.summary.trim()) return { decision: "REJECT", reason: "agent, scope, provenance, and summary are required", retentionDays: 0 };
  const serialized = JSON.stringify({ summary: request.summary, content: request.content ?? null });
  if (request.sensitivity === "SECRET" || SECRET_PATTERN.test(serialized)) return { decision: "REJECT", reason: "secrets and credentials must never enter memory", retentionDays: 0 };
  if (Buffer.byteLength(serialized, "utf8") > 64 * 1024) return { decision: "REJECT", reason: "memory payload exceeds 64 KiB", retentionDays: 0 };
  const retentionDays = Math.min(Math.max(request.retentionDays ?? DEFAULT_RETENTION[request.kind], 1), 365);
  const contentHash = createHash("sha256").update(serialized).digest("hex");
  if (request.kind === "CONVERSATION" && !request.explicitlyRequested) return { decision: "REQUIRE_APPROVAL", reason: "conversation persistence must be explicit", retentionDays, contentHash };
  if (request.kind === "SEMANTIC" && !request.explicitlyRequested) return { decision: "REQUIRE_APPROVAL", reason: "long-term semantic memory requires approval", retentionDays, contentHash };
  return { decision: "ALLOW", reason: "policy accepted", retentionDays, contentHash };
}
export interface QdrantPoint { id: string; vector: number[]; payload: { memoryRecordId: string; scopeType: string; scopeId: string; agentId: string; contentHash: string }; }
export const SEMANTIC_COLLECTION = "gizmo_semantic_memory_v1";
export class QdrantMemoryAdapter {
  constructor(private readonly baseUrl: string, private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) { if (!baseUrl || !apiKey) throw new Error("Qdrant URL and API key are required"); }
  async upsert(point: QdrantPoint): Promise<void> {
    if (!point.payload.memoryRecordId || !point.payload.contentHash) throw new Error("PostgreSQL provenance is required");
    const response = await this.fetcher(`${this.baseUrl}/collections/${SEMANTIC_COLLECTION}/points?wait=true`, { method: "PUT", headers: { "content-type": "application/json", "api-key": this.apiKey }, body: JSON.stringify({ points: [point] }) });
    if (!response.ok) throw new Error(`Qdrant upsert failed: ${response.status}`);
  }
}
