-- Delete-for-me + delete-for-everyone on Square messages.
-- Mirrors the DM Message shape:
--   - hiddenBy String[]   → per-user "hide from my view" list
--   - SquareMessageType.DELETED → global tombstone (delete for all)
-- Additive + idempotent.

-- 1. Per-user "delete for me" array. Defaults to empty so existing
--    rows stay valid.
ALTER TABLE "SquareMessage"
  ADD COLUMN IF NOT EXISTS "hiddenBy" TEXT[] NOT NULL DEFAULT '{}';

-- 2. Add the DELETED enum value if it isn't there already. PostgreSQL
--    ALTER TYPE ... ADD VALUE has IF NOT EXISTS support, but inside a
--    DO block to keep the migration runnable as one transaction.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SquareMessageType')
      AND enumlabel = 'DELETED'
  ) THEN
    ALTER TYPE "SquareMessageType" ADD VALUE 'DELETED';
  END IF;
END $$;
