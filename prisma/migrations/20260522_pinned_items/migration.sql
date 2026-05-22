-- Neighborhood pinned reference items + audit log. Applied to Supabase by
-- hand on 2026-05-22 (Vercel skips migrate deploy).

DO $$ BEGIN CREATE TYPE "PinnedItemType" AS ENUM ('POST','COMMENT','MESSAGE','FILE','LINK','MANUAL_NOTE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PinnedItemStatus" AS ENUM ('ACTIVE','HIDDEN','EXPIRED','REMOVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PinnedItemAction" AS ENUM ('PIN','UPDATE','HIDE','UNHIDE','EXPIRE','REMOVE','REORDER'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "NeighborhoodPinnedItem" (
  "id" TEXT PRIMARY KEY,
  "neighborhoodId" TEXT NOT NULL,
  "type" "PinnedItemType" NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "fileUrl" TEXT,
  "linkUrl" TEXT,
  "status" "PinnedItemStatus" NOT NULL DEFAULT 'ACTIVE',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "pinnedById" TEXT NOT NULL,
  "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "hiddenById" TEXT,
  "hiddenAt" TIMESTAMP(3),
  "hiddenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "NeighborhoodPinnedItem_nbhd_status_expiry_idx" ON "NeighborhoodPinnedItem"("neighborhoodId","status","expiresAt");
CREATE INDEX IF NOT EXISTS "NeighborhoodPinnedItem_nbhd_priority_idx" ON "NeighborhoodPinnedItem"("neighborhoodId","priority","pinnedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "NeighborhoodPinnedItem_source_key" ON "NeighborhoodPinnedItem"("neighborhoodId","sourceType","sourceId");

CREATE TABLE IF NOT EXISTS "NeighborhoodPinnedItemAuditLog" (
  "id" TEXT PRIMARY KEY,
  "pinnedItemId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" "PinnedItemAction" NOT NULL,
  "oldValueJson" JSONB,
  "newValueJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PinnedItemAudit_item_created_idx" ON "NeighborhoodPinnedItemAuditLog"("pinnedItemId","createdAt");

DO $$ BEGIN ALTER TABLE "NeighborhoodPinnedItem" ADD CONSTRAINT "NeighborhoodPinnedItem_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "NeighborhoodPinnedItem" ADD CONSTRAINT "NeighborhoodPinnedItem_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "NeighborhoodPinnedItem" ADD CONSTRAINT "NeighborhoodPinnedItem_hiddenById_fkey" FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "NeighborhoodPinnedItemAuditLog" ADD CONSTRAINT "PinnedItemAudit_item_fkey" FOREIGN KEY ("pinnedItemId") REFERENCES "NeighborhoodPinnedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "NeighborhoodPinnedItemAuditLog" ADD CONSTRAINT "PinnedItemAudit_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
