import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import * as os from 'os';

type CommandResult = { stdout: string; stderr: string };
type Repo = { owner: string; repo: string };

/** gh prints a variant of this when a PR for the branch already exists. */
export function isPrAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists/i.test(message);
}

/** Parse `gh pr list --json url` output, accepting only URLs that belong to
 *  the authorized repository. Anything malformed is a miss, never a throw. */
export function parseOpenPrUrlList(stdout: string, fullName: string): string | null {
  try {
    const rows = JSON.parse(stdout) as Array<{ url?: unknown }>;
    if (!Array.isArray(rows)) return null;
    const expected = new RegExp(`^https://github\\.com/${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/pull/\\d+$`, 'i');
    const match = rows.find((row) => typeof row?.url === 'string' && expected.test(row.url));
    return match ? (match.url as string) : null;
  } catch {
    return null;
  }
}

export class GitHubClient {
  constructor(private readonly allowedRepositories: ReadonlySet<string>, private readonly root = process.env.FOUNDRY_REPO_ROOT || path.join(os.homedir(), 'foundry-repos')) {}

  public async checkAccess(repository: Repo): Promise<{ connected: boolean; defaultBranch: string; visibility: string }> {
    const fullName = this.assertAllowed(repository);
    const result = await this.run('gh', ['repo', 'view', fullName, '--json', 'defaultBranchRef,visibility']);
    const value = JSON.parse(result.stdout) as { defaultBranchRef?: { name?: string }; visibility?: string };
    return { connected: true, defaultBranch: value.defaultBranchRef?.name || 'main', visibility: value.visibility || 'UNKNOWN' };
  }

  public async prepareWorkspace(taskId: string, repository: Repo, baseBranch: string): Promise<{ repoPath: string; branchName: string }> {
    const fullName = this.assertAllowed(repository);
    const safeTask = taskId.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 48);
    if (!safeTask) throw new Error('Invalid task identifier');
    if (!/^[A-Za-z0-9._/-]{1,200}$/.test(baseBranch) || baseBranch.startsWith('-') || baseBranch.includes('..')) throw new Error('Invalid base branch');
    const repoPath = path.join(this.root, safeTask);
    const relative = path.relative(path.resolve(this.root), path.resolve(repoPath));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Workspace escaped the configured root');
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    await fs.rm(repoPath, { recursive: true, force: true });
    await this.run('gh', ['repo', 'clone', fullName, repoPath, '--', '--branch', baseBranch, '--single-branch']);
    await this.run('git', ['-C', repoPath, 'config', 'user.name', process.env.GIT_AUTHOR_NAME || 'Agent Foundry']);
    await this.run('git', ['-C', repoPath, 'config', 'user.email', process.env.GIT_AUTHOR_EMAIL || 'agent-foundry@users.noreply.github.com']);
    const branchName = this.generateBranchName(taskId);
    await this.run('git', ['-C', repoPath, 'switch', '-c', branchName]);
    return { repoPath, branchName };
  }

  public async pushTaskBranch(repoPath: string, branchName: string): Promise<void> {
    this.assertTaskBranch(branchName);
    await this.assertWorkspace(repoPath);
    await this.run('git', ['-C', repoPath, 'push', '--set-upstream', 'origin', branchName]);
  }

  public async getDiff(repoPath: string): Promise<string> {
    await this.assertWorkspace(repoPath);
    const result = await this.run('git', ['-C', repoPath, 'diff', '--no-ext-diff', '--']);
    return result.stdout.slice(0, 200000);
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
  /** Open a draft PR. Idempotent by branch (P13): if a previous delivery
   *  opened the PR and then crashed before the database could record it, the
   *  replay must not fail on "already exists" — it adopts the open PR. */
  public async createDraftPullRequest(repository: Repo, title: string, branchName: string, baseBranch: string, body: string): Promise<{ url: string }> {
    const fullName = this.assertAllowed(repository); this.assertTaskBranch(branchName);
    try {
      const result = await this.run('gh', ['pr', 'create', '--repo', fullName, '--head', branchName, '--base', baseBranch, '--title', title.slice(0, 240), '--body', body.slice(0, 60000), '--draft']);
      const url = result.stdout.trim(); if (!/^https:\/\/github\.com\//.test(url)) throw new Error('GitHub did not return a pull request URL');
      return { url };
    } catch (error) {
      if (!isPrAlreadyExistsError(error)) throw error;
      const existing = await this.findOpenPullRequest(repository, branchName);
      if (existing) return { url: existing };
      throw error;
    }
  }

  /** The URL of the open PR for a task branch, or null. */
  public async findOpenPullRequest(repository: Repo, branchName: string): Promise<string | null> {
    const fullName = this.assertAllowed(repository); this.assertTaskBranch(branchName);
    const result = await this.run('gh', ['pr', 'list', '--repo', fullName, '--head', branchName, '--state', 'open', '--json', 'url', '--limit', '1']);
    return parseOpenPrUrlList(result.stdout, fullName);
  }

  public generateBranchName(taskId: string): string {
    const clean = taskId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32);
    return `foundry/task-${clean}-${Date.now().toString(36)}`;
  }

  private assertAllowed({ owner, repo }: Repo): string {
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) throw new Error('Invalid repository name');
    const fullName = `${owner}/${repo}`; const match = [...this.allowedRepositories].find(value => value.toLowerCase() === fullName.toLowerCase());
    if (!match) throw new Error('Repository is not authorised for Agent Foundry');
    return match;
  }

  private assertRelativePath(value: string) {
    const normalized = value.replace(/\\\\/g, '/');
    if (!normalized || normalized.startsWith('/') || normalized.includes('..') || /[\0\r\n]/.test(normalized)) throw new Error('Invalid changed file path');
    return normalized;
  }
  private assertTaskBranch(branch: string) { if (!/^foundry\/task-[a-z0-9-]+-[a-z0-9]+$/.test(branch)) throw new Error('Only Agent Foundry task branches may be pushed'); }
  private async assertWorkspace(repoPath: string) { const relative = path.relative(path.resolve(this.root), await fs.realpath(repoPath)); if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Repository is outside the Foundry workspace root'); }
  protected run(executable: 'gh'|'git', args: string[], timeoutMs = 120000): Promise<CommandResult> { return new Promise((resolve,reject)=>{const child=spawn(executable,args,{shell:false,windowsHide:true,env:{...process.env,GH_PROMPT_DISABLED:'1',GIT_TERMINAL_PROMPT:'0'},stdio:['ignore','pipe','pipe'],timeout:timeoutMs});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c.toString());child.stderr.on('data',c=>stderr+=c.toString());child.on('error',reject);child.on('close',code=>code===0?resolve({stdout,stderr}):reject(new Error(`${executable} command failed: ${stderr.trim().slice(0,1000)}`)));}); }  protected runWithExitCodes(executable: 'git', args: string[], allowed: number[], timeoutMs = 120000): Promise<CommandResult & { code: number }> { return new Promise((resolve,reject)=>{const child=spawn(executable,args,{shell:false,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0'},stdio:['ignore','pipe','pipe'],timeout:timeoutMs});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c.toString());child.stderr.on('data',c=>stderr+=c.toString());child.on('error',reject);child.on('close',code=>code!==null&&allowed.includes(code)?resolve({stdout,stderr,code}):reject(new Error(`git command failed: ${stderr.trim().slice(0,1000)}`)));}); }
}
