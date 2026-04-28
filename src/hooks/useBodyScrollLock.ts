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
let prev: {
  htmlOverflow: string
  htmlOverflowY: string
  bodyOverflow: string
  bodyTouchAction: string
} | null = null

function applyLock() {
  const html = document.documentElement
  const body = document.body
  prev = {
    htmlOverflow: html.style.overflow,
    htmlOverflowY: html.style.overflowY,
    bodyOverflow: body.style.overflow,
    bodyTouchAction: body.style.touchAction,
  }
  // Lock at the <html> level. iOS WKWebView's document scroll lives
  // on <html>, so this is the one place where overflow:hidden
  // actually stops the page from panning under the sheet. Setting
  // it on <body> alone is a no-op on iOS — that was the bug behind
  // multiple earlier "still scrolls under the sheet" reports.
  html.style.overflow = 'hidden'
  html.style.overflowY = 'hidden'
  // touch-action:none on body kills the rubber-band overscroll that
  // would otherwise pan the page even when document scroll is
  // disabled.
  body.style.overflow = 'hidden'
  body.style.touchAction = 'none'
  // CRITICAL: do NOT use `position: fixed; top: -scrollY` on body.
  // It works for scroll lock but turns body into a non-scrolling
  // container — every sticky header in the page (`.glass sticky
  // top-0`) reverts to its in-flow position, dropping below the
  // safe-area cover by exactly env(safe-area-inset-top) (because
  // body still has `padding-top: env(...)` and the sticky no
  // longer pins to viewport top). That is the visible "header
  // pushed down + black gap above it" symptom on iOS.
}

function releaseLock() {
  if (!prev) return
  const html = document.documentElement
  const body = document.body
  html.style.overflow = prev.htmlOverflow
  html.style.overflowY = prev.htmlOverflowY
  body.style.overflow = prev.bodyOverflow
  body.style.touchAction = prev.bodyTouchAction
  prev = null
  // No scroll restore needed: html overflow:hidden preserves the
  // existing scroll position; releasing it leaves the user where
  // they were.
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
