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

test('dependency install prep stage: network up, scripts disabled, persists to the repo', needsDocker, async () => {
  const installRepo = `${root}/fixture-install`;
  await fs.mkdir(installRepo, { recursive: true });
  await fs.writeFile(`${installRepo}/package.json`, JSON.stringify({
    name: 'fixture-install', version: '1.0.0', private: true,
    dependencies: { 'is-odd': '3.0.1' },
    scripts: { postinstall: `touch ${marker}` },
  }));
  await fs.rm(marker, { force: true });
  process.env.FOUNDRY_REPO_ROOT = root;
  const result = await new SandboxController().executeInSandbox({
    taskId: 'install-test', repoPath: installRepo,
    command: { executable: 'npm', args: ['install', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund'] },
    timeoutMs: 180_000, network: true, persistToRepo: true, tmpfsSize: '1g',
  });
  assert.equal(result.success, true, result.output.slice(-2000));
  // persistToRepo: node_modules landed on the host-side repo, not a temp copy.
  await fs.stat(`${installRepo}/node_modules/is-odd/package.json`);
  // --no-package-lock: no lockfile was written.
  await assert.rejects(fs.stat(`${installRepo}/package-lock.json`));
  // --ignore-scripts: the fixture's malicious postinstall never executed,
  // neither on the host nor in the container touchable tmp space.
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
