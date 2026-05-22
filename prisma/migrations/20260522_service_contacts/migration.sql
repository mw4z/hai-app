-- Service-contact directory: phone-identity-separated lightweight contacts.
-- Applied to Supabase by hand on 2026-05-22 (Vercel skips migrate deploy).

DO $$ BEGIN CREATE TYPE "ServiceCategory" AS ENUM ('PLUMBER','ELECTRICIAN','CARPENTER','PAINTER','AC_TECH','CLEANING','MOVING','TUTOR','TAILOR','HOME_FOOD','CAR_SERVICE','TECH_REPAIR','HEALTH_HOME','OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ServiceContactSource" AS ENUM ('COMMUNITY_ADDED','OWNER_SUBMITTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ServiceVerification" AS ENUM ('UNVERIFIED','PENDING_OWNER_CONFIRMATION','CLAIMED','VERIFIED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ServiceContactStatus" AS ENUM ('ACTIVE','PENDING_REVIEW','HIDDEN','REMOVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ServiceContactReportReason" AS ENUM ('WRONG_PHONE','NOT_THIS_PERSON','FRAUD_OR_ABUSE','INAPPROPRIATE'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ServiceIdentity" (
  "id" TEXT PRIMARY KEY,
  "phoneHash" TEXT NOT NULL,
  "phoneEnc" TEXT NOT NULL,
  "linkedUserId" TEXT,
  "ownerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceIdentity_phoneHash_key" ON "ServiceIdentity"("phoneHash");
CREATE INDEX IF NOT EXISTS "ServiceIdentity_linkedUserId_idx" ON "ServiceIdentity"("linkedUserId");
CREATE INDEX IF NOT EXISTS "ServiceIdentity_ownerUserId_idx" ON "ServiceIdentity"("ownerUserId");

CREATE TABLE IF NOT EXISTS "DirectoryServiceContact" (
  "id" TEXT PRIMARY KEY,
  "serviceIdentityId" TEXT NOT NULL,
  "neighborhoodId" TEXT NOT NULL,
  "category" "ServiceCategory" NOT NULL,
  "displayName" TEXT NOT NULL,
  "description" TEXT,
  "whatsapp" BOOLEAN NOT NULL DEFAULT false,
  "serviceArea" TEXT,
  "notes" TEXT,
  "source" "ServiceContactSource" NOT NULL DEFAULT 'COMMUNITY_ADDED',
  "verification" "ServiceVerification" NOT NULL DEFAULT 'UNVERIFIED',
  "status" "ServiceContactStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT,
  "reportCount" INTEGER NOT NULL DEFAULT 0,
  "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ratingCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DirectoryServiceContact_identity_nbhd_cat_key" ON "DirectoryServiceContact"("serviceIdentityId","neighborhoodId","category");
CREATE INDEX IF NOT EXISTS "DirectoryServiceContact_nbhd_cat_status_idx" ON "DirectoryServiceContact"("neighborhoodId","category","status");
CREATE INDEX IF NOT EXISTS "DirectoryServiceContact_nbhd_status_created_idx" ON "DirectoryServiceContact"("neighborhoodId","status","createdAt");
CREATE INDEX IF NOT EXISTS "DirectoryServiceContact_identity_idx" ON "DirectoryServiceContact"("serviceIdentityId");
CREATE INDEX IF NOT EXISTS "DirectoryServiceContact_creator_idx" ON "DirectoryServiceContact"("createdByUserId");

CREATE TABLE IF NOT EXISTS "ServiceContactReport" (
  "id" TEXT PRIMARY KEY,
  "contactId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reason" "ServiceContactReportReason" NOT NULL,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceContactReport_contact_user_key" ON "ServiceContactReport"("contactId","userId");
CREATE INDEX IF NOT EXISTS "ServiceContactReport_contact_idx" ON "ServiceContactReport"("contactId");
CREATE INDEX IF NOT EXISTS "ServiceContactReport_user_created_idx" ON "ServiceContactReport"("userId","createdAt");

DO $$ BEGIN ALTER TABLE "ServiceIdentity" ADD CONSTRAINT "ServiceIdentity_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ServiceIdentity" ADD CONSTRAINT "ServiceIdentity_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "DirectoryServiceContact" ADD CONSTRAINT "DirectoryServiceContact_serviceIdentityId_fkey" FOREIGN KEY ("serviceIdentityId") REFERENCES "ServiceIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "DirectoryServiceContact" ADD CONSTRAINT "DirectoryServiceContact_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "DirectoryServiceContact" ADD CONSTRAINT "DirectoryServiceContact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ServiceContactReport" ADD CONSTRAINT "ServiceContactReport_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "DirectoryServiceContact"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ServiceContactReport" ADD CONSTRAINT "ServiceContactReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Audit source columns (extracted from posts/comments)
ALTER TABLE "DirectoryServiceContact" ADD COLUMN IF NOT EXISTS "sourcePostId" TEXT;
ALTER TABLE "DirectoryServiceContact" ADD COLUMN IF NOT EXISTS "sourceCommentId" TEXT;
