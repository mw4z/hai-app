'use client'

/**
 * HaiGuideMascot — the friendly "مرشد حي" character used in the
 * first-run guide. Pure inline SVG + scoped CSS, no external assets,
 * no animation libraries.
 *
 * Visual language honours the real Hai app icon (public/icon-192.svg):
 *   • rounded-square teal body (#00b894 → #005c48 gradient)
 *   • white center "face dot" — same dot the icon uses as the
 *     neighborhood hub
 *   • white outer dot waves like a little hand
 *
 * Idle animations (CSS-only):
 *   • gentle float (4s loop)
 *   • soft glow pulse (4s loop, offset)
 *   • blink every ~5s
 *   • small wave on the side dot every ~6s
 *
 * All animations gated on the standard `prefers-reduced-motion`
 * media query — when the user has reduced motion turned on, the
 * mascot renders as a static badge with the same colors.
 *
 * Props:
 *   - size:   visual diameter in px (default 56)
 *   - direction: which side the wave should bias toward — useful
 *               when the mascot sits next to a spotlight and we
 *               want it to feel like it's pointing at the target.
 *               'left' = wave to the left, 'right' = wave to the
 *               right, 'idle' = centered wave.
 */
export default function HaiGuideMascot({
  size = 56,
  direction = 'idle',
}: {
  size?: number
  direction?: 'left' | 'right' | 'idle'
}) {
  // Unique gradient IDs so multiple instances don't share defs.
  // Stable across renders so SSR + hydration agree.
  const gid = 'hai-mascot-grad'
  const gloid = 'hai-mascot-glow'

  return (
    <span
      className={`hai-mascot hai-mascot--${direction}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" width={size} height={size} className="hai-mascot__svg">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00b894" />
            <stop offset="100%" stopColor="#005c48" />
          </linearGradient>
          <radialGradient id={gloid} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00d4a8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#00b894" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft glow behind the body — pulses on idle. */}
        <circle className="hai-mascot__glow" cx="32" cy="32" r="30" fill={`url(#${gloid})`} />

        {/* Body — rounded square, same shape language as the app icon. */}
        <rect
          className="hai-mascot__body"
          x="9" y="9" width="46" height="46" rx="13"
          fill={`url(#${gid})`}
        />

        {/* Top highlight — echoes the icon's gloss. */}
        <rect x="9" y="9" width="46" height="22" rx="13"
          fill="#ffffff" fillOpacity="0.12" />

        {/* Face: two small eyes + a gentle smile.
            Positioned slightly above center so the smile sits at
            the geometric heart of the body. */}
        <g className="hai-mascot__face">
          <circle className="hai-mascot__eye hai-mascot__eye--l" cx="25" cy="29" r="3" fill="#ffffff" />
          <circle className="hai-mascot__eye hai-mascot__eye--r" cx="39" cy="29" r="3" fill="#ffffff" />
          {/* Smile — quadratic curve, white stroke. */}
          <path
            className="hai-mascot__smile"
            d="M24 40 Q32 46 40 40"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>

        {/* Waving "hand" — small white circle on the leading edge.
            The hai-mascot--left / --right classes swing this around
            so the mascot can lean toward the spotlight target. */}
        <circle className="hai-mascot__hand" cx="55" cy="22" r="4" fill="#ffffff" />
      </svg>

      <style jsx>{`
        .hai-mascot {
          display: inline-block;
          position: relative;
          line-height: 0;
        }
        .hai-mascot__svg {
          display: block;
          overflow: visible;
        }

        /* ── Idle animations ─────────────────────────────────────
           Float lifts the whole body; glow softens in/out so the
           character feels like it's breathing. Blink + wave are
           keyframed on the face / hand respectively. */
        .hai-mascot__body,
        .hai-mascot__face {
          transform-box: fill-box;
          transform-origin: center;
          animation: hai-mascot-float 4s ease-in-out infinite;
        }
        .hai-mascot__glow {
          transform-box: fill-box;
          transform-origin: center;
          animation: hai-mascot-glow 4s ease-in-out infinite;
        }
        .hai-mascot__eye {
          transform-box: fill-box;
          transform-origin: center;
          animation: hai-mascot-blink 5.2s ease-in-out infinite;
        }
        .hai-mascot__hand {
          transform-box: fill-box;
          transform-origin: 55px 22px;
          animation: hai-mascot-wave 6s ease-in-out infinite;
        }
        /* When the guide is pointing left, mirror the wave so the
           hand swings outward toward the target — same on the right. */
        .hai-mascot--left .hai-mascot__hand {
          transform: translateX(-46px);
          transform-origin: 9px 22px;
          animation-name: hai-mascot-wave-left;
        }
        .hai-mascot--right .hai-mascot__hand {
          animation-name: hai-mascot-wave-right;
        }

        @keyframes hai-mascot-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-2px); }
        }
        @keyframes hai-mascot-glow {
          0%, 100% { opacity: 0.7; }
          50%      { opacity: 1; }
        }
        @keyframes hai-mascot-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          94%, 98%      { transform: scaleY(0.1); }
        }
        @keyframes hai-mascot-wave {
          0%, 70%, 100% { transform: rotate(0deg); }
          78%           { transform: rotate(18deg); }
          86%           { transform: rotate(-12deg); }
          92%           { transform: rotate(8deg); }
        }
        @keyframes hai-mascot-wave-right {
          0%, 70%, 100% { transform: rotate(0deg); }
          80%           { transform: rotate(22deg); }
          90%           { transform: rotate(-10deg); }
        }
        @keyframes hai-mascot-wave-left {
          0%, 70%, 100% { transform: translateX(-46px) rotate(0deg); }
          80%           { transform: translateX(-46px) rotate(-22deg); }
          90%           { transform: translateX(-46px) rotate(10deg); }
        }

        /* ── Reduced motion — drop all loops. Static badge only. */
        @media (prefers-reduced-motion: reduce) {
          .hai-mascot__body,
          .hai-mascot__face,
          .hai-mascot__glow,
          .hai-mascot__eye,
          .hai-mascot__hand {
            animation: none !important;
          }
          .hai-mascot__glow {
            opacity: 0.7;
          }
        }
      `}</style>
    </span>
  )
}
