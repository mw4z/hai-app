'use client'

import { useRef, useEffect, useState } from 'react'
import { FiMapPin, FiX, FiCheck } from 'react-icons/fi'

interface Props {
  centerLat: number
  centerLng: number
  lang: string
  maptilerKey: string
  onConfirm: (lat: number, lng: number, address: string, area: string) => void
  onClose: () => void
}

/**
 * Fullscreen map picker — isolated component.
 * All map state is local to prevent parent re-renders from destroying the map.
 */
export default function MapPicker({ centerLat, centerLng, lang, maptilerKey, onConfirm, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const pinRef = useRef({ lat: centerLat, lng: centerLng })
  const [address, setAddress] = useState('')
  const [area, setArea] = useState('')
  const [loading, setLoading] = useState(true)
  const [reversing, setReversing] = useState(false)
  const mounted = useRef(true)

  async function reverseGeocode(lat: number, lng: number) {
    setReversing(true)
    try {
      if (maptilerKey) {
        const res = await fetch(`https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${maptilerKey}&language=${lang}`)
        const data = await res.json()
        if (!mounted.current) return
        if (data.features?.length > 0) {
          const f = data.features[0]
          setAddress(f.place_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
          setArea(f.text || f.place_name?.split(',')[0] || '')
          setReversing(false)
          return
        }
      }
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=${lang}&addressdetails=1`)
      const data = await res.json()
      if (!mounted.current) return
      setAddress(data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
      setArea(data.address?.suburb || data.address?.neighbourhood || data.address?.city_district || data.address?.city || '')
    } catch {
      if (!mounted.current) return
      setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
      setArea('')
    }
    setReversing(false)
  }

  useEffect(() => {
    mounted.current = true
    let map: any = null

    async function init() {
      if (!containerRef.current) return

      // Load maplibre-gl from CDN to avoid chunk loading issues
      if (!document.querySelector('link[href*="maplibre-gl"]')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'
        document.head.appendChild(link)
      }

      if (!(window as any).maplibregl) {
        await new Promise<void>((resolve, reject) => {
          if ((window as any).maplibregl) { resolve(); return }
          const script = document.createElement('script')
          script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Failed to load maplibre-gl'))
          document.head.appendChild(script)
        })
      }

      if (!mounted.current || !containerRef.current) return
      const maplibregl = (window as any).maplibregl

      // Request the Arabic-localized variant of the MapTiler style
      // when the UI is Arabic, otherwise default. Also set once the
      // map loads so every symbol layer pulls 'name:ar' where
      // available — fixes the hard-to-read halo'd Latin labels that
      // appeared over Arabic neighborhoods (الهنداوية / الخالدية).
      const styleUrl = maptilerKey
        ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}${lang === 'ar' ? '&language=ar' : lang === 'ur' ? '&language=ur' : ''}`
        : 'https://demotiles.maplibre.org/style.json'
      map = new maplibregl.Map({
        container: containerRef.current,
        style: styleUrl,
        center: [centerLng, centerLat],
        zoom: 14,
      })

      // Belt-and-suspenders: after load, force every label layer to
      // prefer the localized name, then fall back to the default.
      // Also narrows the text-halo so Arabic ligatures aren't broken
      // by the thick white stroke the default style applies.
      map.on('load', () => {
        if (!mounted.current) return
        const target = lang === 'ar' ? 'name:ar' : lang === 'ur' ? 'name:ur' : 'name:latin'
        try {
          const style = map.getStyle()
          for (const layer of style.layers || []) {
            if (layer.type !== 'symbol') continue
            const layout: any = layer.layout || {}
            if (!layout['text-field']) continue
            map.setLayoutProperty(layer.id, 'text-field', [
              'coalesce',
              ['get', target],
              ['get', 'name'],
            ])
            // Keep a halo but slim it so RTL scripts read cleanly.
            map.setPaintProperty(layer.id, 'text-halo-width', 1)
          }
        } catch { /* non-fatal — style may not allow it */ }
      })

      mapRef.current = map

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }), 'top-right')

      const marker = new maplibregl.Marker({ color: '#ef4444', draggable: true })
      marker.setLngLat([centerLng, centerLat]).addTo(map)
      markerRef.current = marker

      // Initial reverse geocode
      reverseGeocode(centerLat, centerLng)

      map.on('click', (e: any) => {
        const { lat, lng } = e.lngLat
        marker.setLngLat([lng, lat])
        pinRef.current = { lat, lng }
        reverseGeocode(lat, lng)
      })

      marker.on('dragend', () => {
        const ll = marker.getLngLat()
        pinRef.current = { lat: ll.lat, lng: ll.lng }
        reverseGeocode(ll.lat, ll.lng)
      })

      map.on('load', () => {
        if (mounted.current) setLoading(false)
      })

      // Fallback for load event
      setTimeout(() => { if (mounted.current) setLoading(false) }, 2000)
    }

    init()

    return () => {
      mounted.current = false
      if (map) { map.remove(); mapRef.current = null; markerRef.current = null }
    }
  }, []) // Empty deps — only run once on mount

  function handleConfirm() {
    onConfirm(pinRef.current.lat, pinRef.current.lng, address, area)
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
      {/* Header — static, not overlapping map */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 px-4 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-gray-700">
        <button onClick={onClose} className="text-gray-400 p-1">
          <FiX className="w-5 h-5" />
        </button>
        <h2 className="flex-1 text-sm font-bold text-gray-900 dark:text-white text-center">
          {lang === 'en' ? 'Pick location on map' : lang === 'ur' ? 'نقشے پر مقام منتخب کریں' : 'اختر الموقع على الخريطة'}
        </h2>
        <div className="w-6" />
      </div>

      {/* Map container — below header */}
      <div ref={containerRef} className="flex-1 w-full relative" />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-5 flex items-center justify-center bg-gray-100 dark:bg-gray-900">
          <div className="hai-loader text-primary-600" style={{width:48,height:48}}><svg viewBox="0 0 64 64" fill="none" className="w-full h-full"><circle className="hai-dot hai-dot-center" cx="32" cy="35" r="6" fill="currentColor"/><circle className="hai-dot hai-dot-top" cx="32" cy="15" r="4" fill="currentColor"/><circle className="hai-dot hai-dot-br" cx="48" cy="47" r="4" fill="currentColor"/><circle className="hai-dot hai-dot-bl" cx="16" cy="47" r="4" fill="currentColor"/></svg></div>
        </div>
      )}

      {/* Hint — pinned below the header. 'top-[70px]' previously
          didn't account for the iOS safe-area-inset-top, so on
          notched phones the hint overlapped the header title.
          Offset against env(safe-area-inset-top) so the hint always
          clears the header regardless of device. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 64px)' }}
      >
        <p className="bg-black/60 text-white text-[10px] px-3 py-1.5 rounded-full whitespace-nowrap">
          {lang === 'ar' ? 'انقر على الخريطة أو اسحب الدبوس' : 'Tap the map or drag the pin'}
        </p>
      </div>

      {/* Bottom card */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl px-4 pt-4 pb-6 border-t border-gray-100 dark:border-gray-700">
        {reversing ? (
          <div className="flex items-center gap-2 py-2 mb-4">
            <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-400">{lang === 'en' ? 'Getting address...' : lang === 'ur' ? 'پتہ معلوم ہو رہا ہے...' : 'جاري تحديد العنوان...'}</span>
          </div>
        ) : (
          <div className="flex items-start gap-3 mb-4">
            <FiMapPin className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{area || (lang === 'en' ? 'Selected location' : lang === 'ur' ? 'منتخب مقام' : 'موقع محدد')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{address}</p>
            </div>
          </div>
        )}
        <button onClick={handleConfirm} disabled={reversing}
          className="w-full bg-primary-600 text-white rounded-xl py-3.5 font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-40 shadow-lg shadow-primary-600/20">
          <FiCheck className="w-5 h-5" />
          {lang === 'en' ? 'Confirm Location' : lang === 'ur' ? 'مقام کی تصدیق' : 'تأكيد الموقع'}
        </button>
      </div>
    </div>
  )
}
