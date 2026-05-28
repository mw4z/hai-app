/**
 * DB row → wire/UI shape for Square messages. Mirrors the DM Message
 * shape one-for-one MINUS image uploads (stickers use the
 * "sticker:<id>" sentinel in imageUrl, same as DM).
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

export interface PublicSquareReplyTo {
  id: string
  authorId: string
  authorName: string | null
  authorLastName: string | null
  body: string | null
  type: 'TEXT' | 'LOCATION' | 'PDF' | 'VOICE' | 'STICKER' | 'DELETED'
  status: 'ACTIVE' | 'HIDDEN'
}

export type SquareMessageType = 'TEXT' | 'LOCATION' | 'PDF' | 'VOICE' | 'STICKER' | 'DELETED'

export interface SquareReaction {
  emoji: string
  userId: string
}

export interface PublicSquareMessage {
  id: string
  type: SquareMessageType
  body: string | null
  kind: 'GENERAL' | 'QUESTION' | 'NOTE' | 'LIGHT_ALERT'
  status: 'ACTIVE' | 'HIDDEN'
  isPinned: boolean
  pinnedAt: string | null
  /** Set when the author has fired "notify neighbors" on this
   *  message. Drives the small 🔔 indicator on the bubble and the
   *  "already fired" guard in the long-press menu. */
  notificationFiredAt: string | null
  /** Per-user reactions, same shape DM Message uses. One entry per
   *  reactor; the toggle endpoint enforces uniqueness. */
  reactions: SquareReaction[]
  replyToMessageId: string | null
  replyTo: PublicSquareReplyTo | null
  createdAt: string
  author: PublicSquareAuthor
  isAuthor: boolean

  // Type-specific payload — exactly one of these surfaces in the UI
  // depending on `type`. All null on a TEXT message.
  lat: number | null
  lng: number | null
  pdfUrl: string | null
  pdfName: string | null
  audioUrl: string | null
  audioDurationMs: number | null
  audioMimeType: string | null
  /** Stickers only. "sticker:<id>" sentinel (Square forbids arbitrary
   *  image URLs at the API layer). */
  imageUrl: string | null
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
  type: string
  body: string | null
  kind: string
  status: string
  isPinned: boolean
  pinnedAt: Date | null
  notificationFiredAt: Date | null
  reactions: unknown
  replyToMessageId: string | null
  createdAt: Date
  authorId: string
  author: RawAuthor
  lat: number | null
  lng: number | null
  pdfUrl: string | null
  pdfName: string | null
  audioUrl: string | null
  audioDurationMs: number | null
  audioMimeType: string | null
  audioSizeBytes: number | null
  imageUrl: string | null
  replyTo?: {
    id: string
    authorId: string
    body: string | null
    type: string
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
    type: row.type as SquareMessageType,
    body: row.body,
    kind: row.kind as PublicSquareMessage['kind'],
    status: row.status as PublicSquareMessage['status'],
    isPinned: row.isPinned,
    pinnedAt: row.pinnedAt ? row.pinnedAt.toISOString() : null,
    notificationFiredAt: row.notificationFiredAt
      ? row.notificationFiredAt.toISOString()
      : null,
    reactions: Array.isArray(row.reactions)
      ? (row.reactions as SquareReaction[]).filter(
          (r) => r && typeof r.emoji === 'string' && typeof r.userId === 'string',
        )
      : [],
    replyToMessageId: row.replyToMessageId,
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          authorId: row.replyTo.authorId,
          authorName: row.replyTo.author.name,
          authorLastName: row.replyTo.author.lastName,
          body: row.replyTo.body,
          type: row.replyTo.type as PublicSquareReplyTo['type'],
          status: row.replyTo.status as PublicSquareReplyTo['status'],
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
    isAuthor: row.authorId === ctx.viewerId,
    lat: row.lat,
    lng: row.lng,
    pdfUrl: row.pdfUrl,
    pdfName: row.pdfName,
    audioUrl: row.audioUrl,
    audioDurationMs: row.audioDurationMs,
    audioMimeType: row.audioMimeType,
    imageUrl: row.imageUrl,
  }
}
