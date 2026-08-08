// Mapping between the legacy `Task.status` strings (still consumed by the
// dashboard UI during the transition period) and the formal TaskState. The
// mapping is deliberately lossy in one place: both legacy plan-approval and
// merge-approval states collapse to AWAITING_APPROVAL, because the state
// machine tracks the *position in the workflow*, while the Approval rows
// carry *which* gate is open. Call sites that care pass the exact legacy
// string they want written; LEGACY_BY_STATE is only the default.

import type { TaskState } from './states';

export const LEGACY_STATUS_BY_STATE: Readonly<Record<TaskState, string>> = {
  DRAFT: 'draft',
  QUEUED: 'queued',
  PLANNING: 'planning',
  RUNNING: 'coding',
  VALIDATING: 'testing',
  REVIEWING: 'reviewing',
  REPAIRING: 'testing',
  PR_CREATED: 'pull_request_open',
  PREVIEW_PENDING: 'pull_request_open',
  PREVIEW_READY: 'preview_ready',
  AWAITING_APPROVAL: 'awaiting_plan_approval',
  CHANGES_REQUESTED: 'awaiting_human_review',
  HUMAN_INPUT_REQUIRED: 'failed',
  APPROVED: 'approved_for_merge',
  REJECTED: 'rejected',
  SECURITY_BLOCKED: 'failed',
  INFRASTRUCTURE_FAILED: 'failed',
  CODE_FAILED: 'failed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

export const STATE_BY_LEGACY_STATUS: Readonly<Record<string, TaskState>> = {
  draft: 'DRAFT',
  queued: 'QUEUED',
  approved: 'QUEUED',
  planning: 'PLANNING',
  coding: 'RUNNING',
  testing: 'VALIDATING',
  reviewing: 'REVIEWING',
  awaiting_plan_approval: 'AWAITING_APPROVAL',
  awaiting_human_review: 'AWAITING_APPROVAL',
  pull_request_open: 'PR_CREATED',
  preview_ready: 'PREVIEW_READY',
  approved_for_merge: 'APPROVED',
  rejected: 'REJECTED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
  completed: 'COMPLETED',
};
