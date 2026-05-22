-- New place category: استراحات وقاعات (rest houses & event halls).
-- Applied to Supabase by hand on 2026-05-22 (Vercel skips migrate deploy).
ALTER TYPE "PlaceCategory" ADD VALUE IF NOT EXISTS 'RESTHOUSE_HALL' BEFORE 'OTHER';
