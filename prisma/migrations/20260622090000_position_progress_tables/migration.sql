-- CreateEnum
CREATE TYPE "PositionFieldType" AS ENUM (
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'MONEY',
  'DATE',
  'DATETIME',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'BOOLEAN',
  'USER',
  'FILE',
  'LINK',
  'RATING'
);

-- CreateEnum
CREATE TYPE "PositionFieldScope" AS ENUM ('CANDIDATE', 'APPLICATION', 'SYSTEM');

-- CreateTable
CREATE TABLE "RecruitmentApplication" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "ownerId" TEXT,
    "ownerName" TEXT,
    "source" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customValues" JSONB NOT NULL DEFAULT '{}',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "lastFollowUpAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionFieldDefinition" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "PositionFieldType" NOT NULL,
    "scope" "PositionFieldScope" NOT NULL DEFAULT 'APPLICATION',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "aiExtractable" BOOLEAN NOT NULL DEFAULT false,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "defaultValue" JSONB,
    "validationRules" JSONB,
    "autoFillRule" JSONB,
    "conflictPolicy" TEXT NOT NULL DEFAULT 'FILL_EMPTY',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 160,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositionFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationFieldChange" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "confidence" DOUBLE PRECISION,
    "rawInputId" TEXT,
    "agentTaskId" TEXT,
    "operatorId" TEXT,
    "operatorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationFieldChange_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "RecruitmentLog" ADD COLUMN "applicationId" TEXT;
ALTER TABLE "RawInput" ADD COLUMN "applicationId" TEXT;
ALTER TABLE "AgentTask" ADD COLUMN "applicationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentApplication_candidateId_positionId_key"
  ON "RecruitmentApplication"("candidateId", "positionId");
CREATE INDEX "RecruitmentApplication_candidateId_idx" ON "RecruitmentApplication"("candidateId");
CREATE INDEX "RecruitmentApplication_positionId_idx" ON "RecruitmentApplication"("positionId");
CREATE INDEX "RecruitmentApplication_status_idx" ON "RecruitmentApplication"("status");
CREATE INDEX "RecruitmentApplication_ownerId_idx" ON "RecruitmentApplication"("ownerId");
CREATE INDEX "RecruitmentApplication_appliedAt_idx" ON "RecruitmentApplication"("appliedAt");
CREATE INDEX "RecruitmentApplication_deletedAt_idx" ON "RecruitmentApplication"("deletedAt");
CREATE UNIQUE INDEX "PositionFieldDefinition_positionId_key_key"
  ON "PositionFieldDefinition"("positionId", "key");
CREATE INDEX "PositionFieldDefinition_positionId_active_sortOrder_idx"
  ON "PositionFieldDefinition"("positionId", "active", "sortOrder");
CREATE INDEX "ApplicationFieldChange_applicationId_idx" ON "ApplicationFieldChange"("applicationId");
CREATE INDEX "ApplicationFieldChange_fieldKey_idx" ON "ApplicationFieldChange"("fieldKey");
CREATE INDEX "ApplicationFieldChange_createdAt_idx" ON "ApplicationFieldChange"("createdAt");
CREATE INDEX "RecruitmentLog_applicationId_idx" ON "RecruitmentLog"("applicationId");
CREATE INDEX "RawInput_applicationId_idx" ON "RawInput"("applicationId");
CREATE INDEX "AgentTask_applicationId_idx" ON "AgentTask"("applicationId");

-- AddForeignKey
ALTER TABLE "RecruitmentApplication"
  ADD CONSTRAINT "RecruitmentApplication_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentApplication"
  ADD CONSTRAINT "RecruitmentApplication_positionId_fkey"
  FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PositionFieldDefinition"
  ADD CONSTRAINT "PositionFieldDefinition_positionId_fkey"
  FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationFieldChange"
  ADD CONSTRAINT "ApplicationFieldChange_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentLog"
  ADD CONSTRAINT "RecruitmentLog_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RawInput"
  ADD CONSTRAINT "RawInput_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentTask"
  ADD CONSTRAINT "AgentTask_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill one application for every legacy candidate that already has a position.
INSERT INTO "RecruitmentApplication" (
  "id",
  "candidateId",
  "positionId",
  "status",
  "source",
  "appliedAt",
  "lastFollowUpAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'app_' || md5(c."id" || ':' || c."positionId"),
  c."id",
  c."positionId",
  c."status",
  c."source",
  c."createdAt",
  c."lastFollowUpAt",
  c."createdAt",
  c."updatedAt"
FROM "Candidate" c
WHERE c."positionId" IS NOT NULL
ON CONFLICT ("candidateId", "positionId") DO NOTHING;

-- Associate legacy history with the backfilled application.
UPDATE "RecruitmentLog" l
SET "applicationId" = a."id"
FROM "RecruitmentApplication" a
WHERE l."candidateId" = a."candidateId"
  AND l."applicationId" IS NULL;

UPDATE "RawInput" r
SET "applicationId" = a."id"
FROM "RecruitmentApplication" a
WHERE r."candidateId" = a."candidateId"
  AND r."applicationId" IS NULL;

UPDATE "AgentTask" t
SET "applicationId" = a."id"
FROM "RecruitmentApplication" a
WHERE t."candidateId" = a."candidateId"
  AND t."applicationId" IS NULL;
