-- PlaceReview reports + denormalized reportCount.
--
-- Mirrors the existing Report model (post reports) so the UX
-- and mod flow are familiar. Auto-hide threshold = 3 distinct
-- reporters; threshold enforcement lives in the API route
-- inside the same txn as the report insert.
--
-- Apply on Supabase manually (Vercel skips prisma migrate deploy).

CREATE TABLE IF NOT EXISTS "PlaceReviewReport" (
  "id"         TEXT          PRIMARY KEY,
  "reason"     "ReportReason" NOT NULL,
  "details"    TEXT,
  "reporterId" TEXT          NOT NULL REFERENCES "User"("id"),
  "reviewId"   TEXT          NOT NULL REFERENCES "PlaceReview"("id"),
  "status"     "ReportStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlaceReviewReport_reporterId_reviewId_key"
  ON "PlaceReviewReport" ("reporterId", "reviewId");
CREATE INDEX        IF NOT EXISTS "PlaceReviewReport_reviewId_status_idx"
  ON "PlaceReviewReport" ("reviewId", "status");

ALTER TABLE "PlaceReview"
  ADD COLUMN IF NOT EXISTS "reportCount" INTEGER NOT NULL DEFAULT 0;
