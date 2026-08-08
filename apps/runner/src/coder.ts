import path from 'path';
import fs from 'fs/promises';

export type TextEdit = { find: string; replace: string };
export type Change = { path: string; content?: string; edits?: TextEdit[]; reason: string };
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
    if (!change || typeof change.reason !== 'string') throw new Error('Coder returned an invalid change');
    const hasContent = typeof change.content === 'string';
    const hasEdits = Array.isArray(change.edits) && change.edits.length > 0 && change.edits.length <= 20 && change.edits.every(edit => edit && typeof edit.find === 'string' && typeof edit.replace === 'string');
    if (hasContent === hasEdits) throw new Error('Each change must provide either complete content or 1-20 exact edits');
    change.path = safeRelativePath(change.path);
    if (seen.has(change.path)) throw new Error(`Coder returned duplicate path ${change.path}`);
    seen.add(change.path); total += hasContent ? Buffer.byteLength(change.content!) : change.edits!.reduce((sum, edit) => sum + Buffer.byteLength(edit.find) + Buffer.byteLength(edit.replace), 0);
  }
  if (total > 500_000) throw new Error('Coder changes exceed the 500 KB limit');
  return result;
}

export async function applyChanges(root: string, changes: Change[]) {
  const resolvedRoot = await fs.realpath(root);
  const pending: Array<{ target: string; relative: string; content: string }> = [];
  for (const change of changes) {
    const relative = safeRelativePath(change.path);
    const target = path.resolve(resolvedRoot, relative);
    const escaped = path.relative(resolvedRoot, target);
    if (escaped.startsWith('..') || path.isAbsolute(escaped)) throw new SecurityViolationError('Change escaped the task workspace');
    try {
      if ((await fs.lstat(target)).isSymbolicLink()) throw new SecurityViolationError(`Refusing to overwrite symlink ${relative}`);
    } catch (error) {
      if (error instanceof SecurityViolationError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    let content: string;
    if (typeof change.content === 'string') {
      content = change.content;
    } else {
      try { content = await fs.readFile(target, 'utf8'); }
      catch {
        if (change.edits?.length === 1 && change.edits[0].find === '') content = '';
        else throw new Error('Exact edits require an existing file: ' + relative);
      }
      for (const edit of change.edits || []) {
        if (edit.find === '' && content !== '') throw new Error('An empty find is allowed only when creating a new file: ' + relative);
        const first = content.indexOf(edit.find);
        if (first < 0) throw new Error('Exact edit text was not found in ' + relative);
        if (edit.find && content.indexOf(edit.find, first + edit.find.length) >= 0) throw new Error('Exact edit text is ambiguous in ' + relative);
        content = content.slice(0, first) + edit.replace + content.slice(first + edit.find.length);
      }
    }
    pending.push({ target, relative, content });
  }

  // Commit only after every edit in every file has validated. A rejected
  // multi-file response therefore leaves the workspace byte-for-byte intact.
  for (const change of pending) {
    await fs.mkdir(path.dirname(change.target), { recursive: true, mode: 0o700 });
    await fs.writeFile(change.target, change.content, { encoding: 'utf8', mode: 0o600 });
  }
}