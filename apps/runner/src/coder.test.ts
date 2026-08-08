import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { safeRelativePath, validateCoderResult, applyChanges, SecurityViolationError } from './coder';

// P16 threat-model invariants (docs/THREAT-MODEL.md): violations of the
// deterministic path/file rules — the ones a hostile or prompt-injected
// coder would trip — throw SecurityViolationError so the runner can route
// the task to SECURITY_BLOCKED. Honest sloppiness (bad shape, oversized
// output, duplicates) throws plain Error and stays on the FAILED path.

test('safeRelativePath accepts ordinary source paths, normalizing backslashes', () => {
  assert.equal(safeRelativePath('src/app/index.ts'), 'src/app/index.ts');
  assert.equal(safeRelativePath('src\\app\\index.ts'), 'src/app/index.ts');
  assert.equal(safeRelativePath('Dockerfile'), 'Dockerfile');
  assert.equal(safeRelativePath('db/schema.prisma'), 'db/schema.prisma');
});

test('path attacks throw SecurityViolationError (drives SECURITY_BLOCKED)', () => {
  for (const hostile of [
    '../escape.ts',
    'src/../../escape.ts',
    '/etc/passwd',
    'src/%00.ts'.replace('%00', '\0'),
    'src/evil\r\n.ts',
  ]) {
    assert.throws(() => safeRelativePath(hostile), SecurityViolationError, `expected SecurityViolationError for ${JSON.stringify(hostile)}`);
  }
});

test('secret/credential exfiltration or overwrite attempts throw SecurityViolationError', () => {
  for (const hostile of [
    '.env',
    'config/.env',
    '.env.production',
    '.npmrc',
    'id_rsa',
    'certs/server.pem',
    'certs/server.key',
    'certs/bundle.p12',
    '.git/config',
    '.git/hooks/pre-push',
  ]) {
    assert.throws(() => safeRelativePath(hostile), SecurityViolationError, `expected SecurityViolationError for ${hostile}`);
  }
});

test('disallowed file classes throw SecurityViolationError; allowlisted names pass', () => {
  assert.throws(() => safeRelativePath('payload.sh'), SecurityViolationError);
  assert.throws(() => safeRelativePath('payload.exe'), SecurityViolationError);
  assert.throws(() => safeRelativePath('Makefile'), SecurityViolationError, 'Makefiles can carry arbitrary shell execution');
  assert.equal(safeRelativePath('Procfile'), 'Procfile');
  assert.equal(safeRelativePath('docs/ARCHITECTURE.md'), 'docs/ARCHITECTURE.md');
});

test('malformed-but-honest coder output throws plain Error, never SecurityViolationError', () => {
  const plain = (fn: () => unknown) => {
    try { fn(); } catch (error) {
      assert.ok(!(error instanceof SecurityViolationError), 'honest output mistakes must not quarantine the task');
      return;
    }
    assert.fail('expected a throw');
  };
  plain(() => validateCoderResult(null));
  plain(() => validateCoderResult({ summary: 'short', changes: [], validationNotes: [] }));
  plain(() => validateCoderResult({ summary: 'a long enough summary', changes: [], validationNotes: [] }));
  const dupe = { summary: 'a long enough summary', validationNotes: [], changes: [
    { path: 'src/a.ts', content: 'x', reason: 'r' },
    { path: 'src/a.ts', content: 'y', reason: 'r' },
  ] };
  plain(() => validateCoderResult(dupe));
  const tooBig = { summary: 'a long enough summary', validationNotes: [], changes: [
    { path: 'src/a.ts', content: 'x'.repeat(500_001), reason: 'r' },
  ] };
  plain(() => validateCoderResult(tooBig));
});

test('validateCoderResult bounds still hold after the P16 extraction (byte-stable contract)', () => {
  const ok = validateCoderResult({ summary: 'a long enough summary', validationNotes: ['npm test'], changes: [
    { path: 'src\\a.ts', content: 'export const a = 1;', reason: 'add a' },
  ] });
  assert.equal(ok.changes[0].path, 'src/a.ts', 'paths are normalized into the result');
  // Hostile paths inside an otherwise valid payload still quarantine.
  assert.throws(() => validateCoderResult({ summary: 'a long enough summary', validationNotes: [], changes: [
    { path: '.env', content: 'JWT_SECRET=stolen', reason: 'rotate' },
  ] }), SecurityViolationError);
});

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'foundry-coder-test-'));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test('applyChanges writes files 0600 under the workspace', () => withTempDir(async (root) => {
  await applyChanges(root, [{ path: 'src/deep/file.ts', content: 'hello', reason: 'r' }]);
  const absolute = path.join(root, 'src/deep/file.ts');
  assert.equal(await fs.readFile(absolute, 'utf8'), 'hello');
  const stat = await fs.stat(absolute);
  assert.equal(stat.mode & 0o777, 0o600, 'agent-written files stay private to the workspace owner');
}));

test('applyChanges refuses to overwrite a symlink (escape defense, SecurityViolationError)', () => withTempDir(async (root) => {
  // Symlink inside the workspace pointing outside it — the classic
  // "write through a planted link" exfiltration primitive.
  const link = path.join(root, 'linked.ts');
  await fs.symlink('/etc/hostname', link);
  await assert.rejects(
    () => applyChanges(root, [{ path: 'linked.ts', content: 'owned', reason: 'r' }]),
    SecurityViolationError,
  );
  // The link itself must be untouched.
  assert.equal((await fs.lstat(link)).isSymbolicLink(), true);
}));

test('applyChanges rejects backslash traversal as SecurityViolationError', () => withTempDir(async (root) => {
  // safeRelativePath rejects '..' outright, so a workspace escape can only
  // reach the resolve() check via normalized-away trickery; assert the
  // guard + class are wired regardless of which layer fires.
  await assert.rejects(
    () => applyChanges(root, [{ path: '..\\windows\\system32\\drivers\\etc\\hosts.md', content: 'x', reason: 'r' }]),
    SecurityViolationError,
  );
}));
