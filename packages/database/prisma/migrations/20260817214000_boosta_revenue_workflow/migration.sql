-- CreateTable
CREATE TABLE "BoostaWorkspace" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "brainSummary" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoostaWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaBrainVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoostaBrainVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaAuthor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "biography" TEXT NOT NULL,
    "website" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'NEEDS_VERIFICATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoostaAuthor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaBook" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "isbn" TEXT,
    "format" TEXT,
    "pageCount" INTEGER,
    "publicationDate" TIMESTAMP(3),
    "language" TEXT NOT NULL DEFAULT 'sv',
    "categories" TEXT[],
    "keywords" TEXT[],
    "metadataStatus" TEXT NOT NULL DEFAULT 'NEEDS_VERIFICATION',
    "priceMinor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoostaBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaAgentRole" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "allowedTools" TEXT[],
    "expectedInputs" TEXT[],
    "expectedOutputs" TEXT[],
    "qualityStandards" TEXT[],
    "humanApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoostaAgentRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaArtifact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "missionId" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "agentRunId" TEXT,
    "title" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoostaArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "BoostaReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaWorkflowApproval" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "artifactId" TEXT,
    "taskId" TEXT,
    "approvalType" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "comments" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "BoostaWorkflowApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaDistributionSubmission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "retailer" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "checklist" JSONB NOT NULL,
    "response" TEXT,
    "followUpAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoostaDistributionSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaEmailSubscriber" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "consentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "consentAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "bookInterest" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoostaEmailSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaEmailCampaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bookId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "consentRequired" BOOLEAN NOT NULL DEFAULT true,
    "sequence" JSONB NOT NULL,
    "attributedRevenueMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoostaEmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaFunnelEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sessionId" TEXT,
    "email" TEXT,
    "bookId" TEXT,
    "campaign" TEXT,
    "source" TEXT,
    "valueMinor" BIGINT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "BoostaFunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaMarketingExperiment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bookId" TEXT,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "variants" JSONB NOT NULL,
    "dailyBudgetMinor" BIGINT NOT NULL DEFAULT 0,
    "totalBudgetMinor" BIGINT NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL DEFAULT 0,
    "killCriteria" TEXT[],
    "scaleCriteria" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "spendMinor" BIGINT NOT NULL DEFAULT 0,
    "results" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoostaMarketingExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaOffer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bookId" TEXT,
    "name" TEXT NOT NULL,
    "offerType" TEXT NOT NULL,
    "priceMinor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoostaOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaB2BOpportunity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "contact" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'LEAD',
    "offer" TEXT NOT NULL,
    "copies" INTEGER,
    "valueMinor" BIGINT,
    "expectedCloseAt" TIMESTAMP(3),
    "proposal" JSONB,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "owner" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoostaB2BOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaWeeklyReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "revenueMinor" BIGINT NOT NULL DEFAULT 0,
    "traffic" INTEGER NOT NULL DEFAULT 0,
    "checkoutStarts" INTEGER NOT NULL DEFAULT 0,
    "emailSignups" INTEGER NOT NULL DEFAULT 0,
    "adSpendMinor" BIGINT NOT NULL DEFAULT 0,
    "adResults" JSONB,
    "retailerProgress" JSONB,
    "observations" TEXT,
    "reviewerOutput" JSONB,
    "brainChanges" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoostaWeeklyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostaRevenueAttribution" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "economicEventId" TEXT,
    "productId" TEXT,
    "offerId" TEXT,
    "channel" TEXT,
    "campaign" TEXT,
    "landingPage" TEXT,
    "emailCampaignId" TEXT,
    "grossMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "refundMinor" BIGINT NOT NULL DEFAULT 0,
    "estimatedCostMinor" BIGINT NOT NULL DEFAULT 0,
    "netMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNCONFIRMED',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoostaRevenueAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoostaWorkspace_companyId_key" ON "BoostaWorkspace"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BoostaWorkspace_slug_key" ON "BoostaWorkspace"("slug");

-- CreateIndex
CREATE INDEX "BoostaWorkspace_companyId_status_idx" ON "BoostaWorkspace"("companyId", "status");

-- CreateIndex
CREATE INDEX "BoostaBrainVersion_workspaceId_status_idx" ON "BoostaBrainVersion"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BoostaBrainVersion_workspaceId_version_key" ON "BoostaBrainVersion"("workspaceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BoostaAuthor_workspaceId_name_key" ON "BoostaAuthor"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "BoostaBook_workspaceId_metadataStatus_idx" ON "BoostaBook"("workspaceId", "metadataStatus");

-- CreateIndex
CREATE UNIQUE INDEX "BoostaBook_workspaceId_title_key" ON "BoostaBook"("workspaceId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "BoostaAgentRole_workspaceId_key_key" ON "BoostaAgentRole"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "BoostaArtifact_workspaceId_status_createdAt_idx" ON "BoostaArtifact"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BoostaArtifact_missionId_projectId_taskId_idx" ON "BoostaArtifact"("missionId", "projectId", "taskId");

-- CreateIndex
CREATE INDEX "BoostaReview_workspaceId_decision_idx" ON "BoostaReview"("workspaceId", "decision");

-- CreateIndex
CREATE INDEX "BoostaWorkflowApproval_workspaceId_decision_idx" ON "BoostaWorkflowApproval"("workspaceId", "decision");

-- CreateIndex
CREATE INDEX "BoostaDistributionSubmission_workspaceId_status_idx" ON "BoostaDistributionSubmission"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BoostaDistributionSubmission_bookId_retailer_key" ON "BoostaDistributionSubmission"("bookId", "retailer");

-- CreateIndex
CREATE INDEX "BoostaEmailSubscriber_workspaceId_consentStatus_idx" ON "BoostaEmailSubscriber"("workspaceId", "consentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "BoostaEmailSubscriber_workspaceId_email_key" ON "BoostaEmailSubscriber"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "BoostaEmailCampaign_workspaceId_status_idx" ON "BoostaEmailCampaign"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "BoostaFunnelEvent_workspaceId_eventType_occurredAt_idx" ON "BoostaFunnelEvent"("workspaceId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "BoostaMarketingExperiment_workspaceId_status_idx" ON "BoostaMarketingExperiment"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "BoostaOffer_workspaceId_status_idx" ON "BoostaOffer"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "BoostaB2BOpportunity_workspaceId_stage_idx" ON "BoostaB2BOpportunity"("workspaceId", "stage");

-- CreateIndex
CREATE INDEX "BoostaWeeklyReview_workspaceId_status_idx" ON "BoostaWeeklyReview"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BoostaWeeklyReview_workspaceId_weekStart_key" ON "BoostaWeeklyReview"("workspaceId", "weekStart");

-- CreateIndex
CREATE INDEX "BoostaRevenueAttribution_workspaceId_occurredAt_idx" ON "BoostaRevenueAttribution"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "BoostaRevenueAttribution_workspaceId_paymentStatus_idx" ON "BoostaRevenueAttribution"("workspaceId", "paymentStatus");

-- AddForeignKey
ALTER TABLE "BoostaBrainVersion" ADD CONSTRAINT "BoostaBrainVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaAuthor" ADD CONSTRAINT "BoostaAuthor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaBook" ADD CONSTRAINT "BoostaBook_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaBook" ADD CONSTRAINT "BoostaBook_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "BoostaAuthor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaAgentRole" ADD CONSTRAINT "BoostaAgentRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaArtifact" ADD CONSTRAINT "BoostaArtifact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaReview" ADD CONSTRAINT "BoostaReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaReview" ADD CONSTRAINT "BoostaReview_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "BoostaArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaWorkflowApproval" ADD CONSTRAINT "BoostaWorkflowApproval_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaWorkflowApproval" ADD CONSTRAINT "BoostaWorkflowApproval_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "BoostaArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaDistributionSubmission" ADD CONSTRAINT "BoostaDistributionSubmission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaDistributionSubmission" ADD CONSTRAINT "BoostaDistributionSubmission_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "BoostaBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaEmailSubscriber" ADD CONSTRAINT "BoostaEmailSubscriber_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaEmailCampaign" ADD CONSTRAINT "BoostaEmailCampaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaFunnelEvent" ADD CONSTRAINT "BoostaFunnelEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaMarketingExperiment" ADD CONSTRAINT "BoostaMarketingExperiment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaOffer" ADD CONSTRAINT "BoostaOffer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaB2BOpportunity" ADD CONSTRAINT "BoostaB2BOpportunity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaWeeklyReview" ADD CONSTRAINT "BoostaWeeklyReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostaRevenueAttribution" ADD CONSTRAINT "BoostaRevenueAttribution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "BoostaWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

