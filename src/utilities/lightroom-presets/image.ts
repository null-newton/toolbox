// Image helpers shared by the studio and editor (decode, downscale, live canvas rendering, download).
import { useEffect, useRef } from 'react'
import { createRenderer, type Dev } from './develop'

export async function decodeImage(file: Blob, max: number): Promise<ImageData> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return ctx.getImageData(0, 0, w, h)
}

/** Downscale already-decoded pixels (used for the tiny preset-strip tiles). */
export function shrink(source: ImageData, max: number): ImageData {
  const scale = Math.min(1, max / Math.max(source.width, source.height))
  if (scale === 1) return source
  const a = document.createElement('canvas')
  a.width = source.width; a.height = source.height
  a.getContext('2d')!.putImageData(source, 0, 0)
  const b = document.createElement('canvas')
  b.width = Math.max(1, Math.round(source.width * scale)); b.height = Math.max(1, Math.round(source.height * scale))
  const ctx = b.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(a, 0, 0, b.width, b.height)
  return ctx.getImageData(0, 0, b.width, b.height)
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/**
 * Draws `source` through `dev` onto a canvas, coalescing rapid updates into
 * one frame. Fires a `rendered` event on the canvas afterwards (the zoom
 * bubble listens for it).
 */
export function useRendered(source: ImageData | null, dev: Dev | null, delay = 0) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !source) return
    let frame = 0
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(() => {
        if (canvas.width !== source.width) canvas.width = source.width
        if (canvas.height !== source.height) canvas.height = source.height
        const out = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height)
        if (dev) createRenderer(dev)(out.data, out.width, out.height)
        canvas.getContext('2d')!.putImageData(out, 0, 0)
        canvas.dispatchEvent(new Event('rendered'))
      })
    }, delay)
    return () => { clearTimeout(timer); cancelAnimationFrame(frame) }
  }, [source, dev, delay])
  return ref
}
