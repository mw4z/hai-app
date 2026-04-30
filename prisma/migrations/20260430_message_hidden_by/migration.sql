-- "Delete for me" support. Stores the set of userIds who hid this
-- message from their own view. The chat read endpoint filters rows
-- where the current user is in this array. "Delete for everyone"
-- continues to use the existing tombstone path (type=DELETED).

ALTER TABLE "Message" ADD COLUMN "hiddenBy" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
