'use client'

import SmartText from './SmartText'
import PlacePreviewCard from './places/PlacePreviewCard'
import PhonePreviewCard from './PhonePreviewCard'
import { extractPlaceLinks } from '@/lib/places/extractPlaceLinks'
import { extractPhoneNumbers } from '@/lib/posts/extractPhoneNumbers'

/**
 * Drop-in wrapper around SmartText that renders compact preview
 * cards below the text whenever the body contains a /directory/<id>
 * link OR a phone number (including Arabic-Indic ٠-٩ and Persian
 * ۰-۹ digits). The text itself is left UNTOUCHED — links still
 * auto-link inline via SmartText. The preview cards appear
 * underneath, deduped per body.
 *
 * Phone detection runs at VIEW time, so EXISTING posts written
 * before the feature shipped pick it up automatically — no
 * migration of post bodies needed.
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
  const placeIds = extractPlaceLinks(text)
  // Phones are returned as E.164 already deduped + normalised, so
  // we can render them 1:1. Cap at 3 per body so a phone-list post
  // doesn't drop 12 cards into the feed.
  const phones = extractPhoneNumbers(text).slice(0, 3)
  return (
    <>
      <SmartText text={text} variant={variant} />
      {placeIds.length > 0 && (
        <div className="space-y-2">
          {placeIds.map((id) => (
            <PlacePreviewCard key={id} placeId={id} />
          ))}
        </div>
      )}
      {phones.length > 0 && (
        <div className="space-y-2">
          {phones.map((p) => (
            <PhonePreviewCard key={p} phone={p} />
          ))}
        </div>
      )}
    </>
  )
}
