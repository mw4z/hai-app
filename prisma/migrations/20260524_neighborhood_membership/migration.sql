-- Neighborhood membership states (claimed-resident support).
-- MANUAL prod migration: apply to Supabase BY HAND before deploying the
-- code that reads these columns (Vercel build skips `prisma migrate deploy`).
-- Safe to re-run: every statement is IF NOT EXISTS / guarded.

-- ── Enums ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "Membership" AS ENUM ('VERIFIED_RESIDENT', 'CLAIMED_RESIDENT', 'OUTSIDE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "NeighborhoodClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── User columns ────────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "membership" "Membership" NOT NULL DEFAULT 'OUTSIDE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "homeClaimedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "homeChangeCooldownUntil" TIMESTAMP(3);

-- ── Backfill ────────────────────────────────────────────────────────────
-- GPS/mod-verified users → VERIFIED_RESIDENT.
UPDATE "User" SET "membership" = 'VERIFIED_RESIDENT'
  WHERE "addressVerified" = true AND "membership" <> 'VERIFIED_RESIDENT';
-- Users who manually picked a home but were never verified → CLAIMED_RESIDENT
-- (they keep their chosen neighborhood and gain limited rights).
UPDATE "User" SET "membership" = 'CLAIMED_RESIDENT'
  WHERE "addressVerified" = false AND "neighborhoodId" IS NOT NULL
    AND "membership" = 'OUTSIDE';

-- ── NeighborhoodClaim (mod review queue + audit log) ──────────────────────
CREATE TABLE IF NOT EXISTS "NeighborhoodClaim" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "neighborhoodId" TEXT NOT NULL,
  "status"         "NeighborhoodClaimStatus" NOT NULL DEFAULT 'PENDING',
  "note"           TEXT,
  "reviewedById"   TEXT,
  "reviewedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NeighborhoodClaim_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NeighborhoodClaim_status_idx" ON "NeighborhoodClaim"("status");
CREATE INDEX IF NOT EXISTS "NeighborhoodClaim_neighborhoodId_status_idx" ON "NeighborhoodClaim"("neighborhoodId", "status");
CREATE INDEX IF NOT EXISTS "NeighborhoodClaim_userId_idx" ON "NeighborhoodClaim"("userId");

DO $$ BEGIN
  ALTER TABLE "NeighborhoodClaim" ADD CONSTRAINT "NeighborhoodClaim_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "NeighborhoodClaim" ADD CONSTRAINT "NeighborhoodClaim_neighborhoodId_fkey"
    FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "NeighborhoodClaim" ADD CONSTRAINT "NeighborhoodClaim_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
