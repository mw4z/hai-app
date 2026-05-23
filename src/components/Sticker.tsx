'use client'

import { STICKER_BY_ID } from '@/lib/stickers/catalog'

/**
 * Renders a single Hai sticker (by id) as a self-contained CSS bubble:
 * a gradient rounded square with a large emoji and a bold Arabic phrase.
 * No <img>, no font dependency beyond the system Arabic + emoji fonts,
 * so it shapes Arabic perfectly on iOS/Android and scales to any `size`.
 *
 * Used by the picker (small), the comment/reply render (~118), and chat.
 */
export default function Sticker({
  id,
  size = 118,
  className,
}: {
  id: string
  size?: number
  className?: string
}) {
  const s = STICKER_BY_ID[id]
  if (!s) return null

  const fg = s.fg ?? '#ffffff'
  const hasText = s.lines.length > 0
  const longest = s.lines.reduce((m, l) => Math.max(m, l.length), 0)

  // Adaptive phrase size: shrink as the longest line grows so 1–2 word
  // phrases never overflow the bubble.
  const textScale = longest <= 5 ? 0.165 : longest <= 8 ? 0.135 : 0.115
  const emojiSize = hasText ? size * 0.34 : size * 0.54

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: `linear-gradient(140deg, ${s.grad[0]}, ${s.grad[1]})`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: size * 0.03,
        padding: size * 0.1,
        boxSizing: 'border-box',
        boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
        color: fg,
        textAlign: 'center',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: emojiSize, lineHeight: 1 }}>{s.emoji}</span>
      {hasText && (
        <span
          style={{
            fontSize: size * textScale,
            fontWeight: 800,
            lineHeight: 1.15,
            textShadow: '0 1px 2px rgba(0,0,0,0.22)',
            maxWidth: '100%',
          }}
        >
          {s.lines.map((l, i) => (
            <span key={i} style={{ display: 'block', whiteSpace: 'nowrap' }}>
              {l}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
