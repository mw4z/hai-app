/**
 * Load FCM credentials from environment variables.
 *
 * Supports two input formats:
 *
 *  1. FCM_SERVICE_ACCOUNT_BASE64 — the entire service account JSON file
 *     base64-encoded as a single line. Most paste-proof format; takes
 *     priority when present.
 *
 *  2. FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY — the classic
 *     three-field format. The private key may contain literal `\n`
 *     escape sequences (unescaped at runtime) OR real newlines. Stray
 *     `\r` carriage returns (from Windows clipboard) are stripped.
 *
 * Returns null if no valid credentials are found.
 */
export function loadFcmCredentials(): {
  projectId: string
  clientEmail: string
  privateKey: string
} | null {
  // Preferred: single base64-encoded JSON
  const b64 = process.env.FCM_SERVICE_ACCOUNT_BASE64
  if (b64) {
    try {
      const decoded = Buffer.from(b64, 'base64').toString('utf-8')
      const json = JSON.parse(decoded) as {
        project_id?: string
        client_email?: string
        private_key?: string
      }
      if (json.project_id && json.client_email && json.private_key) {
        return {
          projectId: json.project_id,
          clientEmail: json.client_email,
          privateKey: json.private_key,
        }
      }
    } catch (err) {
      console.error('[FCM] base64 decode failed:', err)
    }
  }

  // Fallback: three separate env vars
  const projectId = process.env.FCM_PROJECT_ID
  const clientEmail = process.env.FCM_CLIENT_EMAIL
  let privateKey = process.env.FCM_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) return null

  // Normalize: unescape `\n`, strip CRLF, trim whitespace, strip stray quotes
  privateKey = privateKey.replace(/\\n/g, '\n').replace(/\r/g, '').trim()
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1)
  }

  return { projectId, clientEmail, privateKey }
}
