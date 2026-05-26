-- Add WATER to ServiceCategory (مياه). Idempotent; runs outside a txn.
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'WATER';
