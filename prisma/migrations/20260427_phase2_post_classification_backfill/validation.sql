-- ════════════════════════════════════════════════════════════════════
-- Phase-2 deep validation. Run on STAGING after the backfill migration
-- and the existing verify.sql / staging_compare.sql pass clean.
--
-- Five focused checks. The final SELECT prints a single PASS/FAIL line
-- per check so the staging operator can see at a glance whether
-- anything diverged from expectations. Any row with status='FAIL' is
-- a hard stop — investigate before promoting to prod or starting
-- Phase 3 dual-write rollout.
-- ════════════════════════════════════════════════════════════════════

-- ── 1) Intent distribution ──────────────────────────────────────────
-- Expectations:
--   • REQUEST count ≈ legacy LOOKING_FOR + legacy RIDE_REQUEST count
--   • OFFER     = 0 (Phase 2 never sets OFFER — the new UI introduces it)
--   • NORMAL    = remaining rows
\echo
\echo '─── 1) Intent distribution ──────────────────────────────────────'
SELECT intent, COUNT(*) AS n
FROM "Post"
GROUP BY intent
ORDER BY n DESC;

\echo
\echo 'Expected REQUEST count = legacy(LOOKING_FOR + RIDE_REQUEST):'
SELECT
  (SELECT COUNT(*) FROM "Post" WHERE intent = 'REQUEST') AS actual_request,
  (SELECT COUNT(*) FROM "Post" WHERE category IN ('LOOKING_FOR', 'RIDE_REQUEST')) AS expected_request;


-- ── 2) Priority distribution sanity ─────────────────────────────────
-- Expectations:
--   • HIGH count ≈ legacy(LOST_FOUND + NEIGHBORHOOD_ISSUE + ALERT)
--   • CRITICAL = 0 (CRITICAL is reserved for the EmergencyAlert model;
--                   Phase 2 never sets it on Post)
--   • NORMAL  = remaining rows
--   • LOW     = 0 (no Phase 2 path sets LOW)
\echo
\echo '─── 2) Priority distribution ────────────────────────────────────'
SELECT priority, COUNT(*) AS n
FROM "Post"
GROUP BY priority
ORDER BY n DESC;

\echo
\echo 'Expected HIGH count = legacy(LOST_FOUND + NEIGHBORHOOD_ISSUE + ALERT):'
SELECT
  (SELECT COUNT(*) FROM "Post" WHERE priority = 'HIGH') AS actual_high,
  (SELECT COUNT(*) FROM "Post" WHERE category IN ('LOST_FOUND', 'NEIGHBORHOOD_ISSUE', 'ALERT')) AS expected_high;


-- ── 3) Audience distribution ────────────────────────────────────────
-- Expectations:
--   • WOMEN count = legacy WOMEN_ONLY count
--   • MEN   count = 0 (no legacy bucket maps to MEN)
--   • ALL   count = total - WOMEN
\echo
\echo '─── 3) Audience distribution ────────────────────────────────────'
SELECT audience, COUNT(*) AS n
FROM "Post"
GROUP BY audience
ORDER BY n DESC;

\echo
\echo 'Expected WOMEN count = legacy WOMEN_ONLY:'
SELECT
  (SELECT COUNT(*) FROM "Post" WHERE audience = 'WOMEN') AS actual_women,
  (SELECT COUNT(*) FROM "Post" WHERE category = 'WOMEN_ONLY') AS expected_women;


-- ── 4) Cross-field consistency: REQUEST vs category ─────────────────
-- !!! MIGRATION-TIME ONLY — NOT a permanent business rule !!!
-- Once the new composer ships, RIDES will legitimately support both
-- OFFER and REQUEST, and REQUEST will exist in categories beyond
-- {RIDES, SERVICES}. These two checks (#8 and #9) only verify that
-- the Phase 2 backfill produced the EXACT shape implied by the
-- legacy → v2 mapping table — they MUST be removed (or relaxed) the
-- moment the new composer goes live.
-- Expectations DURING migration:
--   • Every RIDES row has intent = REQUEST
--     (legacy RIDE_REQUEST is the ONLY mapping into RIDES today, and
--      that mapping always sets intent = REQUEST)
--   • Every REQUEST row's category ∈ {RIDES, SERVICES}
--     (RIDE_REQUEST → RIDES; LOOKING_FOR → SERVICES)
\echo
\echo '─── 4) Cross-field consistency (REQUEST vs category) ────────────'
SELECT "newCategory" AS category, intent, COUNT(*) AS n
FROM "Post"
GROUP BY "newCategory", intent
ORDER BY "newCategory", intent;

\echo
\echo 'Suspicious rows (RIDES with non-REQUEST intent):'
SELECT id, category AS legacy, "newCategory", intent
FROM "Post"
WHERE "newCategory" = 'RIDES' AND intent <> 'REQUEST'
LIMIT 20;

\echo
\echo 'Suspicious rows (REQUEST with category not in {RIDES, SERVICES}):'
SELECT id, category AS legacy, "newCategory", intent
FROM "Post"
WHERE intent = 'REQUEST' AND "newCategory" NOT IN ('RIDES', 'SERVICES')
LIMIT 20;


-- ── 5) Explicit GENERAL row inspection ──────────────────────────────
-- Expectations:
--   • The ONLY rows in newCategory = GENERAL are those whose legacy
--     category was literally 'GENERAL'. Anything else means a mapping
--     gap that the Phase 2 blocking guard should have caught — but
--     verify here directly anyway.
\echo
\echo '─── 5) GENERAL row inspection ───────────────────────────────────'
SELECT category AS legacy_category, COUNT(*) AS n
FROM "Post"
WHERE "newCategory" = 'GENERAL'
GROUP BY category
ORDER BY n DESC;

\echo
\echo 'Sample (up to 20) of GENERAL rows whose legacy category was NOT GENERAL:'
SELECT id, category AS legacy, "newCategory", intent, priority, audience, "createdAt"
FROM "Post"
WHERE "newCategory" = 'GENERAL' AND category <> 'GENERAL'
ORDER BY "createdAt" DESC
LIMIT 20;


-- ════════════════════════════════════════════════════════════════════
-- Final summary — one row per check with PASS/FAIL.
--
-- Operator: a single FAIL = stop. Don't move to Phase 3 until every
-- row reads PASS. Most failures point at either (a) a legacy category
-- value missing from the Phase 2 mapping table or (b) data outside the
-- expected enum (rare, but possible if anything ever wrote raw SQL).
-- ════════════════════════════════════════════════════════════════════
\echo
\echo '═══ FINAL SUMMARY ═══════════════════════════════════════════════'
WITH counts AS (
  SELECT
    (SELECT COUNT(*) FROM "Post" WHERE intent = 'REQUEST')                                            AS actual_req,
    (SELECT COUNT(*) FROM "Post" WHERE category IN ('LOOKING_FOR','RIDE_REQUEST'))                    AS expected_req,
    (SELECT COUNT(*) FROM "Post" WHERE intent = 'OFFER')                                              AS actual_offer,
    (SELECT COUNT(*) FROM "Post" WHERE priority = 'HIGH')                                             AS actual_high,
    (SELECT COUNT(*) FROM "Post" WHERE category IN ('LOST_FOUND','NEIGHBORHOOD_ISSUE','ALERT'))       AS expected_high,
    (SELECT COUNT(*) FROM "Post" WHERE priority = 'CRITICAL')                                         AS actual_crit,
    (SELECT COUNT(*) FROM "Post" WHERE priority = 'LOW')                                              AS actual_low,
    (SELECT COUNT(*) FROM "Post" WHERE audience = 'WOMEN')                                            AS actual_women,
    (SELECT COUNT(*) FROM "Post" WHERE category = 'WOMEN_ONLY')                                       AS expected_women,
    (SELECT COUNT(*) FROM "Post" WHERE audience = 'MEN')                                              AS actual_men,
    (SELECT COUNT(*) FROM "Post" WHERE "newCategory" = 'RIDES' AND intent <> 'REQUEST')               AS rides_not_request,
    (SELECT COUNT(*) FROM "Post" WHERE intent = 'REQUEST' AND "newCategory" NOT IN ('RIDES','SERVICES')) AS request_outside_buckets,
    (SELECT COUNT(*) FROM "Post" WHERE "newCategory" = 'GENERAL' AND category <> 'GENERAL')           AS general_misroutes
)
SELECT check_name, status, detail FROM (
  SELECT
    '1. intent.REQUEST = legacy(LOOKING_FOR + RIDE_REQUEST)' AS check_name,
    CASE WHEN actual_req = expected_req THEN 'PASS' ELSE 'FAIL' END AS status,
    format('actual=%s expected=%s', actual_req, expected_req) AS detail,
    1 AS ord
  FROM counts
  UNION ALL
  SELECT
    '2. intent.OFFER = 0 (set by new UI only)',
    CASE WHEN actual_offer = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('actual=%s', actual_offer),
    2
  FROM counts
  UNION ALL
  SELECT
    '3. priority.HIGH = legacy(LOST_FOUND + NEIGHBORHOOD_ISSUE + ALERT)',
    CASE WHEN actual_high = expected_high THEN 'PASS' ELSE 'FAIL' END,
    format('actual=%s expected=%s', actual_high, expected_high),
    3
  FROM counts
  UNION ALL
  SELECT
    '4. priority.CRITICAL = 0 (Post never carries CRITICAL — EmergencyAlert does)',
    CASE WHEN actual_crit = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('actual=%s', actual_crit),
    4
  FROM counts
  UNION ALL
  SELECT
    '5. priority.LOW = 0 (no Phase 2 mapping sets LOW)',
    CASE WHEN actual_low = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('actual=%s', actual_low),
    5
  FROM counts
  UNION ALL
  SELECT
    '6. audience.WOMEN = legacy WOMEN_ONLY count',
    CASE WHEN actual_women = expected_women THEN 'PASS' ELSE 'FAIL' END,
    format('actual=%s expected=%s', actual_women, expected_women),
    6
  FROM counts
  UNION ALL
  SELECT
    '7. audience.MEN = 0 (no legacy bucket maps to MEN)',
    CASE WHEN actual_men = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('actual=%s', actual_men),
    7
  FROM counts
  UNION ALL
  SELECT
    '8. [MIGRATION-ONLY] RIDES rows all have intent = REQUEST',
    CASE WHEN rides_not_request = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('violations=%s — DROP THIS CHECK once new composer ships (RIDES will support OFFER too)', rides_not_request),
    8
  FROM counts
  UNION ALL
  SELECT
    '9. [MIGRATION-ONLY] REQUEST rows live in {RIDES, SERVICES} only',
    CASE WHEN request_outside_buckets = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('violations=%s — DROP THIS CHECK once new composer ships (REQUEST may exist in any category)', request_outside_buckets),
    9
  FROM counts
  UNION ALL
  SELECT
    '10. GENERAL bucket holds only legacy=GENERAL rows',
    CASE WHEN general_misroutes = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('misroutes=%s', general_misroutes),
    10
  FROM counts
) AS report
ORDER BY ord;
