-- Neighborhood Directory — reviews + denormalized rating summary.
--
-- Apply on Supabase manually before the deployed code uses any
-- of the new fields (Vercel build skips `prisma migrate deploy`
-- per project_db_migrations memory). Until applied, every
-- /api/directory/[id] read will 500 once the deploy lands.
--
-- All additive. Defaults zero out ratingAvg / ratingCount on
-- existing rows; no backfill needed.

-- ── Enum ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "PlaceReviewStatus" AS ENUM ('VISIBLE', 'HIDDEN_BY_MOD', 'DELETED_BY_USER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── PlaceReview ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PlaceReview" (
  "id"                 TEXT                PRIMARY KEY,
  "placeId"            TEXT                NOT NULL REFERENCES "PlaceListing"("id"),
  "userId"             TEXT                NOT NULL REFERENCES "User"("id"),
  "rating"             INTEGER             NOT NULL,
  "body"               TEXT,
  "ownerReplyBody"     TEXT,
  "ownerReplyByUserId" TEXT                REFERENCES "User"("id"),
  "ownerReplyAt"       TIMESTAMP(3),
  "status"             "PlaceReviewStatus" NOT NULL DEFAULT 'VISIBLE',
  "createdAt"          TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)        NOT NULL,
  -- Server validates rating 1..5 too; CHECK is a belt-and-
  -- suspenders so a bypassed Prisma write can't corrupt data.
  CONSTRAINT "PlaceReview_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlaceReview_placeId_userId_key"
  ON "PlaceReview" ("placeId", "userId");
CREATE INDEX        IF NOT EXISTS "PlaceReview_placeId_status_createdAt_idx"
  ON "PlaceReview" ("placeId", "status", "createdAt");
CREATE INDEX        IF NOT EXISTS "PlaceReview_userId_createdAt_idx"
  ON "PlaceReview" ("userId", "createdAt");

-- ── PlaceListing review summary ───────────────────────────────────
ALTER TABLE "PlaceListing"
  ADD COLUMN IF NOT EXISTS "ratingAvg"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ratingCount" INTEGER          NOT NULL DEFAULT 0;
