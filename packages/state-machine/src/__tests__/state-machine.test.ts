import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_STATES,
  TERMINAL_STATES,
  TRANSITIONS,
  TASK_EVENT_TYPES,
  isValidTransition,
  isTaskEventType,
  reachableStates,
  LEGACY_STATUS_BY_STATE,
  STATE_BY_LEGACY_STATUS,
  transitionTask,
  emitTaskEvent,
  tryEmitTaskEvent,
  InvalidTaskTransitionError,
  TaskNotFoundError,
  TaskTransitionConflictError,
  type TaskState,
  type TransitionDbClient,
} from '../index.ts';

// ---------- state inventory ----------

test('states: exactly the 21 required states in the specified order', () => {
  assert.deepEqual([...TASK_STATES], [
    'DRAFT', 'QUEUED', 'PLANNING', 'RUNNING', 'VALIDATING', 'REVIEWING', 'REPAIRING',
    'PR_CREATED', 'PREVIEW_PENDING', 'PREVIEW_READY', 'AWAITING_APPROVAL', 'CHANGES_REQUESTED',
    'HUMAN_INPUT_REQUIRED', 'APPROVED', 'REJECTED', 'SECURITY_BLOCKED', 'INFRASTRUCTURE_FAILED',
    'CODE_FAILED', 'FAILED', 'CANCELLED', 'COMPLETED',
  ]);
});

test('states: every listed state has a transition-table entry (no orphans)', () => {
  for (const state of TASK_STATES) {
    assert.ok(Object.prototype.hasOwnProperty.call(TRANSITIONS, state), `${state} missing from TRANSITIONS`);
    for (const target of TRANSITIONS[state]) {
      assert.ok((TASK_STATES as readonly string[]).includes(target), `${state} -> unknown target ${target}`);
    }
  }
});

test('states: all 21 states are reachable from DRAFT (no dead-end additions)', () => {
  const reachable = reachableStates('DRAFT');
  for (const state of TASK_STATES) assert.ok(reachable.has(state), `${state} is unreachable from DRAFT`);
});

test('states: terminal states have no outgoing transitions', () => {
  assert.deepEqual([...TERMINAL_STATES].sort(), ['CANCELLED', 'COMPLETED', 'REJECTED', 'SECURITY_BLOCKED']);
  for (const terminal of TERMINAL_STATES) {
    assert.deepEqual([...TRANSITIONS[terminal]], [], `${terminal} must be a dead end`);
  }
});

// ---------- spec-required transition examples (spec §7) ----------

test('transitions: every spec example transition exists', () => {
  const required: Array<[TaskState, TaskState]> = [
    ['QUEUED', 'PLANNING'],
    ['PLANNING', 'RUNNING'],
    ['RUNNING', 'VALIDATING'],
    ['VALIDATING', 'REVIEWING'],
    ['VALIDATING', 'REPAIRING'],
    ['REPAIRING', 'VALIDATING'],
    ['REVIEWING', 'PR_CREATED'],
    ['PR_CREATED', 'PREVIEW_PENDING'],
    ['PREVIEW_PENDING', 'PREVIEW_READY'],
    ['PREVIEW_READY', 'AWAITING_APPROVAL'],
    ['AWAITING_APPROVAL', 'APPROVED'],
    ['AWAITING_APPROVAL', 'CHANGES_REQUESTED'],
    ['AWAITING_APPROVAL', 'REJECTED'],
  ];
  for (const [from, to] of required) {
    assert.ok(isValidTransition(from, to), `required transition ${from} -> ${to} missing`);
  }
});

test('transitions: identity and arbitrary skips are invalid', () => {
  assert.equal(isValidTransition('DRAFT', 'DRAFT'), false);
  assert.equal(isValidTransition('DRAFT', 'COMPLETED'), false, 'cannot skip the whole pipeline');
  assert.equal(isValidTransition('DRAFT', 'PR_CREATED'), false);
  assert.equal(isValidTransition('VALIDATING', 'AWAITING_APPROVAL'), false, 'checks must pass through review');
  assert.equal(isValidTransition('APPROVED', 'DRAFT'), false);
  assert.equal(isValidTransition('SECURITY_BLOCKED', 'QUEUED'), false, 'security blocks may not auto-resume');
  assert.equal(isValidTransition('REJECTED', 'QUEUED'), false);
});

test('transitions: legacy operational edges used by current control points exist', () => {
  const edges: Array<[TaskState, TaskState]> = [
    ['DRAFT', 'PLANNING'],          // request_plan
    ['PLANNING', 'DRAFT'],          // plan-queue failure rollback
    ['PLANNING', 'FAILED'],
    ['FAILED', 'PLANNING'],         // retry from failed
    ['AWAITING_APPROVAL', 'QUEUED'],// approve_plan
    ['QUEUED', 'AWAITING_APPROVAL'],// execution-queue failure rollback
    ['AWAITING_APPROVAL', 'COMPLETED'], // evaluation-only completion
    ['APPROVED', 'COMPLETED'],      // human merged via check_status
  ];
  for (const [from, to] of edges) assert.ok(isValidTransition(from, to), `operational edge ${from} -> ${to} missing`);
});

// ---------- legacy mapping ----------

test('legacy map: every state has a legacy status and vice versa', () => {
  for (const state of TASK_STATES) assert.ok(LEGACY_STATUS_BY_STATE[state], `no legacy status for ${state}`);
  const legacyStatuses = Object.keys(STATE_BY_LEGACY_STATUS);
  assert.equal(legacyStatuses.length, 16, 'all 16 legacy statuses are covered');
  for (const legacy of legacyStatuses) {
    assert.ok((TASK_STATES as readonly string[]).includes(STATE_BY_LEGACY_STATUS[legacy]), `${legacy} maps to a known state`);
  }
});

test('legacy map: AWAITING_APPROVAL serves both approval senses (documented lossy point)', () => {
  assert.equal(STATE_BY_LEGACY_STATUS.awaiting_plan_approval, 'AWAITING_APPROVAL');
  assert.equal(STATE_BY_LEGACY_STATUS.awaiting_human_review, 'AWAITING_APPROVAL');
  assert.equal(LEGACY_STATUS_BY_STATE.APPROVED, 'approved_for_merge');
  assert.equal(LEGACY_STATUS_BY_STATE.PREVIEW_READY, 'preview_ready');
});

// ---------- transitionTask with a recording fake ----------

type FakeCalls = {
  updateWhere: Record<string, unknown> | null;
  updateData: Record<string, unknown> | null;
  transitions: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
};

function fakeDb(opts: { storedState: string | null; updateCount?: number }): { db: TransitionDbClient; calls: FakeCalls } {
  const calls: FakeCalls = { updateWhere: null, updateData: null, transitions: [], events: [], audits: [] };
  const db: TransitionDbClient = {
    task: {
      findUnique: async () => (opts.storedState ? { state: opts.storedState } : null),
      updateMany: async ({ where, data }) => {
        calls.updateWhere = where;
        calls.updateData = data;
        return { count: opts.updateCount ?? 1 };
      },
    },
    taskStateTransition: {
      create: async ({ data }) => { calls.transitions.push(data); return {}; },
    },
    taskEvent: {
      create: async ({ data }) => { calls.events.push(data); return {}; },
    },
    auditEvent: {
      create: async ({ data }) => { calls.audits.push(data); return {}; },
    },
  };
  return { db, calls };
}

test('transitionTask: valid move is atomic and records an immutable transition', async () => {
  const { db, calls } = fakeDb({ storedState: 'RUNNING' });
  const result = await transitionTask(db, {
    taskId: 't1', to: 'VALIDATING', actor: 'runner', actorType: 'worker',
    attemptId: 'attempt-9', correlationId: 'job-42', reason: 'checks starting',
  });
  assert.deepEqual(result, { from: 'RUNNING', to: 'VALIDATING' });
  // optimistic-concurrency guard hits the same UPDATE
  assert.deepEqual(calls.updateWhere, { id: 't1', state: 'RUNNING' });
  assert.equal(calls.updateData?.state, 'VALIDATING');
  assert.equal(calls.updateData?.status, 'testing', 'legacy UI column kept in sync');
  assert.equal(calls.transitions.length, 1);
  assert.deepEqual(
    {
      taskId: calls.transitions[0].taskId, attemptId: calls.transitions[0].attemptId,
      fromState: calls.transitions[0].fromState, toState: calls.transitions[0].toState,
      actor: calls.transitions[0].actor, actorType: calls.transitions[0].actorType, correlationId: calls.transitions[0].correlationId,
    },
    { taskId: 't1', attemptId: 'attempt-9', fromState: 'RUNNING', toState: 'VALIDATING', actor: 'runner', actorType: 'worker', correlationId: 'job-42' },
  );
  assert.ok(calls.audits.some((a) => a.action === 'task.state_changed'));
  // and the domain projection was emitted with the move
  assert.equal(calls.events.length, 1);
  assert.equal(calls.events[0].type, 'task_state_changed');
  assert.equal(calls.events[0].attemptId, 'attempt-9');
  assert.deepEqual(calls.events[0].payload, { from: 'RUNNING', to: 'VALIDATING', reason: 'checks starting' });
});

test('transitionTask: invalid move is rejected, audited, and writes nothing else', async () => {
  const { db, calls } = fakeDb({ storedState: 'DRAFT' });
  await assert.rejects(
    transitionTask(db, { taskId: 't2', to: 'APPROVED', actor: 'mallory', actorType: 'human' }),
    (error: unknown) => error instanceof InvalidTaskTransitionError && error.from === 'DRAFT' && error.to === 'APPROVED',
  );
  assert.equal(calls.updateWhere, null, 'no task write attempted');
  assert.equal(calls.transitions.length, 0, 'no transition row on rejection');
  assert.equal(calls.events.length, 0, 'no event on rejection');
  const rejection = calls.audits.find((a) => a.action === 'task.transition_rejected');
  assert.ok(rejection, 'rejection is logged');
  assert.equal(rejection.result, 'rejected');
});

test('transitionTask: lost race (conditional UPDATE affects 0 rows) raises a conflict, audited', async () => {
  const { db, calls } = fakeDb({ storedState: 'QUEUED', updateCount: 0 });
  await assert.rejects(
    transitionTask(db, { taskId: 't3', to: 'RUNNING', actor: 'runner', actorType: 'worker' }),
    TaskTransitionConflictError,
  );
  assert.equal(calls.transitions.length, 0, 'no transition row on conflict');
  assert.ok(calls.audits.some((a) => a.action === 'task.transition_conflict' && a.result === 'conflict'));
});

test('transitionTask: missing task raises TaskNotFoundError without any writes', async () => {
  const { db, calls } = fakeDb({ storedState: null });
  await assert.rejects(transitionTask(db, { taskId: 'ghost', to: 'QUEUED', actor: 'x' }), TaskNotFoundError);
  assert.equal(calls.updateWhere, null);
  assert.equal(calls.transitions.length, 0);
});

test('transitionTask: attempt-scoped guard adds currentAttemptId to the conditional write', async () => {
  const { db, calls } = fakeDb({ storedState: 'VALIDATING' });
  await transitionTask(db, {
    taskId: 't4', to: 'REVIEWING', actor: 'runner', actorType: 'worker', expectCurrentAttemptId: 'attempt-77',
  });
  assert.deepEqual(calls.updateWhere, { id: 't4', state: 'VALIDATING', currentAttemptId: 'attempt-77' });
});

test('transitionTask: extraTaskData folds into the same atomic UPDATE; legacy override respected', async () => {
  const { db, calls } = fakeDb({ storedState: 'DRAFT' });
  const started = new Date('2026-08-08T00:00:00Z');
  await transitionTask(db, {
    taskId: 't5', to: 'PLANNING', actor: 'admin-1', actorType: 'human', legacyStatus: 'planning',
    extraTaskData: { startedAt: started },
  });
  assert.equal(calls.updateData?.startedAt, started);
  assert.equal(calls.updateData?.status, 'planning');
});

test('transitionTask: stored state outside the enum cannot be laundered', async () => {
  const { db } = fakeDb({ storedState: 'teleported' });
  await assert.rejects(
    transitionTask(db, { taskId: 't6', to: 'QUEUED', actor: 'x' }),
    /unrecognized stored state/,
  );
});

// ---------- task event catalog + emitter (P6) ----------

test('events: exactly the 24 catalog types in the specified order', () => {
  assert.equal(TASK_EVENT_TYPES.length, 24);
  assert.deepEqual([...TASK_EVENT_TYPES], [
    'task_created', 'task_queued', 'planning_started', 'plan_generated',
    'plan_approval_requested', 'plan_approved', 'plan_rejected',
    'execution_started', 'code_generated',
    'validation_started', 'validation_passed', 'validation_failed',
    'review_started', 'review_passed', 'review_failed',
    'draft_pr_opened', 'preview_ready',
    'final_approval_requested', 'final_approved', 'final_rejected',
    'task_completed', 'task_failed', 'task_cancelled', 'task_state_changed',
  ]);
  assert.equal(new Set(TASK_EVENT_TYPES).size, 24, 'no duplicate types');
  for (const type of TASK_EVENT_TYPES) {
    assert.match(type, /^[a-z][a-z_]*$/, `${type} uses snake_case`);
    assert.ok(isTaskEventType(type));
  }
  assert.equal(isTaskEventType('task_launched'), false);
});

test('events: emitTaskEvent writes the full row', async () => {
  const { db, calls } = fakeDb({ storedState: 'DRAFT' });
  await emitTaskEvent(db, {
    taskId: 't7', type: 'plan_approved', actor: 'admin-9', actorType: 'human',
    attemptId: 'a-1', correlationId: 'req-5', payload: { gate: 'plan' },
  });
  assert.equal(calls.events.length, 1);
  assert.deepEqual(calls.events[0], {
    taskId: 't7', type: 'plan_approved', actor: 'admin-9', actorType: 'human',
    attemptId: 'a-1', correlationId: 'req-5', payload: { gate: 'plan' },
  });
});

test('events: emitTaskEvent defaults actorType to system and nullable fields to null', async () => {
  const { db, calls } = fakeDb({ storedState: 'DRAFT' });
  await emitTaskEvent(db, { taskId: 't8', type: 'task_created', actor: 'ai-project-manager' });
  assert.equal(calls.events[0].actorType, 'system');
  assert.equal(calls.events[0].attemptId, null);
  assert.equal(calls.events[0].correlationId, null);
  assert.equal(calls.events[0].payload, undefined, 'omitted payload -> column default (NULL)');
});

test('events: tryEmitTaskEvent never throws; emitTaskEvent propagates (atomic use)', async () => {
  const failingClient = {
    taskEvent: {
      create: async () => { throw new Error('db down'); },
    },
  };
  await assert.rejects(emitTaskEvent(failingClient, { taskId: 't9', type: 'task_failed', actor: 'runner' }), /db down/);
  const ok = await tryEmitTaskEvent(failingClient, { taskId: 't9', type: 'validation_passed', actor: 'runner' });
  assert.equal(ok, false, 'best-effort emission reports failure instead of throwing');
});
