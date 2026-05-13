-- PDF attachments on Post, Comment, and Message.
-- Apply to Supabase manually (the Vercel build skips `prisma migrate
-- deploy` per project_db_migrations memory — without these columns
-- applied, posts.pdfUrl / comments.pdfUrl / messages.pdfUrl + the
-- new MessageType.PDF enum value will 500 the app the moment a user
-- attaches a PDF).

ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "pdfUrl"  TEXT,
  ADD COLUMN IF NOT EXISTS "pdfName" TEXT;

ALTER TABLE "Comment"
  ADD COLUMN IF NOT EXISTS "pdfUrl"  TEXT,
  ADD COLUMN IF NOT EXISTS "pdfName" TEXT;

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "pdfUrl"  TEXT,
  ADD COLUMN IF NOT EXISTS "pdfName" TEXT;

-- Extend the MessageType enum with PDF. `IF NOT EXISTS` makes this
-- safe to re-run.
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'PDF';
