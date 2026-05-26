-- Super-admin broadcast push + open/reach analytics. Additive + idempotent.

CREATE TABLE IF NOT EXISTS "Broadcast" (
  "id"           TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "body"         TEXT NOT NULL,
  "createdById"  TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reachedUsers" INTEGER NOT NULL DEFAULT 0,
  "sentTokens"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BroadcastClick" (
  "id"          TEXT NOT NULL,
  "broadcastId" TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BroadcastClick_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BroadcastClick_broadcastId_userId_key" ON "BroadcastClick" ("broadcastId", "userId");
CREATE INDEX IF NOT EXISTS "BroadcastClick_broadcastId_idx" ON "BroadcastClick" ("broadcastId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BroadcastClick_broadcastId_fkey') THEN
    ALTER TABLE "BroadcastClick"
      ADD CONSTRAINT "BroadcastClick_broadcastId_fkey"
      FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
