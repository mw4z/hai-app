-- Comment pinning — a post/poll author (or mod) can pin a top-level
-- comment to the top of the thread. Nullable timestamp set on pin,
-- cleared on unpin. Additive + idempotent: safe to run once on prod
-- by hand.

ALTER TABLE "Comment"     ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);
ALTER TABLE "PollComment" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);
