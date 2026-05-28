-- Square (ساحة الحي) — structured neighborhood discussion space.
-- Text-only by design (no image/video/file/voice columns); admin-only in
-- MVP via the API + page-layer gate, opens to all residents later.
-- Additive + idempotent — safe to re-run.

-- ── Enums ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SquareType') THEN
    CREATE TYPE "SquareType" AS ENUM ('QUESTION', 'NOTE', 'DISCUSSION', 'LIGHT_ALERT');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SquareStatus') THEN
    CREATE TYPE "SquareStatus" AS ENUM ('ACTIVE', 'HIDDEN');
  END IF;
END $$;

-- ── SquareThread ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SquareThread" (
  "id"             TEXT NOT NULL,
  "neighborhoodId" TEXT NOT NULL,
  "authorId"       TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "body"           TEXT,
  "type"           "SquareType"   NOT NULL DEFAULT 'DISCUSSION',
  "status"         "SquareStatus" NOT NULL DEFAULT 'ACTIVE',
  "isPinned"       BOOLEAN        NOT NULL DEFAULT false,
  "pinnedAt"       TIMESTAMP(3),
  "pinnedById"     TEXT,
  "replyCount"     INTEGER        NOT NULL DEFAULT 0,
  "followerCount"  INTEGER        NOT NULL DEFAULT 0,
  "lastActivityAt" TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hiddenAt"       TIMESTAMP(3),
  "hiddenById"     TEXT,
  "createdAt"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SquareThread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SquareThread_list_idx"
  ON "SquareThread" ("neighborhoodId", "status", "isPinned", "lastActivityAt");
CREATE INDEX IF NOT EXISTS "SquareThread_authorId_idx"
  ON "SquareThread" ("authorId");

-- ── SquareReply ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SquareReply" (
  "id"              TEXT NOT NULL,
  "threadId"        TEXT NOT NULL,
  "authorId"        TEXT NOT NULL,
  "body"            TEXT NOT NULL,
  "status"          "SquareStatus" NOT NULL DEFAULT 'ACTIVE',
  "isMarkedHelpful" BOOLEAN        NOT NULL DEFAULT false,
  "hiddenAt"        TIMESTAMP(3),
  "hiddenById"      TEXT,
  "createdAt"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SquareReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SquareReply_threadId_createdAt_idx"
  ON "SquareReply" ("threadId", "createdAt");
CREATE INDEX IF NOT EXISTS "SquareReply_authorId_idx"
  ON "SquareReply" ("authorId");

-- ── SquareFollow ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SquareFollow" (
  "id"             TEXT NOT NULL,
  "threadId"       TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastNotifiedAt" TIMESTAMP(3),
  CONSTRAINT "SquareFollow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SquareFollow_threadId_userId_key"
  ON "SquareFollow" ("threadId", "userId");
CREATE INDEX IF NOT EXISTS "SquareFollow_userId_idx"
  ON "SquareFollow" ("userId");

-- ── Foreign keys ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareThread_neighborhoodId_fkey') THEN
    ALTER TABLE "SquareThread"
      ADD CONSTRAINT "SquareThread_neighborhoodId_fkey"
      FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareThread_authorId_fkey') THEN
    ALTER TABLE "SquareThread"
      ADD CONSTRAINT "SquareThread_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareThread_pinnedById_fkey') THEN
    ALTER TABLE "SquareThread"
      ADD CONSTRAINT "SquareThread_pinnedById_fkey"
      FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareThread_hiddenById_fkey') THEN
    ALTER TABLE "SquareThread"
      ADD CONSTRAINT "SquareThread_hiddenById_fkey"
      FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareReply_threadId_fkey') THEN
    ALTER TABLE "SquareReply"
      ADD CONSTRAINT "SquareReply_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "SquareThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareReply_authorId_fkey') THEN
    ALTER TABLE "SquareReply"
      ADD CONSTRAINT "SquareReply_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareReply_hiddenById_fkey') THEN
    ALTER TABLE "SquareReply"
      ADD CONSTRAINT "SquareReply_hiddenById_fkey"
      FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareFollow_threadId_fkey') THEN
    ALTER TABLE "SquareFollow"
      ADD CONSTRAINT "SquareFollow_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "SquareThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SquareFollow_userId_fkey') THEN
    ALTER TABLE "SquareFollow"
      ADD CONSTRAINT "SquareFollow_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
