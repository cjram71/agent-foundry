import type { AgentManifest } from '@foundry/agent-contracts';

export const BOOSTA_COMPANY_ID = 'BSTA-COMP-001';
export const BOOSTA_DISCOVERY_PROVENANCE = 'boosta:discovery:v1';

export const discoveryRoles = [
  { id: 'boosta-market-scout', name: 'Market Scout', job: 'Research Boosta Forlag, its public products, audiences, channels, competitors, customer problems and evidence-backed market opportunities.', deliverable: 'A sourced market and company discovery report. Clearly separate verified facts, inferences and unknowns.' },
  { id: 'boosta-finance-analyst', name: 'Finance Analyst', job: 'Evaluate plausible revenue models, costs, margins and cheapest validation experiments for the candidate opportunities. Use ranges and state assumptions.', deliverable: 'A conservative financial assessment with assumptions, uncertainty and stop criteria.' },
  { id: 'boosta-security-reviewer', name: 'Security & Privacy Reviewer', job: 'Assess security, privacy, data and AI risks in the candidate opportunities without performing scans or accessing private systems.', deliverable: 'A risk assessment with mitigations and human approval triggers.' },
  { id: 'boosta-compliance-reviewer', name: 'Legal & Compliance Researcher', job: 'Provide sourced legal and compliance information relevant to Swedish publishing, GDPR, copyright, consumer obligations and the EU AI Act. Never present legal advice.', deliverable: 'A sourced compliance information report identifying matters for qualified human advice.' },
  { id: 'boosta-red-team', name: 'Independent Red Team', job: 'Independently challenge the strongest apparent Boosta opportunities, assumptions, evidence, economics, competition and failure modes. Find the cheapest ways to disprove them.', deliverable: 'An adversarial report with disconfirming evidence, unknowns and falsification experiments.' },
  { id: 'boosta-ai-ceo', name: 'Boosta AI CEO', job: 'Synthesize the independent discovery reports into a concise owner briefing. Recommend no more than three opportunities and one cheapest next experiment. Do not invent evidence or make commitments.', deliverable: 'An executive recommendation with evidence, confidence, risks, unknowns and Approve, Reject, or Research More options.' },
] as const;

export const supportRoleIds: string[] = discoveryRoles.slice(0, -1).map(role => role.id);
export const ceoRoleId = discoveryRoles.at(-1)!.id;

export function manifestFor(role: typeof discoveryRoles[number]): AgentManifest {
  return {
    id: role.id, name: role.name, version: '1.0.0', status: 'staging', mission: role.job,
    responsibilities: [role.job], models: { primary: 'gemini-research', fallback: 'gemini-research', permitted: ['gemini-research'] },
    permissions: { filesystem: { read: [], write: [] }, network: ['google-search'], tools: { allow: [], approvalRequired: [], deny: ['unrestricted-root-shell', 'docker-socket', 'disable-audit-logs', 'self-approve-privilege'] }, databases: { read: ['company', 'mission-reports'], write: ['run-report'] } },
    memory: { read: ['company', 'mission'], write: ['candidate-only'] },
    contract: { oneJob: role.job, exclusions: ['No contacting people, publishing, purchasing, deployment, contracts, rights acquisition, legal advice, production changes or permanent memory writes.'], deliverables: [role.deliverable], operatingLoop: ['inspect authorized context', 'research evidence', 'challenge uncertainty', 'produce structured report'], selfChecks: ['Every factual claim is linked to evidence', 'Unknowns and limitations are explicit', 'No external action was taken'], reportFields: ['completed', 'waitingForApproval', 'uncertain', 'evidence'], memoryWriteMode: 'candidate-only', consequentialActions: [], supervisedTrialsRequired: 3, minimumAcceptanceRate: 0.8, scheduling: 'manual-only', maximumRuntimeMinutes: 20, maximumToolCalls: 25 },
    budget: { maximumTaskCostUsd: 2, maximumDailyCostUsd: 12, tokenLimit: 30000, retries: 1 },
    risk: { classification: 'green', approvalRequired: true, escalationRules: ['Escalate legal, financial, reputational, privacy and rights conclusions to the human owner.'] },
    evaluation: { requiredTests: ['evidence-present', 'unknowns-explicit', 'no-external-action'] }, logging: { enabled: true },
  };
}

export const discoveryMissionContract = {
  goal: 'Discover and evaluate evidence-backed publishing, IP, digital-product, education, app and SaaS opportunities that fit Boosta Forlag AB.',
  constraints: ['Read-only public research only', 'No external communication or commitments', 'No spending, publishing, deployment or permanent memory writes', 'Separate facts, inference and unknowns', 'Legal output is information, not advice'],
  deliverables: ['Company and market inventory', 'Opportunity candidates and scoring evidence', 'Financial, security and compliance reviews', 'Independent Red Team challenge', 'AI CEO recommendation for human decision'],
  definitionOfDone: ['All five independent specialist reports have evidence', 'AI CEO synthesis identifies confidence and unknowns', 'One bounded experiment is recommended', 'Human decision is requested before project creation'],
  failureConditions: ['Evidence cannot be sourced', 'An agent attempts an external action', 'Company constitution is inactive', 'Research output cannot distinguish facts from assumptions'],
};
