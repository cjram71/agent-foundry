import path from 'path';
import fs from 'fs/promises';
import { ValidationCommand, SandboxOptions } from './sandbox';

const MAX_PACKAGE_JSON_BYTES = 1_000_000;
const MAX_SCRIPTS = 64;
const MAX_PIPELINE_COMMANDS = 8;
const OUTPUT_TAIL_BYTES = 2000;
// Canonical, fixed order — derives deterministically from the repository,
// never from anything a model says. The last derived command is reserved for
// the reviewer (unchanged pre-P10 split; P12 restructures review separately).
const SCRIPT_ALLOWLIST = ['lint', 'typecheck', 'test', 'build'] as const;

export const INSTALL_COMMAND: ValidationCommand = {
  executable: 'npm',
  args: ['install', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund'],
};

/** Structural view of the sandbox so the pipeline can be unit-tested without
 *  Docker. SandboxController satisfies this interface. */
export interface SandboxLike {
  executeInSandbox(options: SandboxOptions): Promise<{ success: boolean; output: string; exitCode: number }>;
}

export interface ValidationStageResult {
  stage: string;
  command: string;
  success: boolean;
  exitCode: number;
  durationMs: number;
  outputTail: string;
}

export interface ValidationReport {
  ok: boolean;
  stages: ValidationStageResult[];
  failedStage?: ValidationStageResult;
}

/** A pipeline stage failed. Carries the structured report so the worker's
 *  failure bookkeeping can record precise stage metadata instead of parsing
 *  error text. */
export class ValidationStageError extends Error {
  public readonly report: ValidationReport;
  public readonly failingStage: ValidationStageResult;
  constructor(report: ValidationReport, failingStage: ValidationStageResult) {
    super(`Validation stage "${failingStage.stage}" failed (exit ${failingStage.exitCode})\n${failingStage.outputTail}`);
    this.name = 'ValidationStageError';
    this.report = report;
    this.failingStage = failingStage;
  }
}

export interface PipelineOptions {
  sandbox: SandboxLike;
  taskId: string;
  repoPath: string;
  /** The pre-review commands (worker passes all but the reviewer's reserved
   *  final command; may be empty when a repo defines a single script). */
  commands: ValidationCommand[];
  /** Run the dependency-install prep stage (default true). */
  install?: boolean;
  installTimeoutMs?: number;
  perCommandTimeoutMs?: number;
}

async function runStage(
  sandbox: SandboxLike,
  target: { taskId: string; repoPath: string },
  stage: string,
  command: ValidationCommand,
  extra: Pick<SandboxOptions, 'network' | 'persistToRepo' | 'tmpfsSize'>,
  timeoutMs: number,
): Promise<ValidationStageResult> {
  const started = Date.now();
  const result = await sandbox.executeInSandbox({
    taskId: target.taskId,
    repoPath: target.repoPath,
    command,
    timeoutMs,
    ...extra,
  });
  return {
    stage,
    command: [command.executable, ...command.args].join(' '),
    success: result.success,
    exitCode: result.exitCode,
    durationMs: Date.now() - started,
    outputTail: result.output.slice(-OUTPUT_TAIL_BYTES),
  };
}

/**
 * Deterministic staged validation, one transaction of work:
 *
 *   stage "dependencies" — npm install INSIDE the container with network up
 *     but lifecycle scripts disabled. No package code can execute while the
 *     network exists; it writes node_modules into the repo workspace
 *     (persistToRepo) for the offline stages. Replaces the pre-P10 host-side
 *     install, which executed npm against attacker-influenced dependency
 *     data directly on the runner host.
 *   stage "command:N" — each validation command with the default networkless
 *     isolation, in derived order, stopping at the first failure.
 *
 * The pipeline never throws for a failing stage: it returns the structured
 * report and the caller decides how to record it. It throws only on
 * programmer error (too many commands).
 */
export async function runValidationPipeline(options: PipelineOptions): Promise<ValidationReport> {
  if (options.commands.length > MAX_PIPELINE_COMMANDS) throw new Error(`validation pipeline accepts at most ${MAX_PIPELINE_COMMANDS} commands`);
  const stages: ValidationStageResult[] = [];
  const target = { taskId: options.taskId, repoPath: options.repoPath };

  if (options.install ?? true) {
    const install = await runStage(options.sandbox, target, 'dependencies', INSTALL_COMMAND, {
      network: true,
      persistToRepo: true,
      tmpfsSize: process.env.SANDBOX_INSTALL_TMPFS || '1g',
    }, options.installTimeoutMs || 240_000);
    stages.push(install);
    if (!install.success) return { ok: false, stages, failedStage: install };
  }

  for (let index = 0; index < options.commands.length; index += 1) {
    const stage = await runStage(options.sandbox, target, `command:${index + 1}`, options.commands[index], {}, options.perCommandTimeoutMs || 180_000);
    stages.push(stage);
    if (!stage.success) return { ok: false, stages, failedStage: stage };
  }
  return { ok: true, stages };
}

/** Derive the allowlisted validation commands from package.json scripts in
 *  canonical order, with hard bounds on a file the task influenced. */
export async function deriveValidationCommands(repoPath: string): Promise<ValidationCommand[]> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(repoPath, 'package.json'), 'utf8');
  } catch {
    throw new Error('Repository has no package.json; no allowlisted validation scripts');
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_PACKAGE_JSON_BYTES) throw new Error('package.json exceeds the 1 MB validation bound');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('package.json is not valid JSON');
  }
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) throw new Error('Repository has no allowlisted validation scripts');
  const scriptNames = Object.keys(scripts as Record<string, unknown>);
  if (scriptNames.length > MAX_SCRIPTS) throw new Error(`package.json declares more than ${MAX_SCRIPTS} scripts`);
  const names = SCRIPT_ALLOWLIST.filter((name) => Object.prototype.hasOwnProperty.call(scripts, name));
  if (!names.length) throw new Error('Repository has no allowlisted validation scripts');
  return names.map((name) => ({ executable: 'npm' as const, args: ['run', name] }));
}
