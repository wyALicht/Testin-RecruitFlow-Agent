CREATE TABLE "RecruitmentImportBatch" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    CONSTRAINT "RecruitmentImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecruitmentImportEntry" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "applicationId" TEXT,
    "candidateId" TEXT,
    "beforeCandidate" JSONB,
    "beforeApplication" JSONB,
    "appliedCandidateAt" TIMESTAMP(3),
    "appliedApplicationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecruitmentImportEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecruitmentImportBatch_positionId_createdAt_idx"
ON "RecruitmentImportBatch"("positionId", "createdAt");

CREATE INDEX "RecruitmentImportBatch_status_idx"
ON "RecruitmentImportBatch"("status");

CREATE INDEX "RecruitmentImportEntry_batchId_idx"
ON "RecruitmentImportEntry"("batchId");

CREATE INDEX "RecruitmentImportEntry_applicationId_idx"
ON "RecruitmentImportEntry"("applicationId");

CREATE INDEX "RecruitmentImportEntry_candidateId_idx"
ON "RecruitmentImportEntry"("candidateId");

ALTER TABLE "RecruitmentImportBatch"
ADD CONSTRAINT "RecruitmentImportBatch_positionId_fkey"
FOREIGN KEY ("positionId") REFERENCES "Position"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruitmentImportEntry"
ADD CONSTRAINT "RecruitmentImportEntry_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "RecruitmentImportBatch"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
