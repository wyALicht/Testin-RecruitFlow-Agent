-- Configure HR to use the current logged-in user for existing positions.
UPDATE "PositionFieldDefinition"
SET
  "autoFillRule" = '{"source":"CURRENT_USER"}'::jsonb,
  "defaultValue" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'hr'
  AND ("autoFillRule" IS NULL OR "autoFillRule" = '{}'::jsonb);

-- Add a city field with the requested default value for existing positions.
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
  'field_city_' || substr(md5(p."id"), 1, 12),
  p."id",
  'city',
  '城市',
  'TEXT'::"PositionFieldType",
  'APPLICATION'::"PositionFieldScope",
  false,
  true,
  true,
  true,
  false,
  '[]'::jsonb,
  '"长沙"'::jsonb,
  '{"source":"STATIC","value":"长沙"}'::jsonb,
  'FILL_EMPTY',
  2,
  140,
  1,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Position" p
WHERE p."deletedAt" IS NULL
ON CONFLICT ("positionId", "key") DO NOTHING;
