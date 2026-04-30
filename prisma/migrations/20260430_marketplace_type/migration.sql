-- Marketplace listing subtype. Only meaningful when category=MARKETPLACE.
-- Default SELL preserves the meaning of every existing MARKETPLACE
-- row (the entire Marketplace surface today is sell-side).

CREATE TYPE "MarketplaceType" AS ENUM ('SELL', 'BUY', 'JOB');

ALTER TABLE "Post"
  ADD COLUMN "marketplaceType" "MarketplaceType" NOT NULL DEFAULT 'SELL';
