import { SandboxController, ValidationCommand } from './sandbox';
import { GoogleGenAI } from '@google/genai';

export class ReviewerAgent {
  private sandbox: SandboxController;
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is required for ReviewerAgent');
    this.sandbox = new SandboxController();
    this.ai = new GoogleGenAI({ apiKey });
  }

  public async reviewAndValidate(taskId: string, repoPath: string, validationCommand: ValidationCommand, diff: string): Promise<{ passed: boolean; feedback: string }> {
    const validationResult = await this.sandbox.executeInSandbox({ taskId, repoPath, command: validationCommand });
    if (!validationResult.success) return { passed: false, feedback: `Validation failed with exit code ${validationResult.exitCode}.\nOutput:\n${validationResult.output}` };

    const commandLabel = [validationCommand.executable, ...validationCommand.args].join(' ');
    const response = await this.ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `You are an expert AI code reviewer. Validation succeeded, but approval still requires a clear safety assessment.\n\nCommand: ${commandLabel}\nOutput:\n${validationResult.output.slice(-20000)}\n\nDiff:\n${diff.slice(0,100000)}\n\nStart your response with exactly APPROVED or REJECTED, then give a concise justification.`,
    });
    const feedback = response.text?.trim();
    if (!feedback) return { passed: false, feedback: 'REJECTED: reviewer returned no decision.' };
    return { passed: /^APPROVED\b/i.test(feedback), feedback };
  }
}
