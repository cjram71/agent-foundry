export type ProjectInput = { name: string; githubOwner: string; githubRepository: string; defaultBranch: string; spendingLimit: number; projectType: string; productionUrl: string | null };
const githubName = /^[A-Za-z0-9_.-]+$/;
const branchName = /^[A-Za-z0-9._/-]+$/;
export const projectTypes = new Set(['web_app','website','mobile_app','api','automation','library','other']);

export function parsePublicUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 500) throw new Error('Invalid public project URL');
  let url: URL; try { url = new URL(value.trim()); } catch { throw new Error('Public project URL must be a complete HTTPS address'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) throw new Error('Public project URL must use HTTPS and cannot be localhost');
  url.hash = ''; return url.toString().replace(/\/$/, '');
}

export function parseProjectInput(value: unknown): ProjectInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid request body');
  const data = value as Record<string, unknown>;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  let githubOwner = typeof data.githubOwner === 'string' ? data.githubOwner.trim() : '';
  let githubRepository = typeof data.githubRepository === 'string' ? data.githubRepository.trim() : '';
  const repositoryUrl = githubRepository.match(/^https:\/\/github\.com\/([^/]+)\/([^/#]+?)(?:\.git)?\/?$/i);
  const repositoryPair = githubRepository.match(/^([^/]+)\/([^/]+)$/);
  if (repositoryUrl) {
    githubOwner = repositoryUrl[1];
    githubRepository = repositoryUrl[2];
  } else if (repositoryPair) {
    githubOwner = repositoryPair[1];
    githubRepository = repositoryPair[2].replace(/\.git$/i, '');
  } else {
    githubRepository = githubRepository.replace(/\.git$/i, '');
  }
  const defaultBranch = typeof data.defaultBranch === 'string' && data.defaultBranch.trim() ? data.defaultBranch.trim() : 'main';
  const spendingLimit = typeof data.spendingLimit === 'number' ? data.spendingLimit : Number(data.spendingLimit ?? 50);
  const projectType = typeof data.projectType === 'string' ? data.projectType : 'web_app';
  if (!name || name.length > 100) throw new Error('Project name must be 1-100 characters');
  if (!githubName.test(githubOwner) || !githubName.test(githubRepository)) throw new Error('Invalid GitHub repository');
  if (!branchName.test(defaultBranch) || defaultBranch.includes('..')) throw new Error('Invalid default branch');
  if (!Number.isFinite(spendingLimit) || spendingLimit < 0 || spendingLimit > 10_000) throw new Error('Invalid spending limit');
  if (!projectTypes.has(projectType)) throw new Error('Invalid project type');
  return { name, githubOwner, githubRepository, defaultBranch, spendingLimit, projectType, productionUrl: parsePublicUrl(data.productionUrl) };
}
