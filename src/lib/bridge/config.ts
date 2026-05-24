/**
 * WhatsApp-bridge configuration + limits. Reads env at call time so the
 * flags can flip without a rebuild. Disabled by default — nothing in the
 * bridge does anything until WHATSAPP_BRIDGE_ENABLED=true.
 */
import type { BridgeConfig } from './classify'

export interface FullBridgeConfig extends BridgeConfig {
  ingestSecret: string | null      // shared secret the ingest endpoint requires
  systemUserId: string | null      // authorId for unmatched-sender bridge posts
  reviewFirst: boolean             // create posts HIDDEN (mod-review) vs ACTIVE
}

export function bridgeConfig(): FullBridgeConfig {
  return {
    enabled: process.env.WHATSAPP_BRIDGE_ENABLED === 'true',
    mode: process.env.WHATSAPP_BRIDGE_MODE || 'test',
    testNeighborhoodId: process.env.WHATSAPP_BRIDGE_TEST_NEIGHBORHOOD_ID || null,
    ingestSecret: process.env.WHATSAPP_BRIDGE_SECRET || null,
    systemUserId: process.env.WHATSAPP_BRIDGE_SYSTEM_USER_ID || null,
    reviewFirst: process.env.WHATSAPP_BRIDGE_REVIEW_FIRST === 'true',
  }
}

// Conservative limits for the experiment.
export const BRIDGE_LIMITS = {
  perSenderPostsPerDay: 3,
  perNeighborhoodPostsPerHour: 10,
}
