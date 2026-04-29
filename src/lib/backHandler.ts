/**
 * Coordinated back-press handler stack. Any open overlay (sheet,
 * popover, drawer) pushes a close handler while it's mounted; the
 * top of the stack runs on the next back press, and routing /
 * navigation is suppressed until all overlays are closed.
 *
 * Why a single shared stack instead of per-component listeners:
 * Capacitor's App.backButton fires ALL listeners on every press
 * with no native preventDefault. Two listeners (overlay close +
 * router.back) would both run and the user would close the menu
 * AND lose their page in one tap. The stack lets the overlay
 * "claim" the press and tell the router-level handler to stand
 * down.
 *
 * Last-in / first-out: the most recently mounted overlay handles
 * the back press first. So a confirm dialog opened on top of the
 * comments sheet, opened on top of the post page, closes the
 * confirm dialog — not the comments sheet, not the page.
 */

type BackHandler = () => void

const stack: BackHandler[] = []

/**
 * Register a back-press handler. Returns an unregister function the
 * caller MUST call when the overlay closes.
 */
export function pushBackHandler(handler: BackHandler): () => void {
  stack.push(handler)
  return () => {
    const i = stack.lastIndexOf(handler)
    if (i >= 0) stack.splice(i, 1)
  }
}

/**
 * Try to handle a back press by invoking the topmost registered
 * handler. Returns true when a handler ran (caller should suppress
 * routing), false when the stack was empty.
 */
export function tryHandleBack(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  try {
    top()
  } catch { /* swallow — never let a handler crash routing */ }
  return true
}

/**
 * Read-only check: are any overlays currently registered? Useful
 * for swipe-back / pull-to-refresh guards that need to suppress
 * their gesture while a sheet is open.
 */
export function hasOpenOverlay(): boolean {
  return stack.length > 0
}
