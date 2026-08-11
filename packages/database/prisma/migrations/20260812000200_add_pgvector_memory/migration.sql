CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "MemoryRecord"
  ADD COLUMN "businessId" TEXT,
  ADD COLUMN "sourceReference" TEXT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "confidence" DOUBLE PRECISION,
  ADD COLUMN "trustLevel" TEXT NOT NULL DEFAULT 'untrusted',
  ADD COLUMN "observedAt" TIMESTAMP(3),
  ADD COLUMN "reviewAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "embeddingModel" TEXT,
  ADD COLUMN "embeddingVersion" TEXT,
  ADD COLUMN "embedding" vector(1536),
  ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("summary", '') || ' ' || coalesce("content"::text, ''))) STORED;

CREATE INDEX "MemoryRecord_projectId_trustLevel_idx" ON "MemoryRecord"("projectId", "trustLevel");
CREATE INDEX "MemoryRecord_businessId_trustLevel_idx" ON "MemoryRecord"("businessId", "trustLevel");
CREATE INDEX "MemoryRecord_searchVector_idx" ON "MemoryRecord" USING GIN ("searchVector");
CREATE INDEX "MemoryRecord_embedding_hnsw_idx" ON "MemoryRecord" USING hnsw ("embedding" vector_cosine_ops);
