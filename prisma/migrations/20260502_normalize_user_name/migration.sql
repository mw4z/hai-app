-- Backfill: any User.name that's whitespace-only (or an empty string)
-- becomes NULL, so the new requireCompleteProfile gate redirects those
-- accounts to /onboarding instead of treating them as complete.
--
-- TRIM(name) IS NULL OR LENGTH(TRIM(name)) = 0 covers:
--   - "  " (whitespace pre-fix)
--   - ""   (empty string, just in case)
-- Existing well-formed names are untouched. Same treatment for lastName.
--
-- Not adding NOT NULL yet — the OTP flow legitimately creates rows
-- before the user has had a chance to enter a name. The application-
-- layer guard (requireCompleteProfile) is the enforcement point until
-- every active user has been onboarded.

UPDATE "User"
   SET "name" = NULL
 WHERE "name" IS NOT NULL
   AND LENGTH(TRIM("name")) = 0;

UPDATE "User"
   SET "lastName" = NULL
 WHERE "lastName" IS NOT NULL
   AND LENGTH(TRIM("lastName")) = 0;
