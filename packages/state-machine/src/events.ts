// TaskEvent: the task-workflow domain event log (24 types).
//
// Relationship to the rest of the workflow persistence:
//  * Task.state           — the authoritative current position (state machine),
//  * TaskStateTransition  — the authoritative, immutable record of MOVES,
//  * TaskEvent            — the domain projection other modules consume
//                           (activity feeds, previews, metrics, notifications).
//
// Emission rules kept deliberately boring:
//  * emitTaskEvent() throws on database failure — use it INSIDE an existing
//    interactive transaction so the event is atomic with the write it
//    describes (approvals, transitions, attempt lifecycle).
//  * tryEmitTaskEvent() never throws (returns false instead) — use it for
//    standalone, mid-procedure emissions where losing a log line must not
//    fail the work itself.
//  * transitionTask() auto-emits `task_state_changed` for every accepted
//    transition, in the same transaction as the move. No state change can
//    exist without its event.
//  * Types with no current driver (preview_ready, task_cancelled) are
//    reserved for the phases that introduce those controls; the catalog
//    lists them now so consumers can rely on the full set.

import type { ActorType } from './transition';
import type { TaskState } from './states';

export const TASK_EVENT_TYPES = [
  'task_created',
  'task_queued',
  'planning_started',
  'plan_generated',
  'plan_approval_requested',
  'plan_approved',
  'plan_rejected',
  'execution_started',
  'code_generated',
  'validation_started',
  'validation_passed',
  'validation_failed',
  'review_started',
  'review_passed',
  'review_failed',
  'draft_pr_opened',
  'preview_ready',
  'final_approval_requested',
  'final_approved',
  'final_rejected',
  'task_completed',
  'task_failed',
  'task_cancelled',
  'task_state_changed',
] as const;

export type TaskEventType = (typeof TASK_EVENT_TYPES)[number];

export function isTaskEventType(value: unknown): value is TaskEventType {
  return typeof value === 'string' && (TASK_EVENT_TYPES as readonly string[]).includes(value);
}

/** Structural subset of PrismaClient (or an interactive transaction) able to insert events. */
export interface TaskEventDbClient {
  taskEvent: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface TaskEventInput {
  taskId: string;
  type: TaskEventType;
  actor: string;
  actorType?: ActorType;
  attemptId?: string | null;
  correlationId?: string | null;
  payload?: Record<string, unknown>;
}

/** Atomic emission: throws if the insert fails. Use inside a transaction. */
export async function emitTaskEvent(db: TaskEventDbClient, input: TaskEventInput): Promise<void> {
  await db.taskEvent.create({
    data: {
      taskId: input.taskId,
      type: input.type,
      actor: input.actor || 'unknown',
      actorType: input.actorType ?? 'system',
      attemptId: input.attemptId ?? null,
      correlationId: input.correlationId ?? null,
      payload: input.payload ?? undefined,
    },
  });
}

/** Best-effort emission: never throws. Returns false when the write failed. */
export async function tryEmitTaskEvent(db: TaskEventDbClient, input: TaskEventInput): Promise<boolean> {
  try {
    await emitTaskEvent(db, input);
    return true;
  } catch {
    return false;
  }
}

/** Payload contract for the auto-emitted task_state_changed event. */
export interface StateChangedPayload {
  from: TaskState;
  to: TaskState;
  reason: string | null;
}
