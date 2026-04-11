import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { put } from '@vercel/blob'
import crypto from 'crypto'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_FILES = 5
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const files = formData.getAll('images') as File[]

    if (!files || files.length === 0) return NextResponse.json({ error: 'No files' }, { status: 400 })
    if (files.length > MAX_FILES) return NextResponse.json({ error: `أقصى ${MAX_FILES} صور` }, { status: 400 })

    const urls: string[] = []

    // Upload all files in parallel
    const uploads = files.map(async (file) => {
      if (!ALLOWED_TYPES.includes(file.type)) throw new Error('نوع غير مدعوم')
      if (!file.size || file.size > MAX_FILE_SIZE) throw new Error('حجم كبير جداً')

      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const blob = await put(`uploads/${crypto.randomUUID()}.${ext}`, file, {
        access: 'public',
        contentType: file.type,
      })
      return blob.url
    })

    const results = await Promise.all(uploads)
    urls.push(...results)

    return NextResponse.json({ urls })
  } catch (error: any) {
    console.error('[UPLOAD ERROR]', error?.message || error)
    return NextResponse.json({ error: error?.message || 'فشل رفع الملفات' }, { status: 500 })
  }
}
