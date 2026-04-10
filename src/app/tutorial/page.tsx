'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'

const slides = [
  {
    image: '/screenshot-1-feed.png',
    titleAr: 'تنبيهات الحي',
    titleEn: 'Neighborhood Feed',
    tipsAr: [
      'تابع آخر أخبار وتنبيهات حيّك',
      'اضغط + لإضافة منشور أو تنبيه جديد',
      'اسحب لأسفل لتحديث المنشورات',
    ],
    tipsEn: [
      'Follow the latest news & alerts in your area',
      'Tap + to add a new post or alert',
      'Pull down to refresh the feed',
    ],
  },
  {
    image: '/screenshot-2-market.png',
    titleAr: 'سوق الحي',
    titleEn: 'Local Market',
    tipsAr: [
      'تصفح المنتجات والخدمات القريبة منك',
      'اضغط على أي منتج لعرض التفاصيل والتواصل',
      'أضف منتجك للبيع بضغطة واحدة',
    ],
    tipsEn: [
      'Browse products & services near you',
      'Tap any item to view details & chat',
      'List your own items with one tap',
    ],
  },
  {
    image: '/screenshot-3-chat.png',
    titleAr: 'المحادثات',
    titleEn: 'Chat',
    tipsAr: [
      'تواصل مع جيرانك بشكل مباشر وآمن',
      'أرسل صور ورسائل نصية',
      'المحادثات خاصة بينك وبين الطرف الآخر',
    ],
    tipsEn: [
      'Chat directly & safely with neighbors',
      'Send photos and text messages',
      'Conversations are private between you two',
    ],
  },
  {
    image: '/screenshot-4-profile.png',
    titleAr: 'ملفك الشخصي',
    titleEn: 'Your Profile',
    tipsAr: [
      'عدّل صورتك واسمك وإعدادات حسابك',
      'تابع نقاط سمعتك ومستواك',
      'غيّر اللغة والوضع (ليلي/نهاري)',
    ],
    tipsEn: [
      'Edit your photo, name & account settings',
      'Track your reputation points & level',
      'Switch language and dark/light mode',
    ],
  },
]

// Preload all images
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
    const diff = Math.abs(e.touches[0].clientX - touchStartX.current)
    if (diff > 10) isDragging.current = true
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
      className="fixed inset-0 bg-white flex flex-col z-[9999]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Skip */}
      <div className="flex justify-end px-6 pt-3">
        <button onClick={finish} className="text-gray-400 text-sm font-medium py-2 px-3">
          {isAr ? 'تخطي' : 'Skip'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center px-6 overflow-hidden">
        {/* Screenshot */}
        <div className="relative w-48 h-[38vh] rounded-2xl overflow-hidden shadow-xl border border-gray-100 mb-5 bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.image}
            alt=""
            className="w-full h-full object-cover object-top"
          />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-4 text-center">
          {isAr ? slide.titleAr : slide.titleEn}
        </h1>

        {/* Tips */}
        <div className="w-full max-w-xs space-y-3">
          {(isAr ? slide.tipsAr : slide.tipsEn).map((tip, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">
                {i + 1}
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">{tip}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom */}
      <div className="px-8 pb-10">
        {/* Dots */}
        <div className="flex justify-center gap-2 mb-6">
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

        {/* Next / Start */}
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
