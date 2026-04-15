/**
 * Image picker that respects the app language on iOS/Android.
 *
 * The native file input `<input type="file">` triggers a system
 * action sheet that uses the phone's OS language — you can't force
 * it to Arabic when the app is Arabic and the phone is English.
 *
 * Capacitor's Camera plugin exposes its own prompt whose labels we
 * CAN localize. On native, we use that. On web, we fall back to the
 * normal file input (no language mismatch in browsers).
 *
 * Returns a File object ready to be fed into upload pipelines, or
 * null if the user cancelled / there was an error we've already
 * toasted about.
 */

const MAX_SIZE_MB = 10

export interface ImagePickerLabels {
  header?: string
  cancel?: string
  photo?: string // choose from library
  picture?: string // take photo
  sizeTooLarge?: string
  notImage?: string
}

function isNative(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as any).Capacitor?.isNativePlatform?.()
  )
}

function arabicLabels(): ImagePickerLabels {
  return {
    header: 'اختر صورة',
    cancel: 'إلغاء',
    photo: 'من المكتبة',
    picture: 'التقاط صورة',
    sizeTooLarge: 'الحجم الأقصى 10 ميقا',
    notImage: 'صور فقط',
  }
}

function englishLabels(): ImagePickerLabels {
  return {
    header: 'Choose image',
    cancel: 'Cancel',
    photo: 'From Library',
    picture: 'Take Photo',
    sizeTooLarge: 'Max 10MB',
    notImage: 'Images only',
  }
}

function urduLabels(): ImagePickerLabels {
  return {
    header: 'تصویر منتخب کریں',
    cancel: 'منسوخ',
    photo: 'لائبریری سے',
    picture: 'تصویر لیں',
    sizeTooLarge: 'زیادہ سے زیادہ 10MB',
    notImage: 'صرف تصاویر',
  }
}

function labelsFor(lang: 'ar' | 'en' | 'ur'): ImagePickerLabels {
  if (lang === 'en') return englishLabels()
  if (lang === 'ur') return urduLabels()
  return arabicLabels()
}

/**
 * Pick an image and return it as a File.
 *
 * On native: uses Capacitor Camera plugin's prompt with Arabic/EN/UR
 * labels to match app language.
 *
 * On web: throws 'web_unsupported' — callers should use a native file
 * input instead.
 */
export async function pickImageFile(
  lang: 'ar' | 'en' | 'ur' = 'ar',
): Promise<File> {
  const labels = labelsFor(lang)

  if (!isNative()) {
    throw new Error('web_unsupported')
  }

  // Dynamic import so web bundles don't pull in the plugin
  const { Camera, CameraResultType, CameraSource } = await import(
    '@capacitor/camera'
  )

  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: CameraResultType.Base64,
    source: CameraSource.Prompt,
    promptLabelHeader: labels.header,
    promptLabelCancel: labels.cancel,
    promptLabelPhoto: labels.photo,
    promptLabelPicture: labels.picture,
    correctOrientation: true,
  })

  if (!photo.base64String) {
    throw new Error('no_image')
  }

  const mime =
    photo.format === 'png'
      ? 'image/png'
      : photo.format === 'webp'
        ? 'image/webp'
        : 'image/jpeg'

  // Convert base64 → Uint8Array → File
  const byteString = atob(photo.base64String)
  const bytes = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i)

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  const file = new File([bytes], `photo-${Date.now()}.${ext}`, { type: mime })

  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error('size_too_large')
  }
  return file
}

/**
 * Thin wrapper that chooses between native picker and web file input.
 * Callers pass a file input element ref as the fallback for web.
 */
export async function pickImageOrFallback(
  lang: 'ar' | 'en' | 'ur',
  webInputRef: { current: HTMLInputElement | null },
): Promise<File | null> {
  if (isNative()) {
    try {
      return await pickImageFile(lang)
    } catch (err: any) {
      if (
        err?.message === 'User cancelled photos app' ||
        err?.message === 'no_image' ||
        err?.message?.toLowerCase?.().includes('cancel')
      ) {
        return null
      }
      console.warn('[imagePicker] native failed, falling back to web input:', err)
    }
  }
  webInputRef.current?.click()
  return null
}

/**
 * Pick multiple images from the photo library.
 *
 * Uses Capacitor Camera's pickImages() on native which goes directly
 * to the OS photo library (bypasses the English "Photo Library/Take
 * Photo/Choose File" intermediate sheet). The photo picker UI itself
 * is iOS/Android native and uses system locale, but at least the
 * English intermediate sheet is gone.
 *
 * Returns [] on cancel or web. Web callers should fall back to the
 * file input via the webInputRef pattern.
 */
async function imageUrlToJpegFile(src: string, index: number): Promise<File> {
  // Load the image through an <img> tag. On iOS 14+ WKWebView decodes
  // HEIC natively, so we can then draw onto a canvas and re-export as
  // JPEG — guaranteeing a MIME type our upload pipeline accepts.
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = src
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.drawImage(img, 0, 0)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88),
  )
  if (!blob) throw new Error('canvas_export_failed')

  return new File([blob], `photo-${Date.now()}-${index}.jpg`, {
    type: 'image/jpeg',
  })
}

export async function pickImageFilesMulti(
  limit: number,
): Promise<File[]> {
  if (!isNative()) {
    throw new Error('web_unsupported')
  }

  const { Camera } = await import('@capacitor/camera')

  const result = await Camera.pickImages({
    quality: 85,
    limit,
    correctOrientation: true,
  })

  if (!result?.photos || result.photos.length === 0) return []

  const files: File[] = []
  for (let i = 0; i < result.photos.length; i++) {
    const photo = result.photos[i]
    try {
      const file = await imageUrlToJpegFile(photo.webPath, i)
      if (file.size <= MAX_SIZE_MB * 1024 * 1024) {
        files.push(file)
      }
    } catch (err) {
      console.warn('[imagePicker] failed to decode photo:', err)
    }
  }
  return files
}

/**
 * Multi-image variant of pickImageOrFallback.
 *
 * On native: opens the photo library directly via Camera.pickImages()
 *            (no English intermediate sheet).
 * On web:    triggers the hidden multi-capable <input type="file"> ref.
 */
export async function pickImagesOrFallback(
  limit: number,
  webInputRef: { current: HTMLInputElement | null },
): Promise<File[]> {
  if (isNative()) {
    try {
      return await pickImageFilesMulti(limit)
    } catch (err: any) {
      if (
        err?.message?.toLowerCase?.().includes('cancel') ||
        err?.message === 'no_image'
      ) {
        return []
      }
      console.warn(
        '[imagePicker] native multi failed, falling back to web input:',
        err,
      )
    }
  }
  webInputRef.current?.click()
  return []
}
