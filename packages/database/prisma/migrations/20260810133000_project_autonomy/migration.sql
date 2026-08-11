CREATE TYPE "ProjectRunStatus" AS ENUM ('RUNNING', 'READY_FOR_REVIEW', 'COMPLETED', 'PAUSED', 'FAILED', 'CANCELLED');
ALTER TABLE "ProjectPolicy" ADD COLUMN "autonomousMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "autoApproveMaxRisk" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN "maxParallelTasks" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "maxRepairAttempts" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "maxTasksPerRun" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN "maxTaskCost" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
ADD COLUMN "maxProjectRunCost" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
ADD COLUMN "createDraftPullRequests" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "ProjectRun" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "status" "ProjectRunStatus" NOT NULL DEFAULT 'RUNNING',
  "objective" TEXT NOT NULL,
  "report" JSONB,
  "recommendations" JSONB,
  "tasksTotal" INTEGER NOT NULL DEFAULT 0,
  "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
  "tasksFailed" INTEGER NOT NULL DEFAULT 0,
  "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "startedBy" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectRun_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Task" ADD COLUMN "projectRunId" TEXT;
CREATE INDEX "ProjectRun_projectId_status_idx" ON "ProjectRun"("projectId", "status");
CREATE INDEX "ProjectRun_startedAt_idx" ON "ProjectRun"("startedAt");
CREATE INDEX "Task_projectRunId_state_idx" ON "Task"("projectRunId", "state");
ALTER TABLE "ProjectRun" ADD CONSTRAINT "ProjectRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectRunId_fkey" FOREIGN KEY ("projectRunId") REFERENCES "ProjectRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
