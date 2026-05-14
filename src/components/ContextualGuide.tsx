'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import HaiGuideMascot from '@/components/HaiGuideMascot'

/**
 * ContextualGuide — reusable per-page guided tour used by every
 * surface beyond the feed (which has its own FirstRunGuide for
 * now). Mounts as a self-contained overlay; the page only needs
 * to render `<ContextualGuide guideId="..." steps={[...]} />`
 * and add matching `data-guide="..."` markers on the target
 * elements.
 *
 * Persistence model:
 *   • Per-guide key: `hai:context-guide:{guideId}:v1`
 *     Permanent at v1. Bump suffix to v2 on a substantial redesign
 *     of that guide's copy / targets.
 *   • Global kill: `hai:context-guides-disabled-v1`
 *     User can silence ALL contextual guides with one tap on the
 *     bubble's secondary footer link ("تخطي كل الإرشادات").
 *   • Session throttle: `hai:context-guide:last-shown` (sessionStorage)
 *     Stores a timestamp every time a contextual guide actually
 *     paints. When auto-starting, we defer for 10s if any guide
 *     was shown in the last 90s. Prevents the "popped four guides
 *     in 30 seconds" anti-pattern when a fresh user hops between
 *     pages back to back.
 *
 * Closes ONLY via:
 *   • "تخطي" footer link
 *   • final primary button (last step)
 *   • ESC key
 *   • Android back (popstate sentinel)
 *   • global kill-switch link ("تخطي كل الإرشادات")
 * Backdrop tap is intentionally a no-op so older users can't
 * dismiss the guide by accident.
 *
 * Note: this component intentionally does NOT replace FirstRunGuide
 * yet. That migration is a separate follow-up; the feed tour stays
 * byte-identical for now so we don't risk regressing it while
 * shipping the new framework.
 */

export interface ContextualGuideStep {
  /** Target CSS selector. Null = centered bubble (welcome-style). */
  targetSelector: string | null
  title: string
  body: string
  position: 'top' | 'bottom' | 'center'
  /** Label for the primary "next" button on this step. The last
   *  step's label is what the user sees as the completion CTA. */
  nextLabel: string
}

interface Props {
  /** Stable ID used to build the storage key. */
  guideId: string
  steps: ContextualGuideStep[]
  /** When false, the guide is suppressed entirely (e.g. cross-
   *  neighborhood read-only browse). Default true. */
  enabled?: boolean
  /** Optional override of the auto-start delay (ms after mount).
   *  Default 700, matching FirstRunGuide. */
  autoStartDelay?: number
}

const GLOBAL_KILL_KEY = 'hai:context-guides-disabled-v1'
// The recent-guide throttle was retired — first at 90s (too aggressive),
// then dialed down to 8s (still tripping up intentional navigation
// between guided pages — user reported /post/new and /threads/[id]
// tours "not working"). With per-guide localStorage keys, a one-time
// auto-start gate, and the "تخطي كل الإرشادات" kill switch already
// in place, an additional cooldown only ever produced silent
// surprises. Page navigations now fire their guide immediately.
//
// We keep LAST_SHOWN_KEY as a no-op writer for forward compatibility
// in case a future diagnostic wants to observe firing cadence.
const LAST_SHOWN_KEY = 'hai:context-guide:last-shown'

const BUBBLE_WIDTH = 320
const BUBBLE_HEIGHT_ESTIMATE = 230
const TARGET_PADDING = 8

function storageKey(guideId: string) {
  return `hai:context-guide:${guideId}:v1`
}

function isInputLike(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable === true
}

export default function ContextualGuide({
  guideId,
  steps,
  enabled = true,
  autoStartDelay = 700,
}: Props) {
  // SSR-safe portal gate.
  const [mounted, setMounted] = useState(false)
  // Step index. -1 means not started; >= steps.length means done.
  const [stepIndex, setStepIndex] = useState(-1)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [emergencyClear, setEmergencyClear] = useState(false)
  // Bumped by the "restart this page's guide" affordance — included
  // in the auto-start effect's deps so a bump re-runs the whole
  // start sequence from scratch (with startedRef reset below).
  const [restartTick, setRestartTick] = useState(0)
  const startedRef = useRef(false)
  const key = storageKey(guideId)

  // ── Decide whether to start.
  useEffect(() => {
    setMounted(true)
    if (!enabled) return
    if (startedRef.current) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    function tryStart() {
      if (cancelled || startedRef.current) return
      try {
        if (localStorage.getItem(GLOBAL_KILL_KEY)) return
        if (localStorage.getItem(key)) return
      } catch {
        // localStorage unavailable — show the guide; better than
        // silently skipping for users in private mode.
      }

      // Don't sit on top of an emergency / warning banner.
      const hasEmergency = !!document.querySelector(
        '[data-state="emergency"], [data-state="warning"]',
      )
      if (hasEmergency) {
        timer = setTimeout(tryStart, 1500)
        return
      }
      setEmergencyClear(true)
      startedRef.current = true
      try {
        sessionStorage.setItem(LAST_SHOWN_KEY, String(Date.now()))
      } catch {
        // ignore
      }
      timer = setTimeout(() => {
        if (cancelled) return
        setStepIndex(0)
      }, autoStartDelay)
    }

    timer = setTimeout(tryStart, 400)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [enabled, key, autoStartDelay, restartTick])

  // ── Re-fire the guide on demand. Listens for a custom event the
  //    profile's restart sheet dispatches so the user gets instant
  //    feedback when they pick "شرح هذه الصفحة" / "إظهار كل
  //    الإرشادات". The event carries the guideId so other guides
  //    on the same page (none today, but possible later) don't fire.
  useEffect(() => {
    function onRestart(e: Event) {
      const detail = (e as CustomEvent).detail
      if (!detail || detail.guideId !== guideId) return
      try {
        localStorage.removeItem(key)
        localStorage.removeItem(GLOBAL_KILL_KEY)
        sessionStorage.removeItem(LAST_SHOWN_KEY)
      } catch {
        // ignore
      }
      startedRef.current = false
      setEmergencyClear(false)
      setStepIndex(-1)
      setRestartTick((t) => t + 1)
    }
    window.addEventListener('hai:restart-guide', onRestart)
    return () => window.removeEventListener('hai:restart-guide', onRestart)
  }, [guideId, key])

  const finish = useCallback((completed: boolean) => {
    try {
      localStorage.setItem(key, completed ? 'done' : 'skipped')
    } catch {
      // best-effort
    }
    setStepIndex(-1)
  }, [key])

  const disableAll = useCallback(() => {
    try {
      localStorage.setItem(GLOBAL_KILL_KEY, '1')
      localStorage.setItem(key, 'skipped')
    } catch {
      // ignore
    }
    setStepIndex(-1)
  }, [key])

  const goNext = useCallback(() => {
    setStepIndex((i) => {
      if (i < 0) return i
      if (i >= steps.length - 1) {
        try {
          localStorage.setItem(key, 'done')
        } catch {
          // ignore
        }
        return -1
      }
      return i + 1
    })
  }, [key, steps.length])

  const goBack = useCallback(() => {
    setStepIndex((i) => (i > 0 ? i - 1 : i))
  }, [])

  // ── ESC + Android back close the guide.
  //
  //  Gated on a derived `guideOpen` boolean so the effect runs
  //  exactly ONCE per open session — going next/back inside the
  //  tour doesn't re-trigger setup. Otherwise we'd push a fresh
  //  history sentinel on every step change and the user would
  //  need to tap Android back N+1 times to leave the page
  //  afterwards (each ghost sentinel eating one back press, and
  //  eventually exiting the app at the root).
  //
  //  On close we need to actively pop the sentinel back off the
  //  stack — otherwise dismissing via "تخطي" / final button
  //  leaves the orphan in history. We use a local closure flag
  //  to tell apart "closed via back press" (sentinel already
  //  popped by the browser) from "closed via UI" (sentinel still
  //  on the stack; we need to pop it ourselves).
  const guideOpen = stepIndex >= 0
  useEffect(() => {
    if (!guideOpen) return
    let closedViaBack = false
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        finish(false)
      }
    }
    window.addEventListener('keydown', onKey)
    try {
      window.history.pushState({ contextGuide: guideId, ts: Date.now() }, '')
    } catch {
      // ignore
    }
    function onPop() {
      closedViaBack = true
      finish(false)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('popstate', onPop)
      if (!closedViaBack) {
        try {
          // Pop the sentinel we pushed when the guide opened so
          // the back stack returns to its pre-guide state.
          window.history.back()
        } catch {
          // ignore
        }
      }
    }
  }, [guideOpen, finish, guideId])

  // ── Recompute target rect on step change + on resize / scroll.
  useEffect(() => {
    if (stepIndex < 0) {
      setTargetRect(null)
      return
    }
    const step = steps[stepIndex]
    if (!step.targetSelector) {
      setTargetRect(null)
      return
    }
    let retries = 0
    let timer: number | null = null
    let cancelled = false

    function measure() {
      if (cancelled) return
      const el = document.querySelector(step.targetSelector!) as HTMLElement | null
      if (!el) {
        if (retries < 8) {
          retries++
          timer = window.setTimeout(measure, 500) as unknown as number
        }
        return
      }
      // Skip scrollIntoView when the target is an input/textarea —
      // doing so on iOS WKWebView is a fast path to popping the
      // keyboard, which would obscure our bubble.
      if (!isInputLike(el)) {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } catch {
          // older browsers
        }
      }
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
      if (timer) window.clearTimeout(timer as unknown as number)
      window.removeEventListener('resize', onMutate)
      window.removeEventListener('scroll', onMutate, true)
    }
  }, [stepIndex, steps])

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

  const step = steps[stepIndex]
  const isLast = stepIndex === steps.length - 1
  const isFirst = stepIndex === 0
  const hasUsableRect = !!(targetRect && targetRect.width > 4 && targetRect.height > 4)
  const useCenter = step.position === 'center' || !hasUsableRect

  // Clamp the highlight to the viewport so a target flush against
  // any screen edge (typical for bottom nav / sticky header) keeps
  // its green ring fully on-screen.
  const highlight = hasUsableRect && targetRect
    ? (() => {
        const top = Math.max(0, targetRect.top - TARGET_PADDING)
        const left = Math.max(0, targetRect.left - TARGET_PADDING)
        const right = Math.min(window.innerWidth, targetRect.right + TARGET_PADDING)
        const bottom = Math.min(window.innerHeight, targetRect.bottom + TARGET_PADDING)
        return { top, left, width: right - left, height: bottom - top }
      })()
    : null

  // ── Bubble + arrow positioning.
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
    const targetCenterX = targetRect!.left + targetRect!.width / 2
    const arrowLeft = Math.max(20, Math.min(width - 20, targetCenterX - left))
    arrow = { side: place === 'bottom' ? 'top' : 'bottom', left: arrowLeft }
  }

  const totalSteps = steps.length

  return createPortal(
    <div
      className="hai-context-guide fixed inset-0 z-[10000]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`hai-ctx-guide-${guideId}-title`}
    >
      {/* Spotlight overlay — backdrop intentionally has NO onClick. */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 10000 }}
        aria-hidden
      >
        <defs>
          <mask id={`hai-ctx-guide-mask-${guideId}`}>
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
          mask={`url(#hai-ctx-guide-mask-${guideId})`}
        />
      </svg>

      {highlight && !useCenter && (
        <div
          aria-hidden
          className="fixed pointer-events-none rounded-2xl"
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

      <div
        style={bubbleStyle}
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-4 border border-emerald-100 dark:border-emerald-900/50"
        dir="rtl"
      >
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

        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <HaiGuideMascot size={48} direction="idle" />
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
          id={`hai-ctx-guide-${guideId}-title`}
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

        {/* Secondary kill-all link — small, neutral, never the
            primary visual anchor. One tap silences every
            contextual guide on this device. */}
        <button
          type="button"
          onClick={disableAll}
          className="block mt-2 text-[10.5px] text-gray-400 dark:text-gray-500 underline decoration-dotted active:scale-95 transition-transform"
        >
          تخطي كل الإرشادات
        </button>
      </div>
    </div>,
    document.body,
  )
}
