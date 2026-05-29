-- Ephemeral typing signal for Square. Idempotent.

CREATE TABLE IF NOT EXISTS "SquareTypingSignal" (
  "id"             TEXT NOT NULL,
  "neighborhoodId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SquareTypingSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SquareTypingSignal_neighborhoodId_userId_key"
  ON "SquareTypingSignal"("neighborhoodId", "userId");

CREATE INDEX IF NOT EXISTS "SquareTypingSignal_neighborhoodId_expiresAt_idx"
  ON "SquareTypingSignal"("neighborhoodId", "expiresAt");
