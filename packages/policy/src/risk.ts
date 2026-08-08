// Deterministic task-risk classification.
//
// No AI is involved anywhere in this module: a task's effective risk is
// computed from a fixed rule table and the administrator's declared risk.
// Rules can only ESCALATE risk (declared is the floor; detected patterns
// raise it; prohibited overrides everything) — they never downgrade what an
// administrator declared.
//
// Design constraints that shaped the rule table:
//  * Prohibited rules BLOCK task creation outright, so they must be tight
//    operational patterns (credential theft, merge-bypass, destructive
//    production operations, mass messaging, cryptomining, malware,
//    auth-weakening), not topical keywords — "build a spam filter" must not
//    fire the mass-messaging rule.
//  * FP-prone rules use a negation guard: if the match is immediately
//    preceded by a clear negation ("never", "do not", "must not",
//    "without"), the match is ignored. This is a documented heuristic, not
//    NLP — residual false positives surface as a clear block reason that a
//    human can fix by rewording the task.
//  * High-risk rules are permissive by default (the default policy ceiling
//    is 'high'), so a false positive there only mislabels, never blocks.
//  * MatchedRule exposes only the rule id and severity. Rule evaluation
//    must never copy user text into logs or audits.

export const RISK_LEVELS = ['low', 'medium', 'high', 'prohibited'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export type DeclaredRisk = 'low' | 'medium' | 'high';

/** Narrows the free-form TEXT stored on legacy rows; anything odd floors to 'medium'. */
export function isDeclaredRisk(value: unknown): value is DeclaredRisk {
  return value === 'low' || value === 'medium' || value === 'high';
}

export function asDeclaredRisk(value: unknown): DeclaredRisk {
  return isDeclaredRisk(value) ? value : 'medium';
}

export function riskRank(level: RiskLevel): number {
  return (RISK_LEVELS as readonly string[]).indexOf(level);
}

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return riskRank(a) >= riskRank(b) ? a : b;
}

export interface MatchedRule {
  id: string;
  severity: 'high' | 'prohibited';
}

interface RiskRule extends MatchedRule {
  description: string;
  patterns: RegExp[];
  /** When true, a match preceded (within 25 chars) by a clear negation is ignored. */
  negationGuard?: boolean;
}

const NEGATION = /\b(never|do not|don't|must not|cannot|can't|without ever)\b/i;

function matchesRule(rule: RiskRule, text: string): boolean {
  for (const pattern of rule.patterns) {
    const found = pattern.exec(text);
    if (!found) continue;
    if (!rule.negationGuard) return true;
    const prefix = text.slice(Math.max(0, found.index - 25), found.index);
    if (!NEGATION.test(prefix)) return true;
  }
  return false;
}

// Prohibited: the platform never schedules these, no policy can allow them.
const PROHIBITED_RULES: RiskRule[] = [
  {
    id: 'prohibited.credential-theft',
    severity: 'prohibited',
    description: 'stealing, exfiltrating, dumping or harvesting credentials or secrets',
    patterns: [
      /\b(steal|exfiltrat\w+|dump(?:ing|s)?|harvest(?:ing)?|leak(?:ing|s)?|siphon\w*)\b[\s\S]{0,60}\b(passwords?|secrets?|credentials?|api[_ -]?keys?|access tokens?|private keys?)\b/i,
      /\b(passwords?|secrets?|credentials?|api[_ -]?keys?|access tokens?|private keys?)\b[\s\S]{0,60}\b(steal|exfiltrat\w+|dump(?:ing|s)?|harvest(?:ing)?|leak(?:ing|s)?|siphon\w*)\b/i,
    ],
  },
  {
    id: 'prohibited.auto-merge-bypass',
    severity: 'prohibited',
    description: 'merging to protected branches without human approval',
    negationGuard: true,
    patterns: [
      /\bmerg\w*\b[\s\S]{0,40}\bwithout\b[\s\S]{0,30}\b(approval|review|human)\b/i,
      /\bauto-?merg\w*\b[\s\S]{0,30}\b(production|main|master|default branch)\b/i,
    ],
  },
  {
    id: 'prohibited.destructive-data',
    severity: 'prohibited',
    description: 'destroying production data or whole databases',
    negationGuard: true,
    patterns: [
      /\brm\s+-rf\s+(\/|~|\$HOME)/i,
      /\b(drop|truncate)\s+(all\s+)?(tables?|databases?)\b/i,
      /\b(delete|destroy|wipe)\w*\b[\s\S]{0,25}\b(production|live)\b[\s\S]{0,25}\b(data|database|tables?|records)\b/i,
    ],
  },
  {
    id: 'prohibited.mass-messaging',
    severity: 'prohibited',
    description: 'unsolicited bulk messaging (spam)',
    negationGuard: true,
    patterns: [
      /\b(send|blast|deliver)\w*\b[\s\S]{0,30}\b(unsolicited|mass|bulk)\b[\s\S]{0,20}\b(e-?mails?|messages?|dms?)\b/i,
      /\bspam(ming|s)?\b[\s\S]{0,30}\b(users?|customers?|recipients?)\b/i,
    ],
  },
  {
    id: 'prohibited.cryptomining',
    severity: 'prohibited',
    description: 'cryptocurrency mining on platform or target infrastructure',
    patterns: [
      /\b(mine|mining)\b[\s\S]{0,25}\b(crypto|currenc\w+|bitcoin|monero|ethereum)\b/i,
      /\bcrypto-?mining\b/i,
    ],
  },
  {
    id: 'prohibited.malware',
    severity: 'prohibited',
    description: 'building or deploying malware',
    negationGuard: true,
    patterns: [
      /\b(install|create|build|deploy|plant|distribut\w+)\b[\s\S]{0,40}\b(ransomware|keyloggers?|rootkits?|botnets?|trojans?|spyware)\b/i,
    ],
  },
  {
    id: 'prohibited.auth-weakening',
    severity: 'prohibited',
    description: 'disabling multi-factor authentication',
    negationGuard: true,
    patterns: [
      /\b(disable|remove|bypass|turn\s+off)\w*\b[\s\S]{0,25}\b(two[- ]factor|2fa|mfa|multi[- ]factor)\b/i,
    ],
  },
  {
    id: 'prohibited.branch-protection',
    severity: 'prohibited',
    description: 'removing branch protection or required checks',
    negationGuard: true,
    patterns: [
      /\b(disable|remove|turn\s+off|bypass)\w*\b[\s\S]{0,25}\b(branch\s+protection|protected\s+branches?|required\s+(status\s+)?checks?)\b/i,
    ],
  },
];

// High: permitted under the default policy, but floors the effective risk.
const HIGH_RISK_RULES: RiskRule[] = [
  {
    id: 'high.production-change',
    severity: 'high',
    description: 'deploying to or changing production systems',
    patterns: [
      /\b(deploy|release|ship|roll\s?out|migrate)\w*\b[\s\S]{0,30}\b(to|into|on)\s+production\b/i,
      /\bproduction\b[\s\S]{0,30}\b(deploy\w*|database|migration|config\w*|credentials?|secrets?)\b/i,
    ],
  },
  {
    id: 'high.auth-security-surface',
    severity: 'high',
    description: 'changing authentication, authorization or session handling',
    patterns: [
      /\b(change|modify|rewrite|replace|overhaul)\w*\b[\s\S]{0,30}\b(authentication|authorization|oauth|jwt|sessions?|login\s+flow|permissions?|access\s+control)\b/i,
    ],
  },
  {
    id: 'high.payments-billing',
    severity: 'high',
    description: 'payments, billing or subscription pricing',
    patterns: [
      /\b(payments?|billing|stripe|checkout\s+flow|invoic\w+|charge\w*\s+customers?|subscription\s+pric\w+)\b/i,
    ],
  },
  {
    id: 'high.infrastructure',
    severity: 'high',
    description: 'infrastructure and network configuration',
    patterns: [
      /\b(terraform|kubernetes|k8s|dns\s+records?|firewall\w*|load[- ]balancers?|iam\s+polic\w+|vpc\s+config\w*)\b/i,
    ],
  },
  {
    id: 'high.data-migration',
    severity: 'high',
    description: 'database migrations or production data backfills',
    patterns: [
      /\b(database\s+migration|schema\s+migration|data\s+backfill|migrate\s+production)/i,
    ],
  },
  {
    id: 'high.external-comms',
    severity: 'high',
    description: 'contacting customers, users or third parties',
    patterns: [
      /\b(email|contact|notify|message)\w*\b[\s\S]{0,25}\b(customers?|users?|third[- ]part\w+|vendors?|suppliers?)\b/i,
    ],
  },
  {
    id: 'high.dependency-floor',
    severity: 'high',
    description: 'dependency downgrades',
    patterns: [
      /\bdowngrad\w+\b[\s\S]{0,30}\b(dependenc\w+|packages?|openssl|node|react|next)\b/i,
    ],
  },
];

export const RISK_RULES: readonly MatchedRule[] = [...PROHIBITED_RULES, ...HIGH_RISK_RULES]
  .map(({ id, severity }) => ({ id, severity }));

export interface RiskClassification {
  /** Effective risk: prohibited > high > medium > low. */
  level: RiskLevel;
  /** What the administrator declared (the floor). */
  declared: DeclaredRisk;
  /** Rules that fired (ids only — never source text). */
  matched: MatchedRule[];
}

export function classifyTaskRisk(input: {
  declaredRisk: DeclaredRisk;
  title: string;
  instruction: string;
}): RiskClassification {
  const text = `${input.title}\n${input.instruction}`;
  const matched: MatchedRule[] = [];
  let detectedHigh = false;
  let prohibited = false;
  for (const rule of [...PROHIBITED_RULES, ...HIGH_RISK_RULES]) {
    if (!matchesRule(rule, text)) continue;
    matched.push({ id: rule.id, severity: rule.severity });
    if (rule.severity === 'prohibited') prohibited = true;
    else detectedHigh = true;
  }
  let level: RiskLevel = input.declaredRisk;
  if (detectedHigh) level = maxRisk(level, 'high');
  if (prohibited) level = 'prohibited';
  return { level, declared: input.declaredRisk, matched };
}
