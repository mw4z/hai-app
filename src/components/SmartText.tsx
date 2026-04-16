'use client'

import ContactChip, { parseContactSnippets } from './ContactChip'

/**
 * Renders a text string with any `📱 Name — +phone` snippets replaced
 * by interactive ContactChip cards with Call / Copy / WhatsApp buttons.
 * Plain text segments render as-is.
 *
 * Pass variant="onGreen" when rendering inside a green "me" chat bubble
 * so the chip uses translucent-white glass styling instead of the
 * default light-green card.
 */
export default function SmartText({ text, variant }: { text: string; variant?: 'light' | 'onGreen' }) {
  const segments = parseContactSnippets(text)

  if (segments.length === 1 && typeof segments[0] === 'string') {
    return <>{text}</>
  }

  return (
    <>
      {segments.map((seg, i) =>
        typeof seg === 'string' ? (
          <span key={i}>{seg}</span>
        ) : (
          <ContactChip key={i} name={seg.name} phone={seg.phone} variant={variant} />
        ),
      )}
    </>
  )
}
