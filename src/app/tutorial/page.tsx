'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'
import { FiBell, FiShoppingBag, FiMessageCircle, FiMapPin } from 'react-icons/fi'

const slides = [
  {
    icon: FiBell,
    color: 'from-amber-400 to-orange-500',
    bg: 'bg-amber-50',
    titleAr: 'تنبيهات الحي',
    titleEn: 'Neighborhood Alerts',
    bodyAr: 'اعرف وش يصير في حيّك أول بأول — تنبيهات، أخبار، وتحديثات مباشرة',
    bodyEn: 'Stay updated on what\'s happening around you — alerts, news, and live updates',
  },
  {
    icon: FiShoppingBag,
    color: 'from-emerald-400 to-green-600',
    bg: 'bg-emerald-50',
    titleAr: 'سوق الحي',
    titleEn: 'Local Market',
    bodyAr: 'بيع واشتري من ناس قريبة منك بسهولة وأمان',
    bodyEn: 'Buy and sell from people near you — easy and safe',
  },
  {
    icon: FiMessageCircle,
    color: 'from-blue-400 to-indigo-600',
    bg: 'bg-blue-50',
    titleAr: 'محادثات',
    titleEn: 'Chat',
    bodyAr: 'تواصل مع جيرانك مباشرة — استفسر، تعاون، وشارك',
    bodyEn: 'Connect with your neighbors directly — ask, collaborate, and share',
  },
  {
    icon: FiMapPin,
    color: 'from-purple-400 to-pink-600',
    bg: 'bg-purple-50',
    titleAr: 'حيّك',
    titleEn: 'Your Neighborhood',
    bodyAr: 'كل شي حولك في مكان واحد — خدمات، مساعدة، وجيران تقدر تعتمد عليهم',
    bodyEn: 'Everything around you in one place — services, help, and neighbors you can count on',
  },
]

export default function TutorialPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const isAr = lang !== 'en'
  const [current, setCurrent] = useState(0)
  const touchStart = useRef(0)
  const touchEnd = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Redirect if not a new user
  useEffect(() => {
    try {
      if (!sessionStorage.getItem('hai_show_tour')) {
        router.replace('/feed')
      }
    } catch {
      router.replace('/feed')
    }
  }, [router])

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
    touchStart.current = e.touches[0].clientX
  }

  function handleTouchMove(e: React.TouchEvent) {
    touchEnd.current = e.touches[0].clientX
  }

  function handleTouchEnd() {
    const diff = touchStart.current - touchEnd.current
    if (Math.abs(diff) < 50) return
    if (isAr ? diff < 0 : diff > 0) {
      // Swipe forward
      if (current < slides.length - 1) setCurrent(current + 1)
    } else {
      // Swipe back
      if (current > 0) setCurrent(current - 1)
    }
  }

  const slide = slides[current]
  const Icon = slide.icon

  return (
    <div
      ref={containerRef}
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
          className="text-gray-400 text-sm font-medium"
        >
          {isAr ? 'تخطي' : 'Skip'}
        </button>
      </div>

      {/* Slide content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {/* Icon */}
        <div className={`w-32 h-32 rounded-full ${slide.bg} flex items-center justify-center mb-8 transition-all duration-500`}>
          <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${slide.color} flex items-center justify-center shadow-lg`}>
            <Icon className="w-10 h-10 text-white" strokeWidth={1.5} />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-4 text-center transition-all duration-500">
          {isAr ? slide.titleAr : slide.titleEn}
        </h1>

        {/* Body */}
        <p className="text-gray-500 text-center text-lg leading-relaxed max-w-xs transition-all duration-500">
          {isAr ? slide.bodyAr : slide.bodyEn}
        </p>
      </div>

      {/* Bottom section */}
      <div className="px-8 pb-12">
        {/* Dots */}
        <div className="flex justify-center gap-2 mb-8">
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
