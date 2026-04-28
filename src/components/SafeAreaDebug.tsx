'use client'

/**
 * Diagnostic overlay for the iOS "top gap above header" bug.
 *
 * Activate with ?debug-safe=1 in the URL (or set window.__haiDebugSafe
 * = true in the console). Tints every candidate layer with a labeled
 * coloured outline so the visible element in the gap is identifiable
 * by colour. Also dumps computed styles + viewport metrics to the
 * console whenever the body lock state changes (i.e. when any sheet
 * opens or closes via useBodyScrollLock).
 *
 * Targets:
 *   - <html>
 *   - <body>
 *   - html::before          (safe-area cover)
 *   - sticky .glass header  (per-page top bar)
 *   - sheet backdrops       ([data-sheet-backdrop] or .fixed.inset-0)
 *   - portal containers     (direct children of <body> beyond the
 *                            usual layout tree)
 *
 * Why an overlay component instead of just console logs: the actual
 * question is *which colour band shows in the circled area*. A
 * legend + tints lets a screenshot answer it directly without
 * cross-referencing log output.
 */

import { useEffect, useState } from 'react'

const COLOURS = {
  html: 'rgba(255,0,0,0.18)',          // red
  body: 'rgba(0,128,255,0.18)',        // blue
  htmlBefore: 'rgba(0,255,0,0.35)',    // green — safe-area cover
  header: 'rgba(255,200,0,0.20)',      // yellow
  backdrop: 'rgba(255,0,255,0.20)',    // magenta
  portal: 'rgba(0,255,255,0.18)',      // cyan
} as const

function isDebugOn(): boolean {
  if (typeof window === 'undefined') return false
  // FORCE-ON for the safe-area gap investigation — middleware blocks
  // the ?debug-safe=1 query and the user can't reach Safari devtools
  // to toggle window.__haiDebugSafe from the iPhone. Set to false to
  // disable once the diagnosis is captured. Explicit window.__haiDebugSafe
  // = false in console disables it without a redeploy.
  if ((window as any).__haiDebugSafe === false) return false
  return true
}

function snapshot() {
  const html = document.documentElement
  const body = document.body
  const htmlCS = getComputedStyle(html)
  const bodyCS = getComputedStyle(body)
  const beforeCS = getComputedStyle(html, '::before')

  const header = document.querySelector('header.glass') as HTMLElement | null
  const headerCS = header ? getComputedStyle(header) : null
  const headerRect = header?.getBoundingClientRect()

  const backdrops = Array.from(document.querySelectorAll<HTMLElement>(
    '.fixed.inset-0, [data-sheet-backdrop]'
  ))

  const vv = (window as any).visualViewport as VisualViewport | undefined

  const out = {
    timestamp: new Date().toISOString(),
    scrollY: window.scrollY,
    visualViewport: vv ? {
      height: vv.height,
      offsetTop: vv.offsetTop,
      pageTop: vv.pageTop,
      scale: vv.scale,
    } : null,
    safeAreaInsetTopVar: getComputedStyle(html).getPropertyValue('--sat') || '(unset, env() only)',
    html: {
      position: htmlCS.position,
      overflow: htmlCS.overflow,
      backgroundColor: htmlCS.backgroundColor,
      transform: htmlCS.transform,
    },
    body: {
      position: bodyCS.position,
      top: bodyCS.top,
      width: bodyCS.width,
      height: bodyCS.height,
      overflow: bodyCS.overflow,
      paddingTop: bodyCS.paddingTop,
      backgroundColor: bodyCS.backgroundColor,
      transform: bodyCS.transform,
    },
    htmlBefore: {
      content: beforeCS.content,
      position: beforeCS.position,
      top: beforeCS.top,
      height: beforeCS.height,
      zIndex: beforeCS.zIndex,
      backgroundColor: beforeCS.backgroundColor,
    },
    header: header ? {
      computedTop: headerCS!.top,
      position: headerCS!.position,
      zIndex: headerCS!.zIndex,
      backgroundColor: headerCS!.backgroundColor,
      rectTop: headerRect!.top,
      rectHeight: headerRect!.height,
      transform: headerCS!.transform,
    } : null,
    backdrops: backdrops.map((el) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const parent = el.parentElement
      return {
        tag: el.tagName,
        cls: el.className?.toString().slice(0, 80),
        zIndex: cs.zIndex,
        rectTop: r.top,
        rectHeight: r.height,
        backgroundColor: cs.backgroundColor,
        backdropFilter: cs.backdropFilter,
        position: cs.position,
        parentTag: parent?.tagName,
        parentTransform: parent ? getComputedStyle(parent).transform : null,
      }
    }),
    portalsDirectlyOnBody: Array.from(body.children)
      .filter((c) => !['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'].includes(c.tagName))
      .map((c) => ({
        tag: c.tagName,
        id: (c as HTMLElement).id || null,
        cls: (c as HTMLElement).className?.toString().slice(0, 80),
        zIndex: getComputedStyle(c as HTMLElement).zIndex,
      })),
  }

  console.group('[SAFE-DEBUG] snapshot')
  console.table(out.body)
  console.log('full', out)
  console.groupEnd()
  return out
}

export default function SafeAreaDebug() {
  const [on, setOn] = useState(false)
  const [bodyLocked, setBodyLocked] = useState(false)

  useEffect(() => {
    if (!isDebugOn()) return
    setOn(true)
    ;(window as any).__haiSafeSnapshot = snapshot

    // Watch for body position:fixed (the lock signal) so we
    // automatically dump computed styles when a sheet opens.
    const obs = new MutationObserver(() => {
      const locked = document.body.style.position === 'fixed'
      setBodyLocked(locked)
      snapshot()
    })
    obs.observe(document.body, { attributes: true, attributeFilter: ['style'] })
    snapshot()
    return () => obs.disconnect()
  }, [])

  if (!on) return null

  return (
    <>
      <style>{`
        html, body { outline: 1px dashed rgba(255,0,0,0.4); }
        html { box-shadow: inset 0 0 0 9999px ${COLOURS.html}; }
        /* DOES NOT actually tint html bg without breaking — we use a
           top stripe instead */
      `}</style>

      {/* Stripe overlays — each one labels a candidate layer in the
          top region. Stacked z-indexes match each target so the
          actual paint order is preserved. */}
      <div
        data-debug="html::before-stripe"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          height: 'env(safe-area-inset-top, 0px)',
          background: COLOURS.htmlBefore,
          zIndex: 2,
          pointerEvents: 'none',
          fontSize: 9,
          color: '#000',
          fontWeight: 700,
          fontFamily: 'monospace',
        }}
      >GREEN = covers safe-area zone</div>

      {/* Floating legend + lock-state indicator */}
      <div
        style={{
          position: 'fixed',
          bottom: 'env(safe-area-inset-bottom, 0px)',
          left: 4,
          zIndex: 2147483647,
          background: 'rgba(0,0,0,0.85)',
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: 10,
          padding: '6px 8px',
          borderRadius: 4,
          maxWidth: 'calc(100vw - 8px)',
          pointerEvents: 'auto',
        }}
        onClick={() => snapshot()}
      >
        <div>SAFE-DEBUG (tap to log)</div>
        <div>body lock: <b>{bodyLocked ? 'FIXED' : 'no'}</b></div>
        <div style={{ color: COLOURS.htmlBefore }}>green = html::before</div>
        <div style={{ color: COLOURS.header }}>yellow = header.glass</div>
        <div style={{ color: COLOURS.backdrop }}>magenta = backdrop</div>
        <div style={{ color: COLOURS.body }}>blue = body</div>
        <div style={{ color: COLOURS.portal }}>cyan = direct portals on body</div>
      </div>

      {/* Tint backdrops + headers via runtime style injection so we
          don't rely on adding classes to existing components. */}
      <style>{`
        body { box-shadow: inset 5px 0 0 ${COLOURS.body}, inset -5px 0 0 ${COLOURS.body}; }
        header.glass { outline: 2px dashed ${COLOURS.header} !important; }
        header.glass::after {
          content: 'HEADER (yellow)';
          position: absolute; top: 0; left: 50%;
          transform: translateX(-50%);
          background: ${COLOURS.header}; color: #000;
          font: 700 10px monospace; padding: 1px 4px;
          z-index: 10000;
        }
        .fixed.inset-0 { outline: 2px solid ${COLOURS.backdrop} !important; }
        .fixed.inset-0::before {
          content: 'BACKDROP (magenta) z=' attr(class);
          position: absolute; top: 4px; left: 4px;
          background: ${COLOURS.backdrop}; color: #fff;
          font: 700 9px monospace; padding: 2px 4px;
          z-index: 10000;
          max-width: calc(100vw - 8px);
          overflow: hidden;
          white-space: nowrap;
          pointer-events: none;
        }
      `}</style>
    </>
  )
}
