-- Adds the RIDE vs DELIVERY distinction to RideRequest.
--
-- DELIVERY rows reuse the existing offers / pricing / account-age /
-- notification surfaces; the type just tells the UI to swap the
-- passenger-count field for an itemDescription textarea, render a 📦
-- badge on cards, and cross-list the request in the LOOKING_FOR feed.
-- Existing rows default to RIDE so nothing in flight changes.

CREATE TYPE "RideRequestType" AS ENUM ('RIDE', 'DELIVERY');

ALTER TABLE "RideRequest"
  ADD COLUMN "type" "RideRequestType" NOT NULL DEFAULT 'RIDE',
  ADD COLUMN "itemDescription" TEXT;
