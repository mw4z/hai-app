-- ════════════════════════════════════════════════════════════════════
-- Phase-1 verification queries. Run BEFORE applying Phase 2 backfill.
-- ════════════════════════════════════════════════════════════════════

-- 1) Snapshot the legacy distribution (will be compared against Phase
--    2's post-backfill counts).
SELECT category AS legacy_category, COUNT(*) AS n
FROM "Post"
GROUP BY category
ORDER BY n DESC;

-- 2) Confirm new columns exist and are entirely NULL on newCategory
--    (defaults applied for the others).
SELECT
  COUNT(*)                                         AS total_posts,
  COUNT("newCategory")                             AS rows_with_new_category,
  COUNT(*) - COUNT("newCategory")                  AS rows_unmigrated,
  COUNT(*) FILTER (WHERE "intent"   IS NOT NULL)   AS rows_with_intent_default,
  COUNT(*) FILTER (WHERE "priority" IS NOT NULL)   AS rows_with_priority_default,
  COUNT(*) FILTER (WHERE "audience" IS NOT NULL)   AS rows_with_audience_default
FROM "Post";

-- 3) NotificationPreference table is empty until createDefaultPreferences()
--    is called per-user (lazily on first read).
SELECT COUNT(*) AS prefs_count FROM "NotificationPreference";
