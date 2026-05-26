-- Add FURNITURE to ServiceCategory (أثاث وديكور). Idempotent; outside a txn.
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'FURNITURE';
