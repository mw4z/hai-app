-- Directory contributions + reputation events. Applied to Supabase by
-- hand on 2026-05-22 (Vercel skips migrate deploy).

DO $$ BEGIN CREATE TYPE "DirectoryContributionType" AS ENUM ('CREATE_PLACE','EDIT_PLACE','ADD_PHOTO','FIX_LOCATION','ADD_CONTACT','REPORT_DUPLICATE','REPORT_CLOSED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "DirectoryContributionStatus" AS ENUM ('PENDING_REVIEW','APPROVED','REJECTED','DUPLICATE','NEEDS_EDIT'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "DirectoryContribution" (
  "id" TEXT PRIMARY KEY,
  "type" "DirectoryContributionType" NOT NULL,
  "status" "DirectoryContributionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "contributorId" TEXT NOT NULL,
  "placeId" TEXT,
  "neighborhoodId" TEXT NOT NULL,
  "payloadJson" JSONB,
  "potentialDuplicate" BOOLEAN NOT NULL DEFAULT false,
  "reviewNote" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DirectoryContribution_nbhd_status_created_idx" ON "DirectoryContribution"("neighborhoodId","status","createdAt");
CREATE INDEX IF NOT EXISTS "DirectoryContribution_contributor_created_idx" ON "DirectoryContribution"("contributorId","createdAt");
CREATE INDEX IF NOT EXISTS "DirectoryContribution_place_idx" ON "DirectoryContribution"("placeId");

CREATE TABLE IF NOT EXISTS "ReputationEvent" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReputationEvent_source_key" ON "ReputationEvent"("sourceType","sourceId");
CREATE INDEX IF NOT EXISTS "ReputationEvent_user_created_idx" ON "ReputationEvent"("userId","createdAt");

DO $$ BEGIN ALTER TABLE "DirectoryContribution" ADD CONSTRAINT "DirectoryContribution_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "DirectoryContribution" ADD CONSTRAINT "DirectoryContribution_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "PlaceListing"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "DirectoryContribution" ADD CONSTRAINT "DirectoryContribution_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "DirectoryContribution" ADD CONSTRAINT "DirectoryContribution_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ReputationEvent" ADD CONSTRAINT "ReputationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
