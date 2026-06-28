UPDATE "PositionFieldDefinition"
SET
  "aiExtractable" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'city'
  AND "autoFillRule"->>'source' = 'STATIC';
