// @foundry/ops — operational primitives shared by workers (P14):
// emergency-stop flag, stop supervisor, job deferral, wedge detection.
// IO-free seams are injected so everything here is unit-testable.

export const EMERGENCY_STOP_KEY = 'foundry:emergency-stop';

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
}

/** The dashboard engages the stop by setting the key; any non-empty value
 *  counts (the value may carry operator metadata). */
export async function isEmergencyStopEngaged(store: KeyValueStore): Promise<boolean> {
  return (await store.get(EMERGENCY_STOP_KEY)) != null;
}

export interface PausableWorker {
  pause(): unknown;
  resume(): unknown;
  isPaused?(): boolean;
}

/**
 * Polls the stop flag and pauses/resumes a BullMQ worker accordingly.
 * While stopped, the worker stops FETCHING new jobs; in-flight jobs always
 * finish (hard-stop of in-flight work is the per-task cancel, not this).
 * `tick` is separated from the timer so tests drive it deterministically.
 */
export function createStopSupervisor(args: {
  store: KeyValueStore;
  worker: PausableWorker;
  log?: (message: string) => void;
}): { tick(): Promise<boolean>; start(intervalMs?: number): NodeJS.Timeout; stop(timer: NodeJS.Timeout): void } {
  let applied: boolean | undefined;
  const log = args.log ?? (() => {});
  async function tick(): Promise<boolean> {
    let engaged = false;
    try {
      engaged = await isEmergencyStopEngaged(args.store);
    } catch {
      return applied ?? false; // redis hiccup: keep the current posture, retry next tick
    }
    if (engaged !== applied) {
      applied = engaged;
      if (engaged) {
        await Promise.resolve(args.worker.pause()).catch(() => {});
        log('[ops] emergency stop engaged; worker paused (in-flight jobs complete)');
      } else {
        await Promise.resolve(args.worker.resume()).catch(() => {});
        log('[ops] emergency stop cleared; worker resumed');
      }
    }
    return engaged;
  }
  return {
    tick,
    start(intervalMs = 15_000): NodeJS.Timeout {
      void tick();
      return setInterval(() => void tick(), intervalMs);
    },
    stop(timer: NodeJS.Timeout): void {
      clearInterval(timer);
    },
  };
}

export interface DeferrableJob {
  id?: string;
  token?: string;
  moveToDelayed(timestamp: number, token?: string): Promise<unknown>;
}

/** Processor-entry guard: if the stop flag is set between a job's fetch and
 *  its start, re-park it in the delayed set instead of executing. Returns
 *  true when the job was deferred (caller returns without side effects).
 *  Fails CLOSED: an unverifiable flag is treated as engaged (an emergency
 *  stop control must never silently execute on doubt), and a deferral that
 *  cannot be persisted is thrown for the caller to surface. */
export async function deferJobWhileStopped(store: KeyValueStore, job: DeferrableJob, delayMs = 30_000): Promise<boolean> {
  let engaged = true;
  try {
    engaged = await isEmergencyStopEngaged(store);
  } catch {
    engaged = true; // fail closed
  }
  if (!engaged) return false;
  await job.moveToDelayed(Date.now() + delayMs, job.token);
  return true;
}

/** Wedge detection: a task in an active execution state whose last progress
 *  is older than the timeout. `updatedAt` refreshes on every state-machine
 *  transition; every individual stage has a hard timeout far below the
 *  default (see docs/OPERATIONS.md) so silence past the cutoff means the
 *  worker died mid-attempt — BullMQ cannot recover an attempts:1 job whose
 *  process disappeared (stalled -> failed without a state transition). */
export function isWedged(args: { updatedAt: Date; now: Date; timeoutMs: number }): boolean {
  return args.now.getTime() - args.updatedAt.getTime() > args.timeoutMs;
}

/** The states a sweeper may recover. QUEUED/PLANNING are deliberately NOT
 *  swept: their jobs are durable BullMQ deliveries that a restarted worker
 *  legitimately resumes. */
export const WEDGEABLE_STATES = ['RUNNING', 'VALIDATING', 'REPAIRING', 'REVIEWING'] as const;

export function parseWedgeTimeoutMinutes(raw: string | undefined): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (Number.isNaN(parsed)) return 45;
  return Math.min(Math.max(parsed, 5), 360);
}
