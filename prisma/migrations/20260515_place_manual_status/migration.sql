-- Owner-editable place status — additive only.
--
-- manualStatus      override text shown verbatim as the pill
-- manualStatusUntil optional auto-clear timestamp; readers
--                   ignore the override when in the past
--
-- Apply on Supabase manually (Vercel build skips
-- `prisma migrate deploy`).

ALTER TABLE "PlaceListing"
  ADD COLUMN IF NOT EXISTS "manualStatus"      TEXT,
  ADD COLUMN IF NOT EXISTS "manualStatusUntil" TIMESTAMP(3);
