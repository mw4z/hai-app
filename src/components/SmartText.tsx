'use client'

import ContactChip, { parseContactSnippets } from './ContactChip'

/**
 * Renders a text string with any `📱 Name — +phone` snippets replaced
 * by interactive ContactChip cards with Call / Copy / WhatsApp buttons.
 * Plain text segments render as-is.
 */
export default function SmartText({ text }: { text: string }) {
  const segments = parseContactSnippets(text)

  // Fast path — no contact snippets found, avoid extra wrapper
  if (segments.length === 1 && typeof segments[0] === 'string') {
    return <>{text}</>
  }

  return (
    <>
      {segments.map((seg, i) =>
        typeof seg === 'string' ? (
          <span key={i}>{seg}</span>
        ) : (
          <ContactChip key={i} name={seg.name} phone={seg.phone} />
        ),
      )}
    </>
  )
}
