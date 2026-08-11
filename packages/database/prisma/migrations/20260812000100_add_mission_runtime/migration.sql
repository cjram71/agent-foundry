CREATE TABLE "Mission" (
  "id" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "goal" TEXT NOT NULL,
  "contextSummary" TEXT,
  "constraints" TEXT[],
  "deliverables" TEXT[],
  "definitionOfDone" TEXT[],
  "failureConditions" TEXT[],
  "riskLevel" TEXT NOT NULL,
  "budgetUsd" DOUBLE PRECISION NOT NULL,
  "tokenBudget" INTEGER NOT NULL,
  "maxParallelTasks" INTEGER NOT NULL,
  "allowedToolClasses" TEXT[],
  "approvalRules" TEXT[],
  "deadline" TIMESTAMP(3),
  "projectId" TEXT,
  "businessId" TEXT,
  "provenance" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MissionTask" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MissionTask_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MissionApproval" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "approvalType" TEXT NOT NULL,
  "decision" TEXT NOT NULL DEFAULT 'pending',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "decidedBy" TEXT,
  "comments" TEXT,
  CONSTRAINT "MissionApproval_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MissionEvent" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "actorType" TEXT NOT NULL DEFAULT 'system',
  "correlationId" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MissionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Mission_projectId_status_idx" ON "Mission"("projectId", "status");
CREATE INDEX "Mission_businessId_status_idx" ON "Mission"("businessId", "status");
CREATE INDEX "Mission_createdAt_idx" ON "Mission"("createdAt");
CREATE UNIQUE INDEX "MissionTask_taskId_key" ON "MissionTask"("taskId");
CREATE UNIQUE INDEX "MissionTask_missionId_sequence_key" ON "MissionTask"("missionId", "sequence");
CREATE INDEX "MissionTask_missionId_idx" ON "MissionTask"("missionId");
CREATE INDEX "MissionApproval_missionId_decision_idx" ON "MissionApproval"("missionId", "decision");
CREATE INDEX "MissionEvent_missionId_createdAt_idx" ON "MissionEvent"("missionId", "createdAt");
CREATE INDEX "MissionEvent_correlationId_idx" ON "MissionEvent"("correlationId");
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionTask" ADD CONSTRAINT "MissionTask_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionTask" ADD CONSTRAINT "MissionTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionApproval" ADD CONSTRAINT "MissionApproval_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionEvent" ADD CONSTRAINT "MissionEvent_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
