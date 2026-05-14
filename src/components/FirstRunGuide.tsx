'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import HaiGuideMascot from '@/components/HaiGuideMascot'

/**
 * مرشد حي — one-time first-run guided tour.
 *
 * Four steps tailored for older / first-time users:
 *   1. Welcome (centered bubble, no target)
 *   2. HomeActionCard → "ابدأ من هنا"
 *   3. Quick-ask bar  → "انشر أو اسأل"
 *   4. Bottom nav     → "تابع تفاعلك"
 *
 * Persistence: `localStorage['hai:first-run-guide-v1']`. Permanent
 * at v1 — bump suffix on a significant redesign to re-show.
 *
 * Closes ONLY via "تخطي", final "ابدأ", ESC, or Android back.
 * Backdrop tap is intentionally a no-op so older users can't lose
 * the guide by accident.
 *
 * If an emergency banner is active when this mounts, the guide
 * delays its first paint until the banner is dismissed, so it
 * never sits over a critical alert.
 */

const STORAGE_KEY = 'hai:first-run-guide-v1'

interface Step {
  /** Target selector, or null for a centered welcome bubble. */
  targetSelector: string | null
  title: string
  body: string
  /** Where to anchor the bubble relative to the target. */
  position: 'top' | 'bottom' | 'center'
  /** Which way the mascot should lean its wave — purely visual. */
  mascotDirection: 'left' | 'right' | 'idle'
  /** Label for the primary "next" button on this step. */
  nextLabel: string
}

const STEPS: Step[] = [
  {
    targetSelector: null,
    title: 'أهلًا بك في حي',
    body: 'هنا تتابع أخبار الحي، طلبات الجيران، السوق، الخدمات، والبلاغات في مكان واحد.',
    position: 'center',
    mascotDirection: 'idle',
    nextLabel: 'التالي',
  },
  {
    targetSelector: '[data-firstrun="home-actions"]',
    title: 'ابدأ من هنا',
    body: 'اختر وش تحتاج اليوم، والتطبيق يوجهك للمكان المناسب.',
    position: 'bottom',
    mascotDirection: 'idle',
    nextLabel: 'التالي',
  },
  {
    targetSelector: '[data-firstrun="post"]',
    title: 'انشر أو اسأل',
    body: 'تقدر تسأل أهل الحي، تعرض شيء في السوق، أو تبلغ عن مشكلة.',
    position: 'bottom',
    mascotDirection: 'idle',
    nextLabel: 'التالي',
  },
  {
    targetSelector: '[data-firstrun="bottom-nav"]',
    title: 'تابع تفاعلك',
    body: 'من هنا تتابع رسائلك، تنبيهاتك، وإعدادات حسابك.',
    position: 'top',
    mascotDirection: 'idle',
    nextLabel: 'ابدأ',
  },
]

const BUBBLE_WIDTH = 320
const BUBBLE_HEIGHT_ESTIMATE = 220
const TARGET_PADDING = 8

interface Props {
  /** Skip render when the feed is in cross-neighborhood read-only browse. */
  enabled?: boolean
}

export default function FirstRunGuide({ enabled = true }: Props) {
  // ── SSR-safe portal gate. createPortal must run only when we
  //    have access to document.body. Holding off until mounted=true
  //    also prevents a hydration mismatch (server renders nothing,
  //    client renders the overlay only after the effect runs).
  const [mounted, setMounted] = useState(false)
  // Step index. -1 = not started yet.
  const [stepIndex, setStepIndex] = useState(-1)
  // Recomputed every step + on resize / scroll.
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  // Used to suppress the welcome paint until any active emergency
  // banner has been dismissed (avoid covering critical alerts).
  const [emergencyClear, setEmergencyClear] = useState(false)

  // Avoid re-running the storage check more than once.
  const startedRef = useRef(false)

  // ── Decide whether to start. Runs once on mount.
  useEffect(() => {
    setMounted(true)
    if (!enabled) return
    if (startedRef.current) return

    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    function tryStart() {
      if (cancelled || startedRef.current) return
      // Persistence gate — set once, permanent at v1.
      try {
        if (localStorage.getItem(STORAGE_KEY)) return
      } catch {
        // localStorage unavailable — show the guide; better than
        // silently skipping for everyone in private mode.
      }
      // Don't cover an emergency banner. The banner returns null
      // when there are no active alerts, so the absence of an
      // element with data-state="emergency" / "warning" means we're
      // safe to paint.
      const hasEmergency = !!document.querySelector(
        '[data-state="emergency"], [data-state="warning"]',
      )
      if (hasEmergency) {
        pollTimer = setTimeout(tryStart, 1500)
        return
      }
      setEmergencyClear(true)
      startedRef.current = true
      // Small grace period so HomeActionCard / quick-ask bar /
      // bottom nav are hydrated and have measurable rects.
      pollTimer = setTimeout(() => {
        if (cancelled) return
        setStepIndex(0)
      }, 700)
    }

    // Wait a tick after mount so the page actually has rendered.
    pollTimer = setTimeout(tryStart, 400)
    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [enabled])

  const finish = useCallback((completed: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, completed ? 'done' : 'skipped')
    } catch {
      // best-effort
    }
    setStepIndex(-1)
  }, [])

  const goNext = useCallback(() => {
    setStepIndex((i) => {
      if (i < 0) return i
      if (i >= STEPS.length - 1) {
        // last step → mark done
        try {
          localStorage.setItem(STORAGE_KEY, 'done')
        } catch {
          // ignore
        }
        return -1
      }
      return i + 1
    })
  }, [])

  const goBack = useCallback(() => {
    setStepIndex((i) => (i > 0 ? i - 1 : i))
  }, [])

  // ── ESC + Android back close the guide (treated as "Skip").
  useEffect(() => {
    if (stepIndex < 0) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        finish(false)
      }
    }
    window.addEventListener('keydown', onKey)
    // Android back: history navigation. Push a sentinel and pop
    // on a popstate so the back button collapses the guide instead
    // of leaving the feed.
    const sentinel = { firstRunGuide: true, ts: Date.now() }
    try {
      window.history.pushState(sentinel, '')
    } catch {
      // ignore
    }
    function onPop() {
      finish(false)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('popstate', onPop)
    }
  }, [stepIndex, finish])

  // ── Recompute target rect on step change + on resize / scroll.
  useEffect(() => {
    if (stepIndex < 0) {
      setTargetRect(null)
      return
    }
    const step = STEPS[stepIndex]
    if (!step.targetSelector) {
      setTargetRect(null)
      return
    }
    let retries = 0
    let raf: number | null = null
    let cancelled = false

    function measure() {
      if (cancelled) return
      const el = document.querySelector(step.targetSelector!) as HTMLElement | null
      if (!el) {
        // Target not in the DOM — retry up to 8× (4s). After that
        // fall through to centered fallback by leaving rect null.
        if (retries < 8) {
          retries++
          raf = window.setTimeout(measure, 500) as unknown as number
        }
        return
      }
      // Scroll target into view so its rect is on screen, then
      // measure on the next frame to let the scroll settle.
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      window.setTimeout(() => {
        if (cancelled) return
        setTargetRect(el.getBoundingClientRect())
      }, 350)
    }
    measure()

    function onMutate() {
      const el = document.querySelector(step.targetSelector!) as HTMLElement | null
      if (el) setTargetRect(el.getBoundingClientRect())
    }
    window.addEventListener('resize', onMutate)
    window.addEventListener('scroll', onMutate, true)
    return () => {
      cancelled = true
      if (raf) window.clearTimeout(raf as unknown as number)
      window.removeEventListener('resize', onMutate)
      window.removeEventListener('scroll', onMutate, true)
    }
  }, [stepIndex])

  // ── Body scroll lock while the guide is visible.
  useEffect(() => {
    if (stepIndex < 0) return
    const prevOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prevOverflow
    }
  }, [stepIndex])

  // Render gate.
  if (!mounted) return null
  if (typeof document === 'undefined' || !document.body) return null
  if (!emergencyClear) return null
  if (stepIndex < 0) return null

  const step = STEPS[stepIndex]
  const isLast = stepIndex === STEPS.length - 1
  const isFirst = stepIndex === 0
  // A target rect with tiny dimensions means the element is in the
  // DOM but invisible (e.g. HomeActionCard returned null because
  // the user already dismissed it, leaving an empty wrapper div).
  // Treat that as "no target" and fall back to the centered bubble
  // so we never paint a spotlight at the wrong place.
  const hasUsableRect = !!(targetRect && targetRect.width > 4 && targetRect.height > 4)
  const useCenter = step.position === 'center' || !hasUsableRect

  // ── Spotlight geometry. Clamp to the viewport so the bottom nav
  //    (which sits flush against bottom:0) doesn't end up with its
  //    green ring + rounded corners painted below the visible area.
  //    Same for the left/right edges if a target ever stretches to
  //    the viewport gutter.
  const highlight = hasUsableRect && targetRect
    ? (() => {
        const top = Math.max(0, targetRect.top - TARGET_PADDING)
        const left = Math.max(0, targetRect.left - TARGET_PADDING)
        const right = Math.min(window.innerWidth, targetRect.right + TARGET_PADDING)
        const bottom = Math.min(window.innerHeight, targetRect.bottom + TARGET_PADDING)
        return { top, left, width: right - left, height: bottom - top }
      })()
    : null

  // ── Bubble position + arrow position. For centered welcome OR
  //    missing/zero-size target, the bubble sits dead center with
  //    no arrow. Otherwise anchor above or below the spotlight and
  //    compute an arrow x-offset that lines up with the target's
  //    horizontal center (clamped within the bubble's edges so it
  //    doesn't fly off the rounded corners).
  let bubbleStyle: React.CSSProperties
  let arrow: { side: 'top' | 'bottom'; left: number } | null = null
  if (useCenter) {
    bubbleStyle = {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: Math.min(BUBBLE_WIDTH, window.innerWidth - 32),
      zIndex: 10002,
    }
  } else {
    const width = Math.min(BUBBLE_WIDTH, window.innerWidth - 32)
    const left = Math.max(
      16,
      Math.min(window.innerWidth / 2 - width / 2, window.innerWidth - width - 16),
    )
    const tooltipH = BUBBLE_HEIGHT_ESTIMATE
    const room = {
      above: targetRect!.top,
      below: window.innerHeight - targetRect!.bottom,
    }
    const place = step.position === 'top' ? 'top' : step.position === 'bottom' ? 'bottom' : (room.above > room.below ? 'top' : 'bottom')
    const top =
      place === 'top'
        ? Math.max(16, targetRect!.top - TARGET_PADDING - 12 - tooltipH)
        : Math.min(
            targetRect!.bottom + TARGET_PADDING + 12,
            window.innerHeight - tooltipH - 16,
          )
    bubbleStyle = {
      position: 'fixed',
      left,
      top,
      width,
      zIndex: 10002,
    }
    // Arrow x is the target's centre, clamped 20px in from each
    // edge of the bubble so it always sits on the bubble's flat
    // surface (not on a corner).
    const targetCenterX = targetRect!.left + targetRect!.width / 2
    const arrowLeft = Math.max(20, Math.min(width - 20, targetCenterX - left))
    // Arrow side is the OPPOSITE side of where the bubble lives.
    // Bubble below target → arrow on the bubble's TOP edge pointing
    // up at the spotlight. Bubble above → arrow on BOTTOM edge.
    arrow = { side: place === 'bottom' ? 'top' : 'bottom', left: arrowLeft }
  }

  const totalSteps = STEPS.length

  return createPortal(
    <div
      className="hai-firstrun fixed inset-0 z-[10000]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hai-firstrun-title"
    >
      {/* Spotlight overlay. SVG mask cuts a rounded hole around
          the target rect; the rest of the screen is dimmed. When
          there's no target we render a plain dimmed rect. Backdrop
          intentionally has NO onClick — accidental taps must not
          dismiss the guide. */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 10000 }}
        aria-hidden
      >
        <defs>
          <mask id="hai-firstrun-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {highlight && !useCenter && (
              <rect
                x={highlight.left}
                y={highlight.top}
                width={highlight.width}
                height={highlight.height}
                rx="14"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.62)"
          mask="url(#hai-firstrun-mask)"
        />
      </svg>

      {/* Spotlight ring */}
      {highlight && !useCenter && (
        <div
          aria-hidden
          className="hai-firstrun__ring fixed pointer-events-none rounded-2xl"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            zIndex: 10001,
            boxShadow: '0 0 0 3px rgba(0,184,148,0.7), 0 0 24px rgba(0,212,168,0.45)',
            border: '2px solid #00b894',
          }}
        />
      )}

      {/* Tooltip bubble. role="dialog" lives on the outer wrapper
          so SRs read the title + body via aria-labelledby. */}
      <div
        style={bubbleStyle}
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-4 border border-emerald-100 dark:border-emerald-900/50"
        dir="rtl"
      >
        {/* Solid brand-colored triangle pointing at the spotlight.
            Single triangle instead of the bordered double-layer
            trick — the latter fights dark mode because the inner
            tip color has to match the bubble bg. Brand emerald
            reads as the "guide is pointing here" cue regardless
            of theme. Hidden on the centered welcome step. */}
        {arrow && (
          <span
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              left: arrow.left,
              [arrow.side === 'top' ? 'top' : 'bottom']: -10,
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '10px solid transparent',
              borderRight: '10px solid transparent',
              ...(arrow.side === 'top'
                ? { borderBottom: '10px solid #00b894' }
                : { borderTop: '10px solid #00b894' }),
            }}
          />
        )}
        {/* Header — mascot + brand label + progress */}
        <div className="flex items-center gap-3 mb-3">
          <HaiGuideMascot size={48} direction={step.mascotDirection} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 leading-tight">
              مرشد حي
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              {stepIndex + 1} / {totalSteps}
            </p>
          </div>
          <div className="flex items-center gap-1" aria-hidden>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`block h-1.5 rounded-full transition-all ${
                  i === stepIndex
                    ? 'w-5 bg-emerald-500'
                    : i < stepIndex
                      ? 'w-1.5 bg-emerald-300 dark:bg-emerald-700'
                      : 'w-1.5 bg-gray-200 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>

        <h2
          id="hai-firstrun-title"
          className="text-base font-bold text-gray-900 dark:text-white mb-1.5 leading-tight"
        >
          {step.title}
        </h2>
        <p className="text-[13px] text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
          {step.body}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => finish(false)}
            className="text-[12px] font-medium text-gray-400 dark:text-gray-500 px-2 py-2 active:scale-95 transition-transform"
          >
            تخطي
          </button>
          <div className="flex-1" />
          {!isFirst && (
            <button
              type="button"
              onClick={goBack}
              className="text-[12px] font-medium text-gray-500 dark:text-gray-400 px-3 py-2 active:scale-95 transition-transform"
            >
              رجوع
            </button>
          )}
          <button
            type="button"
            onClick={isLast ? () => finish(true) : goNext}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold px-5 py-2.5 rounded-xl active:scale-95 transition-transform shadow-sm"
          >
            {step.nextLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
