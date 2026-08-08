// P14 cancel driver: pure pieces of the best-effort sandbox kill.
// Coupling note: sandboxSlugForTask MIRRORS the slug construction in
// apps/runner/src/sandbox.ts — if the runner changes its container naming,
// this must change with it. The kill targets only containers whose names
// match the exact task slug + timestamp suffix.

export function sandboxSlugForTask(taskId: string): string {
  return taskId.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 32) || 'unknown';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isTaskSandboxContainer(name: string, slug: string): boolean {
  return new RegExp(`^foundry-sandbox-${escapeRegExp(slug)}-[0-9]{6,}$`).test(name);
}

/** Parse `docker ps --format '{{.Names}}'` output into validated names. */
export function parseContainerNames(stdout: string, slug: string, cap = 10): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((name) => isTaskSandboxContainer(name, slug))
    .slice(0, cap);
}
