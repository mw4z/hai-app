-- Square attachments — voice / PDF / location / sticker / contact.
-- Mirrors the DM Message schema, MINUS image upload (Square blocks
-- arbitrary images by policy; stickers use the "sticker:<id>"
-- sentinel in imageUrl exactly the way DM does it).
--
-- Additive + idempotent — safe to re-run. Drops no data.

-- ── 1. New enum: SquareMessageType ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SquareMessageType') THEN
    CREATE TYPE "SquareMessageType" AS ENUM (
      'TEXT', 'LOCATION', 'PDF', 'VOICE', 'STICKER'
    );
  END IF;
END $$;

-- ── 2. Make body nullable — non-TEXT messages don't carry a body ────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='SquareMessage'
      AND column_name='body' AND is_nullable='NO'
  ) THEN
    ALTER TABLE "SquareMessage" ALTER COLUMN "body" DROP NOT NULL;
  END IF;
END $$;

-- ── 3. Add the per-type columns ─────────────────────────────────────
ALTER TABLE "SquareMessage"
  ADD COLUMN IF NOT EXISTS "type" "SquareMessageType" NOT NULL DEFAULT 'TEXT';
ALTER TABLE "SquareMessage" ADD COLUMN IF NOT EXISTS "lat"             DOUBLE PRECISION;
ALTER TABLE "SquareMessage" ADD COLUMN IF NOT EXISTS "lng"             DOUBLE PRECISION;
ALTER TABLE "SquareMessage" ADD COLUMN IF NOT EXISTS "pdfUrl"          TEXT;
ALTER TABLE "SquareMessage" ADD COLUMN IF NOT EXISTS "pdfName"         TEXT;
ALTER TABLE "SquareMessage" ADD COLUMN IF NOT EXISTS "audioUrl"        TEXT;
ALTER TABLE "SquareMessage" ADD COLUMN IF NOT EXISTS "audioDurationMs" INTEGER;
ALTER TABLE "SquareMessage" ADD COLUMN IF NOT EXISTS "audioMimeType"   TEXT;
ALTER TABLE "SquareMessage" ADD COLUMN IF NOT EXISTS "audioSizeBytes"  INTEGER;
ALTER TABLE "SquareMessage" ADD COLUMN IF NOT EXISTS "imageUrl"        TEXT;
