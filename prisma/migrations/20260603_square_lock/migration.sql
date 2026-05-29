-- Admin-only "lock" state for Square chat, per neighborhood.
-- Idempotent so it can be re-applied on prod without errors.

ALTER TABLE "Neighborhood"
  ADD COLUMN IF NOT EXISTS "squareLockedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "squareLockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "squareLockedById"  TEXT;
