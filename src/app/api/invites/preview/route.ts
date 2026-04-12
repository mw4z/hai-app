import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { INVITE_CODE_PATTERN } from '@/lib/invites'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const code = (new URL(req.url).searchParams.get('code') || '')
    .trim()
    .toUpperCase()

  if (!code || !INVITE_CODE_PATTERN.test(code)) {
    return NextResponse.json({ valid: false })
  }

  const row = await db.inviteCode.findUnique({
    where: { code },
    select: {
      user: {
        select: {
          name: true,
          status: true,
          neighborhood: { select: { name: true, nameEn: true } },
        },
      },
    },
  })

  if (!row || !row.user) return NextResponse.json({ valid: false })
  if (
    row.user.status === 'BANNED_TEMP' ||
    row.user.status === 'BANNED_PERM'
  ) {
    return NextResponse.json({ valid: false })
  }

  return NextResponse.json({
    valid: true,
    inviterName: row.user.name ?? null,
    neighborhoodName: row.user.neighborhood?.name ?? null,
    neighborhoodNameEn: row.user.neighborhood?.nameEn ?? null,
  })
}
