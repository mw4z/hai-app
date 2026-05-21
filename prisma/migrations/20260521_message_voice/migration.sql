-- Voice notes in chat. Apply on Supabase before deploy.

-- Add VOICE to the MessageType enum (no-op if already present).
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'VOICE';

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "audioUrl"        TEXT,
  ADD COLUMN IF NOT EXISTS "audioDurationMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "audioMimeType"   TEXT,
  ADD COLUMN IF NOT EXISTS "audioSizeBytes"  INTEGER;
