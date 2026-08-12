import { createHash } from "node:crypto";

export type Sensitivity = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
export type TrustTier = "low" | "medium" | "medium-high" | "high";
export type ReviewStatus = "pending" | "approved" | "rejected";
export interface AuthorizedMemoryMetadata {
  source: string;
  sourceReference: string;
  missionId?: string;
  projectId?: string;
  createdAt: string;
  reviewedBy?: string;
  reviewStatus: ReviewStatus;
  trustTier: TrustTier;
  owner: string;
  readRoles: string[];
  writeRoles: string[];
  redactionRules: Array<
    "strip_secrets" | "strip_pii" | "strip_financial_detail"
  >;
  sensitivity: Sensitivity;
  retentionDays: number;
  economicRelevance: boolean;
}
export interface RedactionFinding {
  type: "secret" | "email" | "phone" | "payment_card" | "bank_account";
  reference: string;
}
export interface RedactionResult {
  value: string;
  findings: RedactionFinding[];
  safe: boolean;
}

const detectors: Array<{ type: RedactionFinding["type"]; pattern: RegExp }> = [
  {
    type: "secret",
    pattern: /\b(?:sk|pk|ghp|github_pat|xox[baprs])-[_a-z0-9-]{12,}\b/gi,
  },
  {
    type: "secret",
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    type: "secret",
    pattern:
      /\b(?:api[_ -]?key|password|passwd|secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*[^\s,;]{6,}/gi,
  },
  { type: "payment_card", pattern: /\b(?:\d[ -]*?){13,19}\b/g },
  { type: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: "phone", pattern: /(?<!\w)(?:\+?\d[\d ().-]{7,}\d)(?!\w)/g },
  { type: "bank_account", pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi },
];
function redactionReference(
  type: RedactionFinding["type"],
  value: string,
): string {
  return createHash("sha256")
    .update(type)
    .update("\0")
    .update(value)
    .digest("hex")
    .slice(0, 12);
}
export function redactForModel(
  input: unknown,
  enabled: RedactionFinding["type"][] = detectors.map((x) => x.type),
): RedactionResult {
  let value = typeof input === "string" ? input : JSON.stringify(input ?? null);
  const findings: RedactionFinding[] = [];
  for (const detector of detectors) {
    if (!enabled.includes(detector.type)) continue;
    value = value.replace(detector.pattern, (match) => {
      const reference = redactionReference(detector.type, match);
      if (
        !findings.some(
          (x) => x.type === detector.type && x.reference === reference,
        )
      )
        findings.push({ type: detector.type, reference });
      return `[REDACTED:${detector.type}:${reference}]`;
    });
  }
  return { value, findings, safe: findings.length === 0 };
}
export function validateAuthorizedMetadata(
  metadata: AuthorizedMemoryMetadata,
): string[] {
  const errors: string[] = [];
  if (!metadata.source.trim() || !metadata.sourceReference.trim())
    errors.push("source and sourceReference are required");
  if (!Number.isFinite(Date.parse(metadata.createdAt)))
    errors.push("createdAt must be an ISO date");
  if (
    !metadata.owner.trim() ||
    metadata.readRoles.length === 0 ||
    metadata.writeRoles.length === 0
  )
    errors.push("owner and access roles are required");
  if (
    !Number.isInteger(metadata.retentionDays) ||
    metadata.retentionDays < 1 ||
    metadata.retentionDays > 3650
  )
    errors.push("retentionDays must be between 1 and 3650");
  if (metadata.reviewStatus === "approved" && !metadata.reviewedBy)
    errors.push("approved memory requires reviewedBy");
  if (metadata.trustTier === "high" && metadata.reviewStatus !== "approved")
    errors.push("high-trust memory must be approved");
  if (
    (metadata.sensitivity === "CONFIDENTIAL" ||
      metadata.sensitivity === "RESTRICTED") &&
    !metadata.projectId &&
    !metadata.missionId
  )
    errors.push("sensitive memory requires a project or mission compartment");
  return errors;
}
export function canReadMemory(
  metadata: AuthorizedMemoryMetadata,
  role: string,
  scope: { projectId?: string; missionId?: string },
): boolean {
  if (!metadata.readRoles.includes(role)) return false;
  if (metadata.sensitivity === "PUBLIC" || metadata.sensitivity === "INTERNAL")
    return true;
  if (metadata.missionId) return metadata.missionId === scope.missionId;
  return Boolean(metadata.projectId && metadata.projectId === scope.projectId);
}
export type MemoryKind =
  | "WORKING"
  | "CONVERSATION"
  | "SEMANTIC"
  | "STRUCTURED"
  | "ARTIFACT"
  | "OPERATIONAL";
export type MemoryDecision = "ALLOW" | "REQUIRE_APPROVAL" | "REJECT";
export interface MemoryWriteRequest {
  kind: MemoryKind;
  agentId: string;
  scopeType: "TASK" | "PROJECT" | "USER" | "SYSTEM";
  scopeId: string;
  summary: string;
  content?: unknown;
  provenance: string;
  sensitivity?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET";
  explicitlyRequested?: boolean;
  retentionDays?: number;
}
export interface MemoryPolicyResult {
  decision: MemoryDecision;
  reason: string;
  retentionDays: number;
  contentHash?: string;
}
const SECRET_PATTERN =
  /(api[_ -]?key|password|passwd|private[_ -]?key|bearer\s+[a-z0-9._-]+|token\s*[:=])/i;
const DEFAULT_RETENTION: Record<MemoryKind, number> = {
  WORKING: 1,
  CONVERSATION: 30,
  SEMANTIC: 90,
  STRUCTURED: 365,
  ARTIFACT: 90,
  OPERATIONAL: 180,
};
export function evaluateMemoryWrite(
  request: MemoryWriteRequest,
): MemoryPolicyResult {
  if (
    !request.agentId ||
    !request.scopeId ||
    !request.provenance ||
    !request.summary.trim()
  )
    return {
      decision: "REJECT",
      reason: "agent, scope, provenance, and summary are required",
      retentionDays: 0,
    };
  const serialized = JSON.stringify({
    summary: request.summary,
    content: request.content ?? null,
  });
  if (request.sensitivity === "SECRET" || SECRET_PATTERN.test(serialized))
    return {
      decision: "REJECT",
      reason: "secrets and credentials must never enter memory",
      retentionDays: 0,
    };
  if (Buffer.byteLength(serialized, "utf8") > 64 * 1024)
    return {
      decision: "REJECT",
      reason: "memory payload exceeds 64 KiB",
      retentionDays: 0,
    };
  const retentionDays = Math.min(
    Math.max(request.retentionDays ?? DEFAULT_RETENTION[request.kind], 1),
    365,
  );
  const contentHash = createHash("sha256").update(serialized).digest("hex");
  if (request.kind === "CONVERSATION" && !request.explicitlyRequested)
    return {
      decision: "REQUIRE_APPROVAL",
      reason: "conversation persistence must be explicit",
      retentionDays,
      contentHash,
    };
  if (request.kind === "SEMANTIC" && !request.explicitlyRequested)
    return {
      decision: "REQUIRE_APPROVAL",
      reason: "long-term semantic memory requires approval",
      retentionDays,
      contentHash,
    };
  return {
    decision: "ALLOW",
    reason: "policy accepted",
    retentionDays,
    contentHash,
  };
}
export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    memoryRecordId: string;
    scopeType: string;
    scopeId: string;
    agentId: string;
    contentHash: string;
  };
}
export const SEMANTIC_COLLECTION = "gizmo_semantic_memory_v1";
export class QdrantMemoryAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!baseUrl || !apiKey)
      throw new Error("Qdrant URL and API key are required");
  }
  async upsert(point: QdrantPoint): Promise<void> {
    if (!point.payload.memoryRecordId || !point.payload.contentHash)
      throw new Error("PostgreSQL provenance is required");
    const response = await this.fetcher(
      `${this.baseUrl}/collections/${SEMANTIC_COLLECTION}/points?wait=true`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", "api-key": this.apiKey },
        body: JSON.stringify({ points: [point] }),
      },
    );
    if (!response.ok)
      throw new Error(`Qdrant upsert failed: ${response.status}`);
  }
}
