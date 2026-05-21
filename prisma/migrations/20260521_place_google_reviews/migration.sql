-- Google reviews snapshot column on PlaceListing.
-- Apply on Supabase before the deploy lands.

ALTER TABLE "PlaceListing"
  ADD COLUMN IF NOT EXISTS "googleReviews" JSONB;
