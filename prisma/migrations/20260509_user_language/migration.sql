-- Add User.language: persisted UI language preference, used by the
-- push pipeline to localize the OS-level cleanup banner copy
-- ("🗑️ Jawad deleted a message" / "🗑️ حذف جواد الرسالة" / etc.)
-- per recipient.
ALTER TABLE "User" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'ar';
