-- Outside-neighborhood posting: mark whether the author was a resident
-- of the post's neighborhood at creation. OUTSIDE_REQUEST is request-only
-- and never boosted/pushed (see the gate in /api/posts). Applied to
-- Supabase by hand on 2026-05-22 (Vercel skips prisma migrate deploy).

DO $$ BEGIN
  CREATE TYPE "PostOriginScope" AS ENUM ('RESIDENT', 'OUTSIDE_REQUEST');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "originScope" "PostOriginScope" NOT NULL DEFAULT 'RESIDENT';
