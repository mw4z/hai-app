-- Expand directory social fields beyond Instagram.
-- Saudi market: Snapchat and TikTok are at least as common as
-- Instagram for local-business follows. Adding three nullable
-- columns alongside the existing PlaceListing.instagram so the
-- detail page can render a real social row instead of a lonely
-- Instagram link.
--
-- Apply manually on Supabase per project_db_migrations memory
-- (Vercel build skips `prisma migrate deploy`). Until applied,
-- any read on PlaceListing with `include` or no explicit `select`
-- will 500 because the generated Prisma Client expects these
-- columns to exist.

ALTER TABLE "PlaceListing"
  ADD COLUMN IF NOT EXISTS "snapchat" TEXT,
  ADD COLUMN IF NOT EXISTS "tiktok"   TEXT,
  ADD COLUMN IF NOT EXISTS "x"        TEXT;
