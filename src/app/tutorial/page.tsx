'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'

const slides = [
  {
    image: '/screenshot-1-feed.png',
    titleAr: 'تنبيهات الحي',
    titleEn: 'Neighborhood Feed',
    descAr: 'تابع آخر الأخبار والتنبيهات • اضغط + للنشر • اسحب لأسفل للتحديث',
    descEn: 'Follow latest news & alerts • Tap + to post • Pull down to refresh',
  },
  {
    image: '/screenshot-2-market.png',
    titleAr: 'سوق الحي',
    titleEn: 'Local Market',
    descAr: 'تصفح المنتجات القريبة • اضغط للتفاصيل والتواصل • أضف منتجك للبيع',
    descEn: 'Browse nearby products • Tap for details & chat • List your items to sell',
  },
  {
    image: '/screenshot-3-chat.png',
    titleAr: 'المحادثات',
    titleEn: 'Chat',
    descAr: 'تواصل مع جيرانك مباشرة • أرسل صور ورسائل • محادثات خاصة وآمنة',
    descEn: 'Chat directly with neighbors • Send photos & text • Private & secure',
  },
  {
    image: '/screenshot-4-profile.png',
    titleAr: 'ملفك الشخصي',
    titleEn: 'Your Profile',
    descAr: 'عدّل صورتك وإعداداتك • تابع نقاط سمعتك • غيّر اللغة والوضع الليلي',
    descEn: 'Edit your photo & settings • Track reputation • Switch language & theme',
  },
]

function usePreloadImages() {
  useEffect(() => {
    slides.forEach(s => {
      const img = new Image()
      img.src = s.image
    })
  }, [])
}

export default function TutorialPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const isAr = lang !== 'en'
  const [current, setCurrent] = useState(0)
  const touchStartX = useRef(0)
  const isDragging = useRef(false)

  usePreloadImages()

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
    if (Math.abs(e.touches[0].clientX - touchStartX.current) > 10) isDragging.current = true
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!isDragging.current) return
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
      className="fixed inset-0 bg-gray-50 flex flex-col z-[9999]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Skip */}
      <div className="flex justify-end px-4 pt-2">
        <button onClick={finish} className="text-gray-400 text-xs font-medium py-2 px-3">
          {isAr ? 'تخطي' : 'Skip'}
        </button>
      </div>

      {/* Screenshot — takes most of the screen */}
      <div className="flex-1 flex items-center justify-center px-8 pb-2">
        <div className="relative w-full max-w-[260px] h-full max-h-[55vh] rounded-3xl overflow-hidden shadow-2xl shadow-black/15">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.image}
            alt=""
            className="w-full h-full object-cover object-top"
          />
        </div>
      </div>

      {/* Text + controls — compact at bottom */}
      <div className="bg-white rounded-t-3xl px-6 pt-5 pb-8 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {/* Title */}
        <h1 className="text-xl font-bold text-gray-900 mb-2 text-center">
          {isAr ? slide.titleAr : slide.titleEn}
        </h1>

        {/* Description */}
        <p className="text-gray-500 text-center text-sm leading-relaxed mb-5">
          {isAr ? slide.descAr : slide.descEn}
        </p>

        {/* Dots */}
        <div className="flex justify-center gap-2 mb-5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === current ? 'w-8 bg-primary-500' : 'w-2 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Button */}
        <button
          onClick={next}
          className="w-full py-3.5 rounded-2xl bg-primary-500 text-white font-bold text-base shadow-lg shadow-primary-500/30 active:scale-[0.98] transition-transform"
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
