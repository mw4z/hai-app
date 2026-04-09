/**
 * Opens a fullscreen map picker using vanilla JS + maplibre-gl.
 * Completely bypasses React to avoid re-render/unmount issues.
 * Returns a Promise that resolves with { lat, lng, address, area } or null if cancelled.
 */

interface MapResult {
  lat: number
  lng: number
  address: string
  area: string
}

export function openMapPicker(options: {
  centerLat: number
  centerLng: number
  lang: string
  maptilerKey: string
}): Promise<MapResult | null> {
  return new Promise((resolve) => {
    const { centerLat, centerLng, lang, maptilerKey } = options

    // Create overlay — data-overlay prevents PullToRefresh from triggering
    const overlay = document.createElement('div')
    overlay.setAttribute('data-overlay', 'true')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:#111827;'

    // Header — includes safe area padding for iOS status bar
    const header = document.createElement('div')
    header.style.cssText = 'flex-shrink:0;display:flex;align-items:center;gap:12px;padding:12px 16px;padding-top:calc(env(safe-area-inset-top, 0px) + 12px);background:#1f2937;border-bottom:1px solid #374151;'
    const closeBtn = document.createElement('button')
    closeBtn.innerHTML = '✕'
    closeBtn.style.cssText = 'color:#ffffff;font-size:22px;padding:8px 12px;background:rgba(255,255,255,0.1);border:none;cursor:pointer;border-radius:8px;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;'
    closeBtn.onclick = () => { cleanup(); resolve(null) }
    const title = document.createElement('span')
    title.textContent = lang === 'en' ? 'Pick location on map' : lang === 'ur' ? 'نقشے پر مقام منتخب کریں' : 'اختر الموقع على الخريطة'
    title.style.cssText = 'flex:1;text-align:center;font-size:14px;font-weight:700;color:white;'
    header.appendChild(closeBtn)
    header.appendChild(title)
    header.appendChild(document.createElement('div')) // spacer

    // Map container
    const mapContainer = document.createElement('div')
    mapContainer.style.cssText = 'flex:1;width:100%;'

    // Bottom card
    const bottomCard = document.createElement('div')
    bottomCard.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:#1f2937;border-top:1px solid #374151;border-radius:24px 24px 0 0;padding:16px;padding-bottom:calc(env(safe-area-inset-bottom, 0px) + 16px);z-index:2;'
    const addressText = document.createElement('p')
    addressText.style.cssText = 'font-size:13px;color:#d1d5db;margin-bottom:12px;min-height:36px;'
    addressText.textContent = lang === 'en' ? 'Tap the map to select a location' : lang === 'ur' ? 'مقام منتخب کرنے کیلئے نقشے پر ٹیپ کریں' : 'انقر على الخريطة لاختيار الموقع'
    const confirmBtn = document.createElement('button')
    confirmBtn.textContent = lang !== 'en' ? '✓ تأكيد الموقع' : '✓ Confirm Location'
    confirmBtn.style.cssText = 'width:100%;padding:14px;border-radius:12px;background:#16a34a;color:white;font-weight:700;font-size:14px;border:none;cursor:pointer;'
    confirmBtn.disabled = true
    confirmBtn.style.opacity = '0.4'
    bottomCard.appendChild(addressText)
    bottomCard.appendChild(confirmBtn)

    // Hint
    const hint = document.createElement('div')
    hint.style.cssText = 'position:absolute;top:60px;left:50%;transform:translateX(-50%);z-index:1;pointer-events:none;'
    hint.innerHTML = `<span style="background:rgba(0,0,0,0.6);color:white;font-size:10px;padding:4px 10px;border-radius:20px;white-space:nowrap;">${lang === 'en' ? 'Tap the map or drag the pin' : lang === 'ur' ? 'نقشے پر ٹیپ کریں یا پن گھسیٹیں' : 'انقر على الخريطة أو اسحب الدبوس'}</span>`

    overlay.appendChild(header)
    overlay.appendChild(mapContainer)
    overlay.appendChild(bottomCard)
    overlay.appendChild(hint)
    document.body.appendChild(overlay)

    let pin = { lat: centerLat, lng: centerLng }
    let currentAddress = ''
    let currentArea = ''

    function cleanup() {
      if (map) map.remove()
      overlay.remove()
      document.removeEventListener('keydown', handleEsc)
    }

    // ESC key to close
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') { cleanup(); resolve(null) }
    }
    document.addEventListener('keydown', handleEsc)

    // Reverse geocode
    async function reverseGeocode(lat: number, lng: number) {
      addressText.textContent = lang === 'en' ? 'Getting address...' : lang === 'ur' ? 'پتہ معلوم ہو رہا ہے...' : 'جاري تحديد العنوان...'
      try {
        if (maptilerKey) {
          const res = await fetch(`https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${maptilerKey}&language=${lang}`)
          const data = await res.json()
          if (data.features?.length > 0) {
            const f = data.features[0]
            currentAddress = f.place_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
            currentArea = f.text || f.place_name?.split(',')[0] || ''
            addressText.textContent = currentAddress
            confirmBtn.disabled = false
            confirmBtn.style.opacity = '1'
            return
          }
        }
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=${lang}&addressdetails=1`)
        const data = await res.json()
        currentAddress = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        currentArea = data.address?.suburb || data.address?.neighbourhood || data.address?.city_district || data.address?.city || ''
        addressText.textContent = currentAddress
      } catch {
        currentAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        currentArea = ''
        addressText.textContent = currentAddress
      }
      confirmBtn.disabled = false
      confirmBtn.style.opacity = '1'
    }

    confirmBtn.onclick = () => {
      cleanup()
      resolve({ lat: pin.lat, lng: pin.lng, address: currentAddress, area: currentArea })
    }

    // Load maplibre
    let map: any = null

    function loadScript(src: string): Promise<void> {
      return new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          if ((window as any).maplibregl) { res(); return }
          const check = setInterval(() => { if ((window as any).maplibregl) { clearInterval(check); res() } }, 100)
          return
        }
        const s = document.createElement('script')
        s.src = src; s.onload = () => res(); s.onerror = () => rej(); document.head.appendChild(s)
      })
    }

    function loadCSS(href: string) {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l)
      }
    }

    async function initMap() {
      loadCSS('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css')
      await loadScript('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')

      const ml = (window as any).maplibregl
      map = new ml.Map({
        container: mapContainer,
        style: maptilerKey
          ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`
          : 'https://demotiles.maplibre.org/style.json',
        center: [centerLng, centerLat],
        zoom: 14,
      })

      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new ml.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right')

      const marker = new ml.Marker({ color: '#ef4444', draggable: true })
      marker.setLngLat([centerLng, centerLat]).addTo(map)

      reverseGeocode(centerLat, centerLng)

      map.on('click', (e: any) => {
        const { lat, lng } = e.lngLat
        marker.setLngLat([lng, lat])
        pin = { lat, lng }
        reverseGeocode(lat, lng)
      })

      marker.on('dragend', () => {
        const ll = marker.getLngLat()
        pin = { lat: ll.lat, lng: ll.lng }
        reverseGeocode(ll.lat, ll.lng)
      })
    }

    initMap().catch(() => {
      addressText.textContent = lang === 'en' ? 'Failed to load map' : lang === 'ur' ? 'نقشہ لوڈ ناکام' : 'فشل تحميل الخريطة'
    })
  })
}
