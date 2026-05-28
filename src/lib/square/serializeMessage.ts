/**
 * DB row → wire/UI shape for Square messages. One model, one
 * serializer — the pivot away from threads collapses the thread+reply
 * pair to a single SquareMessage row.
 */

export interface PublicSquareAuthor {
  id: string
  name: string | null
  lastName: string | null
  avatarUrl: string | null
  reputation: number
  membership: string
  role: string
}

export interface PublicSquareMessage {
  id: string
  body: string
  kind: 'GENERAL' | 'QUESTION' | 'NOTE' | 'LIGHT_ALERT'
  status: 'ACTIVE' | 'HIDDEN'
  isPinned: boolean
  pinnedAt: string | null
  replyToMessageId: string | null
  createdAt: string
  author: PublicSquareAuthor
  /** True if the viewer is the author — Phase 2 author-side affordances
   *  (edit/delete) can branch on this without an extra lookup. */
  isAuthor: boolean
}

interface RawMessage {
  id: string
  body: string
  kind: string
  status: string
  isPinned: boolean
  pinnedAt: Date | null
  replyToMessageId: string | null
  createdAt: Date
  authorId: string
  author: {
    id: string
    name: string | null
    lastName: string | null
    avatarUrl: string | null
    reputation: number
    membership: string
    role: string
  }
}

export function serializeSquareMessage(
  row: RawMessage,
  ctx: { viewerId: string },
): PublicSquareMessage {
  return {
    id: row.id,
    body: row.body,
    kind: row.kind as PublicSquareMessage['kind'],
    status: row.status as PublicSquareMessage['status'],
    isPinned: row.isPinned,
    pinnedAt: row.pinnedAt ? row.pinnedAt.toISOString() : null,
    replyToMessageId: row.replyToMessageId,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
    isAuthor: row.authorId === ctx.viewerId,
  }
}
