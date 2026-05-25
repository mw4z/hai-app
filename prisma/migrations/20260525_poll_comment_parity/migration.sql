-- Poll comment parity with post comments (core set, no PDFs).
-- Adds: image/sticker attachment, threaded replies (parentId), edit tracking,
-- and a PollCommentLike table. Additive + idempotent — safe to run by hand.

-- 1) New columns on PollComment
ALTER TABLE "PollComment" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "PollComment" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "PollComment" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PollComment_parentId_idx" ON "PollComment" ("parentId");

-- Self-FK for replies: parentId → PollComment(id), cascade so deleting a
-- parent removes its replies (mirrors Comment).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollComment_parentId_fkey') THEN
    ALTER TABLE "PollComment"
      ADD CONSTRAINT "PollComment_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "PollComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 2) PollCommentLike — one like per (comment, user)
CREATE TABLE IF NOT EXISTS "PollCommentLike" (
  "id"            TEXT NOT NULL,
  "pollCommentId" TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PollCommentLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PollCommentLike_pollCommentId_userId_key" ON "PollCommentLike" ("pollCommentId", "userId");
CREATE INDEX IF NOT EXISTS "PollCommentLike_pollCommentId_idx" ON "PollCommentLike" ("pollCommentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollCommentLike_pollCommentId_fkey') THEN
    ALTER TABLE "PollCommentLike"
      ADD CONSTRAINT "PollCommentLike_pollCommentId_fkey"
      FOREIGN KEY ("pollCommentId") REFERENCES "PollComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
