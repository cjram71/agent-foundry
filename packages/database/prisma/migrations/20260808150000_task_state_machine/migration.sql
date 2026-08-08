-- P5: formal task state machine.
--
-- Additive, data-preserving migration:
--   * adds the 21-state TaskState enum + Task.state (backfilled from the
--     legacy `status` column, which is RETAINED for UI compatibility during
--     the transition period),
--   * adds Task.updatedAt (Prisma @updatedAt, client-managed from here on)
--     and Task.currentAttemptId,
--   * creates TaskAttempt (execution ownage/crash recovery) and
--     TaskStateTransition (immutable transition audit log).
-- No existing rows are deleted or rewritten beyond the documented `state`
-- backfill. Safe to deploy with `prisma migrate deploy` after the P3/P4
-- procedures; the legacy `status` column keeps serving the dashboard.

-- CreateEnum
CREATE TYPE "TaskState" AS ENUM ('DRAFT', 'QUEUED', 'PLANNING', 'RUNNING', 'VALIDATING', 'REVIEWING', 'REPAIRING', 'PR_CREATED', 'PREVIEW_PENDING', 'PREVIEW_READY', 'AWAITING_APPROVAL', 'CHANGES_REQUESTED', 'HUMAN_INPUT_REQUIRED', 'APPROVED', 'REJECTED', 'SECURITY_BLOCKED', 'INFRASTRUCTURE_FAILED', 'CODE_FAILED', 'FAILED', 'CANCELLED', 'COMPLETED');

-- AlterTable
ALTER TABLE "Task"
  ADD COLUMN "state" "TaskState" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "currentAttemptId" TEXT;

-- One-time backfill: legacy status -> formal state (see docs/STATE-MACHINE.md
-- for the mapping table, including the two-way AWAITING_APPROVAL senses).
UPDATE "Task" SET "state" = (CASE "status"
  WHEN 'draft' THEN 'DRAFT'
  WHEN 'queued' THEN 'QUEUED'
  WHEN 'approved' THEN 'QUEUED'
  WHEN 'planning' THEN 'PLANNING'
  WHEN 'coding' THEN 'RUNNING'
  WHEN 'testing' THEN 'VALIDATING'
  WHEN 'reviewing' THEN 'REVIEWING'
  WHEN 'awaiting_plan_approval' THEN 'AWAITING_APPROVAL'
  WHEN 'awaiting_human_review' THEN 'AWAITING_APPROVAL'
  WHEN 'pull_request_open' THEN 'PR_CREATED'
  WHEN 'preview_ready' THEN 'PREVIEW_READY'
  WHEN 'approved_for_merge' THEN 'APPROVED'
  WHEN 'rejected' THEN 'REJECTED'
  WHEN 'failed' THEN 'FAILED'
  WHEN 'cancelled' THEN 'CANCELLED'
  WHEN 'completed' THEN 'COMPLETED'
END)::"TaskState";

-- CreateTable
CREATE TABLE "TaskAttempt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "correlationId" TEXT NOT NULL,
    "workspacePath" TEXT,
    "branchName" TEXT,
    "commitSha" TEXT,
    "outcomeSummary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "TaskAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStateTransition" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attemptId" TEXT,
    "fromState" "TaskState" NOT NULL,
    "toState" "TaskState" NOT NULL,
    "actor" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "reason" TEXT,
    "correlationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStateTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttempt_taskId_attemptNumber_key" ON "TaskAttempt"("taskId", "attemptNumber");
CREATE INDEX "TaskAttempt_taskId_idx" ON "TaskAttempt"("taskId");
CREATE INDEX "TaskStateTransition_taskId_idx" ON "TaskStateTransition"("taskId");
CREATE INDEX "TaskStateTransition_correlationId_idx" ON "TaskStateTransition"("correlationId");
CREATE INDEX "TaskStateTransition_createdAt_idx" ON "TaskStateTransition"("createdAt");

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStateTransition" ADD CONSTRAINT "TaskStateTransition_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStateTransition" ADD CONSTRAINT "TaskStateTransition_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TaskAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
