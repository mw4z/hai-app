'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { type Lang, type TranslationKey, t as translate } from '@/lib/i18n'

export const LANGUAGE_CHANGE_EVENT = 'hai-language-change'

interface LangContextValue {
  lang: Lang
  t: (key: TranslationKey) => string
  /** Inline 3-language text: tx('عربي', 'English', 'اردو') */
  tx: (ar: string, en: string, ur?: string) => string
}

const LangContext = createContext<LangContextValue>({
  lang: 'ar',
  t: (key) => translate(key, 'ar'),
  tx: (ar) => ar,
})

export function LangProvider({
  initialLang,
  children,
}: {
  initialLang: Lang
  children: React.ReactNode
}) {
  const [lang, setLang] = useState<Lang>(initialLang)

  useEffect(() => {
    const handler = () => {
      const htmlLang = document.documentElement.getAttribute('lang') || 'ar'
      const updated = (['ar', 'en', 'ur'].includes(htmlLang) ? htmlLang : 'ar') as Lang
      setLang(updated)
    }
    window.addEventListener(LANGUAGE_CHANGE_EVENT, handler)
    return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, handler)
  }, [])

  const t = useCallback((key: TranslationKey) => translate(key, lang), [lang])
  const tx = useCallback((ar: string, en: string, ur?: string) => {
    if (lang === 'en') return en
    if (lang === 'ur') return ur || ar
    return ar
  }, [lang])

  return <LangContext.Provider value={{ lang, t, tx }}>{children}</LangContext.Provider>
}

export function useLanguage() {
  return useContext(LangContext)
}
