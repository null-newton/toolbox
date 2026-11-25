// Full-resolution render of one photo (used by the export worker, and on the
// main thread as a fallback when OffscreenCanvas isn't available).
import { createRenderer, type Dev } from './develop.ts'

export type OutputFormat = 'jpeg' | 'webp' | 'png'

export async function renderFile(file: Blob, dev: Dev, format: OutputFormat, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { width, height } = bitmap
  const offscreen = typeof OffscreenCanvas !== 'undefined'
  const canvas = offscreen ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height })
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new Error('canvas-unavailable')
  if (format === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height) }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const image = ctx.getImageData(0, 0, width, height)
  createRenderer(dev)(image.data, width, height)
  ctx.putImageData(image, 0, 0)
  const type = `image/${format}`
  const q = format === 'png' ? undefined : quality / 100
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality: q })
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export-failed'))), type, q))
}
