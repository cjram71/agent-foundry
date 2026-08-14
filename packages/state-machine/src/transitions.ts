// Explicit transition table. A transition not listed here does not exist:
// transitionTask() rejects it and records the rejection. The table encodes
// the specification examples exactly (see the unit test verifying them) plus
// the operational edges the existing control points already perform
// (queue-rollback, retry-from-failed, evaluation-completion, cancel paths).

import type { TaskState } from './states';

export const TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = {
  DRAFT: ['PLANNING', 'QUEUED', 'CANCELLED'],
  QUEUED: ['PLANNING', 'RUNNING', 'AWAITING_APPROVAL', 'FAILED', 'INFRASTRUCTURE_FAILED', 'CANCELLED'],
  PLANNING: ['AWAITING_APPROVAL', 'RUNNING', 'DRAFT', 'FAILED', 'INFRASTRUCTURE_FAILED', 'CANCELLED'],
  RUNNING: ['AWAITING_APPROVAL', 'VALIDATING', 'SECURITY_BLOCKED', 'CODE_FAILED', 'INFRASTRUCTURE_FAILED', 'FAILED', 'CANCELLED'],
  VALIDATING: ['REVIEWING', 'REPAIRING', 'SECURITY_BLOCKED', 'CODE_FAILED', 'INFRASTRUCTURE_FAILED', 'FAILED', 'CANCELLED'],
  REPAIRING: ['VALIDATING', 'HUMAN_INPUT_REQUIRED', 'SECURITY_BLOCKED', 'CODE_FAILED', 'INFRASTRUCTURE_FAILED', 'FAILED', 'CANCELLED'],
  REVIEWING: ['PR_CREATED', 'REPAIRING', 'SECURITY_BLOCKED', 'INFRASTRUCTURE_FAILED', 'FAILED', 'CANCELLED'],
  PR_CREATED: ['PREVIEW_PENDING', 'AWAITING_APPROVAL', 'FAILED', 'CANCELLED'],
  PREVIEW_PENDING: ['PREVIEW_READY', 'AWAITING_APPROVAL', 'INFRASTRUCTURE_FAILED', 'CANCELLED'],
  PREVIEW_READY: ['AWAITING_APPROVAL', 'CANCELLED'],
  AWAITING_APPROVAL: ['QUEUED', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'COMPLETED', 'CANCELLED'],
  CHANGES_REQUESTED: ['QUEUED', 'PLANNING', 'REJECTED', 'CANCELLED'],
  HUMAN_INPUT_REQUIRED: ['PLANNING', 'QUEUED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['COMPLETED'],
  REJECTED: [],
  SECURITY_BLOCKED: [],
  INFRASTRUCTURE_FAILED: ['QUEUED', 'FAILED', 'CANCELLED'],
  CODE_FAILED: ['REPAIRING', 'HUMAN_INPUT_REQUIRED', 'FAILED', 'CANCELLED'],
  FAILED: ['PLANNING', 'CANCELLED'],
  CANCELLED: [],
  COMPLETED: [],
};

export function isValidTransition(from: TaskState, to: TaskState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Breadth-first reachability used by tests and by future policy checks. */
export function reachableStates(from: TaskState): ReadonlySet<TaskState> {
  const seen = new Set<TaskState>([from]);
  const queue: TaskState[] = [from];
  while (queue.length) {
    const current = queue.shift() as TaskState;
    for (const next of TRANSITIONS[current]) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}
