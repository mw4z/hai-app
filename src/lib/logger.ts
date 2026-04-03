// ─── Structured Logger ──────────────────────────────────────────────────────
// Console-based structured logging for API routes and critical operations.
// Format: [TIMESTAMP] [LEVEL] [ROUTE] userId=X action=Y ...details

type LogLevel = 'INFO' | 'WARN' | 'ERROR'

interface LogContext {
  route?: string
  userId?: string
  action?: string
  [key: string]: unknown
}

function formatLog(level: LogLevel, message: string, ctx?: LogContext): string {
  const ts = new Date().toISOString()
  const parts = [`[${ts}]`, `[${level}]`]
  if (ctx?.route) parts.push(`[${ctx.route}]`)
  parts.push(message)
  if (ctx?.userId) parts.push(`userId=${ctx.userId}`)
  if (ctx?.action) parts.push(`action=${ctx.action}`)

  // Add any extra context
  const extra = Object.entries(ctx || {})
    .filter(([k]) => !['route', 'userId', 'action'].includes(k))
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ')
  if (extra) parts.push(extra)

  return parts.join(' ')
}

export const log = {
  info(message: string, ctx?: LogContext) {
    console.log(formatLog('INFO', message, ctx))
  },

  warn(message: string, ctx?: LogContext) {
    console.warn(formatLog('WARN', message, ctx))
  },

  error(message: string, error?: unknown, ctx?: LogContext) {
    const errMsg = error instanceof Error ? error.message : String(error || '')
    const stack = error instanceof Error ? error.stack : undefined
    console.error(formatLog('ERROR', `${message}${errMsg ? ': ' + errMsg : ''}`, ctx))
    if (stack && process.env.NODE_ENV !== 'production') {
      console.error(stack)
    }
  },

  /** Log an API request (call at the start of every handler) */
  api(method: string, route: string, userId?: string) {
    console.log(formatLog('INFO', `${method} request`, { route, userId }))
  },
}
