'use client'

/**
 * HaiGuideMascot — the friendly "نَبْضي" character used in the
 * guided tours. Pure inline SVG + scoped CSS, no external assets,
 * no animation libraries.
 *
 * Visual language honours the Hai app icon (public/icon-192.svg):
 *   • teal gradient body (#00d4a8 → #005c48)
 *   • rounded pin/teardrop silhouette with a small house-window
 *     detail on the chest
 *   • simple face — two eyes + a smile
 *   • two arms (one rests, one waves) and two small feet planted
 *     under the body
 *   • soft radial glow halo
 *
 * Animation architecture matters here. Earlier revisions had each
 * body part run its own float animation, which made multi-animation
 * transforms fight on the same element (e.g. the waving arm tried
 * to apply both translateY and rotate via two keyframe sets on the
 * SAME `transform` property — the later declaration wins and the
 * other animation appears to "skip"). The fix is structural:
 *
 *   • A single outer <g class="hai-mascot__breath"> wraps everything
 *     and owns the gentle float. Float = translateY, which doesn't
 *     depend on transform-origin, so this is safe.
 *   • Inside the breath group, the waving arm has its OWN <g> that
 *     rotates around a fixed viewBox-coordinate pivot (the shoulder
 *     where the arm joins the body). This pivot is set in SVG
 *     viewBox units, which means we must NOT set `transform-box:
 *     fill-box` on it — fill-box would reinterpret the pivot in
 *     bbox-local coords and put it far outside the arm, making the
 *     "hand" orbit a phantom point in mid-air.
 *   • Eyes use `transform-box: fill-box` so the blink scaleY pivots
 *     around each eye's own center.
 *   • Glow uses opacity only — no transform = no pivot worries.
 *
 * Every loop is gated on prefers-reduced-motion.
 */
export default function HaiGuideMascot({
  size = 56,
  direction = 'idle',
}: {
  size?: number
  direction?: 'left' | 'right' | 'idle'
}) {
  // Aspect ratio = 64 wide / 80 tall.
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

        {/* Single breathing group — everything floats together so
            the waving arm stays attached to its shoulder. */}
        <g className="hai-mascot__breath">
          {/* Soft glow halo behind the body */}
          <ellipse
            className="hai-mascot__glow"
            cx="32" cy="38" rx="30" ry="34"
            fill="url(#hai-mascot-glow)"
          />

          {/* Feet — drawn before the body so the body overlaps them
              slightly and they look planted underneath. */}
          <ellipse cx="23" cy="71" rx="5.5" ry="3" fill="#003a2e" />
          <ellipse cx="41" cy="71" rx="5.5" ry="3" fill="#003a2e" />

          {/* Resting arm (left). Shoulder tucks UNDER the body
              edge so the arm reads as attached. */}
          <g>
            <rect x="3" y="42" width="11" height="7" rx="3.5" fill="url(#hai-mascot-arm)" />
            <circle cx="4" cy="45.5" r="4" fill="url(#hai-mascot-arm)" />
          </g>

          {/* Waving arm (right). Rotates around the shoulder pivot
              at SVG (52, 39) — that's a few pixels inside the body
              edge so the inner end of the arm is hidden under the
              body silhouette through the whole rotation. */}
          <g className="hai-mascot__arm-wave">
            <rect x="50" y="36" width="11" height="6.5" rx="3.25" fill="url(#hai-mascot-arm)" />
            <circle cx="60" cy="36.5" r="4" fill="url(#hai-mascot-arm)" />
          </g>

          {/* Body — drawn last so it overlaps the arms' inner
              ends + the tops of the feet, hiding the joins. */}
          <path
            d="M 32 8
               C 16 8, 8 22, 8 36
               C 8 52, 18 64, 26 68
               C 28 70, 36 70, 38 68
               C 46 64, 56 52, 56 36
               C 56 22, 48 8, 32 8 Z"
            fill="url(#hai-mascot-grad)"
          />

          {/* Top sheen — soft white highlight on the upper half */}
          <path
            d="M 32 8 C 18 8, 10 20, 10 30 L 54 30 C 54 20, 46 8, 32 8 Z"
            fill="#ffffff"
            fillOpacity="0.12"
          />

          {/* House window detail — 4-pane mark on the chest */}
          <g opacity="0.55">
            <rect x="27" y="50" width="10" height="9" rx="1" fill="#ffffff" fillOpacity="0.18" />
            <line x1="32" y1="50" x2="32" y2="59" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.6" />
            <line x1="27" y1="54.5" x2="37" y2="54.5" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.6" />
          </g>

          {/* Face — eyes + smile */}
          <g>
            <circle className="hai-mascot__eye" cx="25" cy="30" r="2.6" fill="#ffffff" />
            <circle className="hai-mascot__eye" cx="39" cy="30" r="2.6" fill="#ffffff" />
            <path
              d="M 24 39 Q 32 44 40 39"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </g>
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

        /* Whole-character breath. translateY only, so no
           transform-origin / transform-box wrangling needed. */
        .hai-mascot__breath {
          animation: hai-mascot-float 4s ease-in-out infinite;
        }

        /* Waving arm rotation pivot. DEFAULT transform-box (view-box)
           keeps the origin in SVG viewBox coords, so (52, 39) is the
           shoulder where the arm meets the body. Adding fill-box
           here would re-anchor to the arm's own bbox top-left and
           the hand would orbit a phantom point in the air. */
        .hai-mascot__arm-wave {
          transform-origin: 52px 39px;
          animation: hai-mascot-wave 3.8s ease-in-out infinite;
        }

        /* Eye blink pivots around each eye's own centre — that
           DOES want fill-box so the scaleY collapses the eye in
           place instead of sliding it. */
        .hai-mascot__eye {
          transform-box: fill-box;
          transform-origin: center;
          animation: hai-mascot-blink 5.2s ease-in-out infinite;
        }

        /* Glow halo breathes via opacity — no transform involved. */
        .hai-mascot__glow {
          animation: hai-mascot-glow 4s ease-in-out infinite;
        }

        /* When the caller hints a direction, amp the wave so the
           gesture reads as a "look this way" cue. */
        .hai-mascot--left .hai-mascot__arm-wave,
        .hai-mascot--right .hai-mascot__arm-wave {
          animation-name: hai-mascot-wave-strong;
        }

        /* Float: bigger amplitude so the breathing is actually
           visible at 48px. Was -2px which was almost imperceptible
           on bright backgrounds. */
        @keyframes hai-mascot-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-5px); }
        }
        /* Glow: wider opacity range so the halo clearly pulses. */
        @keyframes hai-mascot-glow {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 1; }
        }
        /* Blink: occupy a slightly longer keyframe band so the
           eyes visibly close instead of disappearing for one
           frame. */
        @keyframes hai-mascot-blink {
          0%, 88%, 100% { transform: scaleY(1); }
          92%, 97%      { transform: scaleY(0.08); }
        }
        /* Wave: larger angles, more swings per cycle, and the
           "wave window" now spans roughly 40% of the cycle so
           the gesture is clearly readable instead of a brief
           twitch. */
        @keyframes hai-mascot-wave {
          0%, 55%, 100% { transform: rotate(0deg); }
          63%           { transform: rotate(-32deg); }
          71%           { transform: rotate(22deg); }
          79%           { transform: rotate(-18deg); }
          87%           { transform: rotate(12deg); }
          93%           { transform: rotate(-4deg); }
        }
        /* Directional variant — even larger swings to act as a
           "look this way" cue when the bubble points at a target
           offscreen-ish. */
        @keyframes hai-mascot-wave-strong {
          0%, 50%, 100% { transform: rotate(0deg); }
          60%           { transform: rotate(-42deg); }
          70%           { transform: rotate(28deg); }
          80%           { transform: rotate(-20deg); }
          88%           { transform: rotate(14deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .hai-mascot__breath,
          .hai-mascot__arm-wave,
          .hai-mascot__eye,
          .hai-mascot__glow {
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
