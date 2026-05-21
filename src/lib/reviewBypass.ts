/**
 * Store-reviewer login bypass (Google Play / App Store).
 *
 * Hai logs in via phone OTP (Twilio Verify). Store review teams
 * can't receive an SMS sent to a Saudi number, so they get stuck
 * at the login screen — which is exactly the "App access" rejection
 * Google issues ("invalid credentials / no demo account provided").
 *
 * This module designates ONE phone number where:
 *   - send-otp skips Twilio (no SMS) and is exempt from rate limits
 *   - verify-otp accepts a single fixed code without calling Twilio
 *
 * It is gated entirely behind env vars. If REVIEW_TEST_PHONE or
 * REVIEW_TEST_CODE is unset, there is NO bypass and every number
 * behaves exactly as before. To use:
 *   1. Set REVIEW_TEST_PHONE (e.g. 0500000000) + REVIEW_TEST_CODE
 *      (a non-obvious 6-digit code) in the Vercel production env.
 *   2. Declare the number + code in Play Console → App access.
 *   3. Rotate/remove the env vars after approval if you want the
 *      bypass gone.
 *
 * Security notes:
 *   - The bypass only ever logs in as ONE specific account, which
 *     is a normal resident with no elevated role.
 *   - No SMS cost, no Twilio dependency for that number.
 *   - Keep REVIEW_TEST_CODE out of the repo — it lives only in env.
 */

import { formatSaudiPhone } from './auth'

/** The formatted (+966…) reviewer phone, or null when unconfigured. */
export function getReviewTestPhone(): string | null {
  const raw = process.env.REVIEW_TEST_PHONE
  if (!raw || !raw.trim()) return null
  return formatSaudiPhone(raw.trim())
}

/** True when the given already-formatted phone is the reviewer number. */
export function isReviewTestPhone(formattedPhone: string): boolean {
  const test = getReviewTestPhone()
  return test !== null && formattedPhone === test
}

/** True when the supplied code matches the configured fixed code. */
export function isReviewTestCode(code: string): boolean {
  const expected = process.env.REVIEW_TEST_CODE
  return !!expected && !!expected.trim() && code.trim() === expected.trim()
}
