-- Defense-in-depth: a CHECK constraint that rejects whitespace-only or
-- single-character User.name values at the database layer. Sits BELOW
-- the requireUserReady application gate, in case a future code path
-- forgets to validate.
--
-- Critical: NULL is still allowed for name. The OTP flow legitimately
-- creates User rows before the user has had a chance to enter a name,
-- and the application layer catches the NULL→onboarding redirect path.
-- Making name NOT NULL would break OTP signup.
--
-- name:     LENGTH(TRIM) >= 2 — first names <2 chars are almost
--           certainly empty / typos / "A" placeholders. Mirrors the
--           /api/auth/complete-profile validation exactly.
-- lastName: LENGTH(TRIM) >= 1 — single-letter family initials are a
--           legitimate UX case (some users enter only an initial for
--           privacy). Stricter than name because surnames vary more.
--
-- Run order: this migration MUST come AFTER 20260502_normalize_user_name
-- (which scrubbed any existing offending rows to NULL) — Prisma applies
-- in directory-name order and "name_check" sorts after "name" so the
-- ordering holds.

ALTER TABLE "User"
  ADD CONSTRAINT "User_name_format_check"
  CHECK ("name" IS NULL OR LENGTH(TRIM("name")) >= 2);

ALTER TABLE "User"
  ADD CONSTRAINT "User_lastName_format_check"
  CHECK ("lastName" IS NULL OR LENGTH(TRIM("lastName")) >= 1);
