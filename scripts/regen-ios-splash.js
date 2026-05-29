/**
 * Regenerate the iOS native launch-splash PNGs from the current
 * brand SVG. Run after the app icon design changes; replaces the
 * three identical 2732×2732 files in Assets.xcassets/Splash.imageset.
 *
 * The native launch storyboard centers this image on a brand-color
 * background, scaled to fit. We render the brand mark at ~28% of
 * the canvas so it sits comfortably inside the iPad's centered crop
 * window (~30-35% — anything larger gets clipped on some devices).
 *
 * Usage:  node scripts/regen-ios-splash.js
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ICON_SVG = path.resolve(__dirname, '..', 'public', 'icon-192.svg')
const OUT_DIR  = path.resolve(
  __dirname, '..',
  'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset',
)
const CANVAS = 2732                // size each Splash PNG should be
const MARK   = Math.round(CANVAS * 0.28)  // logo ~28% of canvas

// Same gradient endpoints as the brand SVG so the background colour
// behind the mark matches when iOS crops/stretches the splash.
const BG_R = 0x00, BG_G = 0xa6, BG_B = 0x7a   // mid-tone of #00b894 → #005c48

async function main() {
  if (!fs.existsSync(ICON_SVG)) {
    console.error(`[regen-splash] icon source missing: ${ICON_SVG}`)
    process.exit(1)
  }
  const svgBuf = fs.readFileSync(ICON_SVG)

  // Render the brand mark at MARK × MARK, composited centered on
  // the brand-colour canvas. Transparent margins flatten into the
  // background so iOS doesn't render a ghost square outline.
  const mark = await sharp(svgBuf, { density: 1200 })
    .resize(MARK, MARK, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  const splash = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 3,
      background: { r: BG_R, g: BG_G, b: BG_B },
    },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer()

  const files = [
    'splash-2732x2732.png',
    'splash-2732x2732-1.png',
    'splash-2732x2732-2.png',
  ]
  for (const f of files) {
    const out = path.join(OUT_DIR, f)
    fs.writeFileSync(out, splash)
    console.log(`wrote ${out} (${splash.length} bytes)`)
  }
}

main().catch((err) => {
  console.error('[regen-splash] failed:', err)
  process.exit(1)
})
