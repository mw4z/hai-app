'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { useBodyScrollLock, consumeNextClick } from '@/hooks/useBodyScrollLock'
import { pushBackHandler } from '@/lib/backHandler'

/**
 * In-app RTL-aware replacement for window.confirm().
 *
 * Native confirm/prompt render iOS/Android system dialogs that use the
 * phone's system locale and ignore the app's <html dir="rtl"> — Arabic
 * text appears left-aligned and buttons show "Cancel/Ok" regardless of
 * the app language.
 *
 * Use via the useConfirm() hook:
 *
 *   const confirm = useConfirm()
 *   const ok = await confirm({ message: 'Delete post?', variant: 'danger' })
 *   if (!ok) return
 */

export type ConfirmVariant = 'default' | 'danger'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: ConfirmVariant
}

export interface PromptOptions {
  title?: string
  message: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
  multiline?: boolean
  inputType?: 'text' | 'number'
}

type ConfirmResolver = (result: boolean) => void
type PromptResolver = (result: string | null) => void

interface PendingConfirm {
  kind: 'confirm'
  opts: ConfirmOptions
  resolver: ConfirmResolver
}

interface PendingPrompt {
  kind: 'prompt'
  opts: PromptOptions
  resolver: PromptResolver
}

type Pending = PendingConfirm | PendingPrompt

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(
  () => Promise.resolve(false),
)
const PromptContext = createContext<(opts: PromptOptions) => Promise<string | null>>(
  () => Promise.resolve(null),
)

export function useConfirm() {
  return useContext(ConfirmContext)
}
export function usePrompt() {
  return useContext(PromptContext)
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { lang } = useLanguage()
  const [pending, setPending] = useState<Pending | null>(null)
  const [inputValue, setInputValue] = useState('')

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ kind: 'confirm', opts, resolver: resolve })
    })
  }, [])

  const prompt = useCallback((opts: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setInputValue(opts.defaultValue ?? '')
      setPending({ kind: 'prompt', opts, resolver: resolve })
    })
  }, [])

  const close = useCallback(
    (result: boolean) => {
      if (pending) {
        if (pending.kind === 'confirm') {
          pending.resolver(result)
        } else {
          pending.resolver(result ? inputValue : null)
        }
      }
      setPending(null)
      setInputValue('')
    },
    [pending, inputValue],
  )

  useBodyScrollLock(pending !== null)

  // Back-press cancels: hardware back / swipe-back dismisses the
  // dialog (resolving as cancelled) instead of routing away.
  useEffect(() => {
    if (!pending) return
    return pushBackHandler(() => close(false))
  }, [pending, close])

  // ESC cancels
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, close])

  const defaultCancel =
    lang === 'en' ? 'Cancel' : lang === 'ur' ? 'منسوخ' : 'إلغاء'
  const defaultConfirm =
    lang === 'en' ? 'Confirm' : lang === 'ur' ? 'تصدیق' : 'تأكيد'

  const isPrompt = pending?.kind === 'prompt'
  const promptOpts = isPrompt ? (pending.opts as PromptOptions) : null

  return (
    <ConfirmContext.Provider value={confirm}>
    <PromptContext.Provider value={prompt}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[2000] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return
            e.preventDefault()
            consumeNextClick()
            close(false)
          }}
        >
          <div
            className="bg-white dark:bg-gray-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl"
            onPointerDown={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'max(1.25rem, var(--hai-safe-bottom))' }}
          >
            {pending.opts.title && (
              <h2 className="font-bold text-gray-900 dark:text-white text-lg mb-2">
                {pending.opts.title}
              </h2>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4 whitespace-pre-wrap">
              {pending.opts.message}
            </p>

            {isPrompt && promptOpts && (
              promptOpts.multiline ? (
                <textarea
                  autoFocus
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={promptOpts.placeholder}
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4 resize-none"
                />
              ) : (
                <input
                  autoFocus
                  type={promptOpts.inputType || 'text'}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={promptOpts.placeholder}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      close(true)
                    }
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                />
              )
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold text-sm rounded-xl active:scale-95 transition-transform"
              >
                {pending.opts.cancelText || defaultCancel}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`py-3 text-white font-bold text-sm rounded-xl active:scale-95 transition-transform ${
                  pending.kind === 'confirm' && pending.opts.variant === 'danger'
                    ? 'bg-red-600'
                    : 'bg-primary-600'
                }`}
              >
                {pending.opts.confirmText || defaultConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </PromptContext.Provider>
    </ConfirmContext.Provider>
  )
}
