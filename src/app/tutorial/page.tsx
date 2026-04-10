'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'
import Image from 'next/image'

const slides = [
  {
    image: '/screenshot-1-feed.png',
    titleAr: 'تنبيهات الحي',
    titleEn: 'Neighborhood Alerts',
    bodyAr: 'اعرف وش يصير في حيّك أول بأول — تنبيهات، أخبار، وتحديثات مباشرة',
    bodyEn: 'Stay updated on what\'s happening around you — alerts, news, and live updates',
  },
  {
    image: '/screenshot-2-market.png',
    titleAr: 'سوق الحي',
    titleEn: 'Local Market',
    bodyAr: 'بيع واشتري من ناس قريبة منك بسهولة وأمان',
    bodyEn: 'Buy and sell from people near you — easy and safe',
  },
  {
    image: '/screenshot-3-chat.png',
    titleAr: 'محادثات',
    titleEn: 'Chat',
    bodyAr: 'تواصل مع جيرانك مباشرة — استفسر، تعاون، وشارك',
    bodyEn: 'Connect with your neighbors directly — ask, collaborate, and share',
  },
  {
    image: '/screenshot-4-profile.png',
    titleAr: 'ملفك الشخصي',
    titleEn: 'Your Profile',
    bodyAr: 'كل شي حولك في مكان واحد — خدمات، مساعدة، وجيران تقدر تعتمد عليهم',
    bodyEn: 'Everything about you in one place — reputation, settings, and more',
  },
]

export default function TutorialPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const isAr = lang !== 'en'
  const [current, setCurrent] = useState(0)
  const touchStartX = useRef(0)
  const isDragging = useRef(false)

  function next() {
    if (current < slides.length - 1) {
      setCurrent(current + 1)
    } else {
      finish()
    }
  }

  function finish() {
    try { sessionStorage.removeItem('hai_show_tour') } catch {}
    router.replace('/feed')
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    isDragging.current = false
  }

  function handleTouchMove(e: React.TouchEvent) {
    const diff = Math.abs(e.touches[0].clientX - touchStartX.current)
    if (diff > 10) isDragging.current = true
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!isDragging.current) return // Let click/tap events pass through
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) < 50) return
    if (isAr ? diff < 0 : diff > 0) {
      if (current < slides.length - 1) setCurrent(current + 1)
    } else {
      if (current > 0) setCurrent(current - 1)
    }
  }

  const slide = slides[current]

  return (
    <div
      className="fixed inset-0 bg-white flex flex-col z-[9999]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Skip button */}
      <div className="flex justify-end px-6 pt-4">
        <button
          onClick={finish}
          className="text-gray-400 text-sm font-medium py-2 px-3"
        >
          {isAr ? 'تخطي' : 'Skip'}
        </button>
      </div>

      {/* Screenshot */}
      <div className="flex-1 flex flex-col items-center px-6 overflow-hidden">
        <div className="relative w-56 h-[45vh] rounded-3xl overflow-hidden shadow-2xl shadow-gray-300 border border-gray-100 mb-6">
          <Image
            src={slide.image}
            alt=""
            fill
            className="object-cover object-top"
            priority
          />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-3 text-center">
          {isAr ? slide.titleAr : slide.titleEn}
        </h1>

        {/* Body */}
        <p className="text-gray-500 text-center text-base leading-relaxed max-w-xs">
          {isAr ? slide.bodyAr : slide.bodyEn}
        </p>
      </div>

      {/* Bottom section */}
      <div className="px-8 pb-10">
        {/* Dots */}
        <div className="flex justify-center gap-2 mb-6">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === current
                  ? 'w-8 bg-primary-500'
                  : 'w-2 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Next / Start button */}
        <button
          onClick={next}
          className="w-full py-4 rounded-2xl bg-primary-500 text-white font-bold text-lg shadow-lg shadow-primary-500/30 active:scale-[0.98] transition-transform"
        >
          {current === slides.length - 1
            ? (isAr ? 'يلا نبدأ!' : "Let's go!")
            : (isAr ? 'التالي' : 'Next')
          }
        </button>
      </div>
    </div>
  )
}
