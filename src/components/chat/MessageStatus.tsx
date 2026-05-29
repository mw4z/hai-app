/**
 * Shared message-status icons for chat surfaces (DM + Square).
 * Original markup lived inline in ChatClient — this file lifts it so
 * Square's bubble can render the identical clock / single-check pattern
 * without duplicating SVG.
 *
 * Two render states:
 *   - sending  → small clock outline (server hasn't confirmed yet)
 *   - sent     → single WhatsApp-style check (server confirmed)
 *
 * DM additionally has delivered (single) + read (double-blue) states;
 * those still live in ChatClient since they depend on the DM-only
 * deliveredAt / readAt fields. This file is intentionally the minimal
 * shared subset.
 */

export function ChatPendingClock() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 11 11"
      className="ml-1 inline-block flex-shrink-0"
      style={{ marginBottom: -1 }}
      aria-label="sending"
    >
      <circle cx="5.5" cy="5.5" r="4.6" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M5.5 5.5 V2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M5.5 5.5 L7.5 5.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

/** Single WhatsApp-style check used for "sent" state. Inherits color
 *  via currentColor so it adapts to whichever status row it lives in. */
export function ChatSentCheck() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 11 11"
      className="ml-1 inline-block flex-shrink-0"
      style={{ marginBottom: -1 }}
      aria-label="sent"
    >
      <path
        d="M9 .786L4.236 7.856 2 5.394"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
