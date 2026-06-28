ALTER TABLE "Candidate" ADD COLUMN "education" TEXT;

UPDATE "PositionFieldDefinition"
SET
  "fieldType" = 'FILE',
  "autoFillRule" = '{"source":"AI_RESUME"}'::jsonb,
  "aiExtractable" = TRUE,
  "editable" = FALSE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  lower("key") IN ('resume', 'resume_file', 'resume_link', 'cv')
  OR "label" IN ('简历', '简历文件', '简历链接');

UPDATE "PositionFieldDefinition"
SET
  "autoFillRule" = '{"source":"AI_RESUME"}'::jsonb,
  "aiExtractable" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  lower("key") IN ('education', 'highest_education', 'degree')
  OR "label" IN ('学历', '最高学历', '教育程度');

INSERT INTO "PositionFieldDefinition" (
  "id",
  "positionId",
  "key",
  "label",
  "fieldType",
  "scope",
  "required",
  "visible",
  "editable",
  "aiExtractable",
  "system",
  "options",
  "defaultValue",
  "validationRules",
  "autoFillRule",
  "conflictPolicy",
  "sortOrder",
  "width",
  "schemaVersion",
  "active",
  "createdAt",
  "updatedAt"
)
SELECT
  'field_' || substr(md5(random()::text || p."id"), 1, 16),
  p."id",
  'education',
  '最高学历',
  'TEXT',
  'CANDIDATE',
  FALSE,
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  '[]'::jsonb,
  NULL,
  NULL,
  '{"source":"AI_RESUME"}'::jsonb,
  'FILL_EMPTY',
  COALESCE((SELECT MAX(f."sortOrder") + 1 FROM "PositionFieldDefinition" f WHERE f."positionId" = p."id"), 0),
  140,
  1,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Position" p
WHERE p."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "PositionFieldDefinition" f
    WHERE f."positionId" = p."id"
      AND f."active" = TRUE
      AND (
        lower(f."key") IN ('education', 'highest_education', 'degree')
        OR f."label" IN ('学历', '最高学历', '教育程度')
      )
  );
