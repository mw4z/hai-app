import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import crypto from 'crypto'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_FILES = 5
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

// Rate limit: max 10 uploads per user per minute (in-memory, resets on restart)
const uploadCounts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = uploadCounts.get(userId)
  if (!entry || now > entry.resetAt) {
    uploadCounts.set(userId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/upload', session.userId)

    if (!checkRateLimit(session.userId)) {
      log.warn('Upload rate limit hit', { route: '/api/upload', userId: session.userId })
      return NextResponse.json({ error: 'حاول لاحقاً' }, { status: 429 })
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const files = formData.getAll('images') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files' }, { status: 400 })
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `أقصى عدد ${MAX_FILES} صور` }, { status: 400 })
    }

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }

    const urls: string[] = []

    for (const file of files) {
      // Validate type
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: 'نوع الملف غير مدعوم. استخدم JPG أو PNG أو WebP' }, { status: 400 })
      }

      // Validate size (double-check)
      if (!file.size || file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'حجم الصورة كبير جداً (أقصى 5 ميقا)' }, { status: 400 })
      }

      // Read file buffer
      let buffer: Buffer
      try {
        const bytes = await file.arrayBuffer()
        buffer = Buffer.from(bytes)
      } catch {
        return NextResponse.json({ error: 'فشل قراءة الملف' }, { status: 400 })
      }

      // Validate it's actually an image by checking magic bytes
      if (!isValidImageBuffer(buffer)) {
        return NextResponse.json({ error: 'الملف ليس صورة صالحة' }, { status: 400 })
      }

      // Generate unique filename
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const filename = `${crypto.randomUUID()}.${ext}`
      const filepath = path.join(UPLOAD_DIR, filename)

      await writeFile(filepath, buffer)
      urls.push(`/uploads/${filename}`)
    }

    log.info('Upload successful', { route: '/api/upload', userId: session.userId, fileCount: urls.length })
    return NextResponse.json({ urls })
  } catch (error) {
    log.error('Upload failed', error, { route: '/api/upload' })
    return NextResponse.json({ error: 'خطأ في رفع الملفات' }, { status: 500 })
  }
}

/** Check magic bytes to verify it's actually an image */
function isValidImageBuffer(buf: Buffer): boolean {
  if (buf.length < 4) return false
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true
  // WebP: RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf.length > 11 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true
  return false
}
