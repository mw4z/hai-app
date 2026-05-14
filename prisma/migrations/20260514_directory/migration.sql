-- Neighborhood Directory (دليل الحي) — additive migration only.
--
-- Apply to Supabase manually (the Vercel build skips
-- `prisma migrate deploy` per project_db_migrations memory).
-- Until this lands on prod, every directory API will hit a
-- runtime Prisma error from the missing tables / enums.

-- ─── Enums ──────────────────────────────────────────────────────────
CREATE TYPE "PlaceCategory" AS ENUM (
  'RESTAURANT_CAFE',
  'PHARMACY',
  'SUPERMARKET',
  'CAR_WASH',
  'LAUNDRY',
  'CLINIC',
  'SCHOOL_KINDERGARTEN',
  'QURAN_CIRCLE',
  'GAS_STATION',
  'SHOP_SERVICES',
  'GYM_CENTER',
  'SALON',
  'OTHER'
);

-- COMMUNITY_VERIFIED intentionally NOT in the enum — reserved for
-- Phase 1.5 alongside the PlaceConfirmation model.
CREATE TYPE "PlaceStatus" AS ENUM (
  'PENDING',
  'VISIBLE_UNVERIFIED',
  'MOD_VERIFIED',
  'CLAIMED_BY_OWNER',
  'REJECTED',
  'REMOVED'
);

CREATE TYPE "PlaceClaimStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "PlaceReportType" AS ENUM (
  'WRONG_INFO',
  'CLOSED',
  'DUPLICATE',
  'WRONG_LOCATION',
  'WRONG_PHONE',
  'SPAM',
  'OTHER'
);

-- ─── PlaceListing ───────────────────────────────────────────────────
CREATE TABLE "PlaceListing" (
  "id"              TEXT             PRIMARY KEY,
  "neighborhoodId"  TEXT             NOT NULL REFERENCES "Neighborhood"("id"),
  "name"            TEXT             NOT NULL,
  "nameNormalized"  TEXT             NOT NULL,
  "category"        "PlaceCategory"  NOT NULL,
  "description"     TEXT,
  "phone"           TEXT,
  "whatsapp"        TEXT,
  "website"         TEXT,
  "instagram"       TEXT,
  "mapUrl"          TEXT,
  "latitude"        DOUBLE PRECISION,
  "longitude"       DOUBLE PRECISION,
  "addressText"     TEXT,
  "openingHours"    TEXT,
  "imageUrls"       TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status"          "PlaceStatus"    NOT NULL DEFAULT 'PENDING',
  "createdByUserId" TEXT             REFERENCES "User"("id"),
  "claimedByUserId" TEXT             REFERENCES "User"("id"),
  "verifiedByModId" TEXT             REFERENCES "User"("id"),
  "verifiedAt"      TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)     NOT NULL
);
CREATE INDEX "PlaceListing_neighborhoodId_category_status_idx"
  ON "PlaceListing" ("neighborhoodId", "category", "status");
CREATE INDEX "PlaceListing_neighborhoodId_status_createdAt_idx"
  ON "PlaceListing" ("neighborhoodId", "status", "createdAt");
CREATE INDEX "PlaceListing_neighborhoodId_nameNormalized_category_idx"
  ON "PlaceListing" ("neighborhoodId", "nameNormalized", "category");
CREATE INDEX "PlaceListing_claimedByUserId_idx"
  ON "PlaceListing" ("claimedByUserId");
CREATE INDEX "PlaceListing_createdByUserId_idx"
  ON "PlaceListing" ("createdByUserId");

-- ─── PlaceClaimRequest ──────────────────────────────────────────────
CREATE TABLE "PlaceClaimRequest" (
  "id"              TEXT               PRIMARY KEY,
  "placeId"         TEXT               NOT NULL REFERENCES "PlaceListing"("id"),
  "userId"          TEXT               NOT NULL REFERENCES "User"("id"),
  "message"         TEXT,
  "evidenceUrls"    TEXT[]             NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status"          "PlaceClaimStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById"    TEXT               REFERENCES "User"("id"),
  "reviewedAt"      TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt"       TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)       NOT NULL
);
CREATE INDEX "PlaceClaimRequest_placeId_status_idx"
  ON "PlaceClaimRequest" ("placeId", "status");
CREATE INDEX "PlaceClaimRequest_userId_status_idx"
  ON "PlaceClaimRequest" ("userId", "status");

-- ─── PlaceReport ────────────────────────────────────────────────────
CREATE TABLE "PlaceReport" (
  "id"        TEXT              PRIMARY KEY,
  "placeId"   TEXT              NOT NULL REFERENCES "PlaceListing"("id"),
  "userId"    TEXT              NOT NULL REFERENCES "User"("id"),
  "type"      "PlaceReportType" NOT NULL,
  "message"   TEXT,
  "createdAt" TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlaceReport_placeId_idx"
  ON "PlaceReport" ("placeId");
CREATE INDEX "PlaceReport_userId_createdAt_idx"
  ON "PlaceReport" ("userId", "createdAt");
