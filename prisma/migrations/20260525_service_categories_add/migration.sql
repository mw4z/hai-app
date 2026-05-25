-- Add 4 service categories to the directory: مندوب / مطعم / عقار / مستلزمات متنوعة.
-- Postgres enum value additions are idempotent with IF NOT EXISTS (PG12+).
-- Safe to run by hand on Supabase. Each ADD VALUE auto-commits.
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'COURIER';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'RESTAURANT';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'REAL_ESTATE';
ALTER TYPE "ServiceCategory" ADD VALUE IF NOT EXISTS 'MISC_SUPPLIES';
