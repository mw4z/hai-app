-- Add BEAUTY to ServiceCategory (تجميل/كوافير). Idempotent; runs outside a txn.
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'BEAUTY';
