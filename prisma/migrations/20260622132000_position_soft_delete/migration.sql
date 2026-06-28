-- AlterTable
ALTER TABLE "Position" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Position_deletedAt_idx" ON "Position"("deletedAt");
