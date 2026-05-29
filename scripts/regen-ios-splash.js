/**
 * Regenerate the native splash PNGs to match the new monochrome
 * composition: smaller brand mark + "حَيّ" (Arabic dominant) +
 * "HAI" (English subordinate) below.
 *
 *   - iOS Light:  BLACK ink on WHITE bg
 *   - iOS Dark:   WHITE ink on BLACK bg
 *   - Android:    same two variants, written into res/drawable
 *                 and res/drawable-night as splash_composite.png
 *                 (referenced by splash.xml).
 *
 * Run after any change to the icon, ratios, or text. Both
 * platforms need a fresh native build (iOS via Codemagic,
 * Android via `./gradlew bundleRelease`) to pick the new
 * assets up — the splash is baked into the bundle.
 *
 * Usage:  node scripts/regen-ios-splash.js
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT = path.resolve(__dirname, '..')
const IOS_DIR = path.resolve(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset')
const ANDROID_DRAWABLE     = path.resolve(ROOT, 'android', 'app', 'src', 'main', 'res', 'drawable')
const ANDROID_DRAWABLE_NIGHT = path.resolve(ROOT, 'android', 'app', 'src', 'main', 'res', 'drawable-night')

const CANVAS = 2732
// Icon at 9% of canvas — smaller per user request.
const ICON_SIZE = Math.round(CANVAS * 0.09)
// How much the icon shifts UP from the vertical center to make
// room for the text block underneath while keeping the whole
// composition (icon + gap + Arabic + gap + English) visually
// centered on the screen.
const ICON_Y_OFFSET = -Math.round(CANVAS * 0.11)

// Font sizes calibrated against the 2732 canvas. Maps to roughly
// 30 px ("حَيّ") and 12 px ("HAI") on a 393 px iPhone screen —
// same proportions as the JS preview.
const AR_SIZE = Math.round(CANVAS * 0.075)
const EN_SIZE = Math.round(CANVAS * 0.030)
// Letter-spacing of "HAI" — wide, like the JS preview.
const EN_TRACKING = Math.round(CANVAS * 0.012)

// Gaps. The Arabic baseline needs to sit a full font-size-worth
// BELOW the icon bottom because tashkeel (the ّ mark in حَيّ) and
// the cap rise above the baseline; without that the Arabic
// overlaps the icon. Calibrated by eye against the regen output.
const GAP_ICON_TO_AR = Math.round(CANVAS * 0.030)
const GAP_AR_TO_EN   = Math.round(CANVAS * 0.020)

// Use a font stack widely available on Windows (where this
// script runs locally) AND macOS / Linux CI. Segoe UI and
// Tahoma both ship with strong Arabic glyphs on Windows; the
// fallbacks cover other build environments.
const FONT_STACK = `"Segoe UI", "Tahoma", "Arial", sans-serif`

function brandIcon(inkColor, originX, originY) {
  // 192-viewBox icon at ICON_SIZE pixels, positioned at (originX, originY).
  // Strokes scale proportionally — strokeWidth 12 in viewBox
  // → 12 * (ICON_SIZE / 192) px in output.
  return `
    <g transform="translate(${originX}, ${originY}) scale(${ICON_SIZE / 192})">
      <rect x="6" y="6" width="180" height="180" rx="40"
            fill="none" stroke="${inkColor}" stroke-width="12"/>
      <circle cx="96" cy="96" r="73.5"
              fill="none" stroke="${inkColor}" stroke-opacity="0.18" stroke-width="1.2"/>
      <circle cx="96" cy="96" r="57"
              fill="none" stroke="${inkColor}" stroke-opacity="0.34" stroke-width="1.6"/>
      <circle cx="96" cy="96" r="19.5" fill="${inkColor}"/>
      <circle cx="96" cy="39" r="9.5" fill="${inkColor}"/>
      <circle cx="145.5" cy="124.5" r="9.5" fill="${inkColor}"/>
      <circle cx="46.5" cy="124.5" r="9.5" fill="${inkColor}"/>
    </g>`
}

function compositeSvg(inkColor, bgColor) {
  const cx = CANVAS / 2
  const cy = CANVAS / 2
  const iconX = cx - ICON_SIZE / 2
  const iconY = cy + ICON_Y_OFFSET - ICON_SIZE / 2
  const iconBottom = iconY + ICON_SIZE

  // Arabic text baseline = icon bottom + gap + Arabic ascender height.
  // The ascender includes the cap PLUS the tashkeel mark on top of
  // the يّ letter, which extends well above the cap. AR_SIZE * 1.0
  // covers it with a small buffer.
  const arBaselineY = iconBottom + GAP_ICON_TO_AR + AR_SIZE * 1.0
  // English baseline = Arabic baseline + Arabic descender + gap +
  // English ascender. AR_SIZE * 0.25 is roughly the descender drop.
  const enBaselineY = arBaselineY + AR_SIZE * 0.25 + GAP_AR_TO_EN + EN_SIZE * 0.8

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">
  <rect width="${CANVAS}" height="${CANVAS}" fill="${bgColor}"/>
  ${brandIcon(inkColor, iconX, iconY)}
  <text x="${cx}" y="${arBaselineY}"
        text-anchor="middle"
        font-family='${FONT_STACK}'
        font-size="${AR_SIZE}"
        font-weight="700"
        fill="${inkColor}">حَيّ</text>
  <text x="${cx}" y="${enBaselineY}"
        text-anchor="middle"
        font-family='${FONT_STACK}'
        font-size="${EN_SIZE}"
        font-weight="600"
        letter-spacing="${EN_TRACKING}"
        opacity="0.55"
        fill="${inkColor}">HAI</text>
</svg>`
}

async function renderVariant({ inkHex, bgHex, fileName, outDir }) {
  const svg = compositeSvg(inkHex, bgHex)
  // density=1600 gives crisp rasterization of the text + vector
  // icon at the 2732 px output size.
  // density:72 is the default, matches the SVG viewBox 1:1.
  // We bump to 144 for a slight super-sampling pass which sharpens
  // text antialiasing — still well within sharp's pixel-limit.
  const buf = await sharp(Buffer.from(svg, 'utf-8'), { density: 144, limitInputPixels: false })
    .resize(CANVAS, CANVAS, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toBuffer()
  const out = path.join(outDir, fileName)
  fs.writeFileSync(out, buf)
  console.log(`wrote ${out} (${buf.length} bytes)`)
}

async function main() {
  const variants = [
    { inkHex: '#0a0a0a', bgHex: '#ffffff', mode: 'light' },
    { inkHex: '#ffffff', bgHex: '#19232a', mode: 'dark' },
  ]

  // ─── iOS Splash.imageset ──────────────────────────────────
  for (const v of variants) {
    for (const scale of ['1x', '2x', '3x']) {
      await renderVariant({
        inkHex: v.inkHex,
        bgHex:  v.bgHex,
        fileName: `splash-${v.mode}-${scale}.png`,
        outDir: IOS_DIR,
      })
    }
  }
  const contents = {
    images: [
      { idiom: 'universal', filename: 'splash-light-1x.png', scale: '1x' },
      { idiom: 'universal', filename: 'splash-light-2x.png', scale: '2x' },
      { idiom: 'universal', filename: 'splash-light-3x.png', scale: '3x' },
      { idiom: 'universal', filename: 'splash-dark-1x.png', scale: '1x',
        appearances: [{ appearance: 'luminosity', value: 'dark' }] },
      { idiom: 'universal', filename: 'splash-dark-2x.png', scale: '2x',
        appearances: [{ appearance: 'luminosity', value: 'dark' }] },
      { idiom: 'universal', filename: 'splash-dark-3x.png', scale: '3x',
        appearances: [{ appearance: 'luminosity', value: 'dark' }] },
    ],
    info: { version: 1, author: 'xcode' },
  }
  fs.writeFileSync(path.join(IOS_DIR, 'Contents.json'), JSON.stringify(contents, null, 2) + '\n')
  console.log(`wrote ${path.join(IOS_DIR, 'Contents.json')}`)

  // ─── Android composite PNGs ───────────────────────────────
  // The Android Capacitor SplashScreen plugin overlay uses
  // splash.xml (a drawable). We point it at this composite PNG
  // so the user gets the same icon-plus-text composition as
  // iOS. Day variant → drawable/, night variant → drawable-night/.
  if (!fs.existsSync(ANDROID_DRAWABLE_NIGHT)) {
    fs.mkdirSync(ANDROID_DRAWABLE_NIGHT, { recursive: true })
  }
  await renderVariant({
    inkHex: '#0a0a0a', bgHex: '#ffffff',
    fileName: 'splash_composite.png',
    outDir: ANDROID_DRAWABLE,
  })
  await renderVariant({
    inkHex: '#ffffff', bgHex: '#19232a',
    fileName: 'splash_composite.png',
    outDir: ANDROID_DRAWABLE_NIGHT,
  })
}

main().catch((err) => {
  console.error('[regen-splash] failed:', err)
  process.exit(1)
})
