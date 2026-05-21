-- Raw Google opening periods (for an accurate open/closed pill that
-- handles shifts + per-day-varying hours). Apply on Supabase.

ALTER TABLE "PlaceListing"
  ADD COLUMN IF NOT EXISTS "googlePeriods" JSONB;
