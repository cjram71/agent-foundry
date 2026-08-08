import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const MAX_OUTPUT_BYTES = 1_000_000;
const ALLOWED_EXECUTABLES = new Set(['npm', 'node', 'npx']);

export interface ValidationCommand {
  executable: 'npm' | 'node' | 'npx';
  args: string[];
}

export interface SandboxOptions {
  taskId: string;
  repoPath: string;
  command: ValidationCommand;
  timeoutMs?: number;
}

interface ProcessResult { output: string; exitCode: number; timedOut: boolean; }

export class SandboxController {
  public async executeInSandbox(options: SandboxOptions): Promise<{ success: boolean; output: string; exitCode: number }> {
    this.validateCommand(options.command);
    const taskSlug = options.taskId.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 32) || 'unknown';
    const containerName = `foundry-sandbox-${taskSlug}-${Date.now()}`;
    const workspaceDir = path.resolve('/tmp', containerName);
    const sandboxImage = process.env.SANDBOX_IMAGE || 'node:20-bookworm-slim';
    // Run the container as the INVOKING user, never a hardcoded uid: the
    // bind-mounted workspace is host-created (mode 0700) and must be
    // readable/writable by the container process on any runner host
    // (GitHub Actions uid 1001, VPS user cory, etc.). Numeric ids without a
    // passwd entry are fine — HOME is provided via env below.
    const containerUid = typeof process.getuid === 'function' ? process.getuid() : 1000;
    const containerGid = typeof process.getgid === 'function' ? process.getgid() : 1000;

    try {
      const repoPath = await this.validateRepoPath(options.repoPath);
      await this.ensureImage(sandboxImage);
      await fs.mkdir(workspaceDir, { recursive: false, mode: 0o700 });
      await fs.cp(repoPath, workspaceDir, { recursive: true, verbatimSymlinks: true, filter: (source) => this.isSafeWorkspacePath(repoPath, source) });
      const dockerArgs = [
        'run', '--rm', '--name', containerName,
        '--network', 'none', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges', '--pids-limit', '128',
        '--memory', process.env.SANDBOX_MEMORY || '2g', '--cpus', process.env.SANDBOX_CPUS || '1.5', '--user', `${containerUid}:${containerGid}`,
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--env', 'HOME=/tmp',
        '--volume', `${workspaceDir}:/workspace:rw`, '--workdir', '/workspace',
        sandboxImage, options.command.executable, ...options.command.args,
      ];

      console.log(`[Sandbox] Spawning isolated container for task ${taskSlug}...`);
      const result = await this.runProcess('docker', dockerArgs, options.timeoutMs || 60_000);
      if (result.timedOut) return { success: false, output: this.redactSecrets(`Validation timed out.\n${result.output}`), exitCode: 124 };
      return { success: result.exitCode === 0, output: this.redactSecrets(result.output), exitCode: result.exitCode };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown sandbox error';
      return { success: false, output: this.redactSecrets(message), exitCode: 1 };
    } finally {
      await this.runProcess('docker', ['rm', '-f', containerName], 10_000).catch(() => undefined);
      await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private validateCommand(command: ValidationCommand): void {
    if (!command || !ALLOWED_EXECUTABLES.has(command.executable) || !Array.isArray(command.args)) throw new Error('Validation command is not allowlisted');
    if (command.args.length > 32 || command.args.some((arg) => typeof arg !== 'string' || arg.length > 512 || /[\0\r\n]/.test(arg))) throw new Error('Validation command arguments are invalid');
  }

  /** Verify the sandbox image is runnable, pulling it once if absent. A cold
   *  pull must not count against the caller's validation timeout (fresh CI
   *  runners and fresh VPS installs would otherwise flake on first use). */
  private async ensureImage(image: string): Promise<void> {
    const inspected = await this.runProcess('docker', ['image', 'inspect', image], 15_000);
    if (inspected.exitCode === 0) return;
    const pulled = await this.runProcess('docker', ['pull', image], 240_000);
    if (pulled.exitCode !== 0) throw new Error(`Failed to prepare sandbox image ${image}`);
  }

  private async validateRepoPath(repoPath: string): Promise<string> {
    const allowedRoot = path.resolve(process.env.FOUNDRY_REPO_ROOT || '/tmp/foundry-repos');
    const resolved = await fs.realpath(repoPath);
    const relative = path.relative(allowedRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Repository path is outside FOUNDRY_REPO_ROOT');
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) throw new Error('Repository path is not a directory');
    return resolved;
  }

  private isSafeWorkspacePath(repoRoot: string, source: string): boolean {
    const relative = path.relative(repoRoot, source);
    if (!relative) return true;
    const parts = relative.split(path.sep);
    const basename = parts[parts.length - 1];
    return !['.git', '.next', 'dist', 'coverage'].includes(parts[0]) && basename !== '.env' && !basename.startsWith('.env.') && !/\.(?:pem|key|p12)$/i.test(basename);
  }

  private runProcess(executable: string, args: string[], timeoutMs: number): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { shell: false, windowsHide: true, timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      let timedOut = false;
      const append = (chunk: Buffer) => { if (Buffer.byteLength(output) < MAX_OUTPUT_BYTES) output += chunk.toString('utf8'); };
      child.stdout.on('data', append);
      child.stderr.on('data', append);
      child.on('error', reject);
      child.on('timeout', () => { timedOut = true; });
      child.on('close', (code, signal) => {
        if (signal === 'SIGTERM' && code === null) timedOut = true;
        if (Buffer.byteLength(output) >= MAX_OUTPUT_BYTES) output += '\n[OUTPUT TRUNCATED]';
        resolve({ output, exitCode: timedOut ? 124 : (code ?? 1), timedOut });
      });
    });
  }

  private redactSecrets(text: string): string {
    if (!text) return '';
    return text
      .replace(/AIzaSy[0-9A-Za-z_-]{33}/g, '[REDACTED_GEMINI_KEY]')
      .replace(/(?:ghp|github_pat)_[0-9A-Za-z_]{20,}/g, '[REDACTED_GITHUB_TOKEN]')
      .replace(/(?:postgres|postgresql|redis):\/\/[^:\s]+:[^@\s]+@/g, (match) => `${match.split('://')[0]}://[REDACTED]@`)
      .replace(/(authorization:\s*(?:bearer|basic)\s+)[^\s]+/gi, '$1[REDACTED]');
  }
}
