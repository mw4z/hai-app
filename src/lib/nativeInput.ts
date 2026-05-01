/**
 * JS wrapper around the iOS-only HaiNativeInput Capacitor plugin
 * (Swift impl: ios/App/App/Plugins/HaiNativeInputPlugin.swift).
 *
 * The plugin overlays a real UITextView/UITextField on top of the
 * WKWebView so the iOS keyboard renders the native modern style
 * (matches WhatsApp / Notes) instead of the gray-substrate WebView
 * keyboard.
 *
 * Usage is via the <NativeTextarea> React component in
 * src/components/NativeTextarea.tsx — direct calls into this module
 * are rarely needed.
 *
 * No-op safety: `isAvailable()` returns false on web + Android, so
 * components can fall back to plain <textarea> seamlessly.
 */

import type { PluginListenerHandle } from '@capacitor/core'

interface Rect { x: number; y: number; w: number; h: number }

export interface NativeInputCreateOpts {
  id: string
  rect: Rect
  value?: string
  multiline?: boolean
  secure?: boolean
  rtl?: boolean
  placeholder?: string
  returnKey?: 'default' | 'send' | 'search' | 'go' | 'done' | 'next'
  keyboardType?: 'default' | 'numeric' | 'decimal' | 'email' | 'url' | 'phone' | 'search'
  autocapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  autocorrect?: boolean
}

interface NativeInputPluginShape {
  create(opts: NativeInputCreateOpts): Promise<void>
  focus(opts: { id: string }): Promise<void>
  blur(opts: { id: string }): Promise<void>
  setValue(opts: { id: string; value: string }): Promise<void>
  setRect(opts: { id: string; rect: Rect }): Promise<void>
  destroy(opts: { id: string }): Promise<void>
  addListener(
    eventName: 'change' | 'focus' | 'blur' | 'submit',
    listener: (event: { id: string; value?: string }) => void,
  ): Promise<PluginListenerHandle>
}

let cached: NativeInputPluginShape | null | undefined

function getPlugin(): NativeInputPluginShape | null {
  if (cached !== undefined) return cached
  if (typeof window === 'undefined') { cached = null; return cached }
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Record<string, unknown> } }).Capacitor
  if (!cap?.isNativePlatform?.()) { cached = null; return cached }
  if (cap.getPlatform?.() !== 'ios') { cached = null; return cached }
  const plugin = cap.Plugins?.HaiNativeInput as NativeInputPluginShape | undefined
  cached = plugin ?? null
  return cached
}

/** True only on iOS native + a build that bundled the plugin. */
export function isAvailable(): boolean {
  return getPlugin() !== null
}

export const NativeInput = {
  isAvailable,
  create: (opts: NativeInputCreateOpts) => getPlugin()?.create(opts),
  focus: (id: string) => getPlugin()?.focus({ id }),
  blur: (id: string) => getPlugin()?.blur({ id }),
  setValue: (id: string, value: string) => getPlugin()?.setValue({ id, value }),
  setRect: (id: string, rect: Rect) => getPlugin()?.setRect({ id, rect }),
  destroy: (id: string) => getPlugin()?.destroy({ id }),
  addListener: (
    eventName: 'change' | 'focus' | 'blur' | 'submit',
    listener: (event: { id: string; value?: string }) => void,
  ) => getPlugin()?.addListener(eventName, listener),
}
