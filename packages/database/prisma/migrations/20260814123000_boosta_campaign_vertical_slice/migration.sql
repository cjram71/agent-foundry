ALTER TABLE "EditorialJob"
  ADD COLUMN "missionId" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verification" JSONB;

CREATE UNIQUE INDEX "EditorialJob_missionId_key" ON "EditorialJob"("missionId");
CREATE INDEX "EditorialJob_missionId_status_idx" ON "EditorialJob"("missionId", "status");

ALTER TABLE "EditorialJob"
  ADD CONSTRAINT "EditorialJob_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "Mission"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
