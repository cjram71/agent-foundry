// Queue reliability policy, expressed as pure data + functions so it is
// unit-testable without Redis (docs/QUEUE.md has the full contract).
//
// Job identity is deterministic per task+action (`plan-<id>`,
// `execute-<id>`), never timestamped: BullMQ deduplicates job ids
// atomically server-side, so double-submits collapse to one job. The
// client-side decision below only handles the *finished-job* case:
// completed/failed jobs are removed and re-added (a legitimate retry after
// a human rollback), while live jobs (waiting/active/delayed/...) are
// returned as-is.

export type EnqueueDecision = 'add' | 'reuse' | 'replace';

/** Decide what an enqueue should do given the state of the job already
 *  holding the deterministic id (null = no such job). */
export function decideEnqueue(existingState: string | null): EnqueueDecision {
  if (existingState === null) return 'add';
  if (existingState === 'completed' || existingState === 'failed') return 'replace';
  return 'reuse';
}

export function planJobId(taskId: string): string {
  return `plan-${taskId}`;
}

export function executeJobId(taskId: string): string {
  return `execute-${taskId}`;
}

export interface FoundryJobOptions {
  attempts: number;
  backoff: { type: 'exponential'; delay: number };
  removeOnComplete: boolean;
  removeOnFail: boolean;
}

/**
 * Plan jobs retry: planner failures are usually transient (provider rate
 * limits, Ollama warmup), and the orchestrator defers the FAILED state
 * transition until the final attempt, so retries genuinely re-plan.
 */
export const PLAN_JOB_OPTIONS: FoundryJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30000 },
  removeOnComplete: true,
  removeOnFail: false,
};

/**
 * Execute jobs do NOT blind-retry: execution has external side effects
 * (cloned workspaces, branches, pushes, draft PRs), so one failure = one
 * exhausted job. Recovery is the human-gated re-approval/re-plan flow and
 * the P11 repair loop, not silent re-execution. See docs/QUEUE.md.
 */
export const EXECUTE_JOB_OPTIONS: FoundryJobOptions = {
  attempts: 1,
  backoff: { type: 'exponential', delay: 60000 },
  removeOnComplete: true,
  removeOnFail: false,
};
