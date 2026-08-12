import assert from "node:assert/strict";
import test from "node:test";
import {
  canReadMemory,
  evaluateMemoryWrite,
  QdrantMemoryAdapter,
  redactForModel,
  SEMANTIC_COLLECTION,
  validateAuthorizedMetadata,
  type AuthorizedMemoryMetadata,
} from "./index";
const base = {
  kind: "STRUCTURED" as const,
  agentId: "developer",
  scopeType: "TASK" as const,
  scopeId: "t1",
  summary: "Build passed",
  provenance: "task:t1",
};
test("allows bounded structured memory", () => {
  const result = evaluateMemoryWrite(base);
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.contentHash?.length, 64);
});
test("rejects secrets", () =>
  assert.equal(
    evaluateMemoryWrite({ ...base, content: { apiKey: "hidden" } }).decision,
    "REJECT",
  ));
test("requires explicit conversation persistence", () =>
  assert.equal(
    evaluateMemoryWrite({ ...base, kind: "CONVERSATION" }).decision,
    "REQUIRE_APPROVAL",
  ));
test("requires explicit semantic persistence", () =>
  assert.equal(
    evaluateMemoryWrite({ ...base, kind: "SEMANTIC" }).decision,
    "REQUIRE_APPROVAL",
  ));
test("caps retention", () =>
  assert.equal(
    evaluateMemoryWrite({ ...base, retentionDays: 500 }).retentionDays,
    365,
  ));
test("uses versioned Qdrant collection", async () => {
  let url = "";
  const fakeFetch = (async (input: string | URL | Request) => {
    url = String(input);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const adapter = new QdrantMemoryAdapter(
    "http://qdrant:6333",
    "test",
    fakeFetch,
  );
  await adapter.upsert({
    id: "p1",
    vector: [0.1],
    payload: {
      memoryRecordId: "m1",
      scopeType: "TASK",
      scopeId: "t1",
      agentId: "developer",
      contentHash: "a".repeat(64),
    },
  });
  assert.match(url, new RegExp(SEMANTIC_COLLECTION));
});
test("redacts secrets and personal data with stable references", () => {
  const input =
    "password=hunter2 contact owner@example.com card 4111 1111 1111 1111";
  const first = redactForModel(input);
  const second = redactForModel(input);
  assert.equal(first.safe, false);
  assert(!first.value.includes("hunter2"));
  assert(!first.value.includes("owner@example.com"));
  assert.equal(first.value, second.value);
  assert(first.findings.some((x) => x.type === "secret"));
  assert(first.findings.some((x) => x.type === "payment_card"));
});
const metadata = (
  overrides: Partial<AuthorizedMemoryMetadata> = {},
): AuthorizedMemoryMetadata => ({
  source: "research-agent",
  sourceReference: "https://example.test/source",
  missionId: "m1",
  projectId: "p1",
  createdAt: "2026-08-12T14:00:00Z",
  reviewedBy: "owner",
  reviewStatus: "approved",
  trustTier: "high",
  owner: "foundry-charter",
  readRoles: ["orchestrator"],
  writeRoles: ["orchestrator"],
  redactionRules: ["strip_secrets", "strip_pii"],
  sensitivity: "CONFIDENTIAL",
  retentionDays: 365,
  economicRelevance: false,
  ...overrides,
});
test("enforces review and compartment metadata", () => {
  assert.deepEqual(validateAuthorizedMetadata(metadata()), []);
  assert(
    validateAuthorizedMetadata(
      metadata({ reviewStatus: "pending", reviewedBy: undefined }),
    ).some((x) => x.includes("high-trust")),
  );
  assert(
    validateAuthorizedMetadata(
      metadata({ projectId: undefined, missionId: undefined }),
    ).some((x) => x.includes("compartment")),
  );
});
test("compartmentalizes confidential memory", () => {
  assert.equal(
    canReadMemory(metadata(), "orchestrator", {
      projectId: "p1",
      missionId: "m1",
    }),
    true,
  );
  assert.equal(
    canReadMemory(metadata(), "runner", { projectId: "p1", missionId: "m1" }),
    false,
  );
  assert.equal(
    canReadMemory(metadata(), "orchestrator", {
      projectId: "p2",
      missionId: "m2",
    }),
    false,
  );
});
