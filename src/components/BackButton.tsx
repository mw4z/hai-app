'use client'

import Link from 'next/link'
import { useLanguage } from '@/hooks/useLanguage'
import { FiArrowRight, FiArrowLeft } from 'react-icons/fi'

interface Props {
  href: string
  label?: string  // override label, otherwise uses "رجوع" / "Back"
}

/**
 * Uniform back button — icon + text, RTL-aware.
 * Use this everywhere instead of ad-hoc ← arrows.
 */
export default function BackButton({ href, label }: Props) {
  const { lang } = useLanguage()
  const text = label || (lang === 'en' ? 'Back' : lang === 'ur' ? 'واپس' : 'رجوع')
  const Icon = lang !== 'en' ? FiArrowRight : FiArrowLeft

  return (
    <Link href={href}
      className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors py-1 px-1 -mx-1">
      <Icon className="w-5 h-5" />
      <span className="text-sm font-medium">{text}</span>
    </Link>
  )
}
