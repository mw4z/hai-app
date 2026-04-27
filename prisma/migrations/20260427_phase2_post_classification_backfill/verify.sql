-- ════════════════════════════════════════════════════════════════════
-- Phase-2 verification. Run AFTER the backfill migration.
-- Each query has an EXPECTED outcome — if reality diverges, STOP and
-- investigate before moving to Phase 3.
-- ════════════════════════════════════════════════════════════════════

-- 1) Zero rows should still be NULL on newCategory.
-- EXPECTED: 0
SELECT COUNT(*) AS still_null
FROM "Post"
WHERE "newCategory" IS NULL;

-- 2) Every row should have intent/priority/audience set.
-- EXPECTED: 0, 0, 0
SELECT
  COUNT(*) FILTER (WHERE "intent"   IS NULL) AS null_intent,
  COUNT(*) FILTER (WHERE "priority" IS NULL) AS null_priority,
  COUNT(*) FILTER (WHERE "audience" IS NULL) AS null_audience
FROM "Post";

-- 3) Counts before/after — old vs new distribution. The totals MUST
--    match (we never add or drop rows during backfill).
-- EXPECTED: legacy_total = new_total
SELECT
  (SELECT COUNT(*) FROM "Post")                                AS legacy_total,
  (SELECT COUNT(*) FROM "Post" WHERE "newCategory" IS NOT NULL) AS new_total;

-- 4) New-category breakdown. Eyeball this — anything unexpected
--    landing in GENERAL is a sign of a mapping miss.
SELECT "newCategory", COUNT(*) AS n
FROM "Post"
GROUP BY "newCategory"
ORDER BY n DESC;

-- 5) Cross-tab: legacy → new. Confirms the explicit mapping table.
SELECT category AS legacy, "newCategory" AS new_cat, COUNT(*) AS n
FROM "Post"
GROUP BY category, "newCategory"
ORDER BY category, n DESC;

-- 6) Intent/priority/audience secondary signals.
SELECT "newCategory", intent, priority, audience, COUNT(*) AS n
FROM "Post"
GROUP BY "newCategory", intent, priority, audience
ORDER BY "newCategory", n DESC;

-- 7) Hard guardrail: no row should have a non-default secondary signal
--    that contradicts its category (e.g. RIDES with intent=NORMAL is
--    suspicious because all legacy ride posts were REQUEST).
-- EXPECTED: 0
SELECT COUNT(*) AS suspicious_rides
FROM "Post"
WHERE "newCategory" = 'RIDES' AND intent = 'NORMAL';
