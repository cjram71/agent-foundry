import type { AgentManifest } from "./index";
export interface AgentTrialEvidence {
  supervisedRuns: number;
  acceptedRuns: number;
  requiredTestsPassed: boolean;
  securityReviewPassed: boolean;
  charterCompliant: boolean;
}
export function certificationReadiness(
  agent: AgentManifest,
  evidence: AgentTrialEvidence,
): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!agent.contract)
    return { ready: false, reasons: ["Agent Contract v2 is required"] };
  if (evidence.supervisedRuns < agent.contract.supervisedTrialsRequired)
    reasons.push(
      `Requires ${agent.contract.supervisedTrialsRequired} supervised runs`,
    );
  const rate = evidence.supervisedRuns
    ? evidence.acceptedRuns / evidence.supervisedRuns
    : 0;
  if (rate < agent.contract.minimumAcceptanceRate)
    reasons.push(
      `Acceptance rate must be at least ${agent.contract.minimumAcceptanceRate}`,
    );
  if (!evidence.requiredTestsPassed)
    reasons.push("Required tests have not passed");
  if (!evidence.securityReviewPassed)
    reasons.push("Security review has not passed");
  if (!evidence.charterCompliant)
    reasons.push("Active Charter compliance is required");
  return { ready: reasons.length === 0, reasons };
}
