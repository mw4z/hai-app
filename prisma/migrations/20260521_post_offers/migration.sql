-- User-marked offers ("عروض") + optional old/new pricing.
-- Already applied to Supabase by hand on 2026-05-21 (Vercel skips
-- prisma migrate deploy). isOffer is the canonical Offers filter flag
-- (feed chip + Market Offers tab); originalPrice is the optional "was"
-- price shown struck-through next to Post.price.

ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "isOffer" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "originalPrice" DOUBLE PRECISION;
