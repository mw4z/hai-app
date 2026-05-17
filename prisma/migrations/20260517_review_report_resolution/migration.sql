-- PlaceReviewReport resolution audit fields.
--
-- Additive only. Reuses the existing ReportStatus enum
-- (PENDING / REVIEWED / DISMISSED / ACTION_TAKEN). No new
-- enum needed; the mod dashboard treats ACTION_TAKEN as
-- "the review was hidden because of this report" and
-- DISMISSED as "the report was rejected as not actionable".
--
-- Apply on Supabase manually (Vercel skips
-- `prisma migrate deploy`).

ALTER TABLE "PlaceReviewReport"
  ADD COLUMN IF NOT EXISTS "resolvedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedById"  TEXT REFERENCES "User"("id");

-- Mod-dashboard pending-list index. Already covered by
-- (reviewId, status) for the per-review lookup; this one
-- powers the global "all pending" listing ordered by
-- recency.
CREATE INDEX IF NOT EXISTS "PlaceReviewReport_status_createdAt_idx"
  ON "PlaceReviewReport" ("status", "createdAt");
