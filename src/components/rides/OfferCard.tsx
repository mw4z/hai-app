'use client'

import { useLanguage } from '@/hooks/useLanguage'
import RiyalIcon from '@/components/RiyalIcon'
import UserBadgeDisplay from '@/components/UserBadge'
import { FiStar, FiClock, FiTruck } from 'react-icons/fi'
import { HaiSpinner } from '@/components/HaiLoader'

interface Offer {
  id: string
  price: number
  arrivalMin: number
  message: string | null
  status: string
  createdAt: string
  driver: {
    id: string
    name: string
    avatarUrl: string | null
    driverRatingAvg: number | null
    driverTripsCount: number
    cancelRate: number
    reputation: number
    accountType: string
  }
}

interface Props {
  offer: Offer
  badge?: 'fastest' | 'top_rated' | null
  isRequester: boolean
  rideStatus: string
  onSelect?: (offerId: string) => void
  selecting?: boolean
}

const BADGE_STYLES: Record<string, { ar: string; en: string; cls: string }> = {
  fastest:    { ar: '⚡ الأسرع',    en: '⚡ Fastest',    cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  top_rated:  { ar: '⭐ الأعلى تقييماً', en: '⭐ Top Rated', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
}

export default function OfferCard({ offer, badge, isRequester, rideStatus, onSelect, selecting }: Props) {
  const { t, lang } = useLanguage()
  const d = offer.driver

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border p-4 transition-all ${
      offer.status === 'OFFER_ACCEPTED' ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20' : 'border-gray-100 dark:border-gray-700'
    }`}>
      {/* Badge */}
      {badge && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 inline-block ${BADGE_STYLES[badge].cls}`}>
          {lang !== 'en' ? BADGE_STYLES[badge].ar : BADGE_STYLES[badge].en}
        </span>
      )}

      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm overflow-hidden flex-shrink-0">
          {d.avatarUrl ? <img src={d.avatarUrl} alt="" className="w-full h-full object-cover" /> : (d.name?.[0] || '؟')}
        </div>

        <div className="flex-1 min-w-0">
          {/* Driver name + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm text-gray-900 dark:text-white">{d.name || '—'}</span>
            <UserBadgeDisplay accountType={d.accountType} providerStatus={(d as any).providerStatus} reputation={d.reputation} />
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400 dark:text-gray-500">
            {d.driverRatingAvg !== null && (
              <span className="flex items-center gap-0.5"><FiStar className="w-3 h-3 text-amber-500" /> {d.driverRatingAvg}</span>
            )}
            <span className="flex items-center gap-0.5"><FiTruck className="w-3 h-3" /> {d.driverTripsCount} {t('ride_trips')}</span>
            {d.cancelRate > 0 && (
              <span className="text-red-400">{d.cancelRate}% {t('ride_cancel_rate')}</span>
            )}
          </div>

          {/* Message */}
          {offer.message && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 italic">"{offer.message}"</p>
          )}
        </div>

        {/* ETA column */}
        <div className="text-end flex-shrink-0">
          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 font-semibold justify-end">
            <FiClock className="w-3.5 h-3.5 text-primary-600" />
            <span>{offer.arrivalMin} {t('ride_min')}</span>
          </div>
        </div>
      </div>

      {/* Select button (requester only, OPEN rides) */}
      {isRequester && rideStatus === 'RIDE_OPEN' && onSelect && (
        <button
          onClick={() => onSelect(offer.id)}
          disabled={selecting}
          className="mt-3 w-full bg-primary-600 text-white rounded-xl py-2.5 text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {selecting ? <HaiSpinner /> : t('ride_select')}
        </button>
      )}

      {/* Accepted indicator */}
      {offer.status === 'OFFER_ACCEPTED' && (
        <div className="mt-2 text-center text-xs font-medium text-primary-600 dark:text-primary-400">
          ✓ {lang !== 'en' ? 'تم اختياره' : 'Selected'}
        </div>
      )}
    </div>
  )
}
