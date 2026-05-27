'use client'

import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { registerCropHandler } from '@/lib/cropBridge'

const PhotoCropEditor = lazy(() => import('@/components/PhotoCropEditor'))

interface Job {
  url: string
  name: string
  index: number
  total: number
}

/**
 * Mounted once in the root layout. Registers the global crop handler so any
 * call site can `await cropFile(file)` / `cropFiles(files)` and get back the
 * cropped File. Renders the editor over everything while a crop is pending;
 * requests are handled one at a time (cropFiles awaits each in sequence).
 */
export default function CropHost() {
  const [job, setJob] = useState<Job | null>(null)
  const resolverRef = useRef<((f: File | null) => void) | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    registerCropHandler((file, meta) =>
      new Promise<File | null>((resolve) => {
        const url = URL.createObjectURL(file)
        urlRef.current = url
        resolverRef.current = resolve
        setJob({ url, name: file.name, index: meta.index, total: meta.total })
      }),
    )
    return () => registerCropHandler(null)
  }, [])

  const finish = (result: File | null) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    setJob(null)
    resolve?.(result)
  }

  if (!job) return null
  return (
    <Suspense fallback={null}>
      <PhotoCropEditor
        image={job.url}
        fileName={job.name}
        index={job.index}
        total={job.total}
        onDone={(f) => finish(f)}
        onCancel={() => finish(null)}
      />
    </Suspense>
  )
}
