import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

// Client-side direct upload — browser sends files straight to Vercel Blob
// This endpoint only handles token generation and validation, not the file data
export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const session = await getSession()
        if (!session) throw new Error('غير مصرح')

        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: 5 * 1024 * 1024, // 5MB
          tokenPayload: JSON.stringify({ userId: session.userId }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Optional: log completed uploads
        try {
          const { userId } = JSON.parse(tokenPayload || '{}')
          console.log(`[UPLOAD] completed: ${blob.url} by ${userId}`)
        } catch {}
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error: any) {
    console.error('[UPLOAD ERROR]', error?.message || error)
    return NextResponse.json({ error: error?.message || 'فشل رفع الملفات' }, { status: 400 })
  }
}
