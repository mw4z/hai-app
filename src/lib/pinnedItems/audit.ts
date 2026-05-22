import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

type PinnedAction = 'PIN' | 'UPDATE' | 'HIDE' | 'UNHIDE' | 'EXPIRE' | 'REMOVE' | 'REORDER'

/** Record a pinned-item moderator action. Best-effort: a logging failure
 *  must never roll back the action itself. */
export async function logPinnedAudit(opts: {
  pinnedItemId: string
  actorId: string
  action: PinnedAction
  oldValue?: unknown
  newValue?: unknown
}): Promise<void> {
  try {
    await db.neighborhoodPinnedItemAuditLog.create({
      data: {
        pinnedItemId: opts.pinnedItemId,
        actorId: opts.actorId,
        action: opts.action,
        oldValueJson: (opts.oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
        newValueJson: (opts.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (err) {
    console.error('[pinned-audit] failed:', err)
  }
}
