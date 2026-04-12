import toast from 'react-hot-toast'

/**
 * Save an image to the user's device.
 * Tries progressively: Capacitor Filesystem+Share → Capacitor Share URL → Web Share API → download.
 */
export async function saveImageToDevice(imageUrl: string, lang: string = 'ar') {
  const msgSuccess = lang === 'en' ? 'Saved' : 'تم الحفظ'
  const msgFail = lang === 'en' ? 'Save failed' : 'فشل الحفظ'

  const cap = (window as any).Capacitor
  const isCapacitor = typeof cap !== 'undefined' && cap?.isNativePlatform?.()

  // Step 1: Native Filesystem + Share (best — triggers "Save Image")
  if (isCapacitor && cap?.isPluginAvailable?.('Filesystem')) {
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const base64 = await blobToBase64(blob)
      const filename = `hai-${Date.now()}.jpg`

      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const { Share } = await import('@capacitor/share')

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
    } catch (err) {
      console.error('[saveImage] filesystem failed, falling back', err)
    }
  }

  // Step 2: Capacitor Share with image URL (works in current native build)
  if (isCapacitor && cap?.isPluginAvailable?.('Share')) {
    try {
      const { Share } = await import('@capacitor/share')
      await Share.share({
        url: imageUrl,
        dialogTitle: lang === 'en' ? 'Save image' : 'حفظ الصورة',
      })
      return
    } catch (err) {
      console.error('[saveImage] share URL failed', err)
    }
  }

  // Step 3: Web Share API
  try {
    const res = await fetch(imageUrl)
    const blob = await res.blob()
    const file = new File([blob], 'hai-image.jpg', { type: blob.type || 'image/jpeg' })
    const nav: any = navigator
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file] })
      return
    }

    // Step 4: Browser download fallback
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
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
