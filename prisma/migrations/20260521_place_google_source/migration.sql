-- Google Places provenance + snapshot on PlaceListing.
-- Apply on Supabase before the deploy lands (Vercel skips
-- `prisma migrate deploy`).

DO $$ BEGIN
  CREATE TYPE "PlaceSource" AS ENUM ('LOCAL', 'GOOGLE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "PlaceListing"
  ADD COLUMN IF NOT EXISTS "source"            "PlaceSource" NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS "googlePlaceId"     TEXT,
  ADD COLUMN IF NOT EXISTS "googleRating"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "googleRatingCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "googleHours"       TEXT,
  ADD COLUMN IF NOT EXISTS "googlePhotoRefs"   TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "googleSyncedAt"    TIMESTAMP(3);
