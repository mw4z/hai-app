'use client'

/**
 * Compact star widget. Two modes:
 *   - read-only: pass `value`; renders 5 stars with the
 *     first `value` filled in amber. Supports fractional
 *     averages (e.g. 4.3 → 4 full + ~1/3 partial).
 *   - interactive: pass `value` + `onChange`. Tap a star to
 *     pick that rating. Tap the currently-selected star again
 *     to clear (= 0).
 *
 * Used by:
 *   - Place card row (read-only, size=14)
 *   - Place detail header summary (read-only, size=18)
 *   - Review sheet rating picker (interactive, size=32)
 */

interface Props {
  value: number
  onChange?: (next: number) => void
  /** Pixel size of each star — square. */
  size?: number
  /** ARIA label for the picker (interactive mode). */
  ariaLabel?: string
}

export default function StarRating({ value, onChange, size = 16, ariaLabel }: Props) {
  const interactive = typeof onChange === 'function'
  const clamped = Math.max(0, Math.min(5, value || 0))

  function renderStar(i: number) {
    // i is 1..5. Fill amount for this star = clamp(value-i+1, 0, 1).
    const fill = Math.max(0, Math.min(1, clamped - i + 1))
    const StarBody = (
      <span
        className="relative inline-block"
        style={{ width: size, height: size, lineHeight: 0 }}
        aria-hidden
      >
        {/* Empty base layer */}
        <svg
          viewBox="0 0 20 20"
          width={size}
          height={size}
          className="absolute inset-0 text-gray-300 dark:text-gray-600 fill-current"
        >
          <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6.1L10 15l-5.4 3.1 1.2-6.1L1.3 7.8l6.1-.7L10 1.5z" />
        </svg>
        {/* Filled overlay, clipped to fill% width */}
        {fill > 0 && (
          <span
            className="absolute inset-0 overflow-hidden"
            style={{ width: `${fill * 100}%` }}
          >
            <svg
              viewBox="0 0 20 20"
              width={size}
              height={size}
              className="text-amber-400 fill-current"
            >
              <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6.1L10 15l-5.4 3.1 1.2-6.1L1.3 7.8l6.1-.7L10 1.5z" />
            </svg>
          </span>
        )}
      </span>
    )
    if (!interactive) return StarBody
    return (
      <button
        key={i}
        type="button"
        onClick={() => onChange!(i === Math.round(clamped) ? 0 : i)}
        aria-label={`${ariaLabel ?? 'rating'} ${i}`}
        className="active:scale-90 transition-transform p-0.5"
      >
        {StarBody}
      </button>
    )
  }

  return (
    <span dir="ltr" className="inline-flex items-center gap-0.5" role={interactive ? 'group' : 'img'}>
      {[1, 2, 3, 4, 5].map((i) =>
        interactive ? renderStar(i) : <span key={i}>{renderStar(i)}</span>,
      )}
    </span>
  )
}
