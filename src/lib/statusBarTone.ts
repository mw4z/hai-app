/**
 * Status-bar tone helpers — switch the iOS / Android system status
 * bar (clock, battery, wifi icons) between LIGHT (white) and DARK
 * (black) at runtime, based on what's behind it on screen.
 *
 * Used by the profile cover photo: if the cover is dark (or a dark
 * image), the status bar text needs to be WHITE so the user can see
 * it. If the cover is light, status bar text goes BLACK. Otherwise
 * the time / battery indicator gets lost against the cover.
 *
 * Restores the app's normal theme-driven tone (set by CapacitorBridge)
 * when the caller is done with its override — pass null to release.
 */

type Tone = 'light' | 'dark' | null

/**
 * Apply a status-bar tone override. Pass null to release the
 * override and let the app's default (set by CapacitorBridge based
 * on the dark-mode toggle) take back over.
 *
 * 'light' = LIGHT TEXT on the status bar (good for dark backgrounds)
 * 'dark'  = DARK TEXT on the status bar (good for light backgrounds)
 *
 * Maps to @capacitor/status-bar's Style enum:
 *   Style.Light = light text → use on a dark cover
 *   Style.Dark  = dark text  → use on a light cover
 * (yes, the enum names are the OPPOSITE of intuition — they describe
 *  the BACKGROUND each style is meant for, not the text colour.)
 */
export async function setStatusBarTone(tone: Tone): Promise<void> {
  if (typeof window === 'undefined') return
  const cap = (window as any).Capacitor
  if (!cap?.isNativePlatform?.()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    if (tone === null) {
      // Restore: read the app's current dark-mode preference and
      // pick the same tone CapacitorBridge would. Light icons in
      // dark mode, dark icons in light mode.
      const isDark = document.documentElement.classList.contains('dark')
      await StatusBar.setStyle({ style: isDark ? Style.Light : Style.Dark })
      return
    }
    // 'light' tone → light TEXT (Style.Light makes icons white)
    // 'dark' tone  → dark TEXT (Style.Dark makes icons black)
    await StatusBar.setStyle({ style: tone === 'light' ? Style.Light : Style.Dark })
  } catch {
    /* status-bar plugin not available — ignore */
  }
}

/**
 * Compute average perceived luminance of an image's TOP region (the
 * strip behind the status bar). Returns 'light' if the average is
 * bright enough that DARK status-bar text is readable, or 'dark' if
 * the area is dim and LIGHT status-bar text is needed.
 *
 * Returns null when the image fails to load or when the canvas read
 * is blocked (e.g. CORS) so the caller can fall back to a default.
 */
export async function analyzeImageBrightness(url: string): Promise<Tone> {
  if (typeof window === 'undefined') return null
  return new Promise<Tone>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        // Sample only the TOP 12% of the image — that's the strip the
        // iOS status bar / Dynamic Island actually overlays. Sampling
        // the whole image would average a dark sky into a light face
        // and miss the relevant region.
        const sampleH = Math.max(1, Math.floor(img.naturalHeight * 0.12))
        const sampleW = img.naturalWidth
        canvas.width = sampleW
        canvas.height = sampleH
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, sampleW, sampleH, 0, 0, sampleW, sampleH)
        const { data } = ctx.getImageData(0, 0, sampleW, sampleH)
        // Perceived luminance via the standard sRGB weights, averaged
        // across the sampled pixels. Step every 4 px (16 bytes) for
        // speed — this only needs ballpark accuracy for the tone
        // pick, not photometric truth.
        let total = 0
        let count = 0
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]
          if (a < 16) continue
          total += 0.2126 * r + 0.7152 * g + 0.0722 * b
          count++
        }
        if (count === 0) return resolve(null)
        const avg = total / count
        // 0..255: < 140 reads as a "dark" cover where light status-bar
        // text is needed; ≥ 140 reads as "light" where dark text is
        // needed. The 140 split is mid-grey biased toward light because
        // black text on mid-grey is harder to read than white on
        // mid-grey on most iPhone displays.
        resolve(avg < 140 ? 'light' : 'dark')
      } catch {
        // Most likely a tainted-canvas (CORS) error. Tell caller to
        // fall back to a default.
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Compute tone from a CSS background string (gradient or solid hex).
 * Returns 'light'/'dark' for recognisable forms, null otherwise.
 *
 * - solid hex like `#0f172a` → luminance from the hex
 * - linear-gradient(...) → take the first colour stop and luminance it
 *
 * Useful when the cover isn't an image URL but a saved gradient.
 */
export function analyzeCssBackground(bg: string): Tone {
  if (!bg) return null
  // Solid hex
  const hex = bg.match(/#[0-9a-f]{3,8}/i)?.[0]
  if (hex && bg.trim().startsWith('#')) return luminanceTone(hex)
  // Gradient — first hex / rgb stop
  const firstStop = bg.match(/#[0-9a-f]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)/i)?.[0]
  if (firstStop) return luminanceTone(firstStop)
  return null
}

function luminanceTone(c: string): Tone {
  const rgb = parseColor(c)
  if (!rgb) return null
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
  return lum < 140 ? 'light' : 'dark'
}

function parseColor(c: string): [number, number, number] | null {
  if (c.startsWith('#')) {
    const hex = c.slice(1)
    if (hex.length === 3) {
      return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)]
    }
    if (hex.length >= 6) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
    }
    return null
  }
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])]
  return null
}
