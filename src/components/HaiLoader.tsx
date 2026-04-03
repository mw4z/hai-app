'use client'

/**
 * HaiLoader — Branded loading animation using the Hai logo dots.
 *
 * Sizes:
 *   'sm'   → inline (buttons, cards) — 24px
 *   'md'   → section loading — 40px
 *   'lg'   → full page loading — 64px
 *   'page' → full screen with background
 */

type Size = 'sm' | 'md' | 'lg' | 'page'

export default function HaiLoader({ size = 'md' }: { size?: Size }) {
  const dims: Record<Size, number> = { sm: 24, md: 40, lg: 64, page: 64 }
  const d = dims[size]

  const loader = (
    <div className="hai-loader" style={{ width: d, height: d }} role="status" aria-label="Loading">
      <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
        {/* Center dot — pulses */}
        <circle className="hai-dot hai-dot-center" cx="32" cy="35" r="6" fill="currentColor" />
        {/* Top dot */}
        <circle className="hai-dot hai-dot-top" cx="32" cy="15" r="4" fill="currentColor" />
        {/* Bottom-right dot */}
        <circle className="hai-dot hai-dot-br" cx="48" cy="47" r="4" fill="currentColor" />
        {/* Bottom-left dot */}
        <circle className="hai-dot hai-dot-bl" cx="16" cy="47" r="4" fill="currentColor" />
        {/* Connecting arcs — rotate */}
        <path
          className="hai-orbit"
          d="M32 15 Q50 25 48 47 Q32 55 16 47 Q14 25 32 15Z"
          stroke="currentColor"
          strokeWidth="1"
          fill="none"
          strokeDasharray="6 8"
          opacity="0.2"
        />
      </svg>
    </div>
  )

  if (size === 'page') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 text-primary-600">
        {loader}
      </div>
    )
  }

  return <div className="flex items-center justify-center text-primary-600">{loader}</div>
}

/** Tiny inline spinner for buttons — just the center dot pulsing */
export function HaiSpinner() {
  return (
    <div className="hai-loader inline-flex" style={{ width: 18, height: 18 }} role="status">
      <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
        <circle className="hai-dot hai-dot-center" cx="32" cy="35" r="6" fill="currentColor" />
        <circle className="hai-dot hai-dot-top" cx="32" cy="15" r="4" fill="currentColor" />
        <circle className="hai-dot hai-dot-br" cx="48" cy="47" r="4" fill="currentColor" />
        <circle className="hai-dot hai-dot-bl" cx="16" cy="47" r="4" fill="currentColor" />
      </svg>
    </div>
  )
}
