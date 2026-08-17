ALTER TABLE "Project"
  ADD COLUMN "sourceOpportunityId" TEXT,
  ADD COLUMN "governanceStatus" TEXT NOT NULL DEFAULT 'LEGACY_APPROVED',
  ADD COLUMN "pausedReason" TEXT,
  ADD COLUMN "planVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "approvedPlanVersion" INTEGER,
  ADD COLUMN "planApprovedAt" TIMESTAMP(3),
  ADD COLUMN "planApprovedBy" TEXT;

ALTER TABLE "Task"
  ALTER COLUMN "assignedAgent" SET DEFAULT 'human-owner';
UPDATE "Task" SET "assignedAgent" = 'human-owner' WHERE "assignedAgent" IS NULL;
ALTER TABLE "Task"
  ALTER COLUMN "assignedAgent" SET NOT NULL,
  ADD COLUMN "department" TEXT NOT NULL DEFAULT 'operations',
  ADD COLUMN "requiredInputs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "dependencyTaskIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "validationCriteria" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "resultSummary" TEXT,
  ADD COLUMN "dueAt" TIMESTAMP(3),
  ADD COLUMN "blockedReason" TEXT;

CREATE TABLE "ProjectPlan" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "content" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "materialChange" BOOLEAN NOT NULL DEFAULT false,
  "changeSummary" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "supersedesId" TEXT,
  CONSTRAINT "ProjectPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_sourceOpportunityId_key" ON "Project"("sourceOpportunityId");
CREATE INDEX "Project_companyId_governanceStatus_idx" ON "Project"("companyId", "governanceStatus");
CREATE UNIQUE INDEX "ProjectPlan_projectId_version_key" ON "ProjectPlan"("projectId", "version");
CREATE UNIQUE INDEX "ProjectPlan_projectId_contentHash_key" ON "ProjectPlan"("projectId", "contentHash");
CREATE INDEX "ProjectPlan_projectId_status_idx" ON "ProjectPlan"("projectId", "status");
ALTER TABLE "Project" ADD CONSTRAINT "Project_sourceOpportunityId_fkey" FOREIGN KEY ("sourceOpportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectPlan" ADD CONSTRAINT "ProjectPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
