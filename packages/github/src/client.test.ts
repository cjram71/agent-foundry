import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClient, isPrAlreadyExistsError, parseOpenPrUrlList } from './client';

type CommandResult = { stdout: string; stderr: string };

/** Scriptable subclass: records invocations and returns canned results. */
class FakeGitHubClient extends GitHubClient {
  public calls: Array<{ executable: string; args: string[] }> = [];
  constructor(private readonly script: Record<string, string | Error>) {
    super(new Set(['acme/widgets']), '/tmp/foundry-repos-test');
  }
  protected override run(executable: 'gh' | 'git', args: string[]): Promise<CommandResult> {
    this.calls.push({ executable, args });
    const key = args.slice(0, 2).join(' ');
    const scripted = this.script[key];
    if (scripted instanceof Error) return Promise.reject(scripted);
    if (typeof scripted === 'string') return Promise.resolve({ stdout: scripted, stderr: '' });
    return Promise.resolve({ stdout: '', stderr: '' });
  }
}

const REPO = { owner: 'acme', repo: 'widgets' };
const BRANCH = 'foundry/task-abc123-k2j9x3';
const PR_URL = 'https://github.com/acme/widgets/pull/42';

test('creates a draft PR and returns its URL', async () => {
  const client = new FakeGitHubClient({ 'pr create': `${PR_URL}\n` });
  const result = await client.createDraftPullRequest(REPO, 'Add the thing', BRANCH, 'main', 'body');
  assert.equal(result.url, PR_URL);
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0].args.slice(0, 2), ['pr', 'create']);
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
