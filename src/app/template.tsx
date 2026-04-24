/**
 * Route-level template — re-mounts on every navigation so the
 * `.hai-page-enter` animation plays fresh on each screen transition.
 * Gives the app an iOS-native push feel (trailing-edge slide + fade)
 * instead of a flash swap between routes.
 *
 * Kept as a server component — it only renders a wrapper div, the
 * animation is pure CSS. RTL/LTR direction is inferred from the
 * `dir` attribute on <html> via [dir="rtl"] selector.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="hai-page-enter">{children}</div>
}
