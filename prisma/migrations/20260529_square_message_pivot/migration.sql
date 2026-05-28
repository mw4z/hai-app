-- Square pivot — replace the thread/reply/follow model with a single
-- SquareMessage model (one shared neighborhood message space; not a
-- forum). Safe to apply: the three prior tables were created in the
-- 20260528_square migration and verified EMPTY (no production data
-- lost). Additive + idempotent — every CREATE/DROP is guarded so the
-- file is safely re-runnable.

-- ── 1. Drop the thread-based tables (empty in prod) ─────────────────
-- Order matters: children first so FKs unwind cleanly.
DROP TABLE IF EXISTS "SquareFollow";
DROP TABLE IF EXISTS "SquareReply";
DROP TABLE IF EXISTS "SquareThread";

-- ── 2. Drop the old enum once no tables reference it ────────────────
DROP TYPE IF EXISTS "SquareType";

-- ── 3. Replacement enums ────────────────────────────────────────────
-- SquareStatus already exists from the prior migration; create only if
-- absent (re-runnable).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SquareStatus') THEN
    CREATE TYPE "SquareStatus" AS ENUM ('ACTIVE', 'HIDDEN');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SquareKind') THEN
    CREATE TYPE "SquareKind" AS ENUM ('GENERAL', 'QUESTION', 'NOTE', 'LIGHT_ALERT');
  END IF;
END $$;

-- ── 4. SquareMessage ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SquareMessage" (
  "id"               TEXT NOT NULL,
  "neighborhoodId"   TEXT NOT NULL,
  "authorId"         TEXT NOT NULL,
  "body"             TEXT NOT NULL,
  "kind"             "SquareKind"    NOT NULL DEFAULT 'GENERAL',
  "status"           "SquareStatus"  NOT NULL DEFAULT 'ACTIVE',
  -- Future-proof self-reference for "reply to a specific message".
  -- No UI in MVP. ON DELETE SET NULL — orphaned replies stay visible.
  "replyToMessageId" TEXT,
  "isPinned"         BOOLEAN         NOT NULL DEFAULT false,
  "pinnedAt"         TIMESTAMP(3),
  "pinnedById"       TEXT,
  "hiddenAt"         TIMESTAMP(3),
  "hiddenById"       TEXT,
  "createdAt"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SquareMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SquareMessage_neighborhoodId_status_createdAt_idx"
  ON "SquareMessage" ("neighborhoodId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SquareMessage_neighborhoodId_isPinned_idx"
  ON "SquareMessage" ("neighborhoodId", "isPinned");
CREATE INDEX IF NOT EXISTS "SquareMessage_authorId_idx"
  ON "SquareMessage" ("authorId");
CREATE INDEX IF NOT EXISTS "SquareMessage_replyToMessageId_idx"
  ON "SquareMessage" ("replyToMessageId");

-- ── 5. Foreign keys ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareMessage_neighborhoodId_fkey') THEN
    ALTER TABLE "SquareMessage"
      ADD CONSTRAINT "SquareMessage_neighborhoodId_fkey"
      FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareMessage_authorId_fkey') THEN
    ALTER TABLE "SquareMessage"
      ADD CONSTRAINT "SquareMessage_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareMessage_pinnedById_fkey') THEN
    ALTER TABLE "SquareMessage"
      ADD CONSTRAINT "SquareMessage_pinnedById_fkey"
      FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareMessage_hiddenById_fkey') THEN
    ALTER TABLE "SquareMessage"
      ADD CONSTRAINT "SquareMessage_hiddenById_fkey"
      FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareMessage_replyToMessageId_fkey') THEN
    ALTER TABLE "SquareMessage"
      ADD CONSTRAINT "SquareMessage_replyToMessageId_fkey"
      FOREIGN KEY ("replyToMessageId") REFERENCES "SquareMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
