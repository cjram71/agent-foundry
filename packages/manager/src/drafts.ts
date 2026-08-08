// Deterministic conversion of a parsed manager evaluation into DRAFT task
// descriptors. This is the "deterministic Manager": the AI proposes, code
// disposes — every admitted step is assembled by a fixed template, risk
// classified by the policy engine, and admitted only inside the project's
// active policy. The output is descriptors only; the caller persists them
// as DRAFT tasks. Nothing here can plan, queue, or execute.

import {
  classifyTaskRisk,
  evaluateTaskAgainstPolicy,
  type ProjectPolicyValues,
  type RiskLevel,
} from '@foundry/policy';
import type { ManagerPlanParse, ManagerStepDescriptor } from './parse';

/** Drafts carry no human declaration, so the floor is 'low': screening is
 *  done by the deterministic detectors at creation time, the computed
 *  effective risk is STORED on the draft task, and every approval gate
 *  re-classifies independently. A blanket 'medium' floor would make
 *  'low'-ceiling projects unable to receive any manager drafts at all. */
const DRAFT_DECLARED_RISK = 'low' as const;

export interface DraftTaskDescriptor {
  title: string;
  completeInstruction: string;
  /** Effective risk after classification — stored on the created task as its riskLevel. */
  effectiveRisk: RiskLevel;
}

export interface SkippedStep {
  order: number;
  title: string;
  reasons: string[];
  matchedRules: string[];
}

export interface ManagerDraftPlan {
  drafts: DraftTaskDescriptor[];
  skipped: SkippedStep[];
  /** Malformed items dropped at parse time. */
  droppedAtParse: number;
}

function assembleInstruction(input: {
  projectName: string;
  evaluationTaskId: string;
  step: ManagerStepDescriptor;
  acceptanceCriteria: string[];
}): string {
  const lines = [
    `This task is part of the approved AI Project Manager evaluation for ${input.projectName} (evaluation task ${input.evaluationTaskId}). Execute only this step; the human approval gates of Agent Foundry apply unchanged.`,
    '',
    `Step ${input.step.order}: ${input.step.title}`,
  ];
  if (input.step.description) lines.push('', input.step.description);
  if (input.step.validation) lines.push('', `Validation: ${input.step.validation}`);
  if (input.acceptanceCriteria.length) {
    lines.push('', 'Acceptance criteria from the approved evaluation:');
    for (const criterion of input.acceptanceCriteria) lines.push(`- ${criterion}`);
  }
  return lines.join('\n').slice(0, 12000);
}

/**
 * Build draft descriptors from a parsed evaluation. `null` parse input
 * (unusable evaluation output) yields an empty plan rather than an error —
 * evaluation completion must never fail because follow-on drafting could
 * not interpret it.
 */
export function buildTaskDrafts(input: {
  parse: ManagerPlanParse | null;
  projectName: string;
  evaluationTaskId: string;
  policy: ProjectPolicyValues;
}): ManagerDraftPlan {
  if (!input.parse) return { drafts: [], skipped: [], droppedAtParse: 0 };
  const drafts: DraftTaskDescriptor[] = [];
  const skipped: SkippedStep[] = [];
  for (const step of input.parse.steps) {
    const completeInstruction = assembleInstruction({
      projectName: input.projectName,
      evaluationTaskId: input.evaluationTaskId,
      step,
      acceptanceCriteria: input.parse.acceptanceCriteria,
    });
    const risk = classifyTaskRisk({ declaredRisk: DRAFT_DECLARED_RISK, title: step.title, instruction: completeInstruction });
    const decision = evaluateTaskAgainstPolicy(input.policy, risk);
    if (!decision.allowed) {
      skipped.push({ order: step.order, title: step.title, reasons: decision.reasons, matchedRules: decision.matchedRules });
      continue;
    }
    drafts.push({ title: step.title, completeInstruction, effectiveRisk: risk.level });
  }
  return { drafts, skipped, droppedAtParse: input.parse.dropped };
}
