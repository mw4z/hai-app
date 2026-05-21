import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { put } from '@vercel/blob'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// Voice notes: m4a/AAC on native (iOS + Android via the Capgo
// recorder), webm only as the web fallback. Strict caps so a bad /
// hostile client can't store huge blobs.
const MAX_FILE_SIZE = 8 * 1024 * 1024 // 8MB (~ several minutes of AAC)
const ALLOWED: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/aacp': 'm4a',
  'audio/webm': 'webm', // web fallback only
}

/**
 * POST /api/upload-audio  (multipart, field "audio")
 *
 * Uploads a single voice-note file to Blob and returns its URL +
 * normalized MIME + size. Audio only; image/pdf go through their own
 * endpoints. No transcoding — the recorder already produces m4a/AAC
 * on mobile.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('audio') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const ext = ALLOWED[file.type]
    if (!ext) return NextResponse.json({ error: 'نوع صوت غير مدعوم' }, { status: 400 })
    if (!file.size || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'الملف الصوتي كبير جداً' }, { status: 400 })
    }

    const blob = await put(`voice/${crypto.randomUUID()}.${ext}`, file, {
      access: 'public',
      contentType: file.type,
    })

    return NextResponse.json({ url: blob.url, mimeType: file.type, sizeBytes: file.size })
  } catch (error: any) {
    console.error('[UPLOAD-AUDIO ERROR]', error?.message || error)
    return NextResponse.json({ error: error?.message || 'فشل رفع الملف الصوتي' }, { status: 500 })
  }
}
