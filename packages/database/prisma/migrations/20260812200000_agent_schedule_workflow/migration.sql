ALTER TABLE "ProjectAgent" ADD COLUMN "n8nWorkflowId" TEXT;
CREATE UNIQUE INDEX "ProjectAgent_n8nWorkflowId_key" ON "ProjectAgent"("n8nWorkflowId");
