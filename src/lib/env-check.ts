// ─── Environment Variable Safety Check ──────────────────────────────────────
// Runs once at import time. Logs warnings for missing/insecure env vars.

const REQUIRED = [
  { key: 'DATABASE_URL', fallback: true },
  { key: 'JWT_SECRET', fallback: true },
] as const

const OPTIONAL = [
  'UNIFONIC_APP_SID',
  'UNIFONIC_SENDER_ID',
  'NEXT_PUBLIC_APP_URL',
] as const

let checked = false

export function checkEnvironment() {
  if (checked) return
  checked = true

  const missing: string[] = []
  const insecure: string[] = []

  for (const { key, fallback } of REQUIRED) {
    const val = process.env[key]
    if (!val) {
      if (fallback) {
        console.warn(`[ENV] ⚠️  ${key} not set — using fallback. Set this in production!`)
        insecure.push(key)
      } else {
        console.error(`[ENV] ❌ ${key} is REQUIRED but not set`)
        missing.push(key)
      }
    }
  }

  // Check for default/insecure JWT secret
  if (process.env.JWT_SECRET === 'fallback-secret-change-in-production' || !process.env.JWT_SECRET) {
    console.warn('[ENV] ⚠️  JWT_SECRET is using fallback — CHANGE THIS before deploying!')
  }

  for (const key of OPTIONAL) {
    if (!process.env[key]) {
      console.warn(`[ENV] ℹ️  ${key} not set (optional)`)
    }
  }

  if (missing.length > 0) {
    console.error(`[ENV] ❌ ${missing.length} required variable(s) missing: ${missing.join(', ')}`)
  }

  if (process.env.NODE_ENV === 'production' && insecure.length > 0) {
    console.error(`[ENV] 🚨 PRODUCTION with insecure defaults: ${insecure.join(', ')}`)
  }
}
