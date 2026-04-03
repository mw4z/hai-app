// ─── API Route Safety Wrapper ────────────────────────────────────────────────
// Wraps API handlers with: try/catch, logging, structured errors, auth check.

import { NextRequest, NextResponse } from 'next/server'
import { getSession, JWTPayload } from '@/lib/auth'
import { log } from '@/lib/logger'

/** Structured API error response */
export function apiErrorResponse(
  message: string,
  status: number,
  code?: string,
) {
  return NextResponse.json(
    { success: false, error: { code: code || `ERR_${status}`, message } },
    { status },
  )
}

/** Success response wrapper */
export function apiSuccess(data: Record<string, unknown> = {}) {
  return NextResponse.json({ success: true, ...data })
}

interface HandlerOptions {
  /** Route name for logging (e.g., 'POST /api/posts') */
  route: string
  /** Require authenticated session (default: true) */
  auth?: boolean
}

type AuthenticatedHandler = (
  req: NextRequest,
  session: JWTPayload,
  params: Record<string, string>,
) => Promise<NextResponse>

type PublicHandler = (
  req: NextRequest,
  session: JWTPayload | null,
  params: Record<string, string>,
) => Promise<NextResponse>

/**
 * Wrap an API handler with standardized error handling, logging, and auth.
 *
 * Usage:
 *   export const POST = safeHandler({ route: 'POST /api/example' }, async (req, session, params) => {
 *     // ... handler logic
 *     return apiSuccess({ data })
 *   })
 */
export function safeHandler(
  options: HandlerOptions & { auth?: true },
  handler: AuthenticatedHandler,
): (req: NextRequest, ctx?: { params?: Record<string, string> }) => Promise<NextResponse>

export function safeHandler(
  options: HandlerOptions & { auth: false },
  handler: PublicHandler,
): (req: NextRequest, ctx?: { params?: Record<string, string> }) => Promise<NextResponse>

export function safeHandler(
  options: HandlerOptions,
  handler: AuthenticatedHandler | PublicHandler,
) {
  const requireAuth = options.auth !== false

  return async (req: NextRequest, ctx?: { params?: Record<string, string> }) => {
    const params = ctx?.params || {}

    try {
      // Auth check
      const session = await getSession()
      if (requireAuth && !session) {
        return apiErrorResponse('يجب تسجيل الدخول / Please sign in', 401, 'AUTH_REQUIRED')
      }

      log.api(req.method || 'UNKNOWN', options.route, session?.userId)

      // Run handler
      return await (handler as any)(req, session, params)
    } catch (error) {
      log.error('Unhandled API error', error, {
        route: options.route,
      })

      // Prisma known errors
      if (isPrismaError(error)) {
        if ((error as any).code === 'P2025') {
          return apiErrorResponse('السجل غير موجود / Record not found', 404, 'NOT_FOUND')
        }
        if ((error as any).code === 'P2002') {
          return apiErrorResponse('القيمة مكررة / Duplicate entry', 409, 'DUPLICATE')
        }
        return apiErrorResponse('خطأ في قاعدة البيانات / Database error', 500, 'DB_ERROR')
      }

      // JSON parse errors
      if (error instanceof SyntaxError && (error as any).message?.includes('JSON')) {
        return apiErrorResponse('بيانات غير صالحة / Invalid request data', 400, 'INVALID_JSON')
      }

      return apiErrorResponse('خطأ في الخادم / Server error', 500, 'INTERNAL_ERROR')
    }
  }
}

function isPrismaError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as any).code === 'string' && (error as any).code.startsWith('P')
}
