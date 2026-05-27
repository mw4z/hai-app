'use client'

import { useState, useRef, useCallback } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop, type Crop } from 'react-image-crop'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * General crop-before-upload editor used everywhere a photo is attached
 * (posts, comments, chat, directory, …) via CropHost / cropBridge.
 *
 * Free-form by default — the user drags the corners to ANY rectangle. Aspect
 * chips lock the ratio when wanted (الأصل = the photo's own ratio, 1:1, 4:5,
 * 16:9). Outputs a JPEG File (capped at 1600px on the long edge — the upload
 * pipeline re-compresses to 1200 anyway) ready for uploadFiles().
 */
interface Props {
  image: string          // object URL of the picked file
  fileName: string       // original name, for the output File
  index?: number         // 1-based position when cropping several in a row
  total?: number
  onDone: (file: File) => void
  onCancel: () => void
}

const ASPECTS: { key: string; ar: string; en: string; ratio: number | null | undefined }[] = [
  { key: 'free', ar: 'حر', en: 'Free', ratio: undefined },   // undefined → no lock (free crop)
  { key: 'orig', ar: 'الأصل', en: 'Original', ratio: null }, // null → the image's natural ratio
  { key: 'sq', ar: 'مربّع', en: '1:1', ratio: 1 },
  { key: 'p45', ar: '4:5', en: '4:5', ratio: 4 / 5 },
  { key: 'l169', ar: '16:9', en: '16:9', ratio: 16 / 9 },
]

const FULL: Crop = { unit: '%', x: 0, y: 0, width: 100, height: 100 }
const MAX_OUTPUT_EDGE = 1600
const OUTPUT_QUALITY = 0.9

export default function PhotoCropEditor({ image, fileName, index, total, onDone, onCancel }: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [aspect, setAspect] = useState<number | undefined>(undefined)
  const [aspectKey, setAspectKey] = useState('free')
  const [busy, setBusy] = useState(false)

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    imgRef.current = e.currentTarget
    setCrop(FULL) // start with the whole image selected (free)
  }, [])

  function chooseAspect(key: string, ratio: number | null | undefined) {
    setAspectKey(key)
    const img = imgRef.current
    if (ratio === undefined) {            // free — release the lock
      setAspect(undefined)
      setCrop(FULL)
      return
    }
    const r = ratio === null ? (img ? img.naturalWidth / img.naturalHeight : 1) : ratio
    setAspect(r)
    if (img) setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, r, img.width, img.height), img.width, img.height))
  }

  async function confirm() {
    const img = imgRef.current
    if (!img || !crop || busy) return
    setBusy(true)
    try {
      // crop (may be in %) → source pixels in the natural image
      const px = crop.unit === '%'
        ? { x: (crop.x / 100) * img.width, y: (crop.y / 100) * img.height, width: (crop.width / 100) * img.width, height: (crop.height / 100) * img.height }
        : crop
      const scaleX = img.naturalWidth / img.width
      const scaleY = img.naturalHeight / img.height
      const sx = px.x * scaleX, sy = px.y * scaleY
      const sw = Math.max(1, px.width * scaleX), sh = Math.max(1, px.height * scaleY)
      const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(sw, sh))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sw * scale))
      canvas.height = Math.max(1, Math.round(sh * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) { onCancel(); return }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/jpeg', OUTPUT_QUALITY))
      if (!blob) { onCancel(); return }
      const base = (fileName || 'photo').replace(/\.[^.]+$/, '')
      onDone(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }))
    } catch {
      onCancel()
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onCancel} className="text-white/80 text-2xl leading-none w-9 h-9 flex items-center justify-center" aria-label={tr('Cancel', 'إلغاء', 'منسوخ')}>✕</button>
        <span className="text-white/70 text-sm font-medium">
          {tr('Crop', 'قص الصورة', 'تصویر کاٹیں')}{total && total > 1 ? `  ${index}/${total}` : ''}
        </span>
        <span className="w-9" />
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-2 overflow-hidden">
        <ReactCrop
          crop={crop}
          onChange={(_, percent) => setCrop(percent)}
          aspect={aspect}
          minWidth={16}
          minHeight={16}
          keepSelection
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" onLoad={onImageLoad} style={{ maxHeight: '70vh', maxWidth: '100%', display: 'block' }} />
        </ReactCrop>
      </div>

      <div className="flex gap-2 justify-center px-4 py-3 overflow-x-auto scrollbar-hide">
        {ASPECTS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => chooseAspect(a.key, a.ratio)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${aspectKey === a.key ? 'bg-primary-500 text-white' : 'bg-white/15 text-white/80'}`}
          >
            {lang === 'en' ? a.en : a.ar}
          </button>
        ))}
      </div>

      <div className="px-6 pb-[calc(var(--hai-safe-bottom,0px)+20px)] pt-1">
        <button
          onClick={confirm}
          disabled={busy || !crop}
          className="w-full py-3.5 rounded-2xl bg-primary-500 text-white font-bold text-[15px] shadow-lg active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {busy ? tr('Processing…', 'جاري المعالجة…', 'پروسیسنگ…') : tr('Done', 'تم', 'مکمل')}
        </button>
      </div>
    </div>
  )
}
