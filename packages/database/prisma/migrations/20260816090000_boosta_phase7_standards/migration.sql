-- CreateTable
CREATE TABLE "StandardRegistry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "editionVerifiedAt" TIMESTAMP(3),
    "scope" TEXT NOT NULL,
    "departments" TEXT[],
    "controls" JSONB NOT NULL,
    "process" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "testFrequencyDays" INTEGER NOT NULL,
    "exceptions" TEXT[],
    "correctiveActions" TEXT[],
    "nextReviewAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandardRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlEvidence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "standardId" TEXT NOT NULL,
    "controlKey" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "process" TEXT NOT NULL,
    "evidenceRefs" TEXT[],
    "testMethod" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "exception" TEXT,
    "correctiveAction" TEXT,
    "testedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeReview" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "expected" JSONB NOT NULL,
    "actual" JSONB NOT NULL,
    "dimensions" TEXT[],
    "evidenceRefs" TEXT[],
    "reviewedBy" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonLearned" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "outcomeReviewId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "evidenceRefs" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonLearned_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprovementProposal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "proposedChange" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNotes" TEXT,

    CONSTRAINT "ImprovementProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRecommendation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "evidenceRefs" TEXT[],
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "expiresAt" TIMESTAMP(3),
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StandardRegistry_companyId_status_nextReviewAt_idx" ON "StandardRegistry"("companyId", "status", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "StandardRegistry_companyId_framework_edition_key" ON "StandardRegistry"("companyId", "framework", "edition");

-- CreateIndex
CREATE INDEX "ControlEvidence_companyId_result_expiresAt_idx" ON "ControlEvidence"("companyId", "result", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ControlEvidence_standardId_controlKey_testedAt_key" ON "ControlEvidence"("standardId", "controlKey", "testedAt");

-- CreateIndex
CREATE INDEX "OutcomeReview_companyId_projectId_reviewedAt_idx" ON "OutcomeReview"("companyId", "projectId", "reviewedAt");

-- CreateIndex
CREATE INDEX "LessonLearned_companyId_createdAt_idx" ON "LessonLearned"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ImprovementProposal_companyId_status_targetType_idx" ON "ImprovementProposal"("companyId", "status", "targetType");

-- CreateIndex
CREATE INDEX "AgentRecommendation_companyId_agentId_status_idx" ON "AgentRecommendation"("companyId", "agentId", "status");

-- CreateIndex
CREATE INDEX "AgentRecommendation_expiresAt_status_idx" ON "AgentRecommendation"("expiresAt", "status");

-- AddForeignKey
ALTER TABLE "StandardRegistry" ADD CONSTRAINT "StandardRegistry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlEvidence" ADD CONSTRAINT "ControlEvidence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlEvidence" ADD CONSTRAINT "ControlEvidence_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "StandardRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeReview" ADD CONSTRAINT "OutcomeReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonLearned" ADD CONSTRAINT "LessonLearned_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonLearned" ADD CONSTRAINT "LessonLearned_outcomeReviewId_fkey" FOREIGN KEY ("outcomeReviewId") REFERENCES "OutcomeReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementProposal" ADD CONSTRAINT "ImprovementProposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementProposal" ADD CONSTRAINT "ImprovementProposal_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "LessonLearned"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRecommendation" ADD CONSTRAINT "AgentRecommendation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
