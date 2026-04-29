-- Highlights system: nullable timestamp = "moderator-pinned to highlights at".
-- NULL means not pinned. Pin auto-expires 14 days after this value at the
-- query layer (no cron needed).

ALTER TABLE "Post" ADD COLUMN "highlightPinnedAt" TIMESTAMP(3);

-- Partial index keeps the mod-pinned scan cheap; only ~ a handful of rows
-- per neighborhood will ever match.
CREATE INDEX "Post_highlightPinnedAt_neighborhoodId_idx"
  ON "Post" ("neighborhoodId", "highlightPinnedAt")
  WHERE "highlightPinnedAt" IS NOT NULL;
