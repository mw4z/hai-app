-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AccountType" AS ENUM ('NORMAL', 'SERVICE_PROVIDER', 'VERIFIED_PROVIDER');

-- CreateEnum
CREATE TYPE "public"."CompletionMode" AS ENUM ('REQUESTER_CONFIRMED', 'AUTO_CLOSED');

-- CreateEnum
CREATE TYPE "public"."CoordinationMode" AS ENUM ('OPEN', 'EXCLUSIVE');

-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('MALE', 'FEMALE', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "public"."MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "public"."MessageType" AS ENUM ('TEXT', 'LOCATION', 'IMAGE', 'DELETED');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('COMMENT_ON_POST', 'REACTION_ON_POST', 'REPLY_TO_COMMENT', 'LOOKING_FOR_POST', 'NEW_MESSAGE', 'RIDE_OFFER', 'RIDE_STATUS', 'RIDE_MESSAGE', 'RIDE_RATING', 'SYSTEM', 'REPORT');

-- CreateEnum
CREATE TYPE "public"."OfferStatus" AS ENUM ('OFFER_PENDING', 'OFFER_ACCEPTED', 'OFFER_PASSED', 'OFFER_WITHDRAWN');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."PostCategory" AS ENUM ('ALERT', 'LOST_FOUND', 'MARKETPLACE', 'FOOD_HOME', 'REAL_ESTATE', 'SERVICES', 'LOOKING_FOR', 'RIDE_REQUEST', 'NEIGHBORHOOD_ISSUE', 'MOSQUE', 'GENERAL', 'WOMEN_ONLY', 'EID_RAMADAN', 'CONTESTS');

-- CreateEnum
CREATE TYPE "public"."PostStatus" AS ENUM ('PENDING_AI', 'ACTIVE', 'IN_PROGRESS', 'HIDDEN', 'REMOVED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."ProviderStatus" AS ENUM ('NONE', 'PENDING', 'ACTIVE', 'VERIFIED');

-- CreateEnum
CREATE TYPE "public"."ReportReason" AS ENUM ('WRONG_CATEGORY', 'SPAM', 'INAPPROPRIATE', 'SCAM', 'NOT_NEIGHBORHOOD', 'OFFENSIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED', 'ACTION_TAKEN');

-- CreateEnum
CREATE TYPE "public"."RideStatus" AS ENUM ('RIDE_OPEN', 'RIDE_SELECTED', 'RIDE_CONFIRMED', 'RIDE_EN_ROUTE', 'RIDE_ARRIVED', 'RIDE_IN_PROGRESS', 'RIDE_PENDING_COMPLETION', 'RIDE_COMPLETED', 'RIDE_CANCELLED', 'RIDE_EXPIRED', 'RIDE_DISPUTED');

-- CreateEnum
CREATE TYPE "public"."ThreadStatus" AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."UserReportReason" AS ENUM ('IMPERSONATION', 'SCAM_FRAUD', 'HARASSMENT', 'ABUSIVE_LANGUAGE', 'SPAM', 'INAPPROPRIATE_PROFILE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."UserReportSource" AS ENUM ('PROFILE', 'POST', 'CHAT', 'MARKETPLACE', 'PROVIDER');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('RESIDENT', 'NEIGHBORHOOD_MOD', 'COMPOUND_ADMIN', 'PLATFORM_MOD', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'WARNED', 'BANNED_TEMP', 'BANNED_PERM', 'PENDING_REVIEW');

-- CreateTable
CREATE TABLE "public"."Announcement" (
    "id" TEXT NOT NULL,
    "compoundId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Bookmark" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Comment" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "imageUrl" TEXT,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Compound" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "neighborhoodId" TEXT NOT NULL,
    "adminPhone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Compound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DigestLog" (
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DigestLog_pkey" PRIMARY KEY ("userId","weekStart")
);

-- CreateTable
CREATE TABLE "public"."EmergencyAlert" (
    "id" TEXT NOT NULL,
    "neighborhoodId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "EmergencyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmergencyAlertDismissal" (
    "alertId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyAlertDismissal_pkey" PRIMARY KEY ("alertId","userId")
);

-- CreateTable
CREATE TABLE "public"."EmergencyAlertRequest" (
    "id" TEXT NOT NULL,
    "neighborhoodId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectedReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedAlertId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyAlertRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InviteCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InviteFraudSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteFraudSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InviteRedemption" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "action1At" TIMESTAMP(3),
    "d2ReturnAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "signupIpHash" TEXT,
    "signupDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaintenanceRequest" (
    "id" TEXT NOT NULL,
    "compoundId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "type" "public"."MessageType" NOT NULL DEFAULT 'TEXT',
    "text" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "reactions" JSONB NOT NULL DEFAULT '[]',
    "replyToId" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ModRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "neighborhoodId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ModerationLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminName" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Neighborhood" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "boundary" JSONB NOT NULL,
    "bbox" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'balady',
    "baladyId" TEXT,
    "cityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Neighborhood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NeighborhoodChangeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromNeighborhoodId" TEXT NOT NULL,
    "toNeighborhoodId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "customReason" TEXT,
    "changedBy" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NeighborhoodChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NeighborhoodChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentNeighborhoodId" TEXT NOT NULL,
    "requestedNeighborhoodId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "customReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NeighborhoodChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NeighborhoodReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "neighborhoodId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrls" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'open',
    "reply" TEXT,
    "repliedBy" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NeighborhoodReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotifJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "targetType" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupKey" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "NotifJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotifPreference" (
    "userId" TEXT NOT NULL,
    "newPostInNbhd" BOOLEAN NOT NULL DEFAULT true,
    "commentOnYours" BOOLEAN NOT NULL DEFAULT true,
    "replyOnYours" BOOLEAN NOT NULL DEFAULT true,
    "reactionOnYours" BOOLEAN NOT NULL DEFAULT true,
    "directMessage" BOOLEAN NOT NULL DEFAULT true,
    "emergencyAlert" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDigest" BOOLEAN NOT NULL DEFAULT true,
    "quietStartHr" INTEGER,
    "quietEndHr" INTEGER,

    CONSTRAINT "NotifPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT,
    "postId" TEXT,
    "postTitle" TEXT,
    "commentId" TEXT,
    "threadId" TEXT,
    "rideRequestId" TEXT,
    "title" TEXT,
    "titleEn" TEXT,
    "body" TEXT,
    "bodyEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "moyasarId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlanChangeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "previousPlan" TEXT NOT NULL,
    "newPlan" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Poll" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "authorId" TEXT NOT NULL,
    "neighborhoodId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PollComment" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PollReaction" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,

    CONSTRAINT "PollReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Post" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "public"."PostCategory" NOT NULL,
    "status" "public"."PostStatus" NOT NULL DEFAULT 'PENDING_AI',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "coordinationMode" "public"."CoordinationMode" NOT NULL DEFAULT 'OPEN',
    "activeThreadId" TEXT,
    "price" DOUBLE PRECISION,
    "imageUrls" TEXT[],
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "locationName" TEXT,
    "authorId" TEXT NOT NULL,
    "neighborhoodId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Reaction" (
    "id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "reason" "public"."ReportReason" NOT NULL,
    "details" TEXT,
    "reporterId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReputationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "action" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RideDispute" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RideEvent" (
    "id" TEXT NOT NULL,
    "rideRequestId" TEXT NOT NULL,
    "tripId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RideMessage" (
    "id" TEXT NOT NULL,
    "rideRequestId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RideOffer" (
    "id" TEXT NOT NULL,
    "rideRequestId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "arrivalMin" INTEGER NOT NULL,
    "message" TEXT,
    "status" "public"."OfferStatus" NOT NULL DEFAULT 'OFFER_PENDING',
    "editCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RideRating" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RideRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupArea" TEXT NOT NULL,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "dropoffArea" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "estimatedMinPrice" INTEGER NOT NULL,
    "estimatedMaxPrice" INTEGER NOT NULL,
    "isImmediate" BOOLEAN NOT NULL DEFAULT true,
    "scheduledAt" TIMESTAMP(3),
    "notes" TEXT,
    "status" "public"."RideStatus" NOT NULL DEFAULT 'RIDE_OPEN',
    "selectedOfferId" TEXT,
    "confirmDeadline" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "selectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "neighborhoodId" TEXT,

    CONSTRAINT "RideRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ServiceItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrls" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'open',
    "reply" TEXT,
    "repliedBy" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Thread" (
    "id" TEXT NOT NULL,
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "postId" TEXT,
    "status" "public"."ThreadStatus" NOT NULL DEFAULT 'ACTIVE',
    "closedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Trip" (
    "id" TEXT NOT NULL,
    "rideRequestId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "agreedPrice" INTEGER NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enRouteAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "driverMarkedDoneAt" TIMESTAMP(3),
    "requesterConfirmedDoneAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completionMode" "public"."CompletionMode",
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UsageCounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "lastName" TEXT,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifyToken" TEXT,
    "emailVerifyExpiry" TIMESTAMP(3),
    "gender" "public"."Gender" NOT NULL DEFAULT 'MALE',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "addressVerified" BOOLEAN NOT NULL DEFAULT false,
    "addressProofUrl" TEXT,
    "reputation" INTEGER NOT NULL DEFAULT 0,
    "accountType" "public"."AccountType" NOT NULL DEFAULT 'NORMAL',
    "role" "public"."UserRole" NOT NULL DEFAULT 'RESIDENT',
    "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "neighborhoodId" TEXT,
    "driverRatingAvg" DOUBLE PRECISION,
    "driverRatingCount" INTEGER NOT NULL DEFAULT 0,
    "driverTripsCount" INTEGER NOT NULL DEFAULT 0,
    "driverCancelCount" INTEGER NOT NULL DEFAULT 0,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "bio" TEXT,
    "modApprovedAt" TIMESTAMP(3),
    "serviceDescription" TEXT,
    "serviceLat" DOUBLE PRECISION,
    "serviceLng" DOUBLE PRECISION,
    "serviceAddress" TEXT,
    "notifyComments" BOOLEAN NOT NULL DEFAULT true,
    "notifyReactions" BOOLEAN NOT NULL DEFAULT true,
    "notifyReplies" BOOLEAN NOT NULL DEFAULT true,
    "notifyLookingFor" BOOLEAN NOT NULL DEFAULT true,
    "notifyMessages" BOOLEAN NOT NULL DEFAULT true,
    "notifyRides" BOOLEAN NOT NULL DEFAULT true,
    "notifySystem" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "showLastSeen" BOOLEAN NOT NULL DEFAULT true,
    "showReadReceipts" BOOLEAN NOT NULL DEFAULT true,
    "inviteBadgeTier" INTEGER NOT NULL DEFAULT 0,
    "invitedById" TEXT,
    "invitesQualified" INTEGER NOT NULL DEFAULT 0,
    "signupDeviceId" TEXT,
    "signupIpHash" TEXT,
    "showGender" BOOLEAN NOT NULL DEFAULT true,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "providerStatus" "public"."ProviderStatus" NOT NULL DEFAULT 'NONE',
    "providerStatusChangedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "reason" "public"."UserReportReason" NOT NULL,
    "details" TEXT,
    "source" "public"."UserReportSource" NOT NULL DEFAULT 'PROFILE',
    "postId" TEXT,
    "conversationId" TEXT,
    "listingId" TEXT,
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VerificationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT,
    "description" TEXT NOT NULL,
    "proofUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_postId_userId_key" ON "public"."Bookmark"("postId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "Bookmark_userId_createdAt_idx" ON "public"."Bookmark"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "public"."Comment"("parentId" ASC);

-- CreateIndex
CREATE INDEX "Comment_postId_idx" ON "public"."Comment"("postId" ASC);

-- CreateIndex
CREATE INDEX "CommentLike_commentId_idx" ON "public"."CommentLike"("commentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CommentLike_commentId_userId_key" ON "public"."CommentLike"("commentId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "DeviceToken_lastSeenAt_idx" ON "public"."DeviceToken"("lastSeenAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "public"."DeviceToken"("token" ASC);

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "public"."DeviceToken"("userId" ASC);

-- CreateIndex
CREATE INDEX "DigestLog_weekStart_idx" ON "public"."DigestLog"("weekStart" ASC);

-- CreateIndex
CREATE INDEX "EmergencyAlert_neighborhoodId_expiresAt_revokedAt_idx" ON "public"."EmergencyAlert"("neighborhoodId" ASC, "expiresAt" ASC, "revokedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyAlertRequest_approvedAlertId_key" ON "public"."EmergencyAlertRequest"("approvedAlertId" ASC);

-- CreateIndex
CREATE INDEX "EmergencyAlertRequest_neighborhoodId_status_createdAt_idx" ON "public"."EmergencyAlertRequest"("neighborhoodId" ASC, "status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "EmergencyAlertRequest_requesterId_status_idx" ON "public"."EmergencyAlertRequest"("requesterId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "EmergencyAlertRequest_status_expiresAt_idx" ON "public"."EmergencyAlertRequest"("status" ASC, "expiresAt" ASC);

-- CreateIndex
CREATE INDEX "InviteCode_code_idx" ON "public"."InviteCode"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_code_key" ON "public"."InviteCode"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_userId_key" ON "public"."InviteCode"("userId" ASC);

-- CreateIndex
CREATE INDEX "InviteFraudSignal_kind_createdAt_idx" ON "public"."InviteFraudSignal"("kind" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "InviteFraudSignal_userId_idx" ON "public"."InviteFraudSignal"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "InviteRedemption_inviteeId_key" ON "public"."InviteRedemption"("inviteeId" ASC);

-- CreateIndex
CREATE INDEX "InviteRedemption_inviterId_status_idx" ON "public"."InviteRedemption"("inviterId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "InviteRedemption_status_createdAt_idx" ON "public"."InviteRedemption"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Message_replyToId_idx" ON "public"."Message"("replyToId" ASC);

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "public"."Message"("threadId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ModRequest_status_createdAt_idx" ON "public"."ModRequest"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ModRequest_userId_status_idx" ON "public"."ModRequest"("userId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "ModerationLog_adminId_createdAt_idx" ON "public"."ModerationLog"("adminId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ModerationLog_targetId_idx" ON "public"."ModerationLog"("targetId" ASC);

-- CreateIndex
CREATE INDEX "NeighborhoodChangeLog_userId_createdAt_idx" ON "public"."NeighborhoodChangeLog"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "NeighborhoodChangeRequest_status_createdAt_idx" ON "public"."NeighborhoodChangeRequest"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "NeighborhoodChangeRequest_userId_status_idx" ON "public"."NeighborhoodChangeRequest"("userId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "NeighborhoodReport_neighborhoodId_status_createdAt_idx" ON "public"."NeighborhoodReport"("neighborhoodId" ASC, "status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "NeighborhoodReport_userId_createdAt_idx" ON "public"."NeighborhoodReport"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "NotifJob_dedupKey_createdAt_idx" ON "public"."NotifJob"("dedupKey" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "NotifJob_status_runAt_priority_idx" ON "public"."NotifJob"("status" ASC, "runAt" ASC, "priority" ASC);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "public"."Notification"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "public"."Notification"("userId" ASC, "read" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "OtpCode_phone_idx" ON "public"."OtpCode"("phone" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_postId_key" ON "public"."Payment"("postId" ASC);

-- CreateIndex
CREATE INDEX "PlanChangeLog_userId_createdAt_idx" ON "public"."PlanChangeLog"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Poll_authorId_idx" ON "public"."Poll"("authorId" ASC);

-- CreateIndex
CREATE INDEX "Poll_neighborhoodId_status_createdAt_idx" ON "public"."Poll"("neighborhoodId" ASC, "status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "PollComment_pollId_createdAt_idx" ON "public"."PollComment"("pollId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "PollReaction_pollId_idx" ON "public"."PollReaction"("pollId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PollReaction_pollId_userId_key" ON "public"."PollReaction"("pollId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "PollVote_pollId_idx" ON "public"."PollVote"("pollId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_userId_key" ON "public"."PollVote"("pollId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "Post_authorId_idx" ON "public"."Post"("authorId" ASC);

-- CreateIndex
CREATE INDEX "Post_neighborhoodId_category_status_idx" ON "public"."Post"("neighborhoodId" ASC, "category" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Reaction_postId_idx" ON "public"."Reaction"("postId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_postId_userId_key" ON "public"."Reaction"("postId" ASC, "userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_postId_key" ON "public"."Report"("reporterId" ASC, "postId" ASC);

-- CreateIndex
CREATE INDEX "ReputationLog_userId_createdAt_idx" ON "public"."ReputationLog"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ReputationLog_userId_fromUserId_action_idx" ON "public"."ReputationLog"("userId" ASC, "fromUserId" ASC, "action" ASC);

-- CreateIndex
CREATE INDEX "RideDispute_status_idx" ON "public"."RideDispute"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RideDispute_tripId_key" ON "public"."RideDispute"("tripId" ASC);

-- CreateIndex
CREATE INDEX "RideEvent_rideRequestId_createdAt_idx" ON "public"."RideEvent"("rideRequestId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "RideEvent_tripId_createdAt_idx" ON "public"."RideEvent"("tripId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "RideMessage_rideRequestId_createdAt_idx" ON "public"."RideMessage"("rideRequestId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "RideOffer_driverId_idx" ON "public"."RideOffer"("driverId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RideOffer_rideRequestId_driverId_key" ON "public"."RideOffer"("rideRequestId" ASC, "driverId" ASC);

-- CreateIndex
CREATE INDEX "RideOffer_rideRequestId_status_idx" ON "public"."RideOffer"("rideRequestId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "RideRating_targetId_idx" ON "public"."RideRating"("targetId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RideRating_tripId_raterId_key" ON "public"."RideRating"("tripId" ASC, "raterId" ASC);

-- CreateIndex
CREATE INDEX "RideRequest_expiresAt_idx" ON "public"."RideRequest"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "RideRequest_requesterId_status_idx" ON "public"."RideRequest"("requesterId" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RideRequest_selectedOfferId_key" ON "public"."RideRequest"("selectedOfferId" ASC);

-- CreateIndex
CREATE INDEX "RideRequest_status_neighborhoodId_createdAt_idx" ON "public"."RideRequest"("status" ASC, "neighborhoodId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ServiceItem_userId_active_sortOrder_idx" ON "public"."ServiceItem"("userId" ASC, "active" ASC, "sortOrder" ASC);

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "public"."SupportTicket"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "SupportTicket_userId_createdAt_idx" ON "public"."SupportTicket"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Thread_postId_idx" ON "public"."Thread"("postId" ASC);

-- CreateIndex
CREATE INDEX "Thread_user1Id_status_updatedAt_idx" ON "public"."Thread"("user1Id" ASC, "status" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Thread_user1Id_user2Id_postId_key" ON "public"."Thread"("user1Id" ASC, "user2Id" ASC, "postId" ASC);

-- CreateIndex
CREATE INDEX "Thread_user2Id_status_updatedAt_idx" ON "public"."Thread"("user2Id" ASC, "status" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE INDEX "Trip_driverId_idx" ON "public"."Trip"("driverId" ASC);

-- CreateIndex
CREATE INDEX "Trip_requesterId_idx" ON "public"."Trip"("requesterId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Trip_rideRequestId_key" ON "public"."Trip"("rideRequestId" ASC);

-- CreateIndex
CREATE INDEX "UsageCounter_userId_feature_idx" ON "public"."UsageCounter"("userId" ASC, "feature" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_userId_feature_windowStart_key" ON "public"."UsageCounter"("userId" ASC, "feature" ASC, "windowStart" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "public"."User"("phone" ASC);

-- CreateIndex
CREATE INDEX "UserBlock_blockedId_idx" ON "public"."UserBlock"("blockedId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "public"."UserBlock"("blockerId" ASC, "blockedId" ASC);

-- CreateIndex
CREATE INDEX "UserBlock_blockerId_idx" ON "public"."UserBlock"("blockerId" ASC);

-- CreateIndex
CREATE INDEX "UserReport_createdAt_idx" ON "public"."UserReport"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "UserReport_reportedUserId_idx" ON "public"."UserReport"("reportedUserId" ASC);

-- CreateIndex
CREATE INDEX "UserReport_reporterId_idx" ON "public"."UserReport"("reporterId" ASC);

-- CreateIndex
CREATE INDEX "UserReport_status_idx" ON "public"."UserReport"("status" ASC);

-- CreateIndex
CREATE INDEX "VerificationRequest_status_createdAt_idx" ON "public"."VerificationRequest"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "VerificationRequest_userId_status_idx" ON "public"."VerificationRequest"("userId" ASC, "status" ASC);

-- AddForeignKey
ALTER TABLE "public"."Announcement" ADD CONSTRAINT "Announcement_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "public"."Compound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Bookmark" ADD CONSTRAINT "Bookmark_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "public"."Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Compound" ADD CONSTRAINT "Compound_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "public"."Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DigestLog" ADD CONSTRAINT "DigestLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmergencyAlert" ADD CONSTRAINT "EmergencyAlert_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmergencyAlert" ADD CONSTRAINT "EmergencyAlert_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "public"."Neighborhood"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmergencyAlert" ADD CONSTRAINT "EmergencyAlert_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmergencyAlertDismissal" ADD CONSTRAINT "EmergencyAlertDismissal_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "public"."EmergencyAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmergencyAlertDismissal" ADD CONSTRAINT "EmergencyAlertDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmergencyAlertRequest" ADD CONSTRAINT "EmergencyAlertRequest_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "public"."Neighborhood"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmergencyAlertRequest" ADD CONSTRAINT "EmergencyAlertRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmergencyAlertRequest" ADD CONSTRAINT "EmergencyAlertRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InviteCode" ADD CONSTRAINT "InviteCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InviteFraudSignal" ADD CONSTRAINT "InviteFraudSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InviteRedemption" ADD CONSTRAINT "InviteRedemption_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InviteRedemption" ADD CONSTRAINT "InviteRedemption_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "public"."Compound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "public"."Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Neighborhood" ADD CONSTRAINT "Neighborhood_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "public"."City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotifPreference" ADD CONSTRAINT "NotifPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Poll" ADD CONSTRAINT "Poll_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PollComment" ADD CONSTRAINT "PollComment_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "public"."Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PollReaction" ADD CONSTRAINT "PollReaction_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "public"."Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "public"."Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Post" ADD CONSTRAINT "Post_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "public"."Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reaction" ADD CONSTRAINT "Reaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RideDispute" ADD CONSTRAINT "RideDispute_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "public"."Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RideEvent" ADD CONSTRAINT "RideEvent_rideRequestId_fkey" FOREIGN KEY ("rideRequestId") REFERENCES "public"."RideRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RideMessage" ADD CONSTRAINT "RideMessage_rideRequestId_fkey" FOREIGN KEY ("rideRequestId") REFERENCES "public"."RideRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RideOffer" ADD CONSTRAINT "RideOffer_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RideOffer" ADD CONSTRAINT "RideOffer_rideRequestId_fkey" FOREIGN KEY ("rideRequestId") REFERENCES "public"."RideRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RideRating" ADD CONSTRAINT "RideRating_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "public"."Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RideRequest" ADD CONSTRAINT "RideRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceItem" ADD CONSTRAINT "ServiceItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Thread" ADD CONSTRAINT "Thread_user1Id_fkey" FOREIGN KEY ("user1Id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Thread" ADD CONSTRAINT "Thread_user2Id_fkey" FOREIGN KEY ("user2Id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Trip" ADD CONSTRAINT "Trip_rideRequestId_fkey" FOREIGN KEY ("rideRequestId") REFERENCES "public"."RideRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "public"."Neighborhood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserReport" ADD CONSTRAINT "UserReport_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserReport" ADD CONSTRAINT "UserReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

