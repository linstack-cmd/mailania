-- repair-revision-index.sql
-- Fixes suggestion_revision rows where revision_index has bad values
-- (e.g., -11, -111, "01") caused by a JS string concatenation bug.
--
-- Strategy: per conversation, re-number revision_index as 0..N-1
-- in created_at order. Safe and idempotent — running multiple times
-- produces the same result.
--
-- Run with: psql "$DATABASE_URL" -f scripts/repair-revision-index.sql

-- Use a CTE to compute the correct index per conversation
WITH numbered AS (
  SELECT
    "id",
    "conversation_id",
    ROW_NUMBER() OVER (
      PARTITION BY "conversation_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) - 1 AS correct_index
  FROM "suggestion_revision"
)
UPDATE "suggestion_revision" sr
SET "revision_index" = n.correct_index
FROM numbered n
WHERE sr."id" = n."id"
  AND sr."revision_index" != n.correct_index;

-- Report how many rows were fixed
-- (CockroachDB / Postgres will show "UPDATE N" in the output)
