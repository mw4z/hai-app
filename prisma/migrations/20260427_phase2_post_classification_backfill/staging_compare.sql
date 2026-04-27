-- ════════════════════════════════════════════════════════════════════
-- Staging soak — before/after distribution comparison.
--
-- WORKFLOW:
--   1. BEFORE applying Phase 2, run section [SNAPSHOT] to capture the
--      legacy distribution into a temp table.
--   2. Apply Phase 2 migration.
--   3. Run section [COMPARE] to verify counts line up. Any row in the
--      diff means a legacy category got remapped in a way that changed
--      the row count for that bucket — investigate before promoting
--      to prod.
--
--   4. Run section [GENERAL_AUDIT] last. The GENERAL bucket should
--      ONLY contain posts whose legacy category was already GENERAL.
--      If anything else lands there, the explicit mapping missed it
--      and Phase 2 should have failed via the blocking guard — but
--      double-check anyway.
-- ════════════════════════════════════════════════════════════════════

-- ── [SNAPSHOT] run BEFORE Phase 2 ────────────────────────────────────
-- DROP TABLE IF EXISTS post_legacy_snapshot;
-- CREATE TABLE post_legacy_snapshot AS
-- SELECT category::text AS legacy_category, COUNT(*) AS legacy_count
-- FROM "Post"
-- GROUP BY category;


-- ── [COMPARE] run AFTER Phase 2 ──────────────────────────────────────
-- Expected mapping (every legacy bucket lands in exactly one v2 bucket
-- per the explicit table in 2D's classifyLegacy() helper). Joins the
-- snapshot to the actual post-backfill distribution and surfaces any
-- counts that disagree.
WITH expected AS (
  SELECT * FROM (VALUES
    ('FOOD_HOME',          'HOME_BUSINESSES'),
    ('MARKETPLACE',        'MARKETPLACE'),
    ('SERVICES',           'SERVICES'),
    ('REAL_ESTATE',        'REAL_ESTATE'),
    ('LOST_FOUND',         'LOST_FOUND'),
    ('RIDE_REQUEST',       'RIDES'),
    ('LOOKING_FOR',        'SERVICES'),
    ('NEIGHBORHOOD_ISSUE', 'NEIGHBORHOOD_REPORTS'),
    ('ALERT',              'NEIGHBORHOOD_REPORTS'),
    ('MOSQUE',             'EVENTS'),
    ('EID_RAMADAN',        'EVENTS'),
    ('CONTESTS',           'COMPETITIONS'),
    ('WOMEN_ONLY',         'SERVICES'),
    ('GENERAL',            'GENERAL')
  ) AS t(legacy, expected_new)
),
actual AS (
  SELECT category::text AS legacy_category,
         "newCategory"::text AS actual_new,
         COUNT(*) AS n
  FROM "Post"
  GROUP BY category, "newCategory"
)
SELECT
  s.legacy_category,
  s.legacy_count,
  e.expected_new,
  a.actual_new,
  COALESCE(a.n, 0) AS actual_count,
  CASE
    WHEN s.legacy_count = COALESCE(a.n, 0) AND e.expected_new = a.actual_new THEN 'OK'
    WHEN e.expected_new <> a.actual_new THEN 'MAPPING_MISMATCH'
    ELSE 'COUNT_DRIFT'
  END AS verdict
FROM post_legacy_snapshot s
LEFT JOIN expected e ON e.legacy = s.legacy_category
LEFT JOIN actual   a ON a.legacy_category = s.legacy_category
ORDER BY verdict DESC, s.legacy_category;


-- ── [GENERAL_AUDIT] run AFTER Phase 2 ────────────────────────────────
-- The only legitimate inhabitants of newCategory='GENERAL' are posts
-- whose legacy category was already GENERAL. Anything else means the
-- explicit mapping missed.
-- EXPECTED: only one row, with legacy='GENERAL'.
SELECT category AS legacy, COUNT(*) AS n
FROM "Post"
WHERE "newCategory" = 'GENERAL'
GROUP BY category
ORDER BY n DESC;


-- ── Total sanity ─────────────────────────────────────────────────────
-- EXPECTED: legacy_total = new_total = same as before backfill.
SELECT
  (SELECT COUNT(*) FROM "Post")                             AS total_now,
  (SELECT SUM(legacy_count) FROM post_legacy_snapshot)      AS total_at_snapshot,
  (SELECT COUNT(*) FROM "Post" WHERE "newCategory" IS NULL) AS still_null_must_be_zero;
