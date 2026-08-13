CREATE TYPE "EditorialStatus" AS ENUM ('INBOX', 'DRAFTING', 'AWAITING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PREPARING_PUBLICATION', 'READY_TO_PUBLISH', 'PUBLISHED', 'FAILED', 'CANCELLED');
CREATE TABLE "EditorialJob" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "status" "EditorialStatus" NOT NULL DEFAULT 'INBOX', "sourcePath" TEXT NOT NULL,
  "draftPath" TEXT, "approvedPath" TEXT, "publicationPath" TEXT,
  "sourceLanguage" TEXT NOT NULL DEFAULT 'sv', "targetLanguages" TEXT[] DEFAULT ARRAY['sv', 'en']::TEXT[],
  "destinations" TEXT[] DEFAULT ARRAY['website']::TEXT[], "instructions" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0, "errorMessage" TEXT, "approvalRequestedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3), "approvedBy" TEXT, "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EditorialJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EditorialJob_sourcePath_key" ON "EditorialJob"("sourcePath");
CREATE INDEX "EditorialJob_companyId_status_createdAt_idx" ON "EditorialJob"("companyId", "status", "createdAt");
CREATE INDEX "EditorialJob_status_updatedAt_idx" ON "EditorialJob"("status", "updatedAt");
ALTER TABLE "EditorialJob" ADD CONSTRAINT "EditorialJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
