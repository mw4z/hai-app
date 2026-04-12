import toast from 'react-hot-toast'

/**
 * Save an image to the user's device.
 * Uses Capacitor Filesystem + Share on native, falls back to Web Share API or download on web.
 */
export async function saveImageToDevice(imageUrl: string, lang: string = 'ar') {
  const msgSuccess = lang === 'en' ? 'Saved' : 'تم الحفظ'
  const msgFail = lang === 'en' ? 'Save failed' : 'فشل الحفظ'

  try {
    // Fetch the image as a blob
    const res = await fetch(imageUrl)
    const blob = await res.blob()

    // Check if we're running inside Capacitor
    const isCapacitor = typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()

    if (isCapacitor) {
      // Native: write to cache then share — iOS share sheet will show "Save Image"
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const { Share } = await import('@capacitor/share')

      const base64 = await blobToBase64(blob)
      const filename = `hai-${Date.now()}.jpg`

      const saved = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      })

      await Share.share({
        url: saved.uri,
        dialogTitle: lang === 'en' ? 'Save image' : 'حفظ الصورة',
      })
      return
    }

    // Web fallback: Web Share API
    const file = new File([blob], 'hai-image.jpg', { type: blob.type || 'image/jpeg' })
    const nav: any = navigator
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file] })
      return
    }

    // Final fallback: trigger download
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hai-image.jpg'
    a.click()
    URL.revokeObjectURL(url)
    toast.success(msgSuccess)
  } catch (err) {
    console.error('[saveImage]', err)
    toast.error(msgFail)
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Strip the data URL prefix — Filesystem expects raw base64
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
