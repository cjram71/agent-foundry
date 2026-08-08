import path from 'path';
import fs from 'fs/promises';

export type Change = { path: string; content: string; reason: string };
export type CoderResult = { summary: string; changes: Change[]; validationNotes: string[] };

/**
 * P16: a deterministic security violation in coder output — protected file
 * targeted, path escaping its workspace, disallowed file class, symlink
 * overwrite. These route the task to SECURITY_BLOCKED (quarantine), not
 * ordinary failure. Malformed-but-honest output (bad shape/default sizes)
 * throws plain Error and stays on the FAILED path.
 *
 * Deliberately NOT driven by model judgment: no AI review verdict ever
 * moves a task here (docs/THREAT-MODEL.md).
 */
export class SecurityViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityViolationError';
  }
}

export const SAFE_EXTENSIONS = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.css','.scss','.md','.html','.yml','.yaml','.toml','.prisma','.sql']);
export const BLOCKED_NAMES = new Set(['.env','.npmrc','.netrc','id_rsa','id_ed25519']);

export function safeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const basename = path.posix.basename(normalized);
  if (!normalized || normalized.startsWith('/') || normalized.includes('..') || /[\0\r\n]/.test(normalized)) throw new SecurityViolationError('Coder returned an invalid path');
  if (BLOCKED_NAMES.has(basename) || basename.startsWith('.env.') || /\.(pem|key|p12)$/i.test(basename) || normalized.startsWith('.git/')) throw new SecurityViolationError('Coder attempted to write a protected file');
  if (!SAFE_EXTENSIONS.has(path.posix.extname(normalized)) && !['Dockerfile','Procfile'].includes(basename)) throw new SecurityViolationError(`Coder returned a disallowed file type: ${normalized}`);
  return normalized;
}

export function validateCoderResult(value: unknown): CoderResult {
  if (!value || typeof value !== 'object') throw new Error('Coder response is not an object');
  const result = value as CoderResult;
  if (typeof result.summary !== 'string' || result.summary.length < 10 || !Array.isArray(result.changes) || !Array.isArray(result.validationNotes)) throw new Error('Coder response has an invalid shape');
  if (result.changes.length < 1 || result.changes.length > 20) throw new Error('Coder must change 1-20 files');
  let total = 0;
  const seen = new Set<string>();
  for (const change of result.changes) {
    if (!change || typeof change.content !== 'string' || typeof change.reason !== 'string') throw new Error('Coder returned an invalid change');
    change.path = safeRelativePath(change.path);
    if (seen.has(change.path)) throw new Error(`Coder returned duplicate path ${change.path}`);
    seen.add(change.path); total += Buffer.byteLength(change.content);
  }
  if (total > 500_000) throw new Error('Coder changes exceed the 500 KB limit');
  return result;
}

export async function applyChanges(root: string, changes: Change[]) {
  const resolvedRoot = await fs.realpath(root);
  for (const change of changes) {
    const relative = safeRelativePath(change.path);
    const target = path.resolve(resolvedRoot, relative);
    const escaped = path.relative(resolvedRoot, target);
    if (escaped.startsWith('..') || path.isAbsolute(escaped)) throw new SecurityViolationError('Change escaped the task workspace');
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    try {
      if ((await fs.lstat(target)).isSymbolicLink()) throw new SecurityViolationError(`Refusing to overwrite symlink ${relative}`);
    } catch (error) {
      if (error instanceof SecurityViolationError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await fs.writeFile(target, change.content, { encoding: 'utf8', mode: 0o600 });
  }
}
