'use client'

import { forwardRef, useEffect, useImperativeHandle, useId, useLayoutEffect, useRef, useState } from 'react'
import { NativeInput } from '@/lib/nativeInput'

/**
 * Drop-in replacement for <textarea> / <input type="text"> on iOS that
 * overlays a real native UITextView/UITextField on top of the WebView
 * at the same position. Falls back to a plain HTML element on
 * web / Android where the plugin isn't available.
 *
 * The native overlay is positioned absolutely over the spacer <div>
 * this component renders. Whenever the spacer's bounding rect
 * changes (scroll, layout, keyboard show/hide), we re-call
 * NativeInput.setRect to keep the overlay aligned. JS state stays
 * authoritative — every native keystroke arrives via the 'change'
 * listener and is reflected back into React state.
 *
 * Limitations
 * - Width / height are sourced from the spacer's getBoundingClientRect.
 *   Any CSS that resizes the spacer needs to be visible to the
 *   ResizeObserver attached here.
 * - Native overlay paints OVER the WebView — z-index against other
 *   page elements doesn't apply. Don't put modal sheets that should
 *   appear ABOVE the input without first calling onBlur to dismiss
 *   the keyboard.
 */

export interface NativeTextareaProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  onFocus?: () => void
  onBlur?: () => void
  placeholder?: string
  multiline?: boolean
  secure?: boolean
  rtl?: boolean
  returnKey?: 'default' | 'send' | 'search' | 'go' | 'done' | 'next'
  keyboardType?: 'default' | 'numeric' | 'decimal' | 'email' | 'url' | 'phone' | 'search'
  autocapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  autocorrect?: boolean
  className?: string
  style?: React.CSSProperties
  maxLength?: number
  disabled?: boolean
  /** Optional: forces fall-back to HTML (debug / web preview). */
  forceFallback?: boolean
}

export interface NativeTextareaHandle {
  focus(): void
  blur(): void
}

export const NativeTextarea = forwardRef<NativeTextareaHandle, NativeTextareaProps>(
  function NativeTextarea(props, ref) {
    const useNative = !props.forceFallback && NativeInput.isAvailable()
    if (useNative) return <NativeBackedTextarea {...props} fwdRef={ref} />
    return <HtmlFallbackTextarea {...props} fwdRef={ref} />
  },
)

interface InternalProps extends NativeTextareaProps {
  fwdRef: React.ForwardedRef<NativeTextareaHandle>
}

function HtmlFallbackTextarea({ fwdRef, value, onChange, onSubmit, onFocus, onBlur, placeholder, multiline = true, secure, returnKey, keyboardType, autocapitalize, autocorrect, className, style, maxLength, disabled }: InternalProps) {
  const taRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  useImperativeHandle(fwdRef, () => ({
    focus() { taRef.current?.focus() },
    blur()  { taRef.current?.blur() },
  }))
  const sharedProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => onChange(e.target.value),
    onFocus: () => onFocus?.(),
    onBlur: () => onBlur?.(),
    placeholder,
    className,
    style,
    maxLength,
    disabled,
    inputMode: keyboardType === 'numeric' ? 'numeric'
      : keyboardType === 'decimal' ? 'decimal'
      : keyboardType === 'email' ? 'email'
      : keyboardType === 'url' ? 'url'
      : keyboardType === 'phone' ? 'tel'
      : keyboardType === 'search' ? 'search'
      : 'text',
    autoCapitalize: autocapitalize,
    autoCorrect: autocorrect ? 'on' : 'off',
  } as const
  if (multiline) {
    return (
      <textarea
        ref={(el) => { taRef.current = el }}
        {...sharedProps}
        onKeyDown={(e) => {
          if (returnKey && returnKey !== 'default' && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); onSubmit?.()
          }
        }}
      />
    )
  }
  return (
    <input
      ref={(el) => { taRef.current = el }}
      type={secure ? 'password' : 'text'}
      {...sharedProps}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onSubmit?.() }
      }}
    />
  )
}

function NativeBackedTextarea({ fwdRef, value, onChange, onSubmit, onFocus, onBlur, placeholder, multiline = true, secure = false, rtl = false, returnKey = 'default', keyboardType = 'default', autocapitalize = 'sentences', autocorrect = true, className, style }: InternalProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '_')
  const spacerRef = useRef<HTMLDivElement | null>(null)
  const lastSentValue = useRef(value)
  const [_tick, setTick] = useState(0)  // forces rect re-measure on layout effect

  useImperativeHandle(fwdRef, () => ({
    focus() { void NativeInput.focus(id) },
    blur()  { void NativeInput.blur(id) },
  }))

  // Create the native overlay once on mount; destroy on unmount.
  useEffect(() => {
    const el = spacerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    void NativeInput.create({
      id,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      value,
      multiline,
      secure,
      rtl,
      placeholder,
      returnKey,
      keyboardType,
      autocapitalize,
      autocorrect,
    })
    return () => { void NativeInput.destroy(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Listen to native events.
  useEffect(() => {
    const handles: Array<Promise<{ remove: () => void } | undefined>> = []
    handles.push(NativeInput.addListener('change', (e) => {
      if (e.id !== id) return
      lastSentValue.current = e.value ?? ''
      onChange(e.value ?? '')
    }) as Promise<{ remove: () => void } | undefined>)
    handles.push(NativeInput.addListener('submit', (e) => {
      if (e.id !== id) return
      onSubmit?.()
    }) as Promise<{ remove: () => void } | undefined>)
    handles.push(NativeInput.addListener('focus', (e) => { if (e.id === id) onFocus?.() }) as Promise<{ remove: () => void } | undefined>)
    handles.push(NativeInput.addListener('blur',  (e) => { if (e.id === id) onBlur?.() }) as Promise<{ remove: () => void } | undefined>)
    return () => {
      handles.forEach((p) => { p.then((h) => h?.remove()).catch(() => {}) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Push value→native when JS state changes (and it didn't come from native).
  useEffect(() => {
    if (value === lastSentValue.current) return
    lastSentValue.current = value
    void NativeInput.setValue(id, value)
  }, [id, value])

  // Position sync — rect can change on scroll, resize, keyboard show/hide.
  useLayoutEffect(() => {
    const el = spacerRef.current
    if (!el) return
    let raf = 0
    const sync = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        void NativeInput.setRect(id, { x: r.left, y: r.top, w: r.width, h: r.height })
      })
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('scroll', sync)
    setTick((t) => t + 1)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('scroll', sync)
    }
  }, [id])

  // Spacer reserves layout space and provides the rect we mirror.
  // pointer-events: none so taps reach the native overlay; visibility
  // hidden keeps focus management to native side.
  return (
    <div
      ref={spacerRef}
      className={className}
      style={{
        ...style,
        // The native overlay paints on top — keep the spacer
        // invisible but layout-significant.
        opacity: 0,
        pointerEvents: 'none',
        // Match a textarea's default behavior: lay out as block.
        display: style?.display ?? 'block',
        // Single-line variant: 1.5em min-height so the rect has size.
        minHeight: multiline ? undefined : '1.5em',
      }}
      aria-hidden
    />
  )
}
