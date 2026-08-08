import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { runValidationPipeline, deriveValidationCommands, ValidationStageError, SandboxLike, INSTALL_COMMAND } from './validation';
import { SandboxOptions, ValidationCommand } from './sandbox';

function fakeSandbox(plan: Array<{ success: boolean; exitCode?: number; output?: string }>) {
  const calls: SandboxOptions[] = [];
  const sandbox: SandboxLike = {
    executeInSandbox: async (options: SandboxOptions) => {
      calls.push(options);
      const scripted = plan[calls.length - 1] ?? { success: true, exitCode: 0, output: 'ok' };
      return {
        success: scripted.success,
        exitCode: scripted.exitCode ?? (scripted.success ? 0 : 1),
        output: scripted.output ?? 'ok',
      };
    },
  };
  return { sandbox, calls };
}

const LINT: ValidationCommand = { executable: 'npm', args: ['run', 'lint'] };
const TEST: ValidationCommand = { executable: 'npm', args: ['run', 'test'] };

test('install stage runs with network + persistence, validation stages stay offline and isolated', async () => {
  const { sandbox, calls } = fakeSandbox([{ success: true }, { success: true }]);
  const report = await runValidationPipeline({ sandbox, taskId: 't1', repoPath: '/tmp/foundry-repos-test/fixture', commands: [TEST] });
  assert.equal(report.ok, true);
  assert.equal(report.stages.length, 2);

  const install = calls[0];
  assert.deepEqual(install.command, INSTALL_COMMAND);
  assert.equal(install.network, true, 'dependency resolution needs the registry');
  assert.equal(install.persistToRepo, true, 'node_modules must persist for later stages');
  assert.match(install.tmpfsSize || '', /^\d+g$/, 'install needs npm cache room');

  const validate = calls[1];
  assert.deepEqual(validate.command, TEST);
  assert.equal(validate.network, undefined, 'validation defaults to no network');
  assert.equal(validate.persistToRepo, undefined, 'validation writes stay disposable');
});

test('stops at the first failing stage and reports it structurally', async () => {
  const { sandbox, calls } = fakeSandbox([{ success: true }, { success: false, exitCode: 2, output: 'lint exploded\nwith detail' }]);
  const report = await runValidationPipeline({ sandbox, taskId: 't1', repoPath: '/x', commands: [LINT, TEST] });
  assert.equal(report.ok, false);
  assert.equal(report.stages.length, 2, 'test stage must not run after lint failed');
  assert.equal(calls.length, 2);
  assert.equal(report.failedStage?.stage, 'command:1');
  assert.equal(report.failedStage?.exitCode, 2);
  assert.match(report.failedStage?.command || '', /npm run lint/);
  assert.match(report.failedStage?.outputTail || '', /lint exploded/);
});

test('an install failure short-circuits before any validation command runs', async () => {
  const { sandbox, calls } = fakeSandbox([{ success: false, exitCode: 1, output: 'registry unreachable' }]);
  const report = await runValidationPipeline({ sandbox, taskId: 't1', repoPath: '/x', commands: [LINT, TEST] });
  assert.equal(calls.length, 1, 'no validation command may run after install fails');
  assert.equal(report.failedStage?.stage, 'dependencies');
  assert.equal(report.ok, false);
});

test('install-only pipeline succeeds with an empty command list', async () => {
  const { sandbox, calls } = fakeSandbox([{ success: true }]);
  const report = await runValidationPipeline({ sandbox, taskId: 't1', repoPath: '/x', commands: [] });
  assert.equal(report.ok, true);
  assert.equal(calls.length, 1);
});

test('rejects oversized pipelines deterministically', async () => {
  const { sandbox } = fakeSandbox([]);
  const nine = Array.from({ length: 9 }, () => TEST);
  await assert.rejects(runValidationPipeline({ sandbox, taskId: 't1', repoPath: '/x', commands: nine }), /at most 8/);
});

test('ValidationStageError carries the structured failure for the worker', () => {
  const failedStage = { stage: 'dependencies', command: 'npm install …', success: false, exitCode: 1, durationMs: 12, outputTail: 'boom', infraFailure: false };
  const error = new ValidationStageError({ ok: false, stages: [failedStage], failedStage }, failedStage);
  assert.match(error.message, /dependencies/);
  assert.match(error.message, /boom/);
  assert.equal(error.failingStage.stage, 'dependencies');
  assert.equal(error.failingStage.infraFailure, false);
});

test('threads the sandbox infraFailure classification into the stage result (P11)', async () => {
  const sandbox: SandboxLike = {
    executeInSandbox: async () => ({ success: false, exitCode: 1, output: 'Failed to prepare sandbox image node:20-bookworm-slim', infraFailure: true }),
  };
  const report = await runValidationPipeline({ sandbox, taskId: 't1', repoPath: '/x', commands: [TEST] });
  assert.equal(report.failedStage?.stage, 'dependencies');
  assert.equal(report.failedStage?.infraFailure, true, 'repair loop must route machinery faults to INFRASTRUCTURE_FAILED');
});

test('an honest stage failure is never classified as infrastructure', async () => {
  const { sandbox } = fakeSandbox([{ success: false, exitCode: 1, output: 'tests failed' }]);
  const report = await runValidationPipeline({ sandbox, taskId: 't1', repoPath: '/x', commands: [TEST] });
  assert.equal(report.failedStage?.infraFailure, false, 'payload failure -> repairable, never infra');
});

test('deriveValidationCommands returns the allowlist in canonical order', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'foundry-validation-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: 'fixture',
    scripts: { build: 'tsc', test: 'node --test', lint: 'eslint .', typecheck: 'tsc --noEmit', clean: 'rm -rf dist' },
  }));
  const commands = await deriveValidationCommands(dir);
  assert.deepEqual(commands.map((command) => command.args.join(' ')), ['run lint', 'run typecheck', 'run test', 'run build']);
  assert.ok(commands.every((command) => command.executable === 'npm'));
  await fs.rm(dir, { recursive: true, force: true });
});

test('deriveValidationCommands subsets and bounds malformed manifests', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'foundry-validation-'));

  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', custom: 'x' } }));
  assert.deepEqual((await deriveValidationCommands(dir)).map((command) => command.args[1]), ['test']);

  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ scripts: { custom: 'x' } }));
  await assert.rejects(deriveValidationCommands(dir), /no allowlisted validation scripts/);

  await fs.writeFile(path.join(dir, 'package.json'), '{not json');
  await assert.rejects(deriveValidationCommands(dir), /not valid JSON/);

  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ scripts: ['test'] }));
  await assert.rejects(deriveValidationCommands(dir), /no allowlisted/);

  await fs.rm(dir, { recursive: true, force: true });
  await assert.rejects(deriveValidationCommands(dir), /no package\.json/);
});
