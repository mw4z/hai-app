'use client'

import { useCallback } from 'react'
import { usePrompt } from '@/components/ConfirmProvider'
import { useLanguage } from '@/hooks/useLanguage'
import { pickContact, formatContactSnippet } from '@/lib/contactPicker'

/**
 * Returns an async function that produces a formatted "contact snippet"
 * string ready to append to a comment or chat message body. Tries the
 * native/web contact picker first; if none is available (e.g. iOS SPM
 * build with no linked plugin) it falls back to two in-app prompts for
 * name + phone. Returns null when the user cancels anywhere.
 */
export function useAttachContact() {
  const prompt = usePrompt()
  const { t, lang } = useLanguage()

  return useCallback(async (): Promise<string | null> => {
    const picked = await pickContact()
    if (picked) {
      const snippet = formatContactSnippet(picked)
      return snippet || null
    }

    const name = await prompt({
      title: t('attach_contact'),
      message:
        lang === 'en'
          ? 'Contact name'
          : lang === 'ur'
            ? 'رابطہ کا نام'
            : 'اسم جهة الاتصال',
      placeholder:
        lang === 'en' ? 'e.g. Ahmed' : lang === 'ur' ? 'مثال: احمد' : 'مثال: أحمد',
    })
    if (!name || !name.trim()) return null

    const phone = await prompt({
      title: t('attach_contact'),
      message:
        lang === 'en'
          ? 'Phone number'
          : lang === 'ur'
            ? 'فون نمبر'
            : 'رقم الهاتف',
      placeholder: '+966 5x xxx xxxx',
    })
    if (!phone || !phone.trim()) return null

    const snippet = formatContactSnippet({
      name: name.trim(),
      phone: phone.trim(),
    })
    return snippet || null
  }, [prompt, t, lang])
}
