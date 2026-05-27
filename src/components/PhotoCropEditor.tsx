'use client'

import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * General crop-before-upload editor used everywhere a photo is attached
 * (posts, comments, chat, directory, …) via the CropHost / cropBridge.
 *
 * Unlike ImageCropper (avatar-only, fixed 1:1, base64 out) this one:
 *  - lets the user pick an aspect (الأصل / 1:1 / 4:5 / 16:9) — default is
 *    "الأصل" (the photo's own ratio) so confirming without touching anything
 *    just returns the full frame, re-encoded.
 *  - supports pinch/scroll zoom.
 *  - outputs a JPEG File (capped at 1600px on the long edge — the upload
 *    pipeline re-compresses to 1200 anyway) ready for uploadFiles().
 */
interface Props {
  image: string          // object URL of the picked file
  fileName: string       // original name, for the output File
  index?: number         // 1-based position when cropping several in a row
  total?: number
  onDone: (file: File) => void
  onCancel: () => void
}

const ASPECTS: { key: string; ar: string; en: string; ratio: number | null }[] = [
  { key: 'orig', ar: 'الأصل', en: 'Original', ratio: null },
  { key: 'sq', ar: 'مربّع', en: '1:1', ratio: 1 },
  { key: 'p45', ar: '4:5', en: '4:5', ratio: 4 / 5 },
  { key: 'l169', ar: '16:9', en: '16:9', ratio: 16 / 9 },
]

const MAX_OUTPUT_EDGE = 1600
const OUTPUT_QUALITY = 0.9

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = src
  })
}

async function cropToFile(src: string, area: Area, fileName: string): Promise<File> {
  const img = await loadImage(src)
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(area.width, area.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(area.width * scale))
  canvas.height = Math.max(1, Math.round(area.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/jpeg', OUTPUT_QUALITY))
  if (!blob) throw new Error('canvas_export_failed')
  const base = (fileName || 'photo').replace(/\.[^.]+$/, '')
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
}

export default function PhotoCropEditor({ image, fileName, index, total, onDone, onCancel }: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)

  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [aspectKey, setAspectKey] = useState('orig')
  const [naturalAspect, setNaturalAspect] = useState<number | undefined>(undefined)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), [])
  const onMediaLoaded = useCallback((m: { width: number; height: number }) => {
    setNaturalAspect(m.width && m.height ? m.width / m.height : 1)
  }, [])

  const chosen = ASPECTS.find((a) => a.key === aspectKey)
  const aspect = chosen?.ratio ?? naturalAspect ?? 1

  async function confirm() {
    if (!area || busy) return
    setBusy(true)
    try { onDone(await cropToFile(image, area, fileName)) }
    catch { onCancel() }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Header: cancel + optional counter */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onCancel} className="text-white/80 text-2xl leading-none w-9 h-9 flex items-center justify-center" aria-label={tr('Cancel', 'إلغاء', 'منسوخ')}>✕</button>
        <span className="text-white/70 text-sm font-medium">
          {tr('Crop', 'قص الصورة', 'تصویر کاٹیں')}{total && total > 1 ? `  ${index}/${total}` : ''}
        </span>
        <span className="w-9" />
      </div>

      {/* Crop surface */}
      <div className="flex-1 relative">
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          minZoom={1}
          maxZoom={4}
          restrictPosition
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          onMediaLoaded={onMediaLoaded}
        />
      </div>

      {/* Aspect chips */}
      <div className="flex gap-2 justify-center px-4 py-3 overflow-x-auto scrollbar-hide">
        {ASPECTS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => { setAspectKey(a.key); setZoom(1); setCrop({ x: 0, y: 0 }) }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${aspectKey === a.key ? 'bg-primary-500 text-white' : 'bg-white/15 text-white/80'}`}
          >
            {lang === 'en' ? a.en : a.ar}
          </button>
        ))}
      </div>

      {/* Confirm */}
      <div className="px-6 pb-[calc(var(--hai-safe-bottom,0px)+20px)] pt-1">
        <button
          onClick={confirm}
          disabled={busy || !area}
          className="w-full py-3.5 rounded-2xl bg-primary-500 text-white font-bold text-[15px] shadow-lg active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {busy ? tr('Processing…', 'جاري المعالجة…', 'پروسیسنگ…') : tr('Done', 'تم', 'مکمل')}
        </button>
      </div>
    </div>
  )
}
