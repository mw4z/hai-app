-- Notification presets + quiet hours.
-- Additive only: 1 enum + 5 nullable-defaulted user columns.
-- Existing users default to BALANCED preset, quiet hours 22:00–07:00 KSA.

CREATE TYPE "NotificationPreset" AS ENUM ('URGENT_ONLY', 'BALANCED', 'EVERYTHING', 'MANUAL');

ALTER TABLE "User"
  ADD COLUMN "notificationPreset" "NotificationPreset" NOT NULL DEFAULT 'BALANCED',
  ADD COLUMN "quietHoursEnabled"  BOOLEAN              NOT NULL DEFAULT true,
  ADD COLUMN "quietHoursStart"    INTEGER              NOT NULL DEFAULT 1320,
  ADD COLUMN "quietHoursEnd"      INTEGER              NOT NULL DEFAULT 420,
  ADD COLUMN "timezone"           TEXT                 NOT NULL DEFAULT 'Asia/Riyadh';
