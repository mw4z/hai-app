'use client'

/**
 * HaiGuideMascot — the friendly "مرشد حي" character used in the
 * first-run guide. Pure inline SVG + scoped CSS. No external
 * assets, no animation libraries.
 *
 * Design: a little neighborhood character in Hai's visual language.
 *   • body: rounded pin/teardrop shape in the same teal gradient
 *     (#00b894 → #005c48) as the real app icon (public/icon-192.svg)
 *   • house detail: a small 4-pane window on the body, echoing the
 *     "neighborhood" identity
 *   • face: two eyes + soft smile
 *   • two arms — one rests, one waves
 *   • two small feet planted underneath
 *   • subtle teal glow behind everything
 *
 * Idle animations (CSS-only):
 *   • gentle float — whole character lifts a few pixels
 *   • soft glow pulse — radial halo breathes
 *   • blink every ~5s
 *   • the raised arm waves every ~6s
 *
 * All animations stop when the user has `prefers-reduced-motion`
 * turned on. The character then renders as a calm static badge.
 *
 * Props:
 *   - size:      pixel size of the longer (vertical) dimension
 *                (default 56)
 *   - direction: which way the mascot's wave should bias — 'left'
 *                mirrors the wave to the left side, 'right' keeps
 *                it on the right, 'idle' is the default. Purely
 *                visual hint; the character itself is the same.
 */
export default function HaiGuideMascot({
  size = 56,
  direction = 'idle',
}: {
  size?: number
  direction?: 'left' | 'right' | 'idle'
}) {
  // Aspect ratio = 64 wide / 80 tall, so width scales down.
  const width = Math.round((size * 64) / 80)
  const height = size

  return (
    <span
      className={`hai-mascot hai-mascot--${direction}`}
      style={{ width, height }}
      aria-hidden
    >
      <svg viewBox="0 0 64 80" width={width} height={height} className="hai-mascot__svg">
        <defs>
          <linearGradient id="hai-mascot-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00d4a8" />
            <stop offset="100%" stopColor="#005c48" />
          </linearGradient>
          <linearGradient id="hai-mascot-arm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00b894" />
            <stop offset="100%" stopColor="#007057" />
          </linearGradient>
          <radialGradient id="hai-mascot-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00d4a8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#00b894" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft glow halo */}
        <ellipse
          className="hai-mascot__glow"
          cx="32" cy="38" rx="30" ry="34"
          fill="url(#hai-mascot-glow)"
        />

        {/* Feet — small ovals planted underneath the body. Drawn
            BEFORE the body so the body overlaps them slightly,
            making them look like they belong to it. */}
        <ellipse className="hai-mascot__foot" cx="23" cy="71" rx="5.5" ry="3" fill="#003a2e" />
        <ellipse className="hai-mascot__foot" cx="41" cy="71" rx="5.5" ry="3" fill="#003a2e" />

        {/* Resting arm — left side. Short rounded cylinder + ball
            hand. Sits passively. */}
        <g className="hai-mascot__arm-rest">
          <rect x="4" y="42" width="10" height="7" rx="3.5" fill="url(#hai-mascot-arm)" />
          <circle cx="5" cy="45.5" r="4" fill="url(#hai-mascot-arm)" />
        </g>

        {/* Waving arm — right side. Rotates from the shoulder
            (the inner end). transform-origin set in CSS. */}
        <g className="hai-mascot__arm-wave">
          <rect x="50" y="36" width="10" height="6.5" rx="3.25" fill="url(#hai-mascot-arm)" />
          <circle cx="60" cy="36.5" r="4" fill="url(#hai-mascot-arm)" />
        </g>

        {/* Body — rounded pin / teardrop shape. The path is a
            symmetric curve that's wide at the chest and tucks
            down toward the feet. Drawn last so it overlaps the
            arms (shoulders) and feet cleanly. */}
        <path
          className="hai-mascot__body"
          d="M 32 8
             C 16 8, 8 22, 8 36
             C 8 52, 18 64, 26 68
             C 28 70, 36 70, 38 68
             C 46 64, 56 52, 56 36
             C 56 22, 48 8, 32 8 Z"
          fill="url(#hai-mascot-grad)"
        />

        {/* Top sheen — soft white highlight, like the gloss on
            the real app icon. */}
        <path
          d="M 32 8 C 18 8, 10 20, 10 30 L 54 30 C 54 20, 46 8, 32 8 Z"
          fill="#ffffff"
          fillOpacity="0.12"
        />

        {/* House window detail — a tiny 4-pane window on the
            character's chest, marking it as a neighborhood
            resident, not a generic blob. */}
        <g className="hai-mascot__window" opacity="0.55">
          <rect x="27" y="50" width="10" height="9" rx="1" fill="#ffffff" fillOpacity="0.18" />
          <line x1="32" y1="50" x2="32" y2="59" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.6" />
          <line x1="27" y1="54.5" x2="37" y2="54.5" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.6" />
        </g>

        {/* Face — two eyes + a gentle smile. Positioned in the
            upper third of the body where a face would naturally
            sit on a pin-shaped character. */}
        <g className="hai-mascot__face">
          <circle className="hai-mascot__eye hai-mascot__eye--l" cx="25" cy="30" r="2.6" fill="#ffffff" />
          <circle className="hai-mascot__eye hai-mascot__eye--r" cx="39" cy="30" r="2.6" fill="#ffffff" />
          <path
            className="hai-mascot__smile"
            d="M 24 39 Q 32 44 40 39"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </g>
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

        /* Whole-character float — animates the SVG root indirectly
           via the body path; we transform the body + face together
           so the feet stay planted on the ground while the rest
           "breathes." */
        .hai-mascot__body,
        .hai-mascot__face,
        .hai-mascot__window,
        .hai-mascot__arm-rest,
        .hai-mascot__arm-wave {
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

        /* Waving arm pivots from the shoulder (the side of the
           rectangle nearest the body). transform-origin is set in
           viewBox coordinates because the SVG uses fill-box for
           individual <g> elements. */
        .hai-mascot__arm-wave {
          transform-origin: 50px 38.5px;
          animation:
            hai-mascot-float 4s ease-in-out infinite,
            hai-mascot-wave 6s ease-in-out infinite;
        }

        /* When the bubble is on the LEFT side of the target the
           caller can mirror the waving arm to the left edge by
           passing direction="left". We don't actually mirror the
           SVG (would flip text/details); we just amp the wave
           amplitude so the gesture reads stronger on that side. */
        .hai-mascot--left .hai-mascot__arm-wave {
          animation-name: hai-mascot-float, hai-mascot-wave-strong;
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
          78%           { transform: rotate(-22deg); }
          86%           { transform: rotate(14deg); }
          92%           { transform: rotate(-8deg); }
        }
        @keyframes hai-mascot-wave-strong {
          0%, 65%, 100% { transform: rotate(0deg); }
          75%           { transform: rotate(-32deg); }
          85%           { transform: rotate(18deg); }
          92%           { transform: rotate(-10deg); }
        }

        /* Reduced motion: kill every animation. Static badge. */
        @media (prefers-reduced-motion: reduce) {
          .hai-mascot__body,
          .hai-mascot__face,
          .hai-mascot__window,
          .hai-mascot__arm-rest,
          .hai-mascot__arm-wave,
          .hai-mascot__glow,
          .hai-mascot__eye {
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
