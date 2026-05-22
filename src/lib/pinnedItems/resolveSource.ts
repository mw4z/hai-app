import { db } from '@/lib/db'

/**
 * Pinned-item source resolver. A pinned item stays visible even after its
 * source post/comment leaves the feed or Highlights — visibility is the
 * pinned item's OWN status/expiry. The ONLY source condition that hides a
 * pinned item is the source being DELETED or moderation-REMOVED.
 *
 * For POST: EXPIRED / ARCHIVED (feed-expiry states) stay available — only
 * REMOVED / HIDDEN (moderation) or a missing row count as unavailable. So
 * pinned items deliberately load expired posts for display.
 *
 * MESSAGE / FILE / LINK / MANUAL_NOTE are self-contained snapshots (the mod
 * supplies title/summary) — always available, never resolved to raw source.
 *
 * Returns the set of pinned-item ids whose source is unavailable, so the
 * resident query can exclude exactly those.
 */
export async function unavailableSourceItemIds(
  items: { id: string; type: string; sourceType: string | null; sourceId: string | null }[],
): Promise<Set<string>> {
  const unavailable = new Set<string>()

  const postItems = items.filter((i) => i.type === 'POST' && i.sourceId)
  const commentItems = items.filter((i) => i.type === 'COMMENT' && i.sourceId)

  if (postItems.length) {
    const ids = Array.from(new Set(postItems.map((i) => i.sourceId!)))
    const posts = await db.post.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } })
    const byId = new Map(posts.map((p) => [p.id, p.status]))
    for (const it of postItems) {
      const status = byId.get(it.sourceId!)
      // missing → deleted; REMOVED/HIDDEN → moderation. Both hide the pin.
      if (!status || status === 'REMOVED' || status === 'HIDDEN') unavailable.add(it.id)
    }
  }

  if (commentItems.length) {
    const ids = Array.from(new Set(commentItems.map((i) => i.sourceId!)))
    const comments = await db.comment.findMany({ where: { id: { in: ids } }, select: { id: true } })
    const present = new Set(comments.map((c) => c.id))
    for (const it of commentItems) {
      if (!present.has(it.sourceId!)) unavailable.add(it.id) // deleted comment
    }
  }

  return unavailable
}
