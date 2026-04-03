'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { FiMapPin, FiNavigation, FiSearch, FiX, FiMap } from 'react-icons/fi'
import { openMapPicker } from './openMapPicker'

interface Location {
  lat: number
  lng: number
  address: string
  area: string
}

interface Props {
  type: 'pickup' | 'dropoff'
  value: Location | null
  onChange: (loc: Location) => void
  userLat?: number
  userLng?: number
}

interface SearchResult {
  id: string
  name: string
  secondary: string
  fullAddress: string
  lat: number
  lng: number
  distKm: number
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${Math.round(km * 10) / 10}km`
}

export default function LocationPicker({ type, value, onChange, userLat, userLng }: Props) {
  const { lang } = useLanguage()
  const [detecting, setDetecting] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const refLat = userLat || 21.4
  const refLng = userLng || 39.8
  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY || ''

  // ── GPS Detection (pickup) ────────────────────────────────────────────────

  async function detectGPS() {
    setDetecting(true)
    setError('')
    if (!navigator.geolocation) {
      setError(lang === 'en' ? 'Geolocation not supported' : lang === 'ur' ? 'براؤزر مقام کی حمایت نہیں کرتا' : 'المتصفح لا يدعم تحديد الموقع')
      setDetecting(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=${lang}&addressdetails=1`)
          const data = await res.json()
          const address = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
          let area = data.address?.suburb || data.address?.neighbourhood || data.address?.city_district || data.address?.city || ''
          try {
            const nbRes = await fetch(`/api/neighborhoods/detect?lat=${lat}&lng=${lng}`)
            const nbData = await nbRes.json()
            if (nbData.name) area = lang === 'en' && nbData.nameEn ? nbData.nameEn : nbData.name
          } catch { /* */ }
          onChange({ lat, lng, address, area })
        } catch {
          onChange({ lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, area: '' })
        }
        setDetecting(false)
      },
      (err) => {
        setError(err.code === 1
          ? (lang === 'en' ? 'Please allow location access' : lang === 'ur' ? 'براہ کرم مقام کی اجازت دیں' : 'يرجى السماح بالوصول إلى الموقع')
          : (lang === 'en' ? 'Could not detect location' : lang === 'ur' ? 'مقام معلوم نہیں ہو سکا' : 'تعذر تحديد الموقع'))
        setDetecting(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  // ── Search (MapTiler + Photon) ────────────────────────────────────────────

  async function searchMapTiler(query: string): Promise<SearchResult[]> {
    if (!maptilerKey) return []
    try {
      const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${maptilerKey}&proximity=${refLng},${refLat}&language=${lang}&limit=8`)
      const data = await res.json()
      return (data.features || []).map((f: any) => {
        const [lng, lat] = f.center || f.geometry?.coordinates || [0, 0]
        return { id: `mt-${f.id}`, name: f.text || f.place_name?.split(',')[0] || '', secondary: f.place_name?.split(',').slice(1, 3).join(',').trim() || '', fullAddress: f.place_name || '', lat, lng, distKm: Math.round(haversine(refLat, refLng, lat, lng) * 10) / 10 }
      })
    } catch { return [] }
  }

  async function searchPhoton(query: string): Promise<SearchResult[]> {
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${refLat}&lon=${refLng}&limit=8&lang=${lang !== 'en' ? 'default' : 'en'}`)
      const data = await res.json()
      return (data.features || []).map((f: any) => {
        const [lng, lat] = f.geometry?.coordinates || [0, 0]
        const p = f.properties || {}
        return { id: `ph-${lat.toFixed(4)}-${lng.toFixed(4)}`, name: p.name || p.street || '', secondary: [p.type !== 'yes' ? p.type : '', p.street, p.district || p.city].filter(Boolean).join(' · '), fullAddress: [p.name, p.street, p.district, p.city, p.country].filter(Boolean).join(', '), lat, lng, distKm: Math.round(haversine(refLat, refLng, lat, lng) * 10) / 10 }
      }).filter((r: SearchResult) => r.name)
    } catch { return [] }
  }

  const handleSearchInput = useCallback((query: string) => {
    setSearchQuery(query)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const [mt, ph] = await Promise.all([searchMapTiler(query), searchPhoton(query)])
        const merged: SearchResult[] = []
        for (const r of [...mt, ...ph]) {
          if (!r.name) continue
          if (!merged.some(m => haversine(m.lat, m.lng, r.lat, r.lng) < 0.3)) merged.push(r)
        }
        merged.sort((a, b) => a.distKm - b.distKm)
        setResults(merged.slice(0, 8))
      } catch { setResults([]) }
      setSearching(false)
    }, 250)
  }, [refLat, refLng, lang, maptilerKey])

  function selectResult(r: SearchResult) {
    onChange({ lat: r.lat, lng: r.lng, address: r.fullAddress, area: r.name })
    setShowSearch(false)
    setSearchQuery('')
    setResults([])
  }

  useEffect(() => { if (showSearch && inputRef.current) inputRef.current.focus() }, [showSearch])

  // ── Render ────────────────────────────────────────────────────────────────

  const isPickup = type === 'pickup'
  const dotColor = isPickup ? 'bg-green-500' : 'bg-red-500'
  const borderColor = isPickup ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20' : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
  const iconColor = isPickup ? 'text-green-600' : 'text-red-600'
  const label = isPickup ? (lang === 'en' ? 'Pickup' : lang === 'ur' ? 'اٹھانے کی جگہ' : 'نقطة الانطلاق') : (lang === 'en' ? 'Drop-off' : lang === 'ur' ? 'منزل' : 'الوجهة')

  // ── Normal View ───────────────────────────────────────────────────────────

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-2">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} /> {label}
      </label>

      {/* Pickup: GPS */}
      {isPickup && (
        <>
          {value ? (
            <div className={`border ${borderColor} rounded-xl p-3.5 flex items-start gap-3`}>
              <FiMapPin className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{value.area || label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{value.address}</p>
              </div>
              <button onClick={() => { onChange(null as any); detectGPS() }} className="text-gray-400 p-1"><FiX className="w-4 h-4" /></button>
            </div>
          ) : (
            <button onClick={detectGPS} disabled={detecting}
              className="w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center justify-center gap-3 hover:border-primary-400 transition-colors active:scale-[0.98]">
              {detecting ? (
                <><div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /><span className="text-sm text-gray-400">{lang === 'en' ? 'Detecting...' : lang === 'ur' ? 'معلوم ہو رہا ہے...' : 'جاري التحديد...'}</span></>
              ) : (
                <><FiNavigation className="w-5 h-5 text-primary-600" /><span className="text-sm font-medium text-primary-600">{lang === 'en' ? 'Use my current location' : lang === 'ur' ? 'میرا موجودہ مقام استعمال کریں' : 'استخدم موقعي الحالي'}</span></>
              )}
            </button>
          )}
          {error && <p className="text-xs text-red-500 mt-1.5 px-1">{error}</p>}
        </>
      )}

      {/* Dropoff: Search + Map picker */}
      {!isPickup && (
        <>
          {value && !showSearch ? (
            <div className={`border ${borderColor} rounded-xl p-3.5 flex items-start gap-3`}>
              <FiMapPin className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{value.area || label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{value.address}</p>
              </div>
              <button onClick={() => setShowSearch(true)} className="text-gray-400 p-1"><FiX className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Search bar */}
              <div className="relative">
                <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden focus-within:ring-2 focus-within:ring-primary-500">
                  <FiSearch className="w-4 h-4 text-gray-400 mx-3 flex-shrink-0" />
                  <input ref={inputRef} type="text" value={searchQuery}
                    onChange={e => handleSearchInput(e.target.value)}
                    placeholder={lang === 'en' ? 'Search place, restaurant, store...' : lang === 'ur' ? 'جگہ، ریستوران، دکان تلاش کریں...' : 'ابحث عن مكان، مطعم، محل...'}
                    className="flex-1 py-3.5 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none" />
                  {searching && <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-3" />}
                </div>

                {results.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-30 max-h-64 overflow-y-auto">
                    {results.map(r => (
                      <button key={r.id} onClick={() => selectResult(r)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-start border-b border-gray-50 dark:border-gray-700 last:border-0">
                        <FiMapPin className="w-4 h-4 text-red-500 flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-white font-semibold truncate">{r.name}</p>
                          {r.secondary && <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{r.secondary}</p>}
                        </div>
                        <span className="text-[10px] text-gray-400 flex-shrink-0 mt-1 font-medium">{formatDist(r.distKm)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery.length >= 2 && !searching && results.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 p-4 text-center">
                    <p className="text-sm text-gray-400">{lang === 'en' ? 'No results' : lang === 'ur' ? 'کوئی نتیجہ نہیں' : 'لا توجد نتائج'}</p>
                  </div>
                )}
              </div>

              {/* Map picker button */}
              <button onClick={async () => {
                const result = await openMapPicker({ centerLat: refLat, centerLng: refLng, lang, maptilerKey })
                if (result) onChange(result)
              }}
                className="w-full flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 rounded-xl py-3 text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-primary-400 dark:hover:border-primary-600 transition-colors active:scale-[0.98]">
                <FiMap className="w-4 h-4 text-primary-600" />
                {lang === 'en' ? 'Pick from map' : lang === 'ur' ? 'نقشے سے منتخب کریں' : 'اختر من الخريطة'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
