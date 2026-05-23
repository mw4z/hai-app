/* Generates a standalone HTML preview of the Hai sticker pack from the
 * real catalog, using the same CSS the <Sticker> component renders with.
 * Run: node --import tsx scripts/sticker-preview.ts  → stickers-preview.html
 */
import { writeFileSync } from 'fs'
import { STICKERS, STICKER_CATEGORIES } from '../src/lib/stickers/catalog'

function bubble(s: (typeof STICKERS)[number], size = 120): string {
  const fg = s.fg ?? '#ffffff'
  const hasText = s.lines.length > 0
  const longest = s.lines.reduce((m, l) => Math.max(m, l.length), 0)
  const textScale = longest <= 5 ? 0.165 : longest <= 8 ? 0.135 : 0.115
  const emojiSize = hasText ? size * 0.34 : size * 0.54
  const lines = s.lines
    .map(
      (l) =>
        `<span style="display:block;white-space:nowrap">${l}</span>`,
    )
    .join('')
  return `
  <div style="width:${size}px;height:${size}px;border-radius:${size * 0.22}px;
       background:linear-gradient(140deg,${s.grad[0]},${s.grad[1]});
       display:flex;flex-direction:column;align-items:center;justify-content:center;
       gap:${size * 0.03}px;padding:${size * 0.1}px;box-sizing:border-box;
       box-shadow:0 6px 16px rgba(0,0,0,.18);color:${fg};text-align:center;overflow:hidden">
    <span style="font-size:${emojiSize}px;line-height:1">${s.emoji}</span>
    ${hasText ? `<span style="font-size:${size * textScale}px;font-weight:800;line-height:1.15;text-shadow:0 1px 2px rgba(0,0,0,.22)">${lines}</span>` : ''}
  </div>`
}

const sections = STICKER_CATEGORIES.map((c) => {
  const items = STICKERS.filter((s) => s.category === c.key)
  return `
    <h2 style="font:700 18px system-ui;margin:28px 0 12px">${c.emoji} ${c.ar} · ${c.en}</h2>
    <div style="display:flex;flex-wrap:wrap;gap:14px">${items.map((s) => bubble(s)).join('')}</div>`
}).join('')

const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>Hai Stickers</title></head>
<body style="font-family:system-ui,-apple-system,'Segoe UI';background:#f3f4f6;color:#111;padding:24px;max-width:760px;margin:auto">
  <h1 style="font:800 24px system-ui">ملصقات حي — Hai Stickers (${STICKERS.length})</h1>
  ${sections}
</body></html>`

writeFileSync('stickers-preview.html', html, 'utf8')
console.log('Wrote stickers-preview.html with', STICKERS.length, 'stickers')
