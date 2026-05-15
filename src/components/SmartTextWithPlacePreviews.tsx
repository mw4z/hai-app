'use client'

import SmartText from './SmartText'
import PlacePreviewCard from './places/PlacePreviewCard'
import { extractPlaceLinks } from '@/lib/places/extractPlaceLinks'

/**
 * Drop-in wrapper around SmartText that renders compact directory
 * preview cards below the text whenever the body contains a
 * /directory/<id> link. The text itself is left UNTOUCHED — the
 * URL still auto-links inline via SmartText. The preview cards
 * appear underneath, deduped and capped at 2 per content block.
 *
 * Used by:
 *   - PostCard body (collapsed + expanded + detail render modes)
 *   - Chat message bubble
 *   - Comment body inside the comments sheet
 */
export default function SmartTextWithPlacePreviews({
  text,
  variant,
}: {
  text: string
  variant?: 'light' | 'onGreen'
}) {
  const ids = extractPlaceLinks(text)
  return (
    <>
      <SmartText text={text} variant={variant} />
      {ids.length > 0 && (
        <div className="space-y-2">
          {ids.map((id) => (
            <PlacePreviewCard key={id} placeId={id} />
          ))}
        </div>
      )}
    </>
  )
}
