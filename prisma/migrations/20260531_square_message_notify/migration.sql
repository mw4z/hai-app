-- Author-fired "notify neighbors" on a specific Square message.
-- One nullable timestamp column on SquareMessage + a composite index
-- for the per-author rate-limit lookup. Idempotent.

ALTER TABLE "SquareMessage" ADD COLUMN IF NOT EXISTS "notificationFiredAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SquareMessage_authorId_notificationFiredAt_idx"
  ON "SquareMessage" ("authorId", "notificationFiredAt");
