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

/** Nested shape included with each message so a reply quote can render
 *  inline without a second fetch. Mirrors the DM ChatClient `replyTo`
 *  field; status is exposed so the bubble can show "رسالة غير متاحة"
 *  when the parent was hidden by a moderator. */
export interface PublicSquareReplyTo {
  id: string
  authorId: string
  authorName: string | null
  authorLastName: string | null
  body: string
  status: 'ACTIVE' | 'HIDDEN'
}

export interface PublicSquareMessage {
  id: string
  body: string
  kind: 'GENERAL' | 'QUESTION' | 'NOTE' | 'LIGHT_ALERT'
  status: 'ACTIVE' | 'HIDDEN'
  isPinned: boolean
  pinnedAt: string | null
  replyToMessageId: string | null
  replyTo: PublicSquareReplyTo | null
  createdAt: string
  author: PublicSquareAuthor
  /** True if the viewer is the author — Phase 2 author-side affordances
   *  (edit/delete) can branch on this without an extra lookup. */
  isAuthor: boolean
}

interface RawAuthor {
  id: string
  name: string | null
  lastName: string | null
  avatarUrl: string | null
  reputation: number
  membership: string
  role: string
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
  author: RawAuthor
  /** Loaded via Prisma `include: { replyTo: { include: { author: ... } } }`.
   *  Optional — list endpoints that don't need quotes can skip the
   *  include (the renderer simply won't show a quote). */
  replyTo?: {
    id: string
    authorId: string
    body: string
    status: string
    author: Pick<RawAuthor, 'name' | 'lastName'>
  } | null
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
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          authorId: row.replyTo.authorId,
          authorName: row.replyTo.author.name,
          authorLastName: row.replyTo.author.lastName,
          body: row.replyTo.body,
          status: row.replyTo.status as PublicSquareReplyTo['status'],
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
    isAuthor: row.authorId === ctx.viewerId,
  }
}
