export { starterAgentTemplates } from "./starter-templates";
export {
  certificationReadiness,
  type AgentTrialEvidence,
} from "./certification";

export type AgentStatus = "experimental" | "staging" | "active" | "retired";
export type RiskClass = "green" | "yellow" | "red" | "black";

export interface ToolDefinition {
  id: string;
  description: string;
  risk: RiskClass;
  sideEffect: boolean;
  approvalRequired: boolean;
  executor: "control-plane" | "sandbox-runner" | "human-only" | "never";
}

export interface AgentManifest {
  id: string;
  name: string;
  version: string;
  status: AgentStatus;
  mission: string;
  responsibilities: string[];
  models: { primary: string; fallback: string; permitted: string[] };
  permissions: {
    filesystem: { read: string[]; write: string[] };
    network: string[];
    tools: { allow: string[]; approvalRequired: string[]; deny: string[] };
    databases: { read: string[]; write: string[] };
  };
  memory: { read: string[]; write: string[] };
  contract?: {
    oneJob: string;
    exclusions: string[];
    deliverables: string[];
    operatingLoop: string[];
    selfChecks: string[];
    reportFields: string[];
    memoryWriteMode: "candidate-only";
    consequentialActions: string[];
    supervisedTrialsRequired: number;
    minimumAcceptanceRate: number;
    scheduling: "manual-only" | "after-certification";
    maximumRuntimeMinutes: number;
    maximumToolCalls: number;
  };
  budget: {
    maximumTaskCostUsd: number;
    maximumDailyCostUsd: number;
    tokenLimit: number;
    retries: number;
  };
  risk: {
    classification: Exclude<RiskClass, "black">;
    approvalRequired: boolean;
    escalationRules: string[];
  };
  evaluation: { requiredTests: string[] };
  logging: { enabled: true };
}

const idPattern = /^[a-z][a-z0-9-]{2,63}$/;
const semverPattern = /^\d+\.\d+\.\d+$/;
const forbiddenTools = new Set([
  "unrestricted-root-shell",
  "docker-socket",
  "disable-audit-logs",
  "self-approve-privilege",
]);

function duplicates(values: string[]): string[] {
  return [
    ...new Set(
      values.filter((value, index) => values.indexOf(value) !== index),
    ),
  ];
}

export function validateRegistry(
  agents: AgentManifest[],
  tools: ToolDefinition[],
): string[] {
  const errors: string[] = [];
  const toolMap = new Map(tools.map((tool) => [tool.id, tool]));
  for (const id of duplicates(tools.map((tool) => tool.id)))
    errors.push(`duplicate tool id: ${id}`);
  for (const tool of tools) {
    if (!idPattern.test(tool.id)) errors.push(`invalid tool id: ${tool.id}`);
    if (tool.risk === "black" && tool.executor !== "never")
      errors.push(`black tool must use executor never: ${tool.id}`);
    if (tool.risk === "red" && !tool.approvalRequired)
      errors.push(`red tool must require approval: ${tool.id}`);
    if (tool.risk === "green" && tool.sideEffect)
      errors.push(`green tool cannot have side effects: ${tool.id}`);
  }
  for (const id of duplicates(agents.map((agent) => agent.id)))
    errors.push(`duplicate agent id: ${id}`);
  for (const agent of agents) {
    if (!idPattern.test(agent.id)) errors.push(`invalid agent id: ${agent.id}`);
    if (!semverPattern.test(agent.version))
      errors.push(`invalid agent version: ${agent.id}@${agent.version}`);
    if (!agent.mission.trim()) errors.push(`missing mission: ${agent.id}`);
    if (agent.responsibilities.length === 0)
      errors.push(`missing responsibilities: ${agent.id}`);
    if (!agent.models.permitted.includes(agent.models.primary))
      errors.push(`primary model not permitted: ${agent.id}`);
    if (!agent.models.permitted.includes(agent.models.fallback))
      errors.push(`fallback model not permitted: ${agent.id}`);
    if (
      agent.budget.tokenLimit <= 0 ||
      agent.budget.maximumTaskCostUsd < 0 ||
      agent.budget.maximumDailyCostUsd < 0
    )
      errors.push(`invalid budget: ${agent.id}`);
    if (agent.budget.maximumTaskCostUsd > agent.budget.maximumDailyCostUsd)
      errors.push(`task cost exceeds daily cost: ${agent.id}`);
    if (!agent.logging.enabled)
      errors.push(`logging must be enabled: ${agent.id}`);
    const allowed = new Set(agent.permissions.tools.allow);
    const approved = new Set(agent.permissions.tools.approvalRequired);
    const denied = new Set(agent.permissions.tools.deny);
    for (const id of duplicates([...allowed, ...approved, ...denied]))
      errors.push(`tool appears in multiple policy sets: ${agent.id}/${id}`);
    for (const id of [...allowed, ...approved, ...denied])
      if (!toolMap.has(id)) errors.push(`unknown tool: ${agent.id}/${id}`);
    if (agent.contract) {
      const contract = agent.contract;
      if (!contract.oneJob.trim())
        errors.push(`one job is required: ${agent.id}`);
      if (contract.exclusions.length < 1)
        errors.push(`at least one exclusion is required: ${agent.id}`);
      if (contract.deliverables.length < 1 || contract.selfChecks.length < 1)
        errors.push(`deliverables and self checks are required: ${agent.id}`);
      if (
        contract.operatingLoop.length < 4 ||
        contract.operatingLoop.length > 8
      )
        errors.push(`operating loop must contain 4-8 steps: ${agent.id}`);
      if (
        !contract.reportFields.includes("completed") ||
        !contract.reportFields.includes("waitingForApproval") ||
        !contract.reportFields.includes("uncertain")
      )
        errors.push(`run report fields are incomplete: ${agent.id}`);
      if (contract.memoryWriteMode !== "candidate-only")
        errors.push(`permanent self-written memory is forbidden: ${agent.id}`);
      if (
        !Number.isInteger(contract.supervisedTrialsRequired) ||
        contract.supervisedTrialsRequired < 3
      )
        errors.push(
          `at least three supervised trials are required: ${agent.id}`,
        );
      if (
        contract.minimumAcceptanceRate < 0.8 ||
        contract.minimumAcceptanceRate > 1
      )
        errors.push(`minimum acceptance rate must be 0.8-1: ${agent.id}`);

      if (
        !Number.isInteger(contract.maximumRuntimeMinutes) ||
        contract.maximumRuntimeMinutes < 1 ||
        contract.maximumRuntimeMinutes > 240
      )
        errors.push(`runtime limit must be 1-240 minutes: ${agent.id}`);
      if (
        !Number.isInteger(contract.maximumToolCalls) ||
        contract.maximumToolCalls < 1 ||
        contract.maximumToolCalls > 200
      )
        errors.push(`tool call limit must be 1-200: ${agent.id}`);
      const consequential = new Set(contract.consequentialActions);
      for (const action of agent.permissions.tools.approvalRequired)
        if (!consequential.has(action))
          errors.push(
            `approval tool missing from consequential actions: ${agent.id}/${action}`,
          );
    } else if (agent.status === "active")
      errors.push(`active agent requires a v2 contract: ${agent.id}`);
    for (const id of allowed) {
      const tool = toolMap.get(id);
      if (
        tool &&
        (tool.risk === "red" || tool.risk === "black" || tool.approvalRequired)
      )
        errors.push(`high-risk tool cannot be auto-allowed: ${agent.id}/${id}`);
    }
    for (const id of approved)
      if (toolMap.get(id)?.risk !== "red")
        errors.push(
          `approval set must contain red tools only: ${agent.id}/${id}`,
        );
    for (const id of forbiddenTools)
      if (!denied.has(id))
        errors.push(`mandatory deny missing: ${agent.id}/${id}`);
    if (agent.permissions.filesystem.write.includes("/"))
      errors.push(`root filesystem write forbidden: ${agent.id}`);
    if (agent.permissions.network.includes("*"))
      errors.push(`wildcard network forbidden: ${agent.id}`);
  }
  return errors;
}

export function assertValidRegistry(
  agents: AgentManifest[],
  tools: ToolDefinition[],
): void {
  const errors = validateRegistry(agents, tools);
  if (errors.length)
    throw new Error(`Agent registry invalid:\n- ${errors.join("\n- ")}`);
}
