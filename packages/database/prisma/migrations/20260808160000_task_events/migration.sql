-- P6 slice 1: task event log.
--
-- Additive migration: the 24-type TaskEventType enum and the append-only
-- TaskEvent table (the task-workflow domain log; see docs/EVENTS.md).
-- No existing tables, columns, or rows are touched. TaskEvent.payload and
-- TaskEvent.actor follow AuditEvent conventions; attemptId is ON DELETE
-- SET NULL so deleting an attempt never deletes history, and taskId is
-- ON DELETE CASCADE like every other task-owned table.

-- CreateEnum
CREATE TYPE "TaskEventType" AS ENUM ('task_created', 'task_queued', 'planning_started', 'plan_generated', 'plan_approval_requested', 'plan_approved', 'plan_rejected', 'execution_started', 'code_generated', 'validation_started', 'validation_passed', 'validation_failed', 'review_started', 'review_passed', 'review_failed', 'draft_pr_opened', 'preview_ready', 'final_approval_requested', 'final_approved', 'final_rejected', 'task_completed', 'task_failed', 'task_cancelled', 'task_state_changed');

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attemptId" TEXT,
    "type" "TaskEventType" NOT NULL,
    "actor" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "correlationId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_idx" ON "TaskEvent"("taskId");

-- CreateIndex
CREATE INDEX "TaskEvent_type_idx" ON "TaskEvent"("type");

-- CreateIndex
CREATE INDEX "TaskEvent_correlationId_idx" ON "TaskEvent"("correlationId");

-- CreateIndex
CREATE INDEX "TaskEvent_createdAt_idx" ON "TaskEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TaskAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
