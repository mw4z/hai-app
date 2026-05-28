-- Distinct-viewer tracking for Square messages. Mirrors the
-- post viewCount / PostView pattern. Idempotent so it can be
-- re-applied on prod without errors.

-- 1. Counter column on SquareMessage.
ALTER TABLE "SquareMessage"
  ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;

-- 2. Dedup table — one row per (messageId, userId).
CREATE TABLE IF NOT EXISTS "SquareMessageView" (
  "id"        TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SquareMessageView_pkey" PRIMARY KEY ("id")
);

-- 3. Uniqueness on (messageId, userId) — a re-view is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS "SquareMessageView_messageId_userId_key"
  ON "SquareMessageView"("messageId", "userId");

-- 4. Per-message + per-user lookup indexes.
CREATE INDEX IF NOT EXISTS "SquareMessageView_messageId_idx"
  ON "SquareMessageView"("messageId");

CREATE INDEX IF NOT EXISTS "SquareMessageView_userId_idx"
  ON "SquareMessageView"("userId");

-- 5. FK so message hard-delete cascades the view rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SquareMessageView_messageId_fkey'
  ) THEN
    ALTER TABLE "SquareMessageView"
      ADD CONSTRAINT "SquareMessageView_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "SquareMessage"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
