-- ServiceItem visibility flags — additive only.
--
-- Adds per-item booleans so claimed place owners can choose
-- where each catalog item appears (profile, place, or both).
-- Defaults to TRUE for both so existing rows preserve their
-- current behaviour: items keep showing on profile AND on the
-- claimed place.
--
-- Apply on Supabase manually (Vercel build skips
-- `prisma migrate deploy` per the project_db_migrations memory).
-- Until applied, every PATCH/SELECT that references these new
-- columns will hit a Prisma error.

ALTER TABLE "ServiceItem"
  ADD COLUMN IF NOT EXISTS "showOnProfile" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "showOnPlace"   BOOLEAN NOT NULL DEFAULT true;
