ALTER TABLE "Position" ADD COLUMN "positionCreatedAt" TIMESTAMP(3);

UPDATE "Position"
SET "positionCreatedAt" = "createdAt"
WHERE "positionCreatedAt" IS NULL;

ALTER TABLE "Position"
ALTER COLUMN "positionCreatedAt" SET NOT NULL,
ALTER COLUMN "positionCreatedAt" SET DEFAULT CURRENT_TIMESTAMP;
