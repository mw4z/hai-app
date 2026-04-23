'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'

// ─── Tour Step Definition ───────────────────────────────────────────────────

interface TourStep {
  id: string
  targetSelector: string
  titleAr: string
  titleEn: string
  titleUr: string
  bodyAr: string
  bodyEn: string
  bodyUr: string
  position?: 'top' | 'bottom' | 'auto'
  onEnter?: () => void
}

// ─── Tour Flow Definition ───────────────────────────────────────────────────

export type TourFlowId = 'global' | 'ride_create' | 'ride_detail' | 'post_create' | 'chat' | 'profile'

interface TourFlow {
  id: TourFlowId
  storageKey: string        // localStorage key to track completion
  steps: TourStep[]
  autoStartDelay?: number   // ms delay before auto-start (0 = manual only)
}

// ─── Tour Flows ─────────────────────────────────────────────────────────────

const TOUR_FLOWS: Record<TourFlowId, TourFlow> = {

  // ── Global Tour (5 steps) ────────────────────────────────────────────────
  global: {
    id: 'global',
    storageKey: 'hai_tour_seen',
    autoStartDelay: 1500,
    steps: [
      {
        id: 'welcome',
        targetSelector: '[data-tour="feed-title"]',
        titleAr: 'مرحباً بك في حي! 👋',
        titleEn: 'Welcome to Hai! 👋',
        titleUr: 'حی میں خوش آمدید! 👋',
        bodyAr: 'هنا تشوف منشورات جيرانك — تنبيهات، خدمات، سوق، ومشاوير',
        bodyEn: 'See your neighbors\' posts — alerts, services, marketplace & rides',
        bodyUr: 'پڑوسیوں کی پوسٹیں دیکھیں — الرٹس، خدمات، بازار اور سواریاں',
        position: 'bottom',
      },
      {
        id: 'categories',
        targetSelector: '[data-tour="categories"]',
        titleAr: 'تصفية المنشورات 🏷️',
        titleEn: 'Filter Posts 🏷️',
        titleUr: 'پوسٹیں فلٹر کریں 🏷️',
        bodyAr: 'اختر القسم — تنبيهات، أبحث عن، سوق، خدمات والمزيد',
        bodyEn: 'Pick a category — alerts, looking for, market, services & more',
        bodyUr: 'زمرہ منتخب کریں — الرٹس، تلاش، بازار، خدمات اور مزید',
        position: 'bottom',
      },
      {
        id: 'new-post',
        targetSelector: '[data-tour="new-post"]',
        titleAr: 'أنشئ منشور ✏️',
        titleEn: 'Create a Post ✏️',
        titleUr: 'پوسٹ بنائیں ✏️',
        bodyAr: 'انشر تنبيه، اطلب خدمة، بيع شيء، أو اطلب مشوار',
        bodyEn: 'Post an alert, request a service, sell something, or request a ride',
        bodyUr: 'الرٹ، خدمت، فروخت، یا سواری کی درخواست پوسٹ کریں',
        position: 'top',
      },
      {
        id: 'interact',
        targetSelector: '[data-tour="first-post"]',
        titleAr: 'تفاعل مع المنشورات 😊',
        titleEn: 'Interact with Posts 😊',
        titleUr: 'پوسٹوں سے بات چیت 😊',
        bodyAr: 'تفاعل بإيموجي، علّق، احفظ المنشور، أو شاركه — واكسب نقاط سمعة',
        bodyEn: 'React with emoji, comment, bookmark, or share — earn reputation points',
        bodyUr: 'ایموجی، تبصرہ، بک مارک، یا شیئر — ساکھ پوائنٹس کمائیں',
        position: 'top',
      },
      {
        id: 'browse',
        targetSelector: '[data-tour="feed-title"]',
        titleAr: 'تصفح أحياء أخرى 🗺️',
        titleEn: 'Browse Other Areas 🗺️',
        titleUr: 'دوسرے محلے دیکھیں 🗺️',
        bodyAr: 'اضغط اسم حيّك بالأعلى لتصفح أحياء ثانية',
        bodyEn: 'Tap your neighborhood name to browse other areas',
        bodyUr: 'محلے کے نام پر ٹیپ کریں دوسرے علاقے دیکھنے کے لیے',
        position: 'bottom',
      },
    ],
  },

  // ── Ride Creation Tour ──────────────────────────────────────────────────
  ride_create: {
    id: 'ride_create',
    storageKey: 'hai_tour_ride_create',
    autoStartDelay: 800,
    steps: [
      {
        id: 'pickup',
        targetSelector: '[data-tour="ride-pickup"]',
        titleAr: 'نقطة الانطلاق 📍',
        titleEn: 'Pickup Location 📍',
        titleUr: 'اٹھانے کی جگہ 📍',
        bodyAr: 'يتم تحديد موقعك تلقائياً — أو اضغط الخريطة لاختيار يدوي',
        bodyEn: 'Your location is auto-detected — or tap the map to pick manually',
        bodyUr: 'آپ کا مقام خودکار معلوم ہوتا ہے — یا نقشے سے دستی منتخب کریں',
        position: 'bottom',
      },
      {
        id: 'dropoff',
        targetSelector: '[data-tour="ride-dropoff"]',
        titleAr: 'الوجهة 🏁',
        titleEn: 'Destination 🏁',
        titleUr: 'منزل 🏁',
        bodyAr: 'ابحث عن المكان أو اختره من الخريطة',
        bodyEn: 'Search for a place or pick from the map',
        bodyUr: 'جگہ تلاش کریں یا نقشے سے منتخب کریں',
        position: 'bottom',
      },
      {
        id: 'submit',
        targetSelector: '[data-tour="ride-submit"]',
        titleAr: 'بعد النشر ⏳',
        titleEn: 'After Posting ⏳',
        titleUr: 'پوسٹ کرنے کے بعد ⏳',
        bodyAr: 'ينتظر طلبك عروض من أشخاص بالحي — تقدر تختار الأنسب',
        bodyEn: 'Your request waits for offers from neighbors — you pick the best one',
        bodyUr: 'آپ کی درخواست پڑوسیوں سے پیشکشوں کا انتظار کرتی ہے — بہترین چنیں',
        position: 'top',
      },
    ],
  },

  // ── Ride Detail Tour ────────────────────────────────────────────────────
  ride_detail: {
    id: 'ride_detail',
    storageKey: 'hai_tour_ride_detail',
    autoStartDelay: 1000,
    steps: [
      {
        id: 'offers-area',
        targetSelector: '[data-tour="ride-offers"]',
        titleAr: 'العروض المتاحة 🤝',
        titleEn: 'Available Offers 🤝',
        titleUr: 'دستیاب پیشکشیں 🤝',
        bodyAr: 'هنا تشوف عروض الأشخاص — الوقت المتوقع والرسالة',
        bodyEn: 'See offers from others — arrival time and their message',
        bodyUr: 'دوسروں کی پیشکشیں دیکھیں — آمد کا وقت اور پیغام',
        position: 'bottom',
      },
      {
        id: 'select-offer',
        targetSelector: '[data-tour="ride-select"]',
        titleAr: 'اختر الشخص ✅',
        titleEn: 'Choose Someone ✅',
        titleUr: 'کسی کو منتخب کریں ✅',
        bodyAr: 'اضغط "اختيار" لتأكيد — يبدأ التنسيق مباشرة',
        bodyEn: 'Tap "Select" to confirm — coordination starts immediately',
        bodyUr: '"منتخب کریں" دبائیں — فوری رابطہ شروع ہوگا',
        position: 'bottom',
      },
      {
        id: 'ride-status',
        targetSelector: '[data-tour="ride-status"]',
        titleAr: 'تابع الحالة 🚗',
        titleEn: 'Track Status 🚗',
        titleUr: 'حالت دیکھیں 🚗',
        bodyAr: 'الحالة تتحدث تلقائياً — في الطريق، وصل، المشوار جاري',
        bodyEn: 'Status updates live — on the way, arrived, in progress',
        bodyUr: 'حالت خودکار اپ ڈیٹ ہوتی ہے — راستے میں، پہنچ گیا، جاری',
        position: 'top',
      },
    ],
  },

  // ── Post Creation Tour ──────────────────────────────────────────────────
  post_create: {
    id: 'post_create',
    storageKey: 'hai_tour_post_create',
    autoStartDelay: 800,
    steps: [
      {
        id: 'category',
        targetSelector: '[data-tour="post-categories"]',
        titleAr: 'اختر القسم أولاً 📂',
        titleEn: 'Pick a Category First 📂',
        titleUr: 'پہلے زمرہ منتخب کریں 📂',
        bodyAr: 'كل قسم له شكل مختلف — تنبيه، بيع، خدمة، مشوار...',
        bodyEn: 'Each category has its own format — alert, sell, service, ride...',
        bodyUr: 'ہر زمرے کی شکل مختلف ہے — الرٹ، فروخت، خدمت، سواری...',
        position: 'bottom',
      },
      {
        id: 'content',
        targetSelector: '[data-tour="post-content"]',
        titleAr: 'اكتب تفاصيل واضحة ✍️',
        titleEn: 'Write Clear Details ✍️',
        titleUr: 'واضح تفصیلات لکھیں ✍️',
        bodyAr: 'عنوان قصير + وصف واضح = تفاعل أكثر من الجيران',
        bodyEn: 'Short title + clear description = more engagement from neighbors',
        bodyUr: 'مختصر عنوان + واضح تفصیل = پڑوسیوں سے زیادہ ردعمل',
        position: 'bottom',
      },
      {
        id: 'images',
        targetSelector: '[data-tour="post-images"]',
        titleAr: 'أضف صور 📸',
        titleEn: 'Add Photos 📸',
        titleUr: 'تصاویر شامل کریں 📸',
        bodyAr: 'الصور تزيد التفاعل — أضف حتى 5 صور',
        bodyEn: 'Photos boost engagement — add up to 5 images',
        bodyUr: 'تصاویر ردعمل بڑھاتی ہیں — 5 تک تصاویر شامل کریں',
        position: 'top',
      },
    ],
  },

  // ── Chat Tour ───────────────────────────────────────────────────────────
  chat: {
    id: 'chat',
    storageKey: 'hai_tour_chat',
    autoStartDelay: 800,
    steps: [
      {
        id: 'messages',
        targetSelector: '[data-tour="chat-messages"]',
        titleAr: 'المحادثة 💬',
        titleEn: 'The Conversation 💬',
        titleUr: 'بات چیت 💬',
        bodyAr: 'تواصل مع جارك — نقرتين سريعتين للتفاعل ❤️ أو اضغط مطولاً لمزيد الخيارات',
        bodyEn: 'Chat with your neighbor — double-tap to react ❤️ or long-press for more options',
        bodyUr: 'پڑوسی سے بات کریں — ڈبل ٹیپ ❤️ یا لمبا دبائیں مزید آپشنز',
        position: 'bottom',
      },
      {
        id: 'location',
        targetSelector: '[data-tour="chat-location"]',
        titleAr: 'موقع وصور 📍📸',
        titleEn: 'Location & Photos 📍📸',
        titleUr: 'مقام اور تصاویر 📍📸',
        bodyAr: 'أرسل موقعك أو صورة — ✓ تم الإرسال ✓✓ تم التوصيل ✓✓ أزرق = مقروءة',
        bodyEn: 'Send location or photo — ✓ sent ✓✓ delivered ✓✓ blue = read',
        bodyUr: 'مقام یا تصویر بھیجیں — ✓ بھیجا ✓✓ پہنچا ✓✓ نیلا = پڑھا',
        position: 'top',
      },
      {
        id: 'close-thread',
        targetSelector: '[data-tour="chat-close"]',
        titleAr: 'إنهاء وتقييم ⭐',
        titleEn: 'Close & Rate ⭐',
        titleUr: 'ختم اور درجہ بندی ⭐',
        bodyAr: 'بعد الانتهاء أغلق المحادثة وقيّم — التقييم يؤثر على السمعة',
        bodyEn: 'When done, close the chat and rate — ratings affect reputation',
        bodyUr: 'مکمل ہونے پر بات بند کریں اور درجہ بندی دیں — ساکھ پر اثر پڑتا ہے',
        position: 'top',
      },
    ],
  },

  // ── Profile Tour ─────────────────────────────────────────────────────────
  profile: {
    id: 'profile',
    storageKey: 'hai_tour_profile',
    autoStartDelay: 1000,
    steps: [
      {
        id: 'profile-tab',
        targetSelector: '[data-tour="profile-tab"]',
        titleAr: 'ملفك الشخصي 👤',
        titleEn: 'Your Profile 👤',
        titleUr: 'آپ کا پروفائل 👤',
        bodyAr: 'غيّر صورتك وغلافك، عدّل بياناتك، واطلع على سمعتك',
        bodyEn: 'Change your avatar & cover, edit info, and check your reputation',
        bodyUr: 'اپنا اوتار اور کور تبدیل کریں، معلومات ایڈٹ کریں، ساکھ دیکھیں',
        position: 'top',
      },
      {
        id: 'bookmarks',
        targetSelector: '[data-tour="profile-bookmarks"]',
        titleAr: 'المحفوظات 🔖',
        titleEn: 'Saved Posts 🔖',
        titleUr: 'محفوظ شدہ پوسٹیں 🔖',
        bodyAr: 'المنشورات المحفوظة تبقى حتى لو انتهت من الفيد — ابحث وصنّف',
        bodyEn: 'Bookmarked posts stay even after they expire — search and sort them',
        bodyUr: 'محفوظ پوسٹیں فیڈ سے ختم ہونے کے بعد بھی رہتی ہیں — تلاش اور ترتیب',
        position: 'bottom',
      },
      {
        id: 'privacy',
        targetSelector: '[data-tour="profile-privacy"]',
        titleAr: 'الخصوصية 🔒',
        titleEn: 'Privacy 🔒',
        titleUr: 'رازداری 🔒',
        bodyAr: 'تحكم بإظهار حالتك (متصل/آخر ظهور) وإيصالات القراءة',
        bodyEn: 'Control your online status and read receipts',
        bodyUr: 'اپنی آن لائن حالت اور پڑھنے کی رسیدیں کنٹرول کریں',
        position: 'bottom',
      },
      {
        id: 'invite',
        targetSelector: '[data-tour="profile-invite"]',
        titleAr: 'ادعُ جيرانك 📲',
        titleEn: 'Invite Neighbors 📲',
        titleUr: 'پڑوسیوں کو مدعو کریں 📲',
        bodyAr: 'شارك رابط التطبيق مع أهل حيّك — كل ما زاد العدد، زادت الفائدة',
        bodyEn: 'Share the app with your neighbors — more people = more useful',
        bodyUr: 'ایپ اپنے پڑوسیوں سے شیئر کریں — زیادہ لوگ = زیادہ فائدہ',
        position: 'bottom',
      },
    ],
  },
}

// ─── Tour Context ───────────────────────────────────────────────────────────

interface TourContextValue {
  isActive: boolean
  activeFlowId: TourFlowId | null
  currentStep: number
  startTour: (flowId?: TourFlowId) => void
  startContextTour: (flowId: TourFlowId) => void
  endTour: () => void
  nextStep: () => void
  prevStep: () => void
  resetAllTours: () => void
  hasSeenTour: (flowId: TourFlowId) => boolean
}

const TourContext = createContext<TourContextValue>({
  isActive: false, activeFlowId: null, currentStep: 0,
  startTour: () => {}, startContextTour: () => {}, endTour: () => {},
  nextStep: () => {}, prevStep: () => {}, resetAllTours: () => {},
  hasSeenTour: () => false,
})

export function useTour() { return useContext(TourContext) }

// ─── Tour Provider ──────────────────────────────────────────────────────────

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [activeFlowId, setActiveFlowId] = useState<TourFlowId | null>(null)
  const [currentStep, setCurrentStep] = useState(0)

  // Auto-start global tour only for new users (flag set during registration)
  useEffect(() => {
    try {
      const isNewUser = sessionStorage.getItem('hai_show_tour')
      if (!isNewUser) return
      sessionStorage.removeItem('hai_show_tour')
      // Wait for feed elements to render (cloud DB can be slow)
      const waitAndStart = (attempt: number) => {
        const el = document.querySelector('[data-tour="feed-title"]')
        if (el) {
          setTimeout(() => {
            setActiveFlowId('global')
            setCurrentStep(0)
            setIsActive(true)
          }, 500)
        } else if (attempt < 20) {
          setTimeout(() => waitAndStart(attempt + 1), 500)
        }
      }
      setTimeout(() => waitAndStart(0), 1000)
    } catch {
      // localStorage not available (private browsing, etc.) — skip tour
    }
  }, [])

  const hasSeenTour = useCallback((flowId: TourFlowId) => {
    try {
      const flow = TOUR_FLOWS[flowId]
      const lsSeen = !!localStorage.getItem(flow.storageKey)
      const cookieSeen = document.cookie.includes(flow.storageKey + '=1')
      if (!lsSeen && cookieSeen) {
        localStorage.setItem(flow.storageKey, 'true')
      }
      return lsSeen || cookieSeen
    } catch {
      return true // Assume seen if localStorage fails
    }
  }, [])

  const startTour = useCallback((flowId: TourFlowId = 'global') => {
    setActiveFlowId(flowId)
    setCurrentStep(0)
    setIsActive(true)
  }, [])

  // Start a contextual tour only if not seen before and no other tour is active
  const isActiveRef = useRef(false)
  isActiveRef.current = isActive

  const startContextTour = useCallback((flowId: TourFlowId) => {
    try {
      const flow = TOUR_FLOWS[flowId]
      if (!flow) return
      const lsSeen = localStorage.getItem(flow.storageKey)
      const cookieSeen = document.cookie.includes(flow.storageKey + '=1')
      if (!lsSeen && cookieSeen) {
        localStorage.setItem(flow.storageKey, 'true')
      }
      if (lsSeen || cookieSeen) return

      // Wait for target element to exist before starting
      const waitAndStart = (attempt: number) => {
        // Don't interrupt an active tour (use ref for fresh value)
        if (isActiveRef.current) return
        const firstTarget = flow.steps[0]?.targetSelector
        const el = firstTarget ? document.querySelector(firstTarget) : null
        if (el) {
          setTimeout(() => {
            if (isActiveRef.current) return
            // Mark as seen immediately so it won't repeat if user navigates away
            try {
              localStorage.setItem(flow.storageKey, 'true')
              document.cookie = `${flow.storageKey}=1; path=/; max-age=315360000; SameSite=Lax`
            } catch {}
            setActiveFlowId(flowId)
            setCurrentStep(0)
            setIsActive(true)
          }, 300)
        } else if (attempt < 15) {
          setTimeout(() => waitAndStart(attempt + 1), 500)
        }
      }
      setTimeout(() => waitAndStart(0), flow.autoStartDelay || 800)
    } catch {
      // localStorage not available — skip
    }
  }, []) // No isActive dependency — uses ref instead

  const endTour = useCallback(() => {
    if (activeFlowId) {
      try {
        const flow = TOUR_FLOWS[activeFlowId]
        localStorage.setItem(flow.storageKey, 'true')
        document.cookie = `${flow.storageKey}=1; path=/; max-age=315360000; SameSite=Lax`
      } catch { /* localStorage unavailable */ }
    }
    setIsActive(false)
    setActiveFlowId(null)
    setCurrentStep(0)
  }, [activeFlowId])

  const nextStep = useCallback(() => {
    hapticLight()
    if (!activeFlowId) return
    const flow = TOUR_FLOWS[activeFlowId]
    setCurrentStep(prev => {
      if (prev >= flow.steps.length - 1) {
        // Use setTimeout to avoid state update during render
        setTimeout(() => endTour(), 0)
        return prev
      }
      return prev + 1
    })
  }, [activeFlowId, endTour])

  const prevStep = useCallback(() => {
    hapticLight()
    setCurrentStep(prev => Math.max(0, prev - 1))
  }, [])

  const resetAllTours = useCallback(() => {
    try {
      Object.values(TOUR_FLOWS).forEach(flow => {
        localStorage.removeItem(flow.storageKey)
      })
    } catch { /* localStorage unavailable */ }
  }, [])

  const activeFlow = activeFlowId ? TOUR_FLOWS[activeFlowId] : null
  const activeStep = activeFlow ? activeFlow.steps[currentStep] : null

  return (
    <TourContext.Provider value={{
      isActive, activeFlowId, currentStep,
      startTour, startContextTour, endTour, nextStep, prevStep,
      resetAllTours, hasSeenTour,
    }}>
      {children}
      {isActive && activeFlow && activeStep && (
        <TourOverlay
          step={activeStep}
          stepIndex={currentStep}
          totalSteps={activeFlow.steps.length}
        />
      )}
    </TourContext.Provider>
  )
}

// ─── useContextTour Hook ────────────────────────────────────────────────────
// Drop-in hook for pages to trigger their contextual tour on mount

export function useContextTour(flowId: TourFlowId) {
  const { startContextTour } = useTour()
  useEffect(() => {
    startContextTour(flowId)
  }, [flowId, startContextTour])
}

// ─── Tour Overlay ───────────────────────────────────────────────────────────

function TourOverlay({ step, stepIndex, totalSteps }: { step: TourStep; stepIndex: number; totalSteps: number }) {
  const { lang } = useLanguage()
  const { nextStep, prevStep, endTour } = useTour()
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [tooltipPos, setTooltipPos] = useState<'top' | 'bottom'>('bottom')
  const overlayRef = useRef<HTMLDivElement>(null)
  const skipCount = useRef(0)
  const retryCount = useRef(0)

  const title = lang === 'en' ? step.titleEn : lang === 'ur' ? step.titleUr : step.titleAr
  const body = lang === 'en' ? step.bodyEn : lang === 'ur' ? step.bodyUr : step.bodyAr

  useEffect(() => {
    retryCount.current = 0

    function findElement() {
    try {
      const el = document.querySelector(step.targetSelector) as HTMLElement
      if (!el) {
        // Retry up to 15 times (7.5s total) waiting for element to render
        if (retryCount.current < 15) {
          retryCount.current++
          setTimeout(findElement, 500)
          return
        }
        // Element truly not found — skip to next
        skipCount.current++
        if (skipCount.current >= totalSteps) {
          endTour()
          return
        }
        nextStep()
        return
      }
      skipCount.current = 0 // Reset on successful find

      // Scroll to element
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Wait for scroll to complete
      setTimeout(() => {
        const rect = el.getBoundingClientRect()
        setTargetRect(rect)

        // Determine tooltip position
        if (step.position === 'top') setTooltipPos('top')
        else if (step.position === 'bottom') setTooltipPos('bottom')
        else {
          setTooltipPos(rect.top < window.innerHeight / 2 ? 'bottom' : 'top')
        }

        step.onEnter?.()
      }, 400)
    } catch {
      // Tour element interaction failed — end tour silently
      endTour()
    }
    } // end findElement

    findElement()
  }, [step])

  if (!targetRect) return null

  const padding = 8
  const highlightStyle = {
    top: targetRect.top - padding,
    left: targetRect.left - padding,
    width: targetRect.width + padding * 2,
    height: targetRect.height + padding * 2,
  }

  const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-top)') || '0', 10) || 47
  const tooltipWidth = Math.min(300, window.innerWidth - 32)
  const tooltipHeight = 180

  let finalPos = tooltipPos
  if (finalPos === 'top' && targetRect.top - padding - 12 - tooltipHeight < safeTop + 10) {
    finalPos = 'bottom'
  }
  if (finalPos === 'bottom' && targetRect.bottom + padding + 12 + tooltipHeight > window.innerHeight - 10) {
    finalPos = 'top'
  }

  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(16, Math.min(window.innerWidth / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16)),
    width: tooltipWidth,
    zIndex: 10002,
  }

  if (finalPos === 'bottom') {
    tooltipStyle.top = Math.min(targetRect.bottom + padding + 12, window.innerHeight - tooltipHeight - 16)
  } else {
    tooltipStyle.top = Math.max(safeTop + 10, targetRect.top - padding - 12 - tooltipHeight)
  }

  const isLast = stepIndex === totalSteps - 1
  const isFirst = stepIndex === 0

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[10000]" onClick={endTour}>
      {/* Dark overlay with hole */}
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 10000 }}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={highlightStyle.left}
              y={highlightStyle.top}
              width={highlightStyle.width}
              height={highlightStyle.height}
              rx="12"
              fill="black"
            />
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.7)" mask="url(#tour-mask)" />
      </svg>

      {/* Highlight border glow */}
      <div
        className="fixed rounded-xl border-2 border-primary-400 animate-pulse pointer-events-none"
        style={{ ...highlightStyle, zIndex: 10001, boxShadow: '0 0 0 4px rgba(0,168,132,0.3), 0 0 20px rgba(0,168,132,0.2)' }}
      />

      {/* Tooltip */}
      <div
        style={tooltipStyle}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-4 animate-fade-in-up"
      >
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mb-3">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-all ${i === stepIndex ? 'bg-primary-600 w-4' : i < stepIndex ? 'bg-primary-300' : 'bg-gray-200 dark:bg-gray-600'}`} />
          ))}
        </div>

        <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-1">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4">{body}</p>

        <div className="flex items-center gap-2">
          {!isFirst && (
            <button onClick={prevStep}
              className="px-3 py-2 text-xs text-gray-500 font-medium">
              {lang === 'en' ? 'Back' : lang === 'ur' ? 'واپس' : 'رجوع'}
            </button>
          )}
          <button onClick={endTour}
            className="px-3 py-2 text-xs text-gray-400 font-medium mr-auto">
            {lang === 'en' ? 'Skip' : lang === 'ur' ? 'چھوڑیں' : 'تخطي'}
          </button>
          <button onClick={nextStep}
            className="bg-primary-600 text-white px-5 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform shadow-sm">
            {isLast
              ? (lang === 'en' ? 'Got it!' : lang === 'ur' ? 'سمجھ آ گئی!' : 'فهمت!')
              : (lang === 'en' ? 'Next' : lang === 'ur' ? 'اگلا' : 'التالي')}
          </button>
        </div>
      </div>
    </div>
  )
}
