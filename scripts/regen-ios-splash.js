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
// Layout matches the X-style preview the user pinned:
//   - Icon at the visual CENTER of the canvas (vertically centered)
//   - Brand text near the BOTTOM (~80 % down) with a deliberate
//     gap so the composition reads as "icon in the middle, brand
//     down at the foot" — NOT a single tightly-stacked block.

// Icon ~12 % of canvas.
const ICON_SIZE = Math.round(CANVAS * 0.12)
const ICON_Y_OFFSET = 0

// Font sizes — slimmed down per user feedback. Was 7.5 % / 3.0 %,
// felt oversized on the phone. New 4.5 % / 1.8 % maps to ~17 px
// Arabic / ~7 px HAI on a 393 px iPhone (cropped aspect), in
// line with the X / Instagram intro reference proportions.
const AR_SIZE = Math.round(CANVAS * 0.045)
const EN_SIZE = Math.round(CANVAS * 0.018)
const EN_TRACKING = Math.round(CANVAS * 0.010)

// Brand text positions — pushed further toward the foot per
// user feedback. Was 80 % / 85.5 %, now 88 % / 92 %.
const AR_BASELINE_FRAC = 0.88
const EN_BASELINE_FRAC = 0.92

// Embed IBM Plex Sans Arabic (the same font the web app loads
// from Google Fonts) directly into the SVG via @font-face with
// a base64 data URL. This gives the native splash the same
// Arabic typography as the rest of the app, AND removes any
// dependency on system fonts during rasterization — librsvg
// uses the embedded font directly.
const FONT_PATH = path.resolve(__dirname, 'fonts', 'IBMPlexSansArabic-Bold.ttf')
const FONT_NAME = 'IBM Plex Sans Arabic'
// Use single quotes for every name so the whole stack can be
// wrapped in DOUBLE quotes in the SVG attribute without quote
// collisions.
const FONT_STACK = `'${FONT_NAME}', 'Segoe UI', 'Tahoma', 'Arial', sans-serif`

function fontBase64() {
  if (!fs.existsSync(FONT_PATH)) {
    console.warn(`[regen-splash] font file missing at ${FONT_PATH} — falling back to system Arabic font`)
    return null
  }
  // Detect actual format from extension so the data URL mime-type
  // matches (woff2 vs ttf). Google Fonts returns either depending
  // on the request.
  const ext = path.extname(FONT_PATH).toLowerCase()
  const mime = ext === '.woff2' ? 'font/woff2'
             : ext === '.woff'  ? 'font/woff'
             : 'font/ttf'
  const buf = fs.readFileSync(FONT_PATH)
  return { mime, base64: buf.toString('base64') }
}

function fontFaceCss() {
  const font = fontBase64()
  if (!font) return ''
  return `
    @font-face {
      font-family: '${FONT_NAME}';
      font-weight: 700;
      font-style: normal;
      src: url(data:${font.mime};base64,${font.base64}) format('${font.mime === 'font/woff2' ? 'woff2' : font.mime === 'font/woff' ? 'woff' : 'truetype'}');
    }
  `
}

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

  // Brand text positions pinned to a fraction of the canvas height
  // (NOT computed from the icon), so the composition reads as
  // "icon centered, brand text down at the foot" — same beat as
  // the X-style preview.
  const arBaselineY = Math.round(CANVAS * AR_BASELINE_FRAC)
  const enBaselineY = Math.round(CANVAS * EN_BASELINE_FRAC)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">
  <defs>
    <style type="text/css"><![CDATA[${fontFaceCss()}]]></style>
  </defs>
  <rect width="${CANVAS}" height="${CANVAS}" fill="${bgColor}"/>
  ${brandIcon(inkColor, iconX, iconY)}
  <text x="${cx}" y="${arBaselineY}"
        text-anchor="middle"
        font-family="${FONT_STACK}"
        font-size="${AR_SIZE}"
        font-weight="700"
        fill="${inkColor}">حَيّ</text>
  <text x="${cx}" y="${enBaselineY}"
        text-anchor="middle"
        font-family="${FONT_STACK}"
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
