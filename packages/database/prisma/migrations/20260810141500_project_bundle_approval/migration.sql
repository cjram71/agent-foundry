ALTER TABLE "ProjectRun" ADD COLUMN "executionApprovedAt" TIMESTAMP(3), ADD COLUMN "approvedBy" TEXT;
CREATE INDEX "ProjectRun_status_executionApprovedAt_idx" ON "ProjectRun"("status", "executionApprovedAt");
