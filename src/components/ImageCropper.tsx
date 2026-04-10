'use client'

import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { useLanguage } from '@/hooks/useLanguage'

interface Props {
  image: string
  aspect: number // 1 for avatar, 800/300 for cover
  outputWidth: number
  outputHeight: number
  onDone: (base64: string) => void
  onCancel: () => void
}

function getCroppedImg(imageSrc: string, crop: Area, outW: number, outH: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, outW, outH)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = imageSrc
  })
}

export default function ImageCropper({ image, aspect, outputWidth, outputHeight, onDone, onCancel }: Props) {
  const { lang } = useLanguage()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedArea(croppedPixels)
  }, [])

  async function handleConfirm() {
    if (!croppedArea) return
    const result = await getCroppedImg(image, croppedArea, outputWidth, outputHeight)
    onDone(result)
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Crop area */}
      <div className="flex-1 relative">
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      {/* Controls */}
      <div className="bg-black px-6 py-5 flex items-center justify-between gap-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        <button
          onClick={onCancel}
          className="px-6 py-3 rounded-xl text-white/70 font-medium text-sm"
        >
          {lang === 'en' ? 'Cancel' : 'إلغاء'}
        </button>

        <button
          onClick={handleConfirm}
          className="px-8 py-3 rounded-xl bg-primary-500 text-white font-bold text-sm shadow-lg"
        >
          {lang === 'en' ? 'Confirm' : 'تأكيد'}
        </button>
      </div>
    </div>
  )
}
