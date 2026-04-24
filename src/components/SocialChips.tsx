'use client'

import {
  SiInstagram,
  SiTiktok,
  SiX,
  SiSnapchat,
  SiWhatsapp,
} from 'react-icons/si'
import { buildSocialUrls, type SocialPlatform } from '@/lib/socialLinks'

/**
 * Horizontal row of social-media icon buttons for service-provider
 * profiles. Tapping any icon calls openSocial() which tries the
 * platform's custom URL scheme first (opens the installed app) and
 * falls back to the HTTPS profile if the app isn't installed.
 *
 * Used on:
 *  - the user's own profile (viewer state of the service block)
 *  - the provider popup inside PostCard
 *
 * Reuses existing hai-action-btn styling so it matches the rest of
 * the profile layout without introducing new tokens.
 */

/** Per-platform icon meta. Static Tailwind classes drive color so
 *  the JIT picks them up at build time; black-brand platforms
 *  (TikTok / X) flip to white in dark mode to stay visible on the
 *  dark tile. Snapchat uses its yellow tile to avoid that trap. */
const META: Record<
  SocialPlatform,
  { icon: typeof SiInstagram; iconClass: string; tileClass: string; label: string }
> = {
  instagram: {
    icon: SiInstagram,
    iconClass: 'text-[#E4405F]',
    tileClass: 'bg-gray-100 dark:bg-gray-700',
    label: 'Instagram',
  },
  tiktok: {
    icon: SiTiktok,
    iconClass: 'text-black dark:text-white',
    tileClass: 'bg-gray-100 dark:bg-gray-700',
    label: 'TikTok',
  },
  x: {
    icon: SiX,
    iconClass: 'text-black dark:text-white',
    tileClass: 'bg-gray-100 dark:bg-gray-700',
    label: 'X',
  },
  snapchat: {
    icon: SiSnapchat,
    iconClass: 'text-black',
    tileClass: 'bg-[#FFFC00]',
    label: 'Snapchat',
  },
  whatsapp: {
    icon: SiWhatsapp,
    iconClass: 'text-[#25D366]',
    tileClass: 'bg-gray-100 dark:bg-gray-700',
    label: 'WhatsApp',
  },
}

export default function SocialChips({
  links,
  size = 'md',
}: {
  links: Partial<Record<SocialPlatform, string>> | null | undefined
  size?: 'sm' | 'md'
}) {
  if (!links) return null
  const entries = (Object.entries(links) as [SocialPlatform, string][]).filter(
    ([k, v]) => !!v && k in META,
  )
  if (entries.length === 0) return null

  const btnClass = size === 'sm'
    ? 'w-7 h-7 rounded-lg flex items-center justify-center'
    : 'w-9 h-9 rounded-xl flex items-center justify-center'
  const iconSize = size === 'sm' ? 14 : 18

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {entries.map(([platform, handle]) => {
        const { icon: Icon, iconClass, tileClass, label } = META[platform]
        const { web } = buildSocialUrls(platform, handle)
        return (
          <a
            key={platform}
            href={web}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${label} — ${handle}`}
            className={`${btnClass} ${tileClass} active:scale-95 transition-transform`}
          >
            <Icon size={iconSize} className={iconClass} />
          </a>
        )
      })}
    </div>
  )
}
