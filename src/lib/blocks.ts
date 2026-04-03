import { db } from '@/lib/db'

/**
 * Get the set of user IDs that a user has blocked or is blocked by.
 * Used to filter posts, threads, and interactions.
 */
export async function getBlockedUserIds(userId: string): Promise<string[]> {
  const [blockedByMe, blockedMe] = await Promise.all([
    db.userBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
    db.userBlock.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
  ])

  const ids = new Set<string>()
  for (const b of blockedByMe) ids.add(b.blockedId)
  for (const b of blockedMe) ids.add(b.blockerId)
  return Array.from(ids)
}
