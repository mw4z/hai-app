import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { ids } = body as { ids?: string[] }

  await db.notification.updateMany({
    where: {
      userId: session.userId,
      read: false,
      ...(ids?.length ? { id: { in: ids } } : {}),
    },
    data: { read: true },
  })

  return NextResponse.json({ success: true })
}
