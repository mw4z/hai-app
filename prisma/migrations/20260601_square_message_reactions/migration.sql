-- Per-user emoji reactions on Square messages. Same shape DM uses
-- (Json array of {emoji, userId}). Default empty array so existing
-- rows stay valid without a backfill.

ALTER TABLE "SquareMessage"
  ADD COLUMN IF NOT EXISTS "reactions" JSONB NOT NULL DEFAULT '[]'::jsonb;
