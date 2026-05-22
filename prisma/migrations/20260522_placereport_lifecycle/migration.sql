-- PlaceReport lifecycle (status + review fields). Applied to Supabase by
-- hand on 2026-05-22 (Vercel skips migrate deploy). Existing reports
-- default to PENDING.

DO $$ BEGIN CREATE TYPE "PlaceReportStatus" AS ENUM ('PENDING','ACCEPTED','DISMISSED','ACTIONED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "PlaceReport" ADD COLUMN IF NOT EXISTS "status" "PlaceReportStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "PlaceReport" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "PlaceReport" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "PlaceReport" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;
ALTER TABLE "PlaceReport" ADD COLUMN IF NOT EXISTS "actionType" TEXT;

CREATE INDEX IF NOT EXISTS "PlaceReport_place_status_idx" ON "PlaceReport"("placeId","status");
CREATE INDEX IF NOT EXISTS "PlaceReport_status_created_idx" ON "PlaceReport"("status","createdAt");

DO $$ BEGIN ALTER TABLE "PlaceReport" ADD CONSTRAINT "PlaceReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
