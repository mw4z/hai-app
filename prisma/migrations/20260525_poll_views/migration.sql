-- Poll view tracking — mirrors the Post view system (PostView + Post.viewCount).
-- Additive + idempotent: safe to run once on prod by hand.

-- 1) Distinct-viewer counter on Poll (denormalized, bumped on first view).
ALTER TABLE "Poll" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;

-- 2) One row per (poll, user) who viewed — dedup key for the count.
CREATE TABLE IF NOT EXISTS "PollView" (
  "id"        TEXT NOT NULL,
  "pollId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PollView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PollView_pollId_userId_key" ON "PollView" ("pollId", "userId");
CREATE INDEX IF NOT EXISTS "PollView_pollId_idx" ON "PollView" ("pollId");

-- FK pollId → Poll(id) ON DELETE CASCADE (idempotent add).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PollView_pollId_fkey'
  ) THEN
    ALTER TABLE "PollView"
      ADD CONSTRAINT "PollView_pollId_fkey"
      FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
