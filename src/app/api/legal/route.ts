import { NextResponse } from 'next/server'

/** GET /api/legal — Public legal URLs for app review / in-app links */
export async function GET() {
  return NextResponse.json({
    privacy_policy_url: '/privacy',
    terms_of_service_url: '/terms',
    support_email: 'support@hai-app.com',
    data_deletion_url: '/profile#delete-account',
  })
}
