import { NextResponse } from 'next/server'

export async function POST() {
  const { cookies } = await import('next/headers')
  cookies().delete('hai_token')
  return NextResponse.json({ success: true })
}
