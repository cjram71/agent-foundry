import type { AgentManifest } from "./index";
const denied = [
  "unrestricted-root-shell",
  "docker-socket",
  "disable-audit-logs",
  "self-approve-privilege",
];
type Starter = {
  id: string;
  name: string;
  mission: string;
  exclusions: string[];
  deliverables: string[];
  checks: string[];
  tools?: string[];
};
const starters: Starter[] = [
  {
    id: "research-scout",
    name: "Research Scout",
    mission:
      "Produce a concise, sourced brief containing only genuinely relevant developments.",
    exclusions: ["contact people", "publish content", "purchase access"],
    deliverables: ["what's new", "what matters", "deeper-look sources"],
    checks: [
      "every claim has provenance",
      "duplicate findings are removed",
      "uncertain claims are labeled",
    ],
  },
  {
    id: "weekly-ledger",
    name: "Weekly Foundry Ledger",
    mission:
      "Compile one honest weekly report comparing costs, revenue, progress, and risks.",
    exclusions: ["make business decisions", "share reports externally"],
    deliverables: [
      "weekly numbers and deltas",
      "material changes",
      "plain-language flags",
    ],
    checks: [
      "every number has a source",
      "missing sources are disclosed",
      "negative trends are not softened",
    ],
  },
  {
    id: "meeting-minute",
    name: "Meeting Notes Agent",
    mission:
      "Turn authorized meeting notes into decisions, owned actions, and open questions.",
    exclusions: [
      "send recaps",
      "guess owners",
      "summarize sensitive personnel matters",
    ],
    deliverables: ["decisions", "owned action items", "open questions"],
    checks: [
      "actions have owners and dates or are flagged",
      "quotes are not fabricated",
    ],
    tools: ["query-memory", "write-workspace"],
  },
  {
    id: "content-splice",
    name: "Content Repurposer",
    mission:
      "Turn one approved long-form source into review-ready short-form drafts.",
    exclusions: [
      "invent topics",
      "fabricate claims",
      "publish or schedule content",
    ],
    deliverables: [
      "three single-idea drafts",
      "one thread outline",
      "two hooks per draft",
    ],
    checks: ["each draft stands alone", "every claim exists in the source"],
    tools: ["query-memory", "write-workspace"],
  },
];
export const starterAgentTemplates: AgentManifest[] = starters.map((item) => ({
  id: item.id,
  name: item.name,
  version: "1.0.0",
  status: "staging",
  mission: item.mission,
  responsibilities: item.deliverables,
  models: {
    primary: "cloud:reasoning",
    fallback: "local:ollama",
    permitted: ["cloud:reasoning", "local:ollama"],
  },
  permissions: {
    filesystem: {
      read: item.tools?.includes("write-workspace")
        ? ["/opt/gizmo_vps/data/agent-foundry/workspaces"]
        : [],
      write: item.tools?.includes("write-workspace")
        ? ["/opt/gizmo_vps/data/agent-foundry/workspaces"]
        : [],
    },
    network: [],
    tools: {
      allow: item.tools ?? ["query-memory"],
      approvalRequired: [],
      deny: denied,
    },
    databases: {
      read: ["memory", "tasks", "economic-events"],
      write: ["memory-candidates", "agent-run-reports"],
    },
  },
  memory: {
    read: ["working", "episodic", "semantic", "procedural", "economic"],
    write: ["candidate"],
  },
  contract: {
    oneJob: item.mission,
    exclusions: item.exclusions,
    deliverables: item.deliverables,
    operatingLoop: [
      "apply authorized memory",
      "gather evidence",
      "perform the job",
      "self-check",
      "propose durable learnings",
      "report and stop",
    ],
    selfChecks: item.checks,
    reportFields: ["completed", "waitingForApproval", "uncertain"],
    memoryWriteMode: "candidate-only",
    consequentialActions: [],
    supervisedTrialsRequired: 5,
    minimumAcceptanceRate: 0.8,
    scheduling: "after-certification",
    maximumRuntimeMinutes: 30,
    maximumToolCalls: 40,
  },
  budget: {
    maximumTaskCostUsd: 4,
    maximumDailyCostUsd: 20,
    tokenLimit: 100000,
    retries: 1,
  },
  risk: {
    classification: "green",
    approvalRequired: false,
    escalationRules: [
      "stop before any outward-facing action",
      "escalate sensitive or unsupported material",
    ],
  },
  evaluation: {
    requiredTests: [
      "contract-output",
      "provenance",
      "redaction",
      "approval-boundary",
    ],
  },
  logging: { enabled: true },
}));
