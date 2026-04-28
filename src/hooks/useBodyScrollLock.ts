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
  bodyTouchAction: string
} | null = null

function applyLock() {
  const html = document.documentElement
  const body = document.body
  prev = {
    htmlOverflow: html.style.overflow,
    bodyTouchAction: body.style.touchAction,
  }
  // Lock at the <html> level. iOS WKWebView's document scroll lives
  // on <html>, so this is the one place where overflow:hidden
  // actually stops the page from panning. Setting it on <body>
  // alone is a no-op on iOS — that was the bug behind multiple
  // earlier "still scrolls under the sheet" reports.
  html.style.overflow = 'hidden'
  // touch-action:none on body kills the rubber-band overscroll
  // that would otherwise pan the page even when document scroll is
  // disabled.
  body.style.touchAction = 'none'
  // CRITICAL: do NOT also set `body.style.overflow = 'hidden'`.
  // That makes <body> a scroll container in WebKit's eyes, and
  // every `position: sticky` descendant inside body switches its
  // scrolling-ancestor reference from <html> to <body>. body
  // doesn't scroll (its content already fits), so sticky reverts
  // to its natural in-flow position — header drops below the
  // safe-area cover by exactly env(safe-area-inset-top) and a
  // gap appears above the header the moment a sheet opens. Lock
  // ONLY html.overflow + body.touchAction. Verified manually on
  // iOS: this is the combination that keeps the sticky header
  // pinned at top: env(safe-area-inset-top) during sheet open.
  //
  // Likewise, do NOT use `position: fixed; top: -scrollY` on body.
  // Same containing-block-and-sticky-breaks failure mode.
}

function releaseLock() {
  if (!prev) return
  const html = document.documentElement
  const body = document.body
  html.style.overflow = prev.htmlOverflow
  body.style.touchAction = prev.bodyTouchAction
  prev = null
}

/**
 * Read-only check: is any sheet/modal currently locking scroll?
 * Used by SwipeBack and PullToRefresh to suppress their gesture
 * handlers while a sheet is open. Module-level ref count is the
 * source of truth — no DOM-style sniffing.
 */
export function isBodyScrollLocked(): boolean {
  return lockCount > 0
}

/**
 * Swallow the very next click event on the window in capture phase.
 * Call this RIGHT BEFORE you close a sheet via a backdrop press, so
 * the click event iOS WKWebView synthesises after touchend can't
 * reach whatever underlying element is now at those coordinates
 * (post-close DOM).
 *
 * Why we need this even with onPointerDown + preventDefault: on iOS
 * WKWebView, preventDefault on pointerdown does NOT reliably
 * suppress the compatibility mouse/click events. The clicks are
 * dispatched asynchronously after pointerup, and by then the sheet
 * is gone — so React's pointerdown handlers can't suppress them.
 * A capture-phase click listener on window catches the click before
 * any element-bound onClick can fire and cancels it.
 *
 * Safety net: a 600ms timeout removes the listener if no click
 * arrives — covers cases where the user starts a press on the
 * backdrop and then drags/cancels, so the listener doesn't linger
 * and swallow a legitimate later click.
 */
export function consumeNextClick(): void {
  if (typeof window === 'undefined') return
  let cleared = false
  const swallow = (e: Event) => {
    if (cleared) return
    cleared = true
    e.stopPropagation()
    e.preventDefault()
    window.removeEventListener('click', swallow, true)
  }
  window.addEventListener('click', swallow, true)
  setTimeout(() => {
    if (cleared) return
    cleared = true
    window.removeEventListener('click', swallow, true)
  }, 600)
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
