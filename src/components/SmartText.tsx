'use client'

import ContactChip, { parseMessageSegments } from './ContactChip'
import LocationChip from './LocationChip'

/**
 * Renders a text string with inline-segment substitutions:
 *
 *   - `📱 Name — +phone` snippet  → ContactChip (Call / Copy / WhatsApp)
 *   - `📍 Name\n<map URL>` snippet → LocationChip (Open in Maps / Copy)
 *   - Bare `https?://...` URL     → clickable <a target="_blank">
 *   - Everything else             → plain text
 *
 * Pass variant="onGreen" when rendering inside a green "me" chat
 * bubble so chips and links use translucent-white styling instead of
 * the default light card.
 */
export default function SmartText({ text, variant }: { text: string; variant?: 'light' | 'onGreen' }) {
  const segments = parseMessageSegments(text)

  // Fast path: pure text, no special segments. Avoids wrapping a
  // single span around the entire string for the common case.
  if (segments.length === 1 && segments[0].kind === 'text') {
    return <>{text}</>
  }

  const onGreen = variant === 'onGreen'
  const linkClass = onGreen
    ? 'underline decoration-white/50 underline-offset-2 hover:decoration-white break-all'
    : 'underline decoration-sky-400/60 underline-offset-2 text-sky-600 dark:text-sky-400 hover:decoration-sky-500 break-all'

  return (
    <>
      {segments.map((seg, i) => {
        switch (seg.kind) {
          case 'text':
            return <span key={i}>{seg.text}</span>
          case 'contact':
            return <ContactChip key={i} name={seg.name} phone={seg.phone} variant={variant} />
          case 'location':
            return (
              <LocationChip
                key={i}
                name={seg.name}
                lat={seg.lat}
                lng={seg.lng}
                url={seg.url}
                variant={variant}
              />
            )
          case 'link':
            return (
              <a
                key={i}
                href={seg.url}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
                onClick={(e) => e.stopPropagation()}
              >
                {seg.url}
              </a>
            )
        }
      })}
    </>
  )
}
