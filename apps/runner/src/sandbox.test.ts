import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import { SandboxController } from './sandbox';

const root = '/tmp/foundry-repos-test';
const repo = `${root}/fixture`;
const marker = '/tmp/agent-foundry-host-pwned-test';

test('runs allowed commands without interpreting shell metacharacters on the host', async () => {
  await fs.mkdir(repo, { recursive: true });
  await fs.rm(marker, { force: true });
  process.env.FOUNDRY_REPO_ROOT = root;
  const result = await new SandboxController().executeInSandbox({
    taskId: 'metachar-test', repoPath: repo,
    command: { executable: 'node', args: ['-e', 'console.log("sandbox-ok")', '&&', 'touch', marker] },
    timeoutMs: 30_000,
  });
  assert.equal(result.success, true);
  assert.match(result.output, /sandbox-ok/);
  await assert.rejects(fs.access(marker));
  await fs.rm(root, { recursive: true, force: true });
});

test('rejects repository paths outside the configured root', async () => {
  process.env.FOUNDRY_REPO_ROOT = root;
  const result = await new SandboxController().executeInSandbox({
    taskId: 'path-test', repoPath: '/home/cory/agent-foundry',
    command: { executable: 'node', args: ['--version'] },
  });
  assert.equal(result.success, false);
  assert.match(result.output, /outside FOUNDRY_REPO_ROOT/);
});
