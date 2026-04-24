/**
 * SUPER_ADMIN bypass — platform-owner accounts are exempt from every
 * user-facing restriction: rate limits, daily/hourly quotas, account-age
 * gates, reputation gates, duplicate-post checks, profanity moderation,
 * neighborhood isolation, ban/status checks, "one active X" limits,
 * and category gender/provider restrictions.
 *
 * Verification gates (requireVerified) already bypass SUPER_ADMIN in
 * requireVerified.ts. This helper is for routes that enforce their own
 * limits without going through requireVerified.
 *
 * Usage at the top of a restricted route:
 *
 *   const user = await db.user.findUnique({
 *     where: { id: session.userId },
 *     select: { id: true, role: true, ... },
 *   })
 *   const bypass = isSuperAdminRole(user?.role)
 *   if (!bypass) {
 *     // run rate-limit + quota + moderation + neighborhood checks here
 *   }
 */
export function isSuperAdminRole(role: string | null | undefined): boolean {
  return role === 'SUPER_ADMIN'
}
