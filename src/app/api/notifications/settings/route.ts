import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const VALID_FIELDS = [
  'notifyComments', 'notifyReactions', 'notifyReplies', 'notifyLookingFor',
  'notifyMessages', 'notifyRides', 'notifySystem',
]

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      notifyComments: true, notifyReactions: true, notifyReplies: true, notifyLookingFor: true,
      notifyMessages: true, notifyRides: true, notifySystem: true,
    },
  })

  return NextResponse.json(user)
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const data: Record<string, boolean> = {}

  for (const field of VALID_FIELDS) {
    if (typeof body[field] === 'boolean') data[field] = body[field]
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  await db.user.update({ where: { id: session.userId }, data })
  return NextResponse.json({ success: true })
}
