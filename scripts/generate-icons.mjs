#!/usr/bin/env node
// Re-render every app-icon PNG from public/icon-512.svg using sharp.
//
//   node scripts/generate-icons.mjs
//
// Outputs:
//  - public/icon-{192,512,1024}.png   (PWA + manifest + apple-touch)
//  - android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/
//      ic_launcher.png + _round.png + _foreground.png
//  - ios/.../AppIcon.appiconset/AppIcon-512@2x.png   (1024x1024)
//
// The SVG is the single source of truth — change colors there and
// re-run this to roll a new color across every platform asset.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SVG_PATH = path.join(ROOT, 'public/icon-512.svg')
const FOREGROUND_SVG_PATH = path.join(ROOT, 'public/icon-foreground-512.svg')

if (!fs.existsSync(SVG_PATH)) {
  console.error('Missing', SVG_PATH)
  process.exit(1)
}
const svgBuf = fs.readFileSync(SVG_PATH)
const fgBuf = fs.existsSync(FOREGROUND_SVG_PATH) ? fs.readFileSync(FOREGROUND_SVG_PATH) : null

async function render(buf, size, out, opts = {}) {
  fs.mkdirSync(path.dirname(out), { recursive: true })
  let pipe = sharp(buf).resize(size, size)
  if (opts.flatten) {
    // App Store rejects iOS 1024 icons that contain ANY alpha channel
    // (Iris error -19241 / "Invalid large app icon … can't be
    // transparent or contain an alpha channel"). flatten() composites
    // any transparency over a solid background and strips the alpha
    // channel from the PNG output entirely.
    pipe = pipe.flatten({ background: opts.flattenBg || '#00a884' })
  }
  await pipe.png({ compressionLevel: 9 }).toFile(out)
  console.log('wrote', path.relative(ROOT, out), `${size}x${size}`, opts.flatten ? '(no-alpha)' : '')
}

// iOS expects a SQUARE 1024 icon — the launcher applies the rounded
// corners itself. Strip the rx="112" rounding from the SVG just for
// the iOS render so the four corners are filled brand teal instead of
// transparent. (We keep the rounded-corner SVG everywhere else.)
function squareIosSvg(originalSvgBuf) {
  return Buffer.from(
    originalSvgBuf.toString('utf8').replace(/rx="112"/g, 'rx="0"'),
  )
}

const ANDROID_SIZES = {
  'mipmap-mdpi':    48,
  'mipmap-hdpi':    72,
  'mipmap-xhdpi':   96,
  'mipmap-xxhdpi':  144,
  'mipmap-xxxhdpi': 192,
}

async function run() {
  // Public PNGs (PWA, apple-touch, og-image fallback)
  await render(svgBuf, 192,  path.join(ROOT, 'public/icon-192.png'))
  await render(svgBuf, 512,  path.join(ROOT, 'public/icon-512.png'))
  await render(svgBuf, 1024, path.join(ROOT, 'public/icon-1024.png'))

  // Android launcher (square + round share the same square — Android
  // applies the round mask itself when the device wants a circle).
  for (const [dir, size] of Object.entries(ANDROID_SIZES)) {
    const baseDir = path.join(ROOT, 'android/app/src/main/res', dir)
    await render(svgBuf, size, path.join(baseDir, 'ic_launcher.png'))
    await render(svgBuf, size, path.join(baseDir, 'ic_launcher_round.png'))
    // Adaptive-icon foreground — uses the full-bleed branded SVG when
    // a separate foreground asset isn't provided. Adaptive icons
    // overlay the foreground onto the bg defined in
    // mipmap-anydpi-v26/ic_launcher.xml.
    await render(fgBuf || svgBuf, size, path.join(baseDir, 'ic_launcher_foreground.png'))
  }

  // iOS — single 1024 asset; Xcode generates the rest at build time
  // using app-icon variants in the asset catalog. Render from the
  // edge-to-edge SVG variant + flatten so the PNG has no alpha
  // channel (Apple validation rejects transparent corners).
  await render(squareIosSvg(svgBuf), 1024,
    path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'),
    { flatten: true, flattenBg: '#00a884' })

  // Google Play Console listing icon — 512x512, square, no alpha.
  // Same rules as Apple: the store applies its own rounded mask, so
  // a transparent corner shows through as background. Upload this
  // file in Play Console → Main store listing → Graphics → App icon.
  await render(squareIosSvg(svgBuf), 512,
    path.join(ROOT, 'public/play-store-icon-512.png'),
    { flatten: true, flattenBg: '#00a884' })

  // Play Store feature graphic — 1024x500 banner displayed at the
  // top of the listing on the Play Store. Required by Google when
  // promoting an app. Source SVG is hand-drawn at the right aspect
  // ratio; flatten removes alpha (Play rejects transparency on
  // promo graphics).
  const featureSvgPath = path.join(ROOT, 'public/feature-graphic-1024x500.svg')
  if (fs.existsSync(featureSvgPath)) {
    const featureBuf = fs.readFileSync(featureSvgPath)
    fs.mkdirSync(path.dirname(path.join(ROOT, 'public/feature-graphic-1024x500.png')), { recursive: true })
    await sharp(featureBuf)
      .resize(1024, 500)
      .flatten({ background: '#00a884' })
      .png({ compressionLevel: 9 })
      .toFile(path.join(ROOT, 'public/feature-graphic-1024x500.png'))
    console.log('wrote public/feature-graphic-1024x500.png 1024x500 (no-alpha)')
  }

  console.log('Done.')
}

run().catch((err) => { console.error(err); process.exit(1) })
