import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'
import { cookies } from 'next/headers'

/**
 * DELETE /api/account/delete — Self-service account deletion
 *
 * Required by Apple App Store and Google Play for apps with user accounts.
 *
 * Behavior:
 *   1. Soft-delete: sets deletedAt timestamp
 *   2. Anonymize: clears personal data (name, phone, email, avatar, bio)
 *   3. Deactivate: sets status to BANNED_PERM (prevents login)
 *   4. Invalidate session: clears auth cookie
 *   5. Log: creates audit entry
 *
 * Does NOT hard-delete — preserves data integrity for posts/threads.
 * Anonymized user appears as "مستخدم محذوف" / "Deleted User" in existing content.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('DELETE', '/api/account/delete', session.userId)

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, phone: true, name: true, deletedAt: true },
    })
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (user.deletedAt) return NextResponse.json({ error: 'Account already deleted' }, { status: 400 })

    // 1. Anonymize personal data
    await db.user.update({
      where: { id: session.userId },
      data: {
        name: 'مستخدم محذوف',
        lastName: null,
        phone: `deleted_${session.userId}`,
        email: null,
        emailVerified: false,
        avatarUrl: null,
        coverUrl: null,
        bio: null,
        serviceDescription: null,
        serviceAddress: null,
        serviceLat: null,
        serviceLng: null,
        status: 'BANNED_PERM',
        deletedAt: new Date(),
      },
    })

    // 2. Delete catalog items
    await db.serviceItem.deleteMany({ where: { userId: session.userId } })

    // 3. Clear OTP codes
    await db.otpCode.deleteMany({ where: { userId: session.userId } })

    // 4. Clear notifications
    await db.notification.deleteMany({ where: { userId: session.userId } })

    // 5. Log deletion
    log.info('Account deleted (self-service)', {
      route: '/api/account/delete',
      userId: session.userId,
      originalPhone: user.phone?.slice(-4) || '****', // log last 4 digits only
    })

    // 6. Invalidate session cookie
    const cookieStore = cookies()
    cookieStore.delete('hai_token')

    return NextResponse.json({ success: true, message: 'تم حذف حسابك / Account deleted' })
  } catch (error) {
    log.error('Account deletion failed', error, { route: '/api/account/delete' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}
