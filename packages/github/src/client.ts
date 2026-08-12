import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import * as os from 'os';

type CommandResult = { stdout: string; stderr: string };
type Repo = { owner: string; repo: string };

type RepositoryView = {
  defaultBranchRef?: { name?: unknown };
  isPrivate?: unknown;
  viewerPermission?: unknown;
};

export type RepositoryAccess = {
  connected: boolean;
  defaultBranch: string;
  visibility: string;
  viewerPermission: string;
  canPush: boolean;
};

export type PushTarget = {
  /** Canonical owner/repository receiving the task branch. */
  fullName: string;
  /** Owner used to qualify the pull request head. */
  headOwner: string;
  /** True when the target is a fork rather than the authorised repository. */
  forked: boolean;
};


export type RepositoryProfile = {
  stack: 'node' | 'python' | 'static-site' | 'unknown';
  files: string[];
  manifests: string[];
  validation: string;
};

type GitTreeResponse = { tree?: Array<{ path?: unknown; type?: unknown }> };

export function profileRepositoryPaths(paths: string[]): RepositoryProfile {
  const files = [...new Set(paths)].sort().slice(0, 500);
  const lower = new Set(files.map(value => value.toLowerCase()));
  const manifests = files.filter(value => /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|go\.mod|cargo\.toml|composer\.json)$/i.test(value));
  if (lower.has('package.json')) return { stack: 'node', files, manifests, validation: 'Run only repository-declared allowlisted npm scripts (lint, typecheck, test, build).' };
  if (lower.has('pyproject.toml') || lower.has('requirements.txt')) return { stack: 'python', files, manifests, validation: 'Python execution is not enabled by the current secure runner; planning must identify this as an unsupported validation adapter.' };
  if ([...lower].some(value => /(^|\/)index\.html$/.test(value))) return { stack: 'static-site', files, manifests, validation: 'No dependency install. Use Agent Foundry built-in HTML, local-link, asset-reference, and JavaScript syntax checks.' };
  return { stack: 'unknown', files, manifests, validation: 'No safe validation adapter detected; request operator configuration instead of inventing commands.' };
}
const GITHUB_NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const WRITABLE_PERMISSIONS = new Set(['ADMIN', 'MAINTAIN', 'WRITE']);

/** gh prints a variant of this when a PR for the branch already exists. */
export function isPrAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists/i.test(message);
}

/** A missing candidate fork is recoverable; auth/network/GraphQL errors are not. */
export function isRepositoryNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:HTTP\s*404|not found|could not resolve to a repository)/i.test(message);
}

export function canPushWithPermission(permission: unknown): boolean {
  return typeof permission === 'string' && WRITABLE_PERMISSIONS.has(permission.toUpperCase());
}

/** Parse `gh pr list --json url` output, accepting only URLs that belong to
 *  the authorized repository. Anything malformed is a miss, never a throw. */
export function parseOpenPrUrlList(stdout: string, fullName: string): string | null {
  try {
    const rows = JSON.parse(stdout) as Array<{ url?: unknown }>;
    if (!Array.isArray(rows)) return null;
    const expected = pullRequestUrlPattern(fullName);
    const match = rows.find((row) => typeof row?.url === 'string' && expected.test(row.url));
    return match ? (match.url as string) : null;
  } catch {
    return null;
  }
}

function pullRequestUrlPattern(fullName: string): RegExp {
  return new RegExp(`^https://github\\.com/${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/pull/\\d+$`, 'i');
}

export class GitHubClient {
  constructor(
    private readonly allowedRepositories: ReadonlySet<string>,
    private readonly root = process.env.FOUNDRY_REPO_ROOT || path.join(os.homedir(), 'foundry-repos'),
  ) {}

  public async checkAccess(repository: Repo): Promise<RepositoryAccess> {
    const fullName = this.assertAllowed(repository);
    const result = await this.run('gh', ['repo', 'view', fullName, '--json', 'defaultBranchRef,isPrivate,viewerPermission']);
    let value: RepositoryView;
    try {
      value = JSON.parse(result.stdout) as RepositoryView;
    } catch {
      throw new Error('GitHub returned invalid repository metadata');
    }
    const viewerPermission = typeof value.viewerPermission === 'string' ? value.viewerPermission.toUpperCase() : 'UNKNOWN';
    return {
      connected: true,
      defaultBranch: typeof value.defaultBranchRef?.name === 'string' ? value.defaultBranchRef.name : 'main',
      visibility: typeof value.isPrivate === 'boolean' ? (value.isPrivate ? 'PRIVATE' : 'PUBLIC') : 'UNKNOWN',
      viewerPermission,
      canPush: canPushWithPermission(viewerPermission),
    };
  }


  /** Read a bounded file inventory before planning without executing repository code. */
  public async profileRepository(repository: Repo, branch: string): Promise<RepositoryProfile> {
    const fullName = this.assertAllowed(repository);
    if (!/^[A-Za-z0-9._/-]{1,200}$/.test(branch) || branch.startsWith('-') || branch.includes('..')) throw new Error('Invalid base branch');
    const result = await this.run('gh', ['api', `repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`]);
    let value: GitTreeResponse;
    try { value = JSON.parse(result.stdout) as GitTreeResponse; }
    catch { throw new Error('GitHub returned invalid repository tree metadata'); }
    if (!Array.isArray(value.tree)) throw new Error('GitHub repository tree is unavailable');
    return profileRepositoryPaths(value.tree.filter(item => item.type === 'blob' && typeof item.path === 'string').map(item => item.path as string));
  }
  /**
   * Select where task branches are pushed. Repositories writable by the
   * authenticated account remain direct-write. A READ/TRIAGE repository is
   * executed through a verified, writable fork owned by that account.
   *
   * Existing repositories at the expected fork name are never trusted just
   * because their names match: their parent and viewer permission are checked
   * before any source or generated changes can be pushed to them.
   */
  public async resolvePushTarget(repository: Repo): Promise<PushTarget> {
    const fullName = this.assertAllowed(repository);
    const access = await this.checkAccess(repository);
    if (access.canPush) {
      return { fullName, headOwner: fullName.split('/')[0], forked: false };
    }

    const ownerResult = await this.run('gh', ['api', 'user', '--jq', '.login']);
    const forkOwner = ownerResult.stdout.trim();
    if (!GITHUB_NAME.test(forkOwner)) throw new Error('GitHub returned an invalid authenticated user login');
    const forkFullName = `${forkOwner}/${repository.repo}`;
    if (forkFullName.toLowerCase() === fullName.toLowerCase()) {
      throw new Error('GitHub reports read-only access to the authenticated account repository');
    }

    const existing = await this.readForkTarget(forkFullName, fullName);
    if (existing) return existing;

    try {
      await this.run('gh', ['repo', 'fork', fullName, '--clone=false', '--remote=false']);
    } catch (error) {
      // A concurrent task may have created the same fork after our lookup.
      // Verify the repository below; every other fork failure remains fatal.
      if (!isPrAlreadyExistsError(error)) throw error;
    }

    const created = await this.readForkTarget(forkFullName, fullName);
    if (!created) throw new Error(`GitHub did not create the expected fork ${forkFullName}`);
    return created;
  }

  public async prepareWorkspace(
    taskId: string,
    repository: Repo,
    baseBranch: string,
  ): Promise<{ repoPath: string; branchName: string; headOwner: string }> {
    const fullName = this.assertAllowed(repository);
    const safeTask = taskId.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 48);
    if (!safeTask) throw new Error('Invalid task identifier');
    if (!/^[A-Za-z0-9._/-]{1,200}$/.test(baseBranch) || baseBranch.startsWith('-') || baseBranch.includes('..')) throw new Error('Invalid base branch');
    const repoPath = path.join(this.root, safeTask);
    const relative = path.relative(path.resolve(this.root), path.resolve(repoPath));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Workspace escaped the configured root');

    // Resolve and, if required, create the fork before materializing a local
    // workspace. A setup failure therefore cannot leave a clone whose origin
    // points at a read-only or unrelated repository.
    const pushTarget = await this.resolvePushTarget(repository);
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    await fs.rm(repoPath, { recursive: true, force: true });
    await this.run('gh', ['repo', 'clone', fullName, repoPath, '--', '--branch', baseBranch, '--single-branch']);
    if (pushTarget.forked) {
      await this.run('git', ['-C', repoPath, 'remote', 'rename', 'origin', 'upstream']);
      await this.run('git', ['-C', repoPath, 'remote', 'add', 'origin', `https://github.com/${pushTarget.fullName}.git`]);
    }
    await this.run('git', ['-C', repoPath, 'config', 'user.name', process.env.GIT_AUTHOR_NAME || 'Agent Foundry']);
    await this.run('git', ['-C', repoPath, 'config', 'user.email', process.env.GIT_AUTHOR_EMAIL || 'agent-foundry@users.noreply.github.com']);
    const branchName = this.generateBranchName(taskId);
    await this.run('git', ['-C', repoPath, 'switch', '-c', branchName]);
    return { repoPath, branchName, headOwner: pushTarget.headOwner };
  }

  public async pushTaskBranch(repoPath: string, branchName: string): Promise<void> {
    this.assertTaskBranch(branchName);
    await this.assertWorkspace(repoPath);
    await this.run('git', ['-C', repoPath, 'push', '--set-upstream', 'origin', branchName]);
  }

  public async getDiff(repoPath: string, paths: string[] = []): Promise<string> {
    await this.assertWorkspace(repoPath);
    const safePaths = paths.map(value => this.assertRelativePath(value));
    if (safePaths.length) await this.run('git', ['-C', repoPath, 'add', '--intent-to-add', '--', ...safePaths]);
    const result = await this.run('git', ['-C', repoPath, 'diff', '--no-ext-diff', '--']);
    if (result.stdout.trim() || !safePaths.length) return result.stdout.slice(0, 200000);
    const untrackedDiffs: string[] = [];
    for (const relative of safePaths) {
      const candidate = await this.runWithExitCodes('git', ['-C', repoPath, 'diff', '--no-index', '/dev/null', relative], [0, 1]);
      const output = candidate.stdout || candidate.stderr;
      if (output.trim()) untrackedDiffs.push(output);
    }
    return untrackedDiffs.join('\n').slice(0, 200000);
  }

  public async commitTaskChanges(repoPath: string, paths: string[], message: string): Promise<string> {
    await this.assertWorkspace(repoPath);
    const safePaths = paths.map(value => this.assertRelativePath(value));
    if (!safePaths.length || safePaths.length > 20) throw new Error('Task must contain 1-20 changed files');
    await this.run('git', ['-C', repoPath, 'add', '--', ...safePaths]);
    const staged = await this.runWithExitCodes('git', ['-C', repoPath, 'diff', '--cached', '--quiet'], [0, 1]);
    if (staged.code === 0) throw new Error('The coding agent produced no repository changes');
    await this.run('git', ['-C', repoPath, 'commit', '-m', message.slice(0, 200)]);
    return (await this.run('git', ['-C', repoPath, 'rev-parse', '--short=12', 'HEAD'])).stdout.trim();
  }

  /** Open a draft PR. Idempotent by qualified head (P13/P18): if a previous
   *  delivery opened the PR and then crashed before the database could record
   *  it, the replay adopts the open PR from the same direct repo or fork. */
  public async createDraftPullRequest(
    repository: Repo,
    title: string,
    branchName: string,
    baseBranch: string,
    body: string,
    headOwner = repository.owner,
  ): Promise<{ url: string }> {
    const fullName = this.assertAllowed(repository);
    const qualifiedHead = this.qualifyHead(headOwner, branchName);
    try {
      const result = await this.run('gh', ['pr', 'create', '--repo', fullName, '--head', qualifiedHead, '--base', baseBranch, '--title', title.slice(0, 240), '--body', body.slice(0, 60000), '--draft']);
      const url = result.stdout.trim();
      if (!pullRequestUrlPattern(fullName).test(url)) throw new Error('GitHub did not return a pull request URL for the authorized repository');
      return { url };
    } catch (error) {
      if (!isPrAlreadyExistsError(error)) throw error;
      const existing = await this.findOpenPullRequest(repository, branchName, headOwner);
      if (existing) return { url: existing };
      throw error;
    }
  }

  /** The URL of the open PR for a task branch (including fork owner), or null. */
  public async findOpenPullRequest(repository: Repo, branchName: string, headOwner = repository.owner): Promise<string | null> {
    const fullName = this.assertAllowed(repository);
    const qualifiedHead = this.qualifyHead(headOwner, branchName);
    const result = await this.run('gh', ['pr', 'list', '--repo', fullName, '--head', qualifiedHead, '--state', 'open', '--json', 'url', '--limit', '1']);
    return parseOpenPrUrlList(result.stdout, fullName);
  }

  public generateBranchName(taskId: string): string {
    const clean = taskId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32);
    return `foundry/task-${clean}-${Date.now().toString(36)}`;
  }

  private async readForkTarget(forkFullName: string, sourceFullName: string): Promise<PushTarget | null> {
    let result: CommandResult;
    try {
      result = await this.run('gh', ['repo', 'view', forkFullName, '--json', 'nameWithOwner,isFork,parent,viewerPermission']);
    } catch (error) {
      if (isRepositoryNotFoundError(error)) return null;
      throw error;
    }

    let value: { nameWithOwner?: unknown; isFork?: unknown; parent?: { nameWithOwner?: unknown } | null; viewerPermission?: unknown };
    try {
      value = JSON.parse(result.stdout) as typeof value;
    } catch {
      throw new Error(`GitHub returned invalid metadata for fork ${forkFullName}`);
    }
    const actualName = typeof value.nameWithOwner === 'string' ? value.nameWithOwner : '';
    const parentName = typeof value.parent?.nameWithOwner === 'string' ? value.parent.nameWithOwner : '';
    if (actualName.toLowerCase() !== forkFullName.toLowerCase() || value.isFork !== true || parentName.toLowerCase() !== sourceFullName.toLowerCase()) {
      throw new Error(`Refusing unrelated repository at expected fork name ${forkFullName}`);
    }
    if (!canPushWithPermission(value.viewerPermission)) {
      throw new Error(`Authenticated GitHub account cannot push to fork ${forkFullName}`);
    }
    return { fullName: actualName, headOwner: actualName.split('/')[0], forked: true };
  }

  private assertAllowed({ owner, repo }: Repo): string {
    if (!GITHUB_NAME.test(owner) || !GITHUB_NAME.test(repo)) throw new Error('Invalid repository name');
    const fullName = `${owner}/${repo}`;
    const match = [...this.allowedRepositories].find(value => value.toLowerCase() === fullName.toLowerCase());
    if (!match) throw new Error('Repository is not authorised for Agent Foundry');
    return match;
  }

  private assertRelativePath(value: string) {
    const normalized = value.replace(/\\\\/g, '/');
    if (!normalized || normalized.startsWith('/') || normalized.includes('..') || /[\0\r\n]/.test(normalized)) throw new Error('Invalid changed file path');
    return normalized;
  }

  private qualifyHead(owner: string, branch: string): string {
    if (!GITHUB_NAME.test(owner)) throw new Error('Invalid pull request head owner');
    this.assertTaskBranch(branch);
    return `${owner}:${branch}`;
  }

  private assertTaskBranch(branch: string) {
    if (!/^foundry\/task-[a-z0-9-]+-[a-z0-9]+$/.test(branch)) throw new Error('Only Agent Foundry task branches may be pushed');
  }

  private async assertWorkspace(repoPath: string) {
    const relative = path.relative(path.resolve(this.root), await fs.realpath(repoPath));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Repository is outside the Foundry workspace root');
  }

  protected run(executable: 'gh'|'git', args: string[], timeoutMs = 120000): Promise<CommandResult> {
    return new Promise((resolve,reject)=>{const child=spawn(executable,args,{shell:false,windowsHide:true,env:{...process.env,GH_PROMPT_DISABLED:'1',GIT_TERMINAL_PROMPT:'0'},stdio:['ignore','pipe','pipe'],timeout:timeoutMs});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c.toString());child.stderr.on('data',c=>stderr+=c.toString());child.on('error',reject);child.on('close',code=>code===0?resolve({stdout,stderr}):reject(new Error(`${executable} command failed: ${stderr.trim().slice(0,1000)}`)));});
  }

  protected runWithExitCodes(executable: 'git', args: string[], allowed: number[], timeoutMs = 120000): Promise<CommandResult & { code: number }> {
    return new Promise((resolve,reject)=>{const child=spawn(executable,args,{shell:false,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0'},stdio:['ignore','pipe','pipe'],timeout:timeoutMs});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c.toString());child.stderr.on('data',c=>stderr+=c.toString());child.on('error',reject);child.on('close',code=>code!==null&&allowed.includes(code)?resolve({stdout,stderr,code}):reject(new Error(`git command failed: ${stderr.trim().slice(0,1000)}`)));});
  }
}
