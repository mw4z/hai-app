import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const VALID_LANGS = ['ar', 'en', 'ur'] as const
type TargetLang = (typeof VALID_LANGS)[number]

/**
 * POST /api/translate
 *
 * Translates arbitrary text into one of the three app languages.
 * Uses Google's public `translate_a/single` endpoint (no API key
 * required, same path the Google Translate widget uses). Called
 * on-demand from the post card when the viewer taps "Translate"
 * on a post written in a different language than the current UI.
 *
 * Body: { text: string, target: 'ar' | 'en' | 'ur' }
 * Returns: { translated: string, detectedSource?: string }
 *
 * The endpoint intentionally doesn't persist translations — the
 * client caches them in-memory per session.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { text?: string; target?: string } | null
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const target = body?.target as TargetLang
  if (!text) return NextResponse.json({ error: 'empty_text' }, { status: 400 })
  if (text.length > 3000) return NextResponse.json({ error: 'text_too_long' }, { status: 400 })
  if (!VALID_LANGS.includes(target)) {
    return NextResponse.json({ error: 'invalid_target' }, { status: 400 })
  }

  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=auto&tl=${encodeURIComponent(target)}` +
    `&dt=t&q=${encodeURIComponent(text)}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        // A real-browser UA keeps the public endpoint happy
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: 'translate_failed', status: res.status },
        { status: 502 },
      )
    }
    const data = (await res.json()) as unknown
    // Response shape: [ [ [ "translated chunk", "source chunk", …], … ], … , detectedLang ]
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      return NextResponse.json({ error: 'invalid_upstream' }, { status: 502 })
    }
    const chunks = (data[0] as any[])
      .map((row) => (Array.isArray(row) && typeof row[0] === 'string' ? row[0] : ''))
      .filter(Boolean)
    const translated = chunks.join('').trim()
    const detectedSource =
      typeof data[2] === 'string' ? (data[2] as string) : undefined

    if (!translated) {
      return NextResponse.json({ error: 'empty_translation' }, { status: 502 })
    }
    return NextResponse.json({ translated, detectedSource })
  } catch (err) {
    console.error('[TRANSLATE] upstream failed', err)
    return NextResponse.json({ error: 'translate_failed' }, { status: 502 })
  }
}
