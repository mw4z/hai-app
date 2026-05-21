'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { FiMapPin, FiNavigation, FiSearch, FiX, FiMap, FiSettings, FiRefreshCw } from 'react-icons/fi'
import { openMapPicker } from './openMapPicker'

function isNative(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as any).Capacitor?.isNativePlatform?.()
  )
}

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
  // 'ride' (default) renders the original "نقطة الانطلاق" / "الوجهة"
  // labels. 'delivery' swaps them to "نقطة الاستلام" / "نقطة التسليم"
  // — semantically clearer when the user is asking for an item to be
  // picked up and dropped off rather than themselves.
  mode?: 'ride' | 'delivery'
}

interface SearchResult {
  id: string
  name: string
  secondary: string
  fullAddress: string
  lat: number
  lng: number
  distKm: number
  // Set for Google Places suggestions — coordinates aren't known
  // until a Place Details call, so these carry a placeId and a
  // distKm of -1 (no distance badge) until resolved on select.
  placeId?: string
}

function newPlacesToken(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
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

export default function LocationPicker({ type, value, onChange, userLat, userLng, mode = 'ride' }: Props) {
  const { lang } = useLanguage()
  const [detecting, setDetecting] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [error, setError] = useState('')
  const [permissionDenied, setPermissionDenied] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Shared Places session token (autocomplete keystrokes + the final
  // details call billed as one). Reset after each resolved selection.
  const placesTokenRef = useRef<string>(newPlacesToken())

  const refLat = userLat || 21.4
  const refLng = userLng || 39.8
  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY || ''

  // ── GPS Detection (pickup) ────────────────────────────────────────────────

  async function resolveCoords(lat: number, lng: number) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=${lang}&addressdetails=1`,
      )
      const data = await res.json()
      const address = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      let area =
        data.address?.suburb ||
        data.address?.neighbourhood ||
        data.address?.city_district ||
        data.address?.city ||
        ''
      try {
        const nbRes = await fetch(`/api/neighborhoods/detect?lat=${lat}&lng=${lng}`)
        const nbData = await nbRes.json()
        if (nbData.name) area = lang === 'en' && nbData.nameEn ? nbData.nameEn : nbData.name
      } catch {
        /* ignore */
      }
      onChange({ lat, lng, address, area })
    } catch {
      onChange({ lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, area: '' })
    }
  }

  function permissionDeniedMsg() {
    return lang === 'en'
      ? 'Location access is blocked. Enable it in your device settings or pick pickup from the map.'
      : lang === 'ur'
        ? 'مقام بلاک ہے — سیٹنگز میں فعال کریں یا نقشے سے منتخب کریں'
        : 'صلاحية الموقع محظورة — فعّلها من الإعدادات أو اختر نقطة الانطلاق من الخريطة'
  }

  async function detectGPS() {
    setDetecting(true)
    setError('')
    setPermissionDenied(false)

    try {
      if (isNative()) {
        const { Geolocation } = await import('@capacitor/geolocation')
        const current = await Geolocation.checkPermissions()
        let state: string = current.location || 'prompt'
        if (state !== 'granted') {
          const requested = await Geolocation.requestPermissions()
          state = requested.location || 'prompt'
        }
        if (state === 'denied') {
          setPermissionDenied(true)
          setError(permissionDeniedMsg())
          setDetecting(false)
          return
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
        await resolveCoords(pos.coords.latitude, pos.coords.longitude)
        setDetecting(false)
        return
      }

      // Web fallback
      if (!navigator.geolocation) {
        setError(
          lang === 'en'
            ? 'Geolocation not supported'
            : lang === 'ur'
              ? 'براؤزر مقام کی حمایت نہیں کرتا'
              : 'المتصفح لا يدعم تحديد الموقع',
        )
        setDetecting(false)
        return
      }
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            await resolveCoords(pos.coords.latitude, pos.coords.longitude)
            resolve()
          },
          (err) => {
            if (err.code === 1) {
              setPermissionDenied(true)
              setError(permissionDeniedMsg())
            } else {
              setError(
                lang === 'en'
                  ? 'Could not detect location'
                  : lang === 'ur'
                    ? 'مقام معلوم نہیں ہو سکا'
                    : 'تعذر تحديد الموقع',
              )
            }
            resolve()
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        )
      })
    } catch (err: any) {
      const msg = (err?.message || '').toString().toLowerCase()
      if (msg.includes('denied') || msg.includes('permission')) {
        setPermissionDenied(true)
        setError(permissionDeniedMsg())
      } else {
        setError(
          lang === 'en'
            ? 'Could not detect location'
            : lang === 'ur'
              ? 'مقام معلوم نہیں ہو سکا'
              : 'تعذر تحديد الموقع',
        )
      }
    } finally {
      setDetecting(false)
    }
  }

  async function openSystemSettings() {
    if (isNative()) {
      const platform = (window as any).Capacitor?.getPlatform?.() || 'unknown'
      if (platform === 'ios') {
        try {
          window.location.href = 'app-settings:'
          return
        } catch {
          /* fall through */
        }
      }
      toast(
        lang === 'en'
          ? 'Open device Settings → Apps → Hai → Permissions → Location → Allow'
          : lang === 'ur'
            ? 'سیٹنگز → ایپس → Hai → اجازتیں → مقام → اجازت دیں'
            : 'افتح الإعدادات → التطبيقات → حي → الصلاحيات → الموقع → سماح',
        { duration: 6000 },
      )
      return
    }
    toast(
      lang === 'en'
        ? 'Click the lock icon next to the URL and enable location'
        : lang === 'ur'
          ? 'URL کے آگے لاک آئیکن دبائیں اور مقام فعال کریں'
          : 'اضغط على أيقونة القفل بجانب الرابط وفعّل الموقع',
      { duration: 6000 },
    )
  }

  async function pickPickupFromMap() {
    const result = await openMapPicker({ centerLat: refLat, centerLng: refLng, lang, maptilerKey })
    if (result) {
      setError('')
      setPermissionDenied(false)
      onChange(result)
    }
  }

  // ── Search (Google Places primary + MapTiler/Photon fallback) ──────────────

  // Google Places autocomplete — best SA business coverage. Returns
  // text suggestions only (no coords); we resolve lat/lng via a
  // Details call in selectResult. Empty array if Places is off or
  // errors, so the free geocoders below carry the search.
  async function searchGooglePlaces(query: string): Promise<SearchResult[]> {
    try {
      const res = await fetch('/api/places/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Bias toward the user's location so nearby places rank first.
        body: JSON.stringify({
          input: query,
          sessionToken: placesTokenRef.current,
          lang,
          lat: userLat ?? refLat,
          lng: userLng ?? refLng,
        }),
      })
      const d = await res.json().catch(() => ({}))
      const sugg: Array<{ placeId: string; primary: string; secondary: string }> =
        Array.isArray(d.suggestions) ? d.suggestions : []
      return sugg
        .filter((s) => s.placeId && s.primary)
        .map((s) => ({
          id: `g-${s.placeId}`,
          name: s.primary,
          secondary: s.secondary,
          fullAddress: [s.primary, s.secondary].filter(Boolean).join(', '),
          lat: 0,
          lng: 0,
          distKm: -1, // unknown until details resolves coords
          placeId: s.placeId,
        }))
    } catch {
      return []
    }
  }

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
        // Google Places is the source. Only if it returns nothing
        // (key unset / no match) do we fall back to the free
        // geocoders so the box never dead-ends.
        const g = await searchGooglePlaces(query)
        if (g.length > 0) {
          setResults(g.slice(0, 8))
        } else {
          const [mt, ph] = await Promise.all([searchMapTiler(query), searchPhoton(query)])
          const osm: SearchResult[] = []
          for (const r of [...mt, ...ph]) {
            if (!r.name) continue
            if (!osm.some((m) => haversine(m.lat, m.lng, r.lat, r.lng) < 0.3)) osm.push(r)
          }
          osm.sort((a, b) => a.distKm - b.distKm)
          setResults(osm.slice(0, 8))
        }
      } catch { setResults([]) }
      setSearching(false)
    }, 250)
  }, [refLat, refLng, lang, maptilerKey])

  async function selectResult(r: SearchResult) {
    // Google suggestion — no coords yet. Resolve via Place Details
    // (closes the billed session), then commit. Falls back to a toast
    // if details fail so the user can pick another result.
    if (r.placeId && !r.lat && !r.lng) {
      setSearching(true)
      try {
        const res = await fetch('/api/places/details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ placeId: r.placeId, sessionToken: placesTokenRef.current, lang }),
        })
        const d = await res.json().catch(() => ({}))
        placesTokenRef.current = newPlacesToken() // new session after details
        const det = d.details
        if (det && typeof det.latitude === 'number' && typeof det.longitude === 'number') {
          onChange({
            lat: det.latitude,
            lng: det.longitude,
            address: det.address || r.fullAddress,
            area: r.name,
          })
          setShowSearch(false)
          setSearchQuery('')
          setResults([])
        } else {
          toast.error(lang === 'en' ? 'Could not resolve that place' : lang === 'ur' ? 'مقام حل نہیں ہو سکا' : 'تعذّر تحديد هذا المكان')
        }
      } catch {
        toast.error(lang === 'en' ? 'Could not resolve that place' : lang === 'ur' ? 'مقام حل نہیں ہو سکا' : 'تعذّر تحديد هذا المكان')
      } finally {
        setSearching(false)
      }
      return
    }
    // OSM result — coords already inline.
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
  const isDelivery = mode === 'delivery'
  // Which field is "where the user is right now"?
  //   RIDE mode     → pickup  (passenger is at pickup, going to dropoff)
  //   DELIVERY mode → dropoff (item is somewhere else; user wants it
  //                            brought TO their location)
  // The "Use my current location" + map-pick + permission-recovery
  // block follows this instead of being hardwired to pickup, so in
  // delivery the GPS shortcut lives on the drop-off field where it
  // actually makes sense.
  const showGpsBlock = isDelivery ? !isPickup : isPickup
  const label = isPickup
    ? (lang === 'en'
        ? (isDelivery ? 'Pickup point' : 'Pickup')
        : lang === 'ur'
          ? (isDelivery ? 'وصول کی جگہ' : 'اٹھانے کی جگہ')
          : (isDelivery ? 'نقطة الاستلام' : 'نقطة الانطلاق'))
    : (lang === 'en'
        ? (isDelivery ? 'Drop-off point' : 'Drop-off')
        : lang === 'ur'
          ? (isDelivery ? 'حوالگی کی جگہ' : 'منزل')
          : (isDelivery ? 'نقطة التسليم' : 'الوجهة'))

  // ── Normal View ───────────────────────────────────────────────────────────

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-2">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} /> {label}
      </label>

      {value ? (
        /* Selected location — same card for both fields. The X clears
           it so the user can search or re-pin. */
        <div className={`border ${borderColor} rounded-xl p-3.5 flex items-start gap-3`}>
          <FiMapPin className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{value.area || label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{value.address}</p>
          </div>
          <button
            onClick={() => { onChange(null as any); setPermissionDenied(false); setError(''); setShowSearch(false); setSearchQuery(''); setResults([]) }}
            className="text-gray-400 p-1"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* "Use my current location" — only on the field that is the
              user's own position (pickup in RIDE, dropoff in DELIVERY). */}
          {showGpsBlock && (
            <button onClick={detectGPS} disabled={detecting}
              className="w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center justify-center gap-3 hover:border-primary-400 transition-colors active:scale-[0.98] disabled:opacity-60">
              {detecting ? (
                <><div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /><span className="text-sm text-gray-400">{lang === 'en' ? 'Detecting...' : lang === 'ur' ? 'معلوم ہو رہا ہے...' : 'جاري التحديد...'}</span></>
              ) : (
                <><FiNavigation className="w-5 h-5 text-primary-600" /><span className="text-sm font-medium text-primary-600">{lang === 'en' ? 'Use my current location' : lang === 'ur' ? 'میرا موجودہ مقام استعمال کریں' : 'استخدم موقعي الحالي'}</span></>
              )}
            </button>
          )}

          {/* Google Places search — BOTH pickup and dropoff. */}
          <div className="relative">
            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden focus-within:ring-2 focus-within:ring-primary-500">
              <FiSearch className="w-4 h-4 text-gray-400 mx-3 flex-shrink-0" />
              <input ref={inputRef} type="text" value={searchQuery}
                onChange={e => handleSearchInput(e.target.value)}
                placeholder={lang === 'en' ? 'Search place, restaurant, store...' : lang === 'ur' ? 'جگہ، ریستوران، دکان تلاش کریں...' : 'ابحث عن مكان، مطعم، محل...'}
                className="flex-1 min-w-0 py-3.5 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none" />
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
                    {r.distKm >= 0 && (
                      <span className="text-[10px] text-gray-400 flex-shrink-0 mt-1 font-medium">{formatDist(r.distKm)}</span>
                    )}
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

          {/* Map picker — BOTH fields. */}
          <button onClick={pickPickupFromMap}
            className="w-full flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 rounded-xl py-3 text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-primary-400 dark:hover:border-primary-600 transition-colors active:scale-[0.98]">
            <FiMap className="w-4 h-4 text-primary-600" />
            {lang === 'en' ? 'Pick from map' : lang === 'ur' ? 'نقشے سے منتخب کریں' : 'اختر من الخريطة'}
          </button>

          {/* GPS permission recovery — only the current-location field. */}
          {showGpsBlock && permissionDenied && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900 rounded-xl p-3">
              <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed mb-3">{error || permissionDeniedMsg()}</p>
              <div className="flex gap-2">
                <button type="button" onClick={openSystemSettings}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-600 text-white text-xs font-bold rounded-lg active:scale-95">
                  <FiSettings className="w-3.5 h-3.5" />
                  {lang === 'en' ? 'Open Settings' : lang === 'ur' ? 'سیٹنگز' : 'الإعدادات'}
                </button>
                <button type="button" onClick={detectGPS} disabled={detecting}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white dark:bg-gray-800 text-red-600 border border-red-300 dark:border-red-700 text-xs font-bold rounded-lg active:scale-95 disabled:opacity-50">
                  <FiRefreshCw className={`w-3.5 h-3.5 ${detecting ? 'animate-spin' : ''}`} />
                  {lang === 'en' ? 'Try again' : lang === 'ur' ? 'دوبارہ' : 'إعادة المحاولة'}
                </button>
              </div>
            </div>
          )}

          {showGpsBlock && error && !permissionDenied && (
            <p className="text-xs text-red-500 mt-1.5 px-1">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}
