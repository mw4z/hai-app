-- CreateTable
CREATE TABLE "PostSubscription" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostSubscription_userId_createdAt_idx" ON "PostSubscription"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PostSubscription_postId_idx" ON "PostSubscription"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostSubscription_postId_userId_key" ON "PostSubscription"("postId", "userId");

-- AddForeignKey
ALTER TABLE "PostSubscription" ADD CONSTRAINT "PostSubscription_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostSubscription" ADD CONSTRAINT "PostSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
