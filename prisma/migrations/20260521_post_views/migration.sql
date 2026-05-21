-- Distinct-viewer count for posts. Apply on Supabase before deploy.

ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "PostView" (
  "id"        TEXT NOT NULL,
  "postId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PostView_postId_userId_key"
  ON "PostView" ("postId", "userId");
CREATE INDEX IF NOT EXISTS "PostView_postId_idx" ON "PostView" ("postId");

DO $$ BEGIN
  ALTER TABLE "PostView"
    ADD CONSTRAINT "PostView_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PostView"
    ADD CONSTRAINT "PostView_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
