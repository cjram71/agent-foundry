// The 21 formal task states required by the product specification.
// Single source of truth for the Prisma "TaskState" enum — keep in sync with
// packages/database/prisma/schema.prisma (verified by the parity script and
// by the unit test that asserts exact enum membership).

export const TASK_STATES = [
  'DRAFT',
  'QUEUED',
  'PLANNING',
  'RUNNING',
  'VALIDATING',
  'REVIEWING',
  'REPAIRING',
  'PR_CREATED',
  'PREVIEW_PENDING',
  'PREVIEW_READY',
  'AWAITING_APPROVAL',
  'CHANGES_REQUESTED',
  'HUMAN_INPUT_REQUIRED',
  'APPROVED',
  'REJECTED',
  'SECURITY_BLOCKED',
  'INFRASTRUCTURE_FAILED',
  'CODE_FAILED',
  'FAILED',
  'CANCELLED',
  'COMPLETED',
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([
  'REJECTED',
  'SECURITY_BLOCKED',
  'CANCELLED',
  'COMPLETED',
]);

export function isTaskState(value: unknown): value is TaskState {
  return typeof value === 'string' && (TASK_STATES as readonly string[]).includes(value);
}
