CREATE TYPE "PositionRecruitmentStatus" AS ENUM ('NORMAL', 'DELAYED', 'PAUSED');

CREATE TYPE "PositionPriority" AS ENUM ('HIGHEST', 'MEDIUM_HIGH', 'REGULAR');

ALTER TABLE "Position"
  ADD COLUMN "recruitmentStatus" "PositionRecruitmentStatus" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "priority" "PositionPriority" NOT NULL DEFAULT 'REGULAR';

CREATE INDEX "Position_recruitmentStatus_idx" ON "Position"("recruitmentStatus");

CREATE INDEX "Position_priority_idx" ON "Position"("priority");
