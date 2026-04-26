/**
 * Returns the user's full display name, joining first name and last name
 * with a single space. Trims surrounding whitespace from each part and
 * silently drops empty/missing parts. Returns an empty string when the
 * user object is missing or when both fields are empty — callers should
 * fall back to a localized "Neighbor" placeholder in that case.
 */
export function fullName(
  u: { name?: string | null; lastName?: string | null } | null | undefined
): string {
  if (!u) return ''
  const parts = [u.name?.trim(), u.lastName?.trim()].filter(Boolean) as string[]
  return parts.join(' ')
}
