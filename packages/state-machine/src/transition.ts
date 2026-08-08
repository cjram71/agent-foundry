// transitionTask(): the only write path that may advance a task's state.
//
// Guarantees:
//  * the target state is reachable per the explicit transition table,
//  * the move is atomic with an optimistic-concurrency guard (conditional
//    UPDATE on the expected current state; callers must invoke us inside an
//    interactive transaction when combining with other writes),
//  * every accepted move leaves an immutable TaskStateTransition row with
//    attempt/correlation/actor/evidence context, plus a task_state_changed
//    TaskEvent (domain projection) in the same write,
//  * every rejected or lost-race move is logged as an AuditEvent
//    (task.transition_rejected / task.transition_conflict),
//  * the legacy `status` column is kept in sync from the mapping (overridable)
//    so the existing dashboard keeps rendering consistently.

import { isTaskState, type TaskState } from './states';
import { isValidTransition } from './transitions';
import { LEGACY_STATUS_BY_STATE } from './legacy-map';
import { emitTaskEvent, type TaskEventDbClient } from './events';
import { InvalidTaskTransitionError, TaskNotFoundError, TaskTransitionConflictError } from './errors';

export type ActorType = 'human' | 'worker' | 'system';

export interface TransitionInput {
  taskId: string;
  to: TaskState;
  actor: string;
  actorType?: ActorType;
  reason?: string;
  attemptId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  /** Exact legacy status to write for the UI (defaults to LEGACY_STATUS_BY_STATE[to]). */
  legacyStatus?: string;
  /** Extra Task fields merged into the same conditional UPDATE (e.g. startedAt, pullRequestUrl). */
  extraTaskData?: Record<string, unknown>;
  /** When set, the conditional UPDATE also requires Task.currentAttemptId to
   *  match: a stale worker holding an old attempt can no longer advance the task. */
  expectCurrentAttemptId?: string;
}

export interface TransitionResult {
  from: TaskState;
  to: TaskState;
}

/**
 * Minimal structural client: satisfied by PrismaClient and by an interactive
 * Prisma transaction. Parameter types are intentionally loose so this package
 * never depends on generated Prisma types (it must stay buildable and
 * testable outside generator access and remain version-tolerant).
 */
export interface TransitionDbClient extends TaskEventDbClient {
  task: {
    findUnique(args: { where: { id: string }; select: { state: true } }): Promise<{ state: string } | null>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  taskStateTransition: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  auditEvent: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

async function logTransitionEvent(
  db: TransitionDbClient,
  data: { action: string; target: string; actor: string; result: string; metadata: Record<string, unknown> },
): Promise<void> {
  try {
    await db.auditEvent.create({
      data: { actor: data.actor, action: data.action, target: data.target, result: data.result, metadata: data.metadata },
    });
  } catch {
    // Logging must never crash the state machine; the primary write already
    // failed or succeeded on its own merits.
  }
}

export async function transitionTask(
  db: TransitionDbClient,
  input: TransitionInput,
): Promise<TransitionResult> {
  const { taskId, to } = input;
  const actor = input.actor || 'unknown';
  const actorType: ActorType = input.actorType ?? 'system';

  const current = await db.task.findUnique({ where: { id: taskId }, select: { state: true } });
  if (!current) throw new TaskNotFoundError(taskId);
  if (!isTaskState(current.state)) {
    // Defensive: the enum guarantees this in practice, but never propagate an
    // unknown value into the transition table.
    throw new Error(`Task ${taskId} has an unrecognized stored state`);
  }
  const from = current.state;

  if (!isValidTransition(from, to)) {
    await logTransitionEvent(db, {
      action: 'task.transition_rejected',
      target: taskId,
      actor,
      result: 'rejected',
      metadata: { from, to, reason: input.reason ?? null, correlationId: input.correlationId ?? null },
    });
    throw new InvalidTaskTransitionError(taskId, from, to);
  }

  const where: Record<string, unknown> = { id: taskId, state: from };
  if (input.expectCurrentAttemptId) where.currentAttemptId = input.expectCurrentAttemptId;
  const data: Record<string, unknown> = {
    state: to,
    status: input.legacyStatus ?? LEGACY_STATUS_BY_STATE[to],
    ...(input.extraTaskData ?? {}),
  };

  const updated = await db.task.updateMany({ where, data });
  if (updated.count !== 1) {
    await logTransitionEvent(db, {
      action: 'task.transition_conflict',
      target: taskId,
      actor,
      result: 'conflict',
      metadata: {
        from, to,
        expectCurrentAttemptId: input.expectCurrentAttemptId ?? null,
        correlationId: input.correlationId ?? null,
      },
    });
    throw new TaskTransitionConflictError(taskId, from, to);
  }

  await db.taskStateTransition.create({
    data: {
      taskId,
      attemptId: input.attemptId ?? null,
      fromState: from,
      toState: to,
      actor,
      actorType,
      reason: input.reason ?? null,
      correlationId: input.correlationId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
  // Domain projection: every accepted move has an event in the same
  // transaction. TaskStateTransition stays authoritative; this is for
  // consumers (activity feeds, metrics, future notifications).
  await emitTaskEvent(db, {
    taskId,
    type: 'task_state_changed',
    actor,
    actorType,
    attemptId: input.attemptId,
    correlationId: input.correlationId,
    payload: { from, to, reason: input.reason ?? null },
  });
  await logTransitionEvent(db, {
    action: 'task.state_changed',
    target: taskId,
    actor,
    result: 'success',
    metadata: { from, to, reason: input.reason ?? null, attemptId: input.attemptId ?? null, correlationId: input.correlationId ?? null },
  });

  return { from, to };
}
