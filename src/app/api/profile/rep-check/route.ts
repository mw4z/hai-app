import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/profile/rep-check — returns current reputation total
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ totalRep: 0 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { reputation: true },
  })

  return NextResponse.json({ totalRep: user?.reputation || 0 })
}
