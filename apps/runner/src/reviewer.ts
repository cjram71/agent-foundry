import { SandboxController, ValidationCommand } from './sandbox';
import { GoogleGenAI } from '@google/genai';

export interface ReviewLenses {
  /** The reserved final validation command passed inside the sandbox. */
  validation: boolean;
  /** The safety/security lens approved (null = never reached). */
  safety: boolean | null;
  /** The plan-fidelity lens approved (null = never reached). */
  planFidelity: boolean | null;
}

export interface ReviewResult {
  passed: boolean;
  /** Combined, human-readable verdict text from every lens that ran. */
  feedback: string;
  lenses: ReviewLenses;
}

export interface FidelityContext {
  title: string;
  instruction: string;
  planSummary: string;
}

/** Parse the APPROVED/REJECTED contract. Unparseable or empty output is NOT
 *  a verdict and never counts as approval (null). */
export function parseReviewVerdict(text: string | undefined | null): boolean | null {
  const value = (text || '').trim();
  if (!value) return null;
  if (/^APPROVED\b/i.test(value)) return true;
  if (/^REJECTED\b/i.test(value)) return false;
  return null;
}

/** One combined feedback document for the PR body, human gate, and repair
 *  loop — each lens clearly attributed, total length bounded. */
export function combineLensFeedback(safety: string, planFidelity: string): string {
  return `Safety review: ${safety}\n\nPlan-fidelity review: ${planFidelity}`.slice(0, 3900);
}

function buildSafetyPrompt(commandLabel: string, validationOutput: string, diff: string): string {
  return `You are an expert AI code reviewer. Validation succeeded, but approval still requires a clear safety assessment.\n\nCommand: ${commandLabel}\nOutput:\n${validationOutput.slice(-20000)}\n\nDiff:\n${diff.slice(0, 100000)}\n\nStart your response with exactly APPROVED or REJECTED, then give a concise justification.`;
}

function buildFidelityPrompt(context: FidelityContext, diff: string): string {
  return `You are checking plan fidelity for a human-gated delivery system. A coding agent produced the diff below for an approved task. Judge ONLY plan fidelity: (1) does the diff implement the approved plan's steps and the task instruction, (2) does it avoid unrelated or scope-creep changes, (3) are the plan's acceptance criteria addressed. A separate lens handles style and security — do not duplicate that work.\n\nTask: ${context.title}\nInstruction: ${context.instruction}\nApproved plan summary: ${context.planSummary.slice(0, 20000)}\n\nDiff:\n${diff.slice(0, 100000)}\n\nStart your response with exactly APPROVED or REJECTED, then give a concise justification.`;
}

/**
 * Split review (P12): the deterministic validation lens runs inside the
 * sandbox; then TWO independent model lenses judge the diff — safety and
 * plan fidelity. Both lenses must APPROVE. Verdicts are recorded separately
 * so repair cycles and human approvers can see exactly which concern failed.
 */
export class ReviewerAgent {
  private sandbox: SandboxController;
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is required for ReviewerAgent');
    this.sandbox = new SandboxController();
    this.ai = new GoogleGenAI({ apiKey });
  }

  public async reviewAndValidate(taskId: string, repoPath: string, validationCommand: ValidationCommand, diff: string, fidelity: FidelityContext): Promise<ReviewResult> {
    const validationResult = await this.sandbox.executeInSandbox({ taskId, repoPath, command: validationCommand });
    if (!validationResult.success) {
      return { passed: false, feedback: `Validation failed with exit code ${validationResult.exitCode}.\nOutput:\n${validationResult.output}`, lenses: { validation: false, safety: null, planFidelity: null } };
    }

    const commandLabel = [validationCommand.executable, ...validationCommand.args].join(' ');
    const [safetyResponse, fidelityResponse] = await Promise.all([
      this.ai.models.generateContent({ model: 'gemini-3.6-flash', contents: buildSafetyPrompt(commandLabel, validationResult.output, diff) }),
      this.ai.models.generateContent({ model: 'gemini-3.6-flash', contents: buildFidelityPrompt(fidelity, diff) }),
    ]);
    const safetyText = safetyResponse.text?.trim() || 'REJECTED: safety reviewer returned no decision.';
    const fidelityText = fidelityResponse.text?.trim() || 'REJECTED: plan-fidelity reviewer returned no decision.';
    const safetyPassed = parseReviewVerdict(safetyText) === true;
    const fidelityPassed = parseReviewVerdict(fidelityText) === true;
    return {
      passed: safetyPassed && fidelityPassed,
      feedback: combineLensFeedback(safetyText, fidelityText),
      lenses: { validation: true, safety: safetyPassed, planFidelity: fidelityPassed },
    };
  }
}
