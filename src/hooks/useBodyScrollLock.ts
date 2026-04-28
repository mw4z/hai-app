'use client'

import { useEffect } from 'react'

/**
 * Shared body scroll lock for sheets/modals/dialogs.
 *
 * Uses the iOS-safe `position: fixed; top: -scrollY` pattern. On iOS
 * WKWebView, `body { overflow: hidden }` alone does NOT stop document
 * scroll — the page still pans under the open sheet. Anchoring the
 * body with position:fixed is the only reliable cross-WebView lock.
 *
 * Why a module-level ref count instead of per-sheet effects: nested
 * sheets (QuickAskSheet → ImageSourceSheet, BottomNav → confirm
 * dialog) used to fight over body.style — whichever closed first
 * would restore the un-locked state and scroll-jump while the outer
 * sheet was still open. Counting locks means the body stays locked
 * until the LAST sheet closes, and the original scroll position is
 * the one captured by the FIRST lock.
 *
 * Why this is preferable to a per-component implementation: the
 * "gap above header on iOS" was caused by inconsistent locks across
 * sheets. Centralising it ensures every sheet gets identical
 * behaviour and the same correct scrollY restore on close.
 */

// Module-level state shared across hook instances.
let lockCount = 0
let lockedScrollY = 0
let prev: {
  position: string
  top: string
  width: string
  overflow: string
} | null = null

function applyLock() {
  lockedScrollY = window.scrollY
  prev = {
    position: document.body.style.position,
    top: document.body.style.top,
    width: document.body.style.width,
    overflow: document.body.style.overflow,
  }
  document.body.style.position = 'fixed'
  document.body.style.top = `-${lockedScrollY}px`
  document.body.style.width = '100%'
  document.body.style.overflow = 'hidden'
}

function releaseLock() {
  if (!prev) return
  document.body.style.position = prev.position
  document.body.style.top = prev.top
  document.body.style.width = prev.width
  document.body.style.overflow = prev.overflow
  prev = null
  // iOS resets scroll to 0 when position:fixed is cleared. Restore
  // the position the user was at when the first sheet opened.
  window.scrollTo(0, lockedScrollY)
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (lockCount === 0) applyLock()
    lockCount += 1
    return () => {
      lockCount -= 1
      if (lockCount === 0) releaseLock()
    }
  }, [active])
}
