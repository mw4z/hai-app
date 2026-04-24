-- CreateEnum
CREATE TYPE "ModStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'UNDER_REVIEW', 'SUSPENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserReportReason" ADD VALUE 'MOD_ABUSE_OF_POWER';
ALTER TYPE "UserReportReason" ADD VALUE 'MOD_UNFAIR_MODERATION';
ALTER TYPE "UserReportReason" ADD VALUE 'MOD_HARASSMENT';
ALTER TYPE "UserReportReason" ADD VALUE 'MOD_INACTIVE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastModActionAt" TIMESTAMP(3),
ADD COLUMN     "modActionsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "modReportCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "modStatus" "ModStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "UserReport" ADD COLUMN     "abuseFlags" TEXT,
ADD COLUMN     "isModeratorTarget" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "neighborhoodId" TEXT,
ADD COLUMN     "reporterIpHash" TEXT;

-- CreateTable
CREATE TABLE "ModActionLog" (
    "id" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "neighborhoodId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModActionLog_moderatorId_createdAt_idx" ON "ModActionLog"("moderatorId", "createdAt");

-- CreateIndex
CREATE INDEX "ModActionLog_targetType_targetId_idx" ON "ModActionLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ModActionLog_neighborhoodId_createdAt_idx" ON "ModActionLog"("neighborhoodId", "createdAt");

-- CreateIndex
CREATE INDEX "UserReport_reportedUserId_isModeratorTarget_status_idx" ON "UserReport"("reportedUserId", "isModeratorTarget", "status");

-- CreateIndex
CREATE INDEX "UserReport_neighborhoodId_isModeratorTarget_status_idx" ON "UserReport"("neighborhoodId", "isModeratorTarget", "status");

-- CreateIndex
CREATE INDEX "UserReport_reportedUserId_reporterIpHash_createdAt_idx" ON "UserReport"("reportedUserId", "reporterIpHash", "createdAt");

-- AddForeignKey
ALTER TABLE "ModActionLog" ADD CONSTRAINT "ModActionLog_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
