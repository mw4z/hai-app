-- WhatsApp→Hai bridge (Hai-side core). Additive only.
-- MANUAL prod migration: apply to Supabase BY HAND before deploying the
-- code. Safe to re-run (every statement guarded).

-- ── Enums ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "PostOrigin" AS ENUM ('APP', 'WHATSAPP_BRIDGE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsappBridgeStatus" AS ENUM
    ('DETECTED', 'PROMPTED', 'CONFIRMED', 'PUBLISHED', 'IGNORED', 'FAILED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Post.origin ───────────────────────────────────────────────────────────
-- NOT NULL DEFAULT 'APP' backfills every existing row to APP automatically —
-- no existing post is ever marked WHATSAPP_BRIDGE.
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "origin" "PostOrigin" NOT NULL DEFAULT 'APP';

-- ── WhatsappBridgeMessage (audit + idempotency) ──────────────────────────
CREATE TABLE IF NOT EXISTS "WhatsappBridgeMessage" (
  "id"                 TEXT NOT NULL,
  "sourceChatId"       TEXT NOT NULL,
  "sourceMessageId"    TEXT NOT NULL,
  "senderHash"         TEXT NOT NULL,
  "senderDisplayName"  TEXT,
  "originalText"       TEXT NOT NULL,
  "classifiedType"     TEXT,
  "confirmationMethod" TEXT,
  "confirmedBySender"  BOOLEAN NOT NULL DEFAULT false,
  "confirmedAt"        TIMESTAMP(3),
  "createdPostId"      TEXT,
  "neighborhoodId"     TEXT NOT NULL,
  "status"             "WhatsappBridgeStatus" NOT NULL DEFAULT 'DETECTED',
  "failureReason"      TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsappBridgeMessage_pkey" PRIMARY KEY ("id")
);

-- Idempotency: one record per (chat, message, sender).
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappBridgeMessage_src_unique"
  ON "WhatsappBridgeMessage" ("sourceChatId", "sourceMessageId", "senderHash");
CREATE INDEX IF NOT EXISTS "WhatsappBridgeMessage_status_idx" ON "WhatsappBridgeMessage" ("status");
CREATE INDEX IF NOT EXISTS "WhatsappBridgeMessage_createdPostId_idx" ON "WhatsappBridgeMessage" ("createdPostId");
CREATE INDEX IF NOT EXISTS "WhatsappBridgeMessage_neighborhoodId_idx" ON "WhatsappBridgeMessage" ("neighborhoodId");
CREATE INDEX IF NOT EXISTS "WhatsappBridgeMessage_createdAt_idx" ON "WhatsappBridgeMessage" ("createdAt");

-- Note: no FK on createdPostId/neighborhoodId here (kept loose so a bridge
-- audit row survives post deletion); enforced at the app layer.
