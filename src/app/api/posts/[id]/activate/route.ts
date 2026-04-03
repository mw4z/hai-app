import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  await db.post.update({
    where: { id: params.id, authorId: session.userId },
    data: { status: 'ACTIVE' },
  })

  return NextResponse.redirect(new URL('/feed', req.url))
}
