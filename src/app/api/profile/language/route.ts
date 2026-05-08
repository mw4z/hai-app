import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const ALLOWED = new Set(['ar', 'en', 'ur'])

/**
 * PATCH /api/profile/language  { language: 'ar' | 'en' | 'ur' }
 *
 * Mirrors the user's UI language toggle to the server. The push
 * pipeline reads User.language to localize OS cleanup-banner copy
 * per recipient, so banners on the lock screen match the user's
 * actual app language instead of always defaulting to Arabic.
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { language?: string }
  try {
    body = (await req.json()) as { language?: string }
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const lang = (body.language || '').trim().toLowerCase()
  if (!ALLOWED.has(lang)) {
    return NextResponse.json({ error: 'invalid_language' }, { status: 400 })
  }

  await db.user.update({
    where: { id: session.userId },
    data: { language: lang },
  })

  return NextResponse.json({ ok: true, language: lang })
}
