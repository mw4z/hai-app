/**
 * Regenerate the iOS native launch-splash PNGs to match the new
 * monochrome AppSplash design:
 *   - Light variant: BLACK outline icon on WHITE background
 *   - Dark variant:  WHITE outline icon on BLACK background
 *
 * Outputs 6 PNGs to Assets.xcassets/Splash.imageset and rewrites
 * the imageset's Contents.json so iOS picks the correct variant
 * based on the OS appearance trait. Run after any change to the
 * brand mark dimensions.
 *
 * Usage:  node scripts/regen-ios-splash.js
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const OUT_DIR = path.resolve(
  __dirname, '..',
  'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset',
)
const CANVAS = 2732
// Mark size as a fraction of canvas. Smaller (~14%) than the old
// 28% — the new design has more breathing room around the icon
// like X and Instagram. iPad crop still safe at this size.
const MARK = Math.round(CANVAS * 0.14)

function iconSvg(inkColor) {
  // Mirror of the SVG in src/components/AppSplash.tsx — outline
  // square + 2 light inner rings + filled center dot + 3 filled
  // satellites. Drawn with currentColor placeholder so we can
  // swap black/white per variant.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg" width="192" height="192">
  <rect x="6" y="6" width="180" height="180" rx="40"
        fill="none" stroke="${inkColor}" stroke-width="12"/>
  <circle cx="96" cy="96" r="73.5"
          fill="none" stroke="${inkColor}" stroke-opacity="0.18" stroke-width="1.2"/>
  <circle cx="96" cy="96" r="57"
          fill="none" stroke="${inkColor}" stroke-opacity="0.34" stroke-width="1.6"/>
  <circle cx="96" cy="96" r="19.5" fill="${inkColor}"/>
  <circle cx="96"   cy="39"    r="9.5" fill="${inkColor}"/>
  <circle cx="145.5" cy="124.5" r="9.5" fill="${inkColor}"/>
  <circle cx="46.5"  cy="124.5" r="9.5" fill="${inkColor}"/>
</svg>`
}

async function renderVariant({ inkColor, bgR, bgG, bgB, fileName }) {
  const svgBuf = Buffer.from(iconSvg(inkColor), 'utf-8')

  const mark = await sharp(svgBuf, { density: 1600 })
    .resize(MARK, MARK, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  const splash = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 3,
      background: { r: bgR, g: bgG, b: bgB },
    },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer()

  const out = path.join(OUT_DIR, fileName)
  fs.writeFileSync(out, splash)
  console.log(`wrote ${out} (${splash.length} bytes)`)
}

async function main() {
  // Three scales for universal idiom. Image catalog Contents.json
  // below maps each to 1x / 2x / 3x.
  // Light: BLACK ink (#0a0a0a — slight off-black, matches AppSplash --ink)
  //        on WHITE bg.
  // Dark:  WHITE ink (#ffffff) on BLACK bg.
  const variants = [
    { inkColor: '#0a0a0a', bgR: 0xff, bgG: 0xff, bgB: 0xff,
      files: ['splash-light-1x.png', 'splash-light-2x.png', 'splash-light-3x.png'] },
    { inkColor: '#ffffff', bgR: 0x00, bgG: 0x00, bgB: 0x00,
      files: ['splash-dark-1x.png', 'splash-dark-2x.png', 'splash-dark-3x.png'] },
  ]
  for (const v of variants) {
    for (const f of v.files) {
      await renderVariant({ inkColor: v.inkColor, bgR: v.bgR, bgG: v.bgG, bgB: v.bgB, fileName: f })
    }
  }

  // Contents.json — declare both light + dark variants per scale.
  // iOS picks the appropriate one at launch based on the user's
  // OS appearance setting (light / dark).
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
  const contentsPath = path.join(OUT_DIR, 'Contents.json')
  fs.writeFileSync(contentsPath, JSON.stringify(contents, null, 2) + '\n')
  console.log(`wrote ${contentsPath}`)

  // Remove the old single-variant files if they linger.
  const old = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']
  for (const f of old) {
    const p = path.join(OUT_DIR, f)
    if (fs.existsSync(p)) {
      fs.unlinkSync(p)
      console.log(`removed legacy ${p}`)
    }
  }
}

main().catch((err) => {
  console.error('[regen-splash] failed:', err)
  process.exit(1)
})
