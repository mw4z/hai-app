import { NextResponse } from 'next/server'
import { getReviewTestPhone } from '@/lib/reviewBypass'

export const dynamic = 'force-dynamic'

/**
 * TEMPORARY diagnostic for the store-reviewer OTP bypass.
 *
 * Reports whether the RUNNING deployment can see the
 * REVIEW_TEST_PHONE / REVIEW_TEST_CODE env vars — without leaking
 * the secret code (only its length, which we need to confirm it's
 * 4 digits, not 6). The test phone itself is non-secret (it's in
 * the Play Console submission), so echoing the normalized form is
 * safe and confirms the normalization.
 *
 * DELETE this route once the bypass is confirmed working.
 */
export async function GET() {
  const code = (process.env.REVIEW_TEST_CODE || '').trim()
  return NextResponse.json({
    phoneConfigured: !!process.env.REVIEW_TEST_PHONE,
    normalizedPhone: getReviewTestPhone(), // null if unset
    codeConfigured: code.length > 0,
    codeLength: code.length, // expect 4
    nodeEnv: process.env.NODE_ENV,
  })
}
