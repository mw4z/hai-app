/**
 * Extract directory place IDs from a free-text content block.
 *
 * Recognized link shapes:
 *   /directory/{id}
 *   https://app.hai-app.net/directory/{id}
 *   https://<any host>/directory/{id}   (matches NEXT_PUBLIC_BASE_URL
 *                                         on any domain)
 *
 * Bounded so a stray "/directory/" substring inside another URL or
 * a longer slug doesn't false-match. The id must be a 8-40 char
 * cuid-ish token; cuid() defaults to 25 chars but we allow some
 * slack so a future id generator change doesn't break extraction.
 *
 * Caller behaviour:
 *   - returned ids are unique (first occurrence kept)
 *   - capped at MAX_PLACE_PREVIEWS_PER_BLOCK so a hostile body
 *     can't trigger N preview fetches for free
 *   - the original text is NEVER modified — SmartText still auto-
 *     links the URLs in-place; the previews render BELOW the text
 */

export const MAX_PLACE_PREVIEWS_PER_BLOCK = 2

// Capture group 1: the place id.
// Non-capturing leading group accepts either a bare leading "/"
// (relative link) or a full "http(s)://<host>" (absolute link).
// Trailing lookahead allows whitespace, common punctuation, or end
// of string — the id can't run into another word.
const PLACE_LINK_RE =
  /(?:^|\s)(?:https?:\/\/[^\s/]+)?\/directory\/([a-zA-Z0-9_-]{8,40})(?=[\s.,!?؟،;)\]]|$)/g

export function extractPlaceLinks(text: string | null | undefined): string[] {
  if (!text) return []
  const ids: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  // Reset lastIndex defensively in case the regex object got mutated
  // somewhere upstream (it's module-scoped so a parallel call could
  // theoretically race; we re-anchor each call).
  PLACE_LINK_RE.lastIndex = 0
  while ((m = PLACE_LINK_RE.exec(text)) !== null) {
    const id = m[1]
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
    if (ids.length >= MAX_PLACE_PREVIEWS_PER_BLOCK) break
  }
  return ids
}
