-- ════════════════════════════════════════════════════════════════════
-- Phase 1: Additive schema for the post-classification v2 refactor.
-- ════════════════════════════════════════════════════════════════════
--   • Adds new enums (PostCategoryV2, PostIntent, PostPriority,
--     PostAudience).
--   • Adds nullable columns to Post: newCategory, intent, priority,
--     audience.
--   • Creates NotificationPreference table.
--   • DOES NOT touch the existing Post.category column.
--   • DOES NOT drop or rename anything.
--
-- Rollback for this phase: see 20260427_phase1_post_classification_v2_rollback.sql
-- ════════════════════════════════════════════════════════════════════

-- ── New enums ────────────────────────────────────────────────────────
CREATE TYPE "PostCategoryV2" AS ENUM (
  'HOME_BUSINESSES',
  'MARKETPLACE',
  'SERVICES',
  'RIDES',
  'REAL_ESTATE',
  'LOST_FOUND',
  'NEIGHBORHOOD_REPORTS',
  'EVENTS',
  'COMPETITIONS',
  'GENERAL'
);

CREATE TYPE "PostIntent" AS ENUM (
  'OFFER',
  'REQUEST',
  'NORMAL'
);

CREATE TYPE "PostPriority" AS ENUM (
  'LOW',
  'NORMAL',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "PostAudience" AS ENUM (
  'ALL',
  'WOMEN',
  'MEN'
);

-- ── New columns on Post (all nullable; backfilled in Phase 2) ────────
ALTER TABLE "Post"
  ADD COLUMN "newCategory" "PostCategoryV2",
  ADD COLUMN "intent"      "PostIntent"     DEFAULT 'NORMAL',
  ADD COLUMN "priority"    "PostPriority"   DEFAULT 'NORMAL',
  ADD COLUMN "audience"    "PostAudience"   DEFAULT 'ALL';

-- Index that mirrors the existing (neighborhoodId, category, status)
-- index but on the new column. Cheap to add now so Phase 3 reads are
-- already indexed when we flip them.
CREATE INDEX "Post_neighborhoodId_newCategory_status_idx"
  ON "Post" ("neighborhoodId", "newCategory", "status");

-- ── NotificationPreference table ─────────────────────────────────────
CREATE TABLE "NotificationPreference" (
  "id"           TEXT             NOT NULL,
  "userId"       TEXT             NOT NULL,
  "category"     "PostCategoryV2" NOT NULL,
  "pushEnabled"  BOOLEAN          NOT NULL DEFAULT TRUE,
  "inAppEnabled" BOOLEAN          NOT NULL DEFAULT TRUE,
  "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_userId_category_key"
  ON "NotificationPreference" ("userId", "category");

CREATE INDEX "NotificationPreference_userId_idx"
  ON "NotificationPreference" ("userId");

ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
