import type { TaskState } from './states';

export class TaskNotFoundError extends Error {
  readonly code = 'TASK_NOT_FOUND' as const;
  readonly taskId: string;

  constructor(taskId: string) {
    super(`Task ${taskId} not found`);
    this.name = 'TaskNotFoundError';
    this.taskId = taskId;
  }
}

export class InvalidTaskTransitionError extends Error {
  readonly code = 'INVALID_TASK_TRANSITION' as const;
  readonly taskId: string;
  readonly from: TaskState;
  readonly to: TaskState;

  constructor(taskId: string, from: TaskState, to: TaskState) {
    super(`Invalid task transition ${from} -> ${to} for task ${taskId}`);
    this.name = 'InvalidTaskTransitionError';
    this.taskId = taskId;
    this.from = from;
    this.to = to;
  }
}

/** The task's state changed between read and conditional write: another
 *  worker/handler advanced it first. Callers should reload and re-decide. */
export class TaskTransitionConflictError extends Error {
  readonly code = 'TASK_TRANSITION_CONFLICT' as const;
  readonly taskId: string;
  readonly expectedFrom: TaskState;
  readonly to: TaskState;

  constructor(taskId: string, expectedFrom: TaskState, to: TaskState) {
    super(`Task ${taskId} no longer in state ${expectedFrom} when applying transition to ${to} (lost race to another writer)`);
    this.name = 'TaskTransitionConflictError';
    this.taskId = taskId;
    this.expectedFrom = expectedFrom;
    this.to = to;
  }
}
