'use client'

import { useCallback } from 'react'
import toast from 'react-hot-toast'
import { useConfirm, usePrompt } from '@/components/ConfirmProvider'
import { useLanguage } from '@/hooks/useLanguage'
import {
  pickContact,
  formatContactSnippet,
  ContactsPermissionDeniedError,
  openAndroidAppSettings,
} from '@/lib/contactPicker'

/**
 * Returns an async function that produces a formatted "contact snippet"
 * string ready to append to a comment or chat message body. Tries the
 * native/web contact picker first; if none is available (e.g. iOS SPM
 * build with no linked plugin) it falls back to two in-app prompts for
 * name + phone. Returns null when the user cancels anywhere.
 */
export function useAttachContact() {
  const prompt = usePrompt()
  const confirm = useConfirm()
  const { t, lang } = useLanguage()

  return useCallback(async (): Promise<string | null> => {
    let picked: { name: string; phone: string } | null = null
    try {
      picked = await pickContact()
    } catch (err) {
      if (err instanceof ContactsPermissionDeniedError) {
        // Don't fall through to the manual form — the user wanted the
        // picker. Show a single dialog with the literal Settings path
        // they need to follow. Auto-launching Settings via intent://
        // navigated the WebView itself to an error page on older
        // Android, so we're skipping the button and just telling the
        // user where to go.
        await confirm({
          title:
            lang === 'en'
              ? 'Allow contacts access'
              : lang === 'ur'
                ? 'رابطوں کی اجازت دیں'
                : 'فعّل إذن جهات الاتصال',
          message:
            lang === 'en'
              ? 'To pick a contact, open phone Settings → Apps → حي → Permissions → Contacts → Allow. Then come back and tap Attach again.'
              : lang === 'ur'
                ? 'رابطہ منتخب کرنے کیلئے فون سیٹنگز → ایپس → حي → اجازتیں → رابطے → اجازت دیں۔ پھر واپس آئیں اور اٹیچ پر دوبارہ ٹیپ کریں۔'
                : 'لاختيار جهة اتصال: الإعدادات → التطبيقات → حي → الأذونات → جهات الاتصال → السماح. ثم ارجع للتطبيق واضغط إرفاق مرة أخرى.',
          confirmText: lang === 'en' ? 'OK' : lang === 'ur' ? 'ٹھیک ہے' : 'حسناً',
          cancelText: '',
        })
        return null
      }
      // Any other error: log and fall through to the manual prompt
      // path so attach isn't completely broken.
      console.warn('[useAttachContact] picker error:', err)
    }

    // If native picker returned a contact WITH a phone, we're done.
    if (picked?.phone) {
      return formatContactSnippet(picked) || null
    }

    // Either the picker returned no contact (user cancelled / no picker
    // available), or the contact had no phone number. In both cases,
    // fall through to the manual prompt. If we got a name from the
    // picker, pre-fill it so the user only needs to type the phone.
    const prefillName = picked?.name || ''

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
      defaultValue: prefillName,
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
