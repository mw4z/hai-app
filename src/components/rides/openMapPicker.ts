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

    // Header — title + subtitle stacked in a column inside the
    // header so the "tap the map" hint can never overlap the title.
    // Safe-area padding included for notched iPhones.
    const header = document.createElement('div')
    header.style.cssText = 'flex-shrink:0;display:flex;align-items:center;gap:12px;padding:10px 16px;padding-top:calc(env(safe-area-inset-top, 0px) + 10px);background:#1f2937;border-bottom:1px solid #374151;'
    const closeBtn = document.createElement('button')
    closeBtn.innerHTML = '✕'
    closeBtn.style.cssText = 'color:#ffffff;font-size:22px;padding:8px 12px;background:rgba(255,255,255,0.1);border:none;cursor:pointer;border-radius:8px;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;'
    closeBtn.onclick = () => { cleanup(); resolve(null) }
    const titleStack = document.createElement('div')
    titleStack.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;'
    const title = document.createElement('span')
    title.textContent = lang === 'en' ? 'Pick location on map' : lang === 'ur' ? 'نقشے پر مقام منتخب کریں' : 'اختر الموقع على الخريطة'
    title.style.cssText = 'font-size:14px;font-weight:700;color:white;'
    const subtitle = document.createElement('span')
    subtitle.textContent = lang === 'en' ? 'Tap the map or drag the pin' : lang === 'ur' ? 'نقشے پر ٹیپ کریں یا پن گھسیٹیں' : 'انقر على الخريطة أو اسحب الدبوس'
    subtitle.style.cssText = 'font-size:11px;color:#9ca3af;line-height:1.2;'
    titleStack.appendChild(title)
    titleStack.appendChild(subtitle)
    header.appendChild(closeBtn)
    header.appendChild(titleStack)
    header.appendChild(document.createElement('div')) // spacer

    // Map container
    const mapContainer = document.createElement('div')
    mapContainer.style.cssText = 'flex:1;width:100%;'

    // Bottom card
    const bottomCard = document.createElement('div')
    bottomCard.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:#1f2937;border-top:1px solid #374151;border-radius:24px 24px 0 0;padding:16px;padding-bottom:calc(var(--hai-safe-bottom, 0px) + 16px);z-index:2;'
    const addressText = document.createElement('p')
    addressText.style.cssText = 'font-size:13px;color:#d1d5db;margin-bottom:12px;min-height:36px;'
    addressText.textContent = lang === 'en' ? 'Tap the map to select a location' : lang === 'ur' ? 'مقام منتخب کرنے کیلئے نقشے پر ٹیپ کریں' : 'انقر على الخريطة لاختيار الموقع'
    const confirmBtn = document.createElement('button')
    confirmBtn.textContent = lang !== 'en' ? '✓ تأكيد الموقع' : '✓ Confirm Location'
    confirmBtn.style.cssText = 'width:100%;padding:14px;border-radius:12px;background:#00a884;color:white;font-weight:700;font-size:14px;border:none;cursor:pointer;'
    confirmBtn.disabled = true
    confirmBtn.style.opacity = '0.4'
    bottomCard.appendChild(addressText)
    bottomCard.appendChild(confirmBtn)

    // Full-cover loading screen — satellite tiles + the RTL plugin
    // fetch can take a few seconds, and the default MapLibre canvas
    // is blank black until the first tile paints, which feels broken.
    // This shows the branded HaiLoader over the map container until
    // map.on('load') fires, then fades itself out.
    const loadingCover = document.createElement('div')
    loadingCover.style.cssText = 'position:absolute;inset:0;top:0;background:#0f172a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:3;transition:opacity 220ms ease-out;pointer-events:none;'
    loadingCover.innerHTML = `
      <div style="color:#00a884;width:56px;height:56px;">
        <svg viewBox="0 0 64 64" fill="none" width="56" height="56">
          <circle cx="32" cy="35" r="6" fill="currentColor">
            <animate attributeName="opacity" values="1;0.35;1" dur="1.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="32" cy="15" r="4" fill="currentColor">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" begin="0s" repeatCount="indefinite" />
          </circle>
          <circle cx="48" cy="47" r="4" fill="currentColor">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
          </circle>
          <circle cx="16" cy="47" r="4" fill="currentColor">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" begin="0.8s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
      <p style="color:#9ca3af;font-size:12px;margin:0;">${
        lang === 'en'
          ? 'Loading map…'
          : lang === 'ur'
            ? 'نقشہ لوڈ ہو رہا ہے…'
            : 'جاري تحميل الخريطة…'
      }</p>
    `

    overlay.appendChild(header)
    overlay.appendChild(mapContainer)
    overlay.appendChild(bottomCard)
    overlay.appendChild(loadingCover)
    document.body.appendChild(overlay)

    let pin = { lat: centerLat, lng: centerLng }
    let currentAddress = ''
    let currentArea = ''
    // Initial center — starts at the passed value but gets overridden
    // by the user's live GPS position when available (resolveInitialCenter),
    // so the picker opens on "where you are" instead of a default city.
    let startLat = centerLat
    let startLng = centerLng

    // Try to get the device's current position before the map paints.
    // Resolves to the GPS fix if granted+quick, otherwise the passed
    // center after a short timeout — so a denied/slow lookup never
    // leaves the user staring at the loader.
    function resolveInitialCenter(): Promise<{ lat: number; lng: number }> {
      return new Promise((res) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          res({ lat: centerLat, lng: centerLng })
          return
        }
        let settled = false
        const finish = (lat: number, lng: number) => {
          if (settled) return
          settled = true
          res({ lat, lng })
        }
        const t = setTimeout(() => finish(centerLat, centerLng), 4500)
        navigator.geolocation.getCurrentPosition(
          (pos) => { clearTimeout(t); finish(pos.coords.latitude, pos.coords.longitude) },
          () => { clearTimeout(t); finish(centerLat, centerLng) },
          { enableHighAccuracy: false, timeout: 4500, maximumAge: 60000 },
        )
      })
    }

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
      // Kick off geolocation NOW, in parallel with the (slower) script
      // + RTL-plugin loads, so the GPS fix is usually ready by the time
      // we're about to create the map — hiding the lookup latency.
      const geoPromise = resolveInitialCenter()

      loadCSS('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css')
      await loadScript('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')

      const ml = (window as any).maplibregl

      // RTL text plugin — required for Arabic/Urdu labels. Without it
      // MapLibre renders isolated Arabic glyph forms left-to-right,
      // which looks like reversed, disconnected letters. Load EAGERLY
      // (deferred=false) so the plugin is available before the map
      // starts shaping any labels. Wrapped in a Promise so we wait for
      // the plugin to finish before creating the map. Idempotent —
      // calling setRTLTextPlugin twice in a session is a no-op after
      // the first success.
      await new Promise<void>((rtlResolve) => {
        try {
          const status = ml.getRTLTextPluginStatus?.()
          if (status === 'loaded') { rtlResolve(); return }
          if (typeof ml.setRTLTextPlugin !== 'function') { rtlResolve(); return }
          // Short timeout in case the plugin CDN is unreachable — we
          // still want the map to render, even if Arabic looks wrong.
          const t = setTimeout(() => rtlResolve(), 2500)
          ml.setRTLTextPlugin(
            'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
            (err: Error | null) => {
              clearTimeout(t)
              if (err) console.warn('[MAP] RTL plugin load failed:', err)
              rtlResolve()
            },
            false, // eager
          )
        } catch (e) {
          console.warn('[MAP] RTL plugin setup failed:', e)
          rtlResolve()
        }
      })

      // Resolve the live GPS center (or fall back) just before paint.
      const detected = await geoPromise
      startLat = detected.lat
      startLng = detected.lng
      pin = { lat: startLat, lng: startLng }

      // 'hybrid' = satellite imagery with street/neighborhood labels
      // overlaid. Gives the user real aerial context when picking a
      // location, without losing the ability to read place names.
      map = new ml.Map({
        container: mapContainer,
        style: maptilerKey
          ? `https://api.maptiler.com/maps/hybrid/style.json?key=${maptilerKey}${lang === 'ar' ? '&language=ar' : lang === 'ur' ? '&language=ur' : ''}`
          : 'https://demotiles.maplibre.org/style.json',
        center: [startLng, startLat],
        zoom: 16,
      })

      // On satellite imagery the original style's light labels get
      // lost against buildings / roofs / shadows. Boost every label:
      // larger text (1.25x), WHITE fill, and a strong BLACK halo so
      // the text is legible over any imagery tone.
      map.on('load', () => {
        try {
          for (const layer of map.getStyle().layers || []) {
            if (layer.type !== 'symbol') continue
            const layout: any = layer.layout || {}
            if (!layout['text-field']) continue
            const current = layout['text-size']
            if (typeof current === 'number') {
              map.setLayoutProperty(layer.id, 'text-size', current * 1.25)
            } else if (!current) {
              map.setLayoutProperty(layer.id, 'text-size', 14)
            }
            map.setPaintProperty(layer.id, 'text-halo-width', 2)
            map.setPaintProperty(layer.id, 'text-halo-color', '#000000')
            map.setPaintProperty(layer.id, 'text-color', '#ffffff')
          }
        } catch { /* style may not allow it — non-fatal */ }

        // Fade the loading cover out once the basemap is drawn.
        // 'load' fires after the style is parsed and the first
        // viewport tiles finish rendering, which is when the user
        // can actually see the map.
        loadingCover.style.opacity = '0'
        setTimeout(() => { loadingCover.remove() }, 260)
      })
      // Also remove the cover if load errors out, so the user isn't
      // stuck staring at a spinner forever.
      map.on('error', () => {
        loadingCover.style.opacity = '0'
        setTimeout(() => { loadingCover.remove() }, 260)
      })

      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new ml.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right')

      const marker = new ml.Marker({ color: '#ef4444', draggable: true })
      marker.setLngLat([startLng, startLat]).addTo(map)

      reverseGeocode(startLat, startLng)

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
