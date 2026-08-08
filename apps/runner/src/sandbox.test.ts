import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import { SandboxController } from './sandbox';

const root = '/tmp/foundry-repos-test';
const repo = `${root}/fixture`;
const marker = '/tmp/agent-foundry-host-pwned-test';

// These are integration tests for the Docker boundary and behave like the
// dashboard's TEST_DATABASE_URL integration tests: they exercise the real
// thing where it exists (CI, VPS) and report a skip elsewhere, so local
// development without Docker is not permanently red.
const dockerAvailable = spawnSync('docker', ['--version'], { stdio: 'ignore' }).status === 0;
const needsDocker = { skip: !dockerAvailable };

test('runs allowed commands without interpreting shell metacharacters on the host', needsDocker, async () => {
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
  // Path must (a) exist on every test host and (b) be outside the root:
  // /tmp qualifies on both. A nonexistent path would fail earlier inside
  // realpath() with ENOENT instead of the boundary error being asserted.
  const result = await new SandboxController().executeInSandbox({
    taskId: 'path-test', repoPath: '/tmp',
    command: { executable: 'node', args: ['--version'] },
  });
  assert.equal(result.success, false);
  assert.match(result.output, /outside FOUNDRY_REPO_ROOT/);
});
