UPDATE "PositionFieldDefinition"
SET
  "defaultValue" = '"长沙"'::jsonb,
  "autoFillRule" = '{"source":"STATIC","value":"长沙"}'::jsonb,
  "aiExtractable" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'city'
  AND (
    "autoFillRule" IS NULL
    OR "autoFillRule" = '{}'::jsonb
    OR "autoFillRule"->>'source' = 'NONE'
  );
