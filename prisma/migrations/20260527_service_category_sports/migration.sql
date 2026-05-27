-- Add SPORTS to ServiceCategory (رياضة ولياقة). Idempotent; outside a txn.
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'SPORTS';
