'use client'

import { useLanguage } from '@/hooks/useLanguage'

interface TimelineStep {
  key: string
  labelAr: string
  labelEn: string
  timestamp: string | null
  active: boolean
  completed: boolean
}

function buildSteps(status: string, trip: any, selectedAt: string | null, createdAt: string): TimelineStep[] {
  const steps: TimelineStep[] = [
    { key: 'created',   labelAr: 'تم الطلب',     labelEn: 'Requested',  timestamp: createdAt,          active: false, completed: true },
    { key: 'selected',  labelAr: 'تم الاختيار',   labelEn: 'Selected',   timestamp: selectedAt,         active: false, completed: !!selectedAt },
    { key: 'confirmed', labelAr: 'تم التأكيد',  labelEn: 'Confirmed',  timestamp: trip?.confirmedAt,   active: false, completed: !!trip?.confirmedAt },
    { key: 'en_route',  labelAr: 'في الطريق',     labelEn: 'En Route',   timestamp: trip?.enRouteAt,     active: false, completed: !!trip?.enRouteAt },
    { key: 'arrived',   labelAr: 'وصل',           labelEn: 'Arrived',    timestamp: trip?.arrivedAt,     active: false, completed: !!trip?.arrivedAt },
    { key: 'started',   labelAr: 'بدأت',          labelEn: 'Started',    timestamp: trip?.startedAt,     active: false, completed: !!trip?.startedAt },
    { key: 'completed', labelAr: 'اكتملت',        labelEn: 'Completed',  timestamp: trip?.completedAt,   active: false, completed: !!trip?.completedAt },
  ]

  // Find current active step
  const STATUS_TO_STEP: Record<string, string> = {
    RIDE_OPEN: 'created',
    RIDE_SELECTED: 'selected',
    RIDE_CONFIRMED: 'confirmed',
    RIDE_EN_ROUTE: 'en_route',
    RIDE_ARRIVED: 'arrived',
    RIDE_IN_PROGRESS: 'started',
    RIDE_PENDING_COMPLETION: 'started',
    RIDE_COMPLETED: 'completed',
  }

  const activeKey = STATUS_TO_STEP[status]
  if (activeKey) {
    const idx = steps.findIndex(s => s.key === activeKey)
    if (idx >= 0) steps[idx].active = true
  }

  return steps
}

export default function Timeline({ status, trip, selectedAt, createdAt }: {
  status: string
  trip: any
  selectedAt: string | null
  createdAt: string
}) {
  const { lang } = useLanguage()
  const steps = buildSteps(status, trip, selectedAt, createdAt)

  if (['RIDE_CANCELLED', 'RIDE_EXPIRED', 'RIDE_DISPUTED'].includes(status)) {
    // For terminal non-completed states, only show completed steps
  }

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        const label = lang !== 'en' ? step.labelAr : step.labelEn
        const time = step.timestamp ? new Date(step.timestamp).toLocaleTimeString(lang !== 'en' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : null

        return (
          <div key={step.key} className="flex items-start gap-3">
            {/* Dot + line */}
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${
                step.completed ? 'bg-primary-600' :
                step.active ? 'bg-primary-600 ring-4 ring-primary-100 dark:ring-primary-900/50' :
                'bg-gray-200 dark:bg-gray-600'
              }`} />
              {!isLast && (
                <div className={`w-0.5 h-6 ${step.completed ? 'bg-primary-300 dark:bg-primary-700' : 'bg-gray-200 dark:bg-gray-600'}`} />
              )}
            </div>
            {/* Label + time */}
            <div className="flex-1 flex items-center justify-between -mt-0.5 pb-2">
              <span className={`text-sm ${step.completed || step.active ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                {label}
              </span>
              {time && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{time}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
