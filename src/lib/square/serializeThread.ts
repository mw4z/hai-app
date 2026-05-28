/**
 * DB row → wire/UI shape for Square threads and replies. Keeps the API
 * + SSR layer talking to the components in one stable contract — adding
 * a field is a single edit here, not 20 grep'd renames across the
 * client tree.
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

export interface PublicSquareThread {
  id: string
  title: string
  body: string | null
  type: 'QUESTION' | 'NOTE' | 'DISCUSSION' | 'LIGHT_ALERT'
  status: 'ACTIVE' | 'HIDDEN'
  isPinned: boolean
  pinnedAt: string | null
  replyCount: number
  followerCount: number
  lastActivityAt: string
  createdAt: string
  author: PublicSquareAuthor
  /** True if the viewer is the author. Convenience for "edit/delete"
   *  affordances on the detail screen. */
  isAuthor: boolean
  /** True if the viewer is following this thread. */
  isFollowing: boolean
}

export interface PublicSquareReply {
  id: string
  body: string
  status: 'ACTIVE' | 'HIDDEN'
  isMarkedHelpful: boolean
  createdAt: string
  author: PublicSquareAuthor
  /** True if the viewer is the reply author. */
  isAuthor: boolean
}

interface RawThread {
  id: string
  title: string
  body: string | null
  type: string
  status: string
  isPinned: boolean
  pinnedAt: Date | null
  replyCount: number
  followerCount: number
  lastActivityAt: Date
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

export function serializeSquareThread(
  row: RawThread,
  ctx: { viewerId: string; followingThreadIds: Set<string> },
): PublicSquareThread {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type as PublicSquareThread['type'],
    status: row.status as PublicSquareThread['status'],
    isPinned: row.isPinned,
    pinnedAt: row.pinnedAt ? row.pinnedAt.toISOString() : null,
    replyCount: row.replyCount,
    followerCount: row.followerCount,
    lastActivityAt: row.lastActivityAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    author: row.author,
    isAuthor: row.authorId === ctx.viewerId,
    isFollowing: ctx.followingThreadIds.has(row.id),
  }
}

interface RawReply {
  id: string
  body: string
  status: string
  isMarkedHelpful: boolean
  createdAt: Date
  authorId: string
  author: RawThread['author']
}

export function serializeSquareReply(
  row: RawReply,
  ctx: { viewerId: string },
): PublicSquareReply {
  return {
    id: row.id,
    body: row.body,
    status: row.status as PublicSquareReply['status'],
    isMarkedHelpful: row.isMarkedHelpful,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
    isAuthor: row.authorId === ctx.viewerId,
  }
}
