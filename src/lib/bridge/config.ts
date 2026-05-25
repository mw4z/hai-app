/**
 * WhatsApp-bridge configuration + limits. Reads env at call time so the
 * flags can flip without a rebuild. Disabled by default — nothing in the
 * bridge does anything until WHATSAPP_BRIDGE_ENABLED=true.
 */
import type { BridgeConfig } from './classify'

export interface FullBridgeConfig extends BridgeConfig {
  ingestSecret: string | null      // shared secret the internal ingest endpoint requires
  systemUserId: string | null      // authorId for unmatched-sender bridge posts
  reviewFirst: boolean             // create posts HIDDEN (mod-review) vs ACTIVE
  senderPepper: string | null      // HMAC pepper for senderHash (never sends the phone)
  // Official WhatsApp Cloud API (forward-to-bot ingestion). All null until set.
  cloud: {
    token: string | null           // permanent access token (WHATSAPP_CLOUD_TOKEN)
    phoneNumberId: string | null    // sending phone-number id (WHATSAPP_PHONE_NUMBER_ID)
    verifyToken: string | null      // webhook GET handshake token
    appSecret: string | null        // for X-Hub-Signature-256 verification
    graphVersion: string            // Graph API version, e.g. v21.0
  }
  // Optional Claude pass — rewrites the message + acts as a 2nd filter.
  // The rule gate still validates whatever the AI returns.
  ai: {
    enabled: boolean
    apiKey: string | null
    model: string
  }
}

export function bridgeConfig(): FullBridgeConfig {
  return {
    enabled: process.env.WHATSAPP_BRIDGE_ENABLED === 'true',
    mode: process.env.WHATSAPP_BRIDGE_MODE || 'test',
    testNeighborhoodId: process.env.WHATSAPP_BRIDGE_TEST_NEIGHBORHOOD_ID || null,
    ingestSecret: process.env.WHATSAPP_BRIDGE_SECRET || null,
    systemUserId: process.env.WHATSAPP_BRIDGE_SYSTEM_USER_ID || null,
    reviewFirst: process.env.WHATSAPP_BRIDGE_REVIEW_FIRST === 'true',
    senderPepper: process.env.WHATSAPP_BRIDGE_SENDER_PEPPER || null,
    cloud: {
      token: process.env.WHATSAPP_CLOUD_TOKEN || null,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || null,
      appSecret: process.env.WHATSAPP_APP_SECRET || null,
      graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v21.0',
    },
    ai: {
      enabled: process.env.WHATSAPP_BRIDGE_AI_ENABLED === 'true',
      apiKey: process.env.ANTHROPIC_API_KEY || null,
      model: process.env.WHATSAPP_BRIDGE_AI_MODEL || 'claude-haiku-4-5',
    },
  }
}

// Conservative limits for the experiment.
export const BRIDGE_LIMITS = {
  perSenderPostsPerDay: 3,
  perNeighborhoodPostsPerHour: 10,
}
