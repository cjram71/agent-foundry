import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  GitHubClient,
  canPushWithPermission,
  isPrAlreadyExistsError,
  isRepositoryNotFoundError,
  parseOpenPrUrlList,
} from './client';

type CommandResult = { stdout: string; stderr: string };
type ScriptValue = string | Error;
type Script = Record<string, ScriptValue | ScriptValue[]>;

/** Scriptable subclass: records invocations and returns canned results. */
class FakeGitHubClient extends GitHubClient {
  public calls: Array<{ executable: string; args: string[] }> = [];
  constructor(private readonly script: Script, root = '/tmp/foundry-repos-test') {
    super(new Set(['acme/widgets']), root);
  }
  protected override run(executable: 'gh' | 'git', args: string[]): Promise<CommandResult> {
    this.calls.push({ executable, args });
    let scripted: ScriptValue | undefined;
    // Tests may address a broad command ("pr create") or distinguish repo
    // views by their target ("repo view acme/widgets"). Prefer the longest.
    for (let length = args.length; length >= 2; length -= 1) {
      const key = args.slice(0, length).join(' ');
      if (!Object.prototype.hasOwnProperty.call(this.script, key)) continue;
      const entry = this.script[key];
      scripted = Array.isArray(entry) ? entry.shift() : entry;
      break;
    }
    if (scripted instanceof Error) return Promise.reject(scripted);
    if (typeof scripted === 'string') return Promise.resolve({ stdout: scripted, stderr: '' });
    return Promise.resolve({ stdout: '', stderr: '' });
  }
}

const REPO = { owner: 'acme', repo: 'widgets' };
const BRANCH = 'foundry/task-abc123-k2j9x3';
const PR_URL = 'https://github.com/acme/widgets/pull/42';
const WRITABLE_VIEW = JSON.stringify({ defaultBranchRef: { name: 'main' }, isPrivate: false, viewerPermission: 'WRITE' });
const READ_ONLY_VIEW = JSON.stringify({ defaultBranchRef: { name: 'main' }, isPrivate: false, viewerPermission: 'READ' });
const FORK_VIEW = JSON.stringify({ nameWithOwner: 'agent/widgets', isFork: true, parent: { nameWithOwner: 'acme/widgets' }, viewerPermission: 'WRITE' });

test('creates a draft PR and returns its URL', async () => {
  const client = new FakeGitHubClient({ 'pr create': `${PR_URL}\n` });
  const result = await client.createDraftPullRequest(REPO, 'Add the thing', BRANCH, 'main', 'body');
  assert.equal(result.url, PR_URL);
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0].args.slice(0, 2), ['pr', 'create']);
  assert.equal(client.calls[0].args[client.calls[0].args.indexOf('--head') + 1], `acme:${BRANCH}`);
});

test('adopts the existing open PR when a replay hits "already exists"', async () => {
  const client = new FakeGitHubClient({
    'pr create': new Error('gh command failed: a pull request for branch "acme:foundry/task-abc123-k2j9x3" already exists'),
    'pr list': JSON.stringify([{ url: PR_URL }]),
  });
  const result = await client.createDraftPullRequest(REPO, 'Add the thing', BRANCH, 'main', 'body');
  assert.equal(result.url, PR_URL, 'replay converges onto the already-open PR');
  assert.deepEqual(client.calls.map((call) => call.args.slice(0, 2).join(' ')), ['pr create', 'pr list']);
});

test('already-exists error propagates when no open PR can be found', async () => {
  const client = new FakeGitHubClient({
    'pr create': new Error('gh command failed: a pull request for branch already exists'),
    'pr list': '[]',
  });
  await assert.rejects(client.createDraftPullRequest(REPO, 'Add the thing', BRANCH, 'main', 'body'), /already exists/);
});

test('unrelated errors never trigger the fallback', async () => {
  const client = new FakeGitHubClient({ 'pr create': new Error('gh command failed: authentication failed') });
  await assert.rejects(client.createDraftPullRequest(REPO, 'Add the thing', BRANCH, 'main', 'body'), /authentication failed/);
  assert.equal(client.calls.length, 1, 'no pr list fallback for unrelated errors');
});

test('rejects URLs that do not belong to the authorized repository', async () => {
  const client = new FakeGitHubClient({ 'pr create': 'https://evil.example/acme/widgets/pull/42\n' });
  await assert.rejects(client.createDraftPullRequest(REPO, 'Add the thing', BRANCH, 'main', 'body'), /did not return a pull request URL/);
});

test('helper semantics: already-exists detection and PR list parsing', () => {
  assert.equal(isPrAlreadyExistsError(new Error('a pull request for branch already exists')), true);
  assert.equal(isPrAlreadyExistsError(new Error('boom')), false);
  assert.equal(isPrAlreadyExistsError('already exists'), true);

  assert.equal(parseOpenPrUrlList(`[{"url":"${PR_URL}"}]`, 'acme/widgets'), PR_URL);
  assert.equal(parseOpenPrUrlList('[{"url":"https://github.com/acme/OTHER/pull/7"}]', 'acme/widgets'), null);
  assert.equal(parseOpenPrUrlList('[{"url":"https://evil.example/acme/widgets/pull/42"}]', 'acme/widgets'), null);
  assert.equal(parseOpenPrUrlList('not json', 'acme/widgets'), null);
  assert.equal(parseOpenPrUrlList('{"url":"x"}', 'acme/widgets'), null);
  assert.equal(parseOpenPrUrlList('[]', 'acme/widgets'), null);
  // Dots in repo names are regex-escaped, not wildcards:
  assert.equal(parseOpenPrUrlList('[{"url":"https://github.com/acXe/widgets/pull/42"}]', 'ac.e/widgets'), null);
});

test('writable repositories keep the authorized repository as the push target', async () => {
  const client = new FakeGitHubClient({ 'repo view acme/widgets': WRITABLE_VIEW });
  const target = await client.resolvePushTarget(REPO);
  assert.deepEqual(target, { fullName: 'acme/widgets', headOwner: 'acme', forked: false });
  assert.equal(client.calls.length, 1, 'no identity lookup or fork for direct-write access');
  assert.deepEqual(await client.checkAccess(REPO), {
    connected: true,
    defaultBranch: 'main',
    visibility: 'PUBLIC',
    viewerPermission: 'WRITE',
    canPush: true,
  });
});

test('read-only repositories create and verify a writable fork', async () => {
  const client = new FakeGitHubClient({
    'repo view acme/widgets': READ_ONLY_VIEW,
    'api user': 'agent\n',
    'repo view agent/widgets': [new Error('HTTP 404: Not Found'), FORK_VIEW],
    'repo fork': '',
  });
  assert.deepEqual(await client.resolvePushTarget(REPO), { fullName: 'agent/widgets', headOwner: 'agent', forked: true });
  assert.equal(client.calls.filter(call => call.args.slice(0, 2).join(' ') === 'repo fork').length, 1);
});

test('read-only repositories reuse an existing verified fork', async () => {
  const client = new FakeGitHubClient({
    'repo view acme/widgets': READ_ONLY_VIEW,
    'api user': 'agent\n',
    'repo view agent/widgets': FORK_VIEW,
  });
  assert.deepEqual(await client.resolvePushTarget(REPO), { fullName: 'agent/widgets', headOwner: 'agent', forked: true });
  assert.equal(client.calls.some(call => call.args.slice(0, 2).join(' ') === 'repo fork'), false);
});

test('fork lookup only recovers not-found and does not hide auth failures', async () => {
  const client = new FakeGitHubClient({
    'repo view acme/widgets': READ_ONLY_VIEW,
    'api user': 'agent\n',
    'repo view agent/widgets': new Error('gh command failed: authentication failed'),
  });
  await assert.rejects(client.resolvePushTarget(REPO), /authentication failed/);
  assert.equal(client.calls.some(call => call.args.slice(0, 2).join(' ') === 'repo fork'), false);
});

test('refuses an unrelated repository occupying the expected fork name', async () => {
  const unrelated = JSON.stringify({ nameWithOwner: 'agent/widgets', isFork: false, parent: null, viewerPermission: 'ADMIN' });
  const client = new FakeGitHubClient({
    'repo view acme/widgets': READ_ONLY_VIEW,
    'api user': 'agent\n',
    'repo view agent/widgets': unrelated,
  });
  await assert.rejects(client.resolvePushTarget(REPO), /Refusing unrelated repository/);
});

test('refuses a fork that the authenticated account cannot write', async () => {
  const readOnlyFork = JSON.stringify({ nameWithOwner: 'agent/widgets', isFork: true, parent: { nameWithOwner: 'acme/widgets' }, viewerPermission: 'READ' });
  const client = new FakeGitHubClient({
    'repo view acme/widgets': READ_ONLY_VIEW,
    'api user': 'agent\n',
    'repo view agent/widgets': readOnlyFork,
  });
  await assert.rejects(client.resolvePushTarget(REPO), /cannot push to fork/);
});

test('fork workspace clones upstream and rewires origin to the push fork', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foundry-github-test-'));
  try {
    const client = new FakeGitHubClient({
      'repo view acme/widgets': READ_ONLY_VIEW,
      'api user': 'agent\n',
      'repo view agent/widgets': FORK_VIEW,
    }, root);
    const workspace = await client.prepareWorkspace('Task 123', REPO, 'main');
    assert.equal(workspace.headOwner, 'agent');
    assert.equal(workspace.repoPath, path.join(root, 'Task-123'));
    const commands = client.calls.map(call => `${call.executable} ${call.args.join(' ')}`);
    assert.ok(commands.some(command => command.includes('remote rename origin upstream')));
    assert.ok(commands.some(command => command.includes('remote add origin https://github.com/agent/widgets.git')));
    assert.ok(commands.some(command => command.startsWith(`gh repo clone acme/widgets ${workspace.repoPath}`)), 'source branch is cloned from upstream');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('direct-write workspace leaves the clone origin unchanged', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foundry-github-test-'));
  try {
    const client = new FakeGitHubClient({ 'repo view acme/widgets': WRITABLE_VIEW }, root);
    const workspace = await client.prepareWorkspace('task-123', REPO, 'main');
    assert.equal(workspace.headOwner, 'acme');
    assert.equal(client.calls.some(call => call.args.includes('remote')), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('fork pull requests use an explicitly qualified head', async () => {
  const client = new FakeGitHubClient({ 'pr create': `${PR_URL}\n` });
  await client.createDraftPullRequest(REPO, 'Add the thing', BRANCH, 'main', 'body', 'agent');
  const args = client.calls[0].args;
  assert.equal(args[args.indexOf('--head') + 1], `agent:${BRANCH}`);
  assert.equal(args[args.indexOf('--repo') + 1], 'acme/widgets', 'PR base remains the authorized upstream');
});

test('fork PR replay searches with the same qualified head', async () => {
  const client = new FakeGitHubClient({
    'pr create': new Error('a pull request for branch already exists'),
    'pr list': JSON.stringify([{ url: PR_URL }]),
  });
  assert.deepEqual(await client.createDraftPullRequest(REPO, 'Add', BRANCH, 'main', 'body', 'agent'), { url: PR_URL });
  const list = client.calls[1].args;
  assert.equal(list[list.indexOf('--head') + 1], `agent:${BRANCH}`);
});

test('invalid authenticated fork owners and PR head owners fail closed', async () => {
  const client = new FakeGitHubClient({
    'repo view acme/widgets': READ_ONLY_VIEW,
    'api user': 'bad/owner\n',
  });
  await assert.rejects(client.resolvePushTarget(REPO), /invalid authenticated user login/);
  await assert.rejects(client.createDraftPullRequest(REPO, 'Add', BRANCH, 'main', 'body', 'bad:owner'), /Invalid pull request head owner/);
});

test('permission and not-found classifiers are narrow and deterministic', () => {
  assert.equal(canPushWithPermission('ADMIN'), true);
  assert.equal(canPushWithPermission('maintain'), true);
  assert.equal(canPushWithPermission('WRITE'), true);
  assert.equal(canPushWithPermission('TRIAGE'), false);
  assert.equal(canPushWithPermission('READ'), false);
  assert.equal(canPushWithPermission(undefined), false);
  assert.equal(isRepositoryNotFoundError(new Error('HTTP 404: Not Found')), true);
  assert.equal(isRepositoryNotFoundError(new Error('Could not resolve to a Repository')), true);
  assert.equal(isRepositoryNotFoundError(new Error('authentication failed')), false);
});
