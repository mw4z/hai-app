-- Mod-side category override audit. Two nullable columns capture who
-- last edited the post's category routing (category / intent /
-- marketplaceType) and when. ModerationLog already records the action
-- text, so this is purely a denormalized "show in PostCard" surface.

ALTER TABLE "Post"
  ADD COLUMN "categoryEditedById" TEXT,
  ADD COLUMN "categoryEditedAt"   TIMESTAMP(3);
