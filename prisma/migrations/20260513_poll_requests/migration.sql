-- Phase 1: resident-submitted poll requests (mod-reviewed).
-- Direct Poll creation stays admin-only; this table holds the
-- pre-approval suggestion + the post-approval audit trail.
--
-- Apply to Supabase manually (Vercel build does NOT run prisma migrate
-- deploy — see project_db_migrations memory). Then:
--   npx prisma migrate resolve --applied 20260513_poll_requests

CREATE TYPE "PollRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "PollRequest" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "neighborhoodId"  TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "description"     TEXT,
    "options"         TEXT[] NOT NULL,
    "reason"          TEXT,
    "status"          "PollRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById"    TEXT,
    "reviewedAt"      TIMESTAMP(3),
    "rejectionReason" TEXT,
    "titleOriginal"   TEXT,
    "optionsOriginal" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "approvedPollId"  TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PollRequest_neighborhoodId_status_createdAt_idx"
    ON "PollRequest" ("neighborhoodId", "status", "createdAt");

CREATE INDEX "PollRequest_userId_createdAt_idx"
    ON "PollRequest" ("userId", "createdAt");

ALTER TABLE "PollRequest"
    ADD CONSTRAINT "PollRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PollRequest"
    ADD CONSTRAINT "PollRequest_neighborhoodId_fkey"
    FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PollRequest"
    ADD CONSTRAINT "PollRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
