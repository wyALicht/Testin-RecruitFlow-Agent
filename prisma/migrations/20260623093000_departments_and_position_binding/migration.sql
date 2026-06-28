CREATE TABLE "Department" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");
CREATE INDEX "Department_active_sortOrder_idx" ON "Department"("active", "sortOrder");

ALTER TABLE "Position" ADD COLUMN "departmentId" TEXT;
CREATE INDEX "Position_departmentId_idx" ON "Position"("departmentId");

INSERT INTO "Department" ("id", "name", "active", "sortOrder", "createdAt", "updatedAt")
SELECT
  'dept_' || substr(md5(trim(p."department")), 1, 16),
  trim(p."department"),
  TRUE,
  (row_number() OVER (ORDER BY trim(p."department")) - 1)::integer,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "department"
  FROM "Position"
  WHERE "department" IS NOT NULL AND trim("department") <> ''
) p;

UPDATE "Position" p
SET "departmentId" = d."id"
FROM "Department" d
WHERE trim(p."department") = d."name";

ALTER TABLE "Position"
  ADD CONSTRAINT "Position_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
