'use client'

import { useLanguage } from '@/hooks/useLanguage'

interface Props {
  url: string
  name?: string | null
  /** Bytes — when provided, rendered as a "324 KB" / "1.2 MB" hint. */
  size?: number | null
  /**
   * Visual variant. Each composer / display surface looks slightly
   * different around the tile:
   *
   *  - 'card'    → PostCard body. Light surface, full-width pill.
   *  - 'comment' → comment row. Narrower, smaller font.
   *  - 'message' → chat bubble. Inherits bubble color via parent's
   *                bg class; tile uses a translucent overlay.
   *  - 'preview' → composer preview. Has an inline ✕ remove button
   *                rendered by the caller (the component itself never
   *                shows a remove control — that lives with state).
   */
  variant?: 'card' | 'comment' | 'message' | 'preview'
}

/**
 * Shared PDF attachment tile. Used in PostCard, comment rows, and
 * chat bubbles to render the same "📄 filename + size + open" pill
 * everywhere.
 *
 * Tap opens the PDF in a new tab (browser) or the native viewer
 * (WKWebView on iOS, Android WebView on Android — Capacitor delegates
 * application/pdf URLs to the OS PDF viewer in both cases). No inline
 * preview by design — full-text PDF rendering is heavy and most
 * Capacitor wrappers ship without it.
 */
export default function PdfTile({ url, name, size, variant = 'card' }: Props) {
  const { lang } = useLanguage()
  const displayName = name || 'document.pdf'
  const sizeLabel = formatSize(size)

  const openLabel = lang === 'en' ? 'Open' : lang === 'ur' ? 'کھولیں' : 'فتح'

  // Container classes per variant — keep visual rhythm consistent
  // with the surrounding surface. All variants share the icon+text
  // structure; only background + spacing change.
  const containerByVariant: Record<NonNullable<Props['variant']>, string> = {
    card:
      'flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 active:scale-[0.98] transition-transform',
    comment:
      'flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 active:scale-[0.98] transition-transform',
    message:
      'flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/10 dark:bg-white/5 backdrop-blur border border-white/15 active:scale-[0.98] transition-transform',
    preview:
      'flex items-center gap-3 px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/60',
  }

  const titleClass =
    variant === 'comment'
      ? 'text-[12px] font-semibold leading-tight truncate'
      : 'text-[13px] font-semibold leading-tight truncate'

  const subClass =
    variant === 'comment'
      ? 'text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5'
      : 'text-[11px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5'

  // Preview variant doesn't navigate — the composer renders it next
  // to a ✕ remove button. Everything else is a tap-to-open link.
  //
  // On native (Capacitor iOS / Android) the default <a target="_blank">
  // bounces the user out to the system browser (Safari / Chrome),
  // which feels broken — they leave the Hai app entirely to read a
  // PDF, and the OS's "back to app" gesture is fiddly. We intercept
  // the tap and open via @capacitor/browser instead:
  //
  //   - iOS:     SFSafariViewController (in-app Safari sheet)
  //   - Android: Chrome Custom Tabs (in-app browser sheet)
  //
  // Both render PDFs natively via the OS PDF viewer pipeline and
  // dismiss back into the Hai app with a single tap. On web we keep
  // the default new-tab behavior — that's the right idiom for browsers.
  const Wrapper: React.ElementType = variant === 'preview' ? 'div' : 'a'
  const wrapperProps =
    variant === 'preview'
      ? {}
      : {
          href: url,
          target: '_blank',
          rel: 'noopener noreferrer',
          onClick: async (e: React.MouseEvent) => {
            const isNative =
              typeof window !== 'undefined' &&
              !!(window as any).Capacitor?.isNativePlatform?.()
            if (!isNative) return // web: let the default new-tab happen
            e.preventDefault()
            try {
              const { Browser } = await import('@capacitor/browser')
              await Browser.open({ url, presentationStyle: 'popover' })
            } catch {
              // Fall back to the default open if the plugin barfs.
              // Use window.open here because we already preventDefault'd
              // the anchor.
              window.open(url, '_blank', 'noopener,noreferrer')
            }
          },
        }

  return (
    <Wrapper {...wrapperProps} className={containerByVariant[variant]}>
      <span
        className="text-2xl leading-none flex-shrink-0"
        aria-hidden="true"
      >
        📄
      </span>
      <div className="min-w-0 flex-1">
        <p className={`${titleClass} text-gray-900 dark:text-white`}>
          {displayName}
        </p>
        <p className={subClass}>
          {sizeLabel ? (
            <>
              PDF · {sizeLabel}
            </>
          ) : (
            'PDF'
          )}
        </p>
      </div>
      {variant !== 'preview' && (
        <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex-shrink-0">
          {openLabel}
        </span>
      )}
    </Wrapper>
  )
}

function formatSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
