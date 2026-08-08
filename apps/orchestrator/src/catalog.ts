import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

export interface CatalogAgent {
  id: string;
  title: string;
  description: string;
  framework: string;
  tags: string[];
  industry: string;
  difficulty: string;
}

export interface LoadedCatalog {
  agents: CatalogAgent[];
  commit: string;
  /** true only when the checkout was verified against the operator's
   *  AGENT_CATALOG_COMMIT pin. Unpinned loads are development mode and are
   *  recorded as such on every plan they influence. */
  pinned: boolean;
  skippedEntries: string[];
}

/** Permanent catalog integrity failure. Never retried by the planner worker:
 *  retrying a mismatched/missing catalog cannot fix it, only a human can. */
export class CatalogIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogIntegrityError';
  }
}

const ENTRY_ID_PATTERN = /^\d{2}-[a-z0-9-]+$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
// Unicode control + format characters: C0/C1 controls, zero-width joiners and
// spaces, bidi overrides. Stripped so catalog text that later lands inside an
// LLM prompt cannot hide content from whoever reviews the yaml source.
const INVISIBLE_PATTERN = /[\p{Cc}\p{Cf}]/gu;

function sanitizeText(value: string, maxLength: number): string {
  return value.replace(INVISIBLE_PATTERN, '').trim().slice(0, maxLength);
}

function rawField(metadata: string, name: string): string {
  return metadata.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') || '';
}

function requiredField(metadata: string, id: string, name: string, maxLength: number): string {
  const value = sanitizeText(rawField(metadata, name), maxLength);
  if (!value) throw new CatalogIntegrityError(`catalog entry ${id}: missing or empty required field "${name}"`);
  return value;
}

function optionalField(metadata: string, name: string, maxLength: number): string {
  return sanitizeText(rawField(metadata, name), maxLength);
}

/** Parse and bound one metadata.yaml entry. Anything unparseable throws:
 *  a structured-but-wrong catalog entry is a tamper signal, not a soft error. */
export function parseCatalogEntry(id: string, metadataYaml: string): CatalogAgent {
  if (!ENTRY_ID_PATTERN.test(id)) throw new CatalogIntegrityError(`catalog entry id "${id}" does not match ${ENTRY_ID_PATTERN}`);
  const tags = optionalField(metadataYaml, 'tags', 600)
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((tag) => sanitizeText(tag, 48))
    .filter(Boolean)
    .slice(0, 12);
  return {
    id,
    title: requiredField(metadataYaml, id, 'title', 160),
    description: requiredField(metadataYaml, id, 'description', 600),
    framework: requiredField(metadataYaml, id, 'framework', 80),
    tags,
    industry: optionalField(metadataYaml, 'industry', 80),
    difficulty: optionalField(metadataYaml, 'difficulty', 40),
  };
}

/** Decide whether an actual HEAD commit satisfies the operator's pin. */
export function resolveCatalogPin(actualCommit: string, pinnedCommit?: string): { commit: string; pinned: boolean } {
  if (!COMMIT_PATTERN.test(actualCommit)) {
    throw new CatalogIntegrityError('agent catalog HEAD is not a verifiable 40-hex commit');
  }
  const pin = (pinnedCommit || '').trim().toLowerCase();
  if (pin && !COMMIT_PATTERN.test(pin)) {
    throw new CatalogIntegrityError('AGENT_CATALOG_COMMIT is not a 40-character hex sha');
  }
  if (pin && actualCommit !== pin) {
    throw new CatalogIntegrityError(`agent catalog pin mismatch: expected ${pin}, found ${actualCommit}`);
  }
  return { commit: actualCommit, pinned: Boolean(pin) };
}

function runGit(args: string[], timeoutMs: number): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { shell: false, windowsHide: true, timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => { if (stdout.length < 4096) stdout += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout: stdout.trim(), exitCode: code ?? 1 }));
  });
}

/** Verify the checkout HEAD refers to a real commit object, not just a
 *  fabricated ref file: `rev-parse --verify HEAD^{commit}` fails unless the
 *  object exists in the repository's object database. */
export async function verifyCatalogCommit(catalogRoot: string): Promise<string> {
  const result = await runGit(['-C', catalogRoot, 'rev-parse', '--verify', 'HEAD^{commit}'], 10_000);
  if (result.exitCode !== 0 || !COMMIT_PATTERN.test(result.stdout)) {
    throw new CatalogIntegrityError('agent catalog is not a git worktree with a verifiable commit object');
  }
  return result.stdout;
}

export async function loadAgentCatalog(options: { root: string; pinnedCommit?: string }): Promise<LoadedCatalog> {
  const agentsRoot = path.join(options.root, 'agents');
  const entries = await fs.readdir(agentsRoot, { withFileTypes: true }).catch(() => {
    throw new CatalogIntegrityError('agent catalog directory is missing or unreadable');
  });
  const agents: CatalogAgent[] = [];
  const skippedEntries: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !ENTRY_ID_PATTERN.test(entry.name)) continue;
    let metadata: string;
    try {
      metadata = await fs.readFile(path.join(agentsRoot, entry.name, 'metadata.yaml'), 'utf8');
    } catch {
      // Incomplete clone or partial checkout: the entry is excluded from the
      // whitelist (cannot be selected) but recorded for the audit trail.
      skippedEntries.push(entry.name);
      continue;
    }
    // Structured-but-invalid content fails closed (CatalogIntegrityError).
    agents.push(parseCatalogEntry(entry.name, metadata));
  }
  agents.sort((a, b) => a.id.localeCompare(b.id));
  if (!agents.length) throw new CatalogIntegrityError('agent catalog contains no valid metadata entries');
  const commit = await verifyCatalogCommit(options.root);
  const { pinned } = resolveCatalogPin(commit, options.pinnedCommit);
  return { agents, commit, pinned, skippedEntries };
}
