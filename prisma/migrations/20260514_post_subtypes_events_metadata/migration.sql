-- Phase 1 structured post metadata. Additive only — no existing column
-- is altered, no row is rewritten, no NOT NULL is added. Safe under the
-- "Prisma migrations are manual on prod" memory note.
--
-- ROLLOUT ORDER (mandatory):
--   1. Apply this SQL via Supabase SQL Editor.
--   2. Verify with:
--        SELECT column_name FROM information_schema.columns
--         WHERE table_name = 'Post'
--           AND column_name IN ('realEstateType','civicType',
--                               'eventStartAt','eventEndAt','eventLocation');
--      Expect 5 rows.
--   3. Deploy the code that references these columns.
--   4. (Optional) Flip NEXT_PUBLIC_STRUCTURED_POST_METADATA=1 in Vercel
--      to enable UI subtype chips on PostCard.
--
-- ROLLBACK: drop the columns + types. Not needed in normal flow.

CREATE TYPE "RealEstateType" AS ENUM (
  'APARTMENT_RENT',
  'APARTMENT_SALE',
  'VILLA_RENT',
  'VILLA_SALE',
  'LAND_SALE',
  'COMMERCIAL_SHOP',
  'WAREHOUSE',
  'WANTED'
);

CREATE TYPE "CivicType" AS ENUM (
  'TRAFFIC_SAFETY',
  'INFRASTRUCTURE',
  'PUBLIC_SERVICES',
  'ENVIRONMENT',
  'PROPOSAL',
  'COMPLAINT'
);

ALTER TABLE "Post"
  ADD COLUMN "realEstateType" "RealEstateType",
  ADD COLUMN "civicType"      "CivicType",
  ADD COLUMN "eventStartAt"   TIMESTAMP(3),
  ADD COLUMN "eventEndAt"     TIMESTAMP(3),
  ADD COLUMN "eventLocation"  TEXT;
