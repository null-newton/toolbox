import { functionsBase } from '../../lib/supabase'
import type { LatLon } from './solar'

const TILE = 256
const MAX_TILE_ZOOM = 19
const MAX_TILE_COUNT = 64
const MAX_SOURCE_EDGE = 768
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile'

export interface TextureBounds {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export interface ComposedTexture {
  blob: Blob
  image: HTMLImageElement
  bounds: TextureBounds
  width: number
  height: number
}

interface CreateJobResponse {
  job: { id: string }
  uploadToken: string
}

const lonToWorldX = (lon: number, zoom: number) => ((lon + 180) / 360) * TILE * 2 ** zoom
const latToWorldY = (lat: number, zoom: number) => {
  const s = Math.sin((lat * Math.PI) / 180)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** zoom
}

function boundsFor(area: LatLon[]): TextureBounds {
  return {
    minLat: Math.min(...area.map((p) => p.lat)),
    maxLat: Math.max(...area.map((p) => p.lat)),
    minLon: Math.min(...area.map((p) => p.lon)),
    maxLon: Math.max(...area.map((p) => p.lon)),
  }
}

function loadImage(url: string, cors = true, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (cors) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load satellite imagery.'))
    image.src = url
    signal?.addEventListener(
      'abort',
      () => {
        image.src = ''
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare map texture.'))), 'image/png')
  )
}

/** Composes only the selected area's satellite tile bounds at Esri's maximum zoom. */
export async function composeSatelliteTexture(area: LatLon[], signal?: AbortSignal): Promise<ComposedTexture> {
  const bounds = boundsFor(area)
  let tileZoom = MAX_TILE_ZOOM
  let left = 0
  let right = 0
  let top = 0
  let bottom = 0
  while (tileZoom >= 3) {
    left = lonToWorldX(bounds.minLon, tileZoom)
    right = lonToWorldX(bounds.maxLon, tileZoom)
    top = latToWorldY(bounds.maxLat, tileZoom)
    bottom = latToWorldY(bounds.minLat, tileZoom)
    const columns = Math.floor((right - 1e-6) / TILE) - Math.floor(left / TILE) + 1
    const rows = Math.floor((bottom - 1e-6) / TILE) - Math.floor(top / TILE) + 1
    if (columns * rows <= MAX_TILE_COUNT) break
    tileZoom--
  }
  const naturalWidth = Math.max(1, right - left)
  const naturalHeight = Math.max(1, bottom - top)
  const maximumScale = MAX_SOURCE_EDGE / Math.max(naturalWidth, naturalHeight)
  const minimumUsefulScale = 64 / Math.max(1, Math.min(naturalWidth, naturalHeight))
  const scale = Math.min(maximumScale, Math.max(1, minimumUsefulScale))
  const width = Math.max(1, Math.ceil(naturalWidth * scale))
  const height = Math.max(1, Math.ceil(naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const x0 = Math.floor(left / TILE)
  const x1 = Math.floor((right - 1e-6) / TILE)
  const y0 = Math.floor(top / TILE)
  const y1 = Math.floor((bottom - 1e-6) / TILE)
  const tiles: Promise<void>[] = []
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      tiles.push(
        loadImage(`${ESRI}/${tileZoom}/${y}/${x}`, true, signal).then((image) => {
          ctx.drawImage(image, (x * TILE - left) * scale, (y * TILE - top) * scale, TILE * scale + 1, TILE * scale + 1)
        })
      )
    }
  }
  await Promise.all(tiles)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const blob = await canvasBlob(canvas)
  const url = URL.createObjectURL(blob)
  try {
    const image = await loadImage(url, false, signal)
    return { blob, image, bounds, width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function json<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok || payload.error) throw new Error(payload.error || `Request failed (${response.status}).`)
  return payload
}

/** Runs the composed satellite crop through the same Real-ESRGAN 4× service as the image upscaler utility. */
export async function upscaleSatelliteTexture(source: ComposedTexture, signal?: AbortSignal): Promise<HTMLImageElement> {
  const created = await json<CreateJobResponse>(
    await fetch(`${functionsBase}/image-upscaler?action=create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'solar-site.png',
        size: source.blob.size,
        mimeType: 'image/png',
        scale: 4,
        model: 'photo',
        format: 'png',
      }),
      signal,
    })
  )
  const uploaded = await json<{ job: { id: string } }>(
    await fetch(`${functionsBase}/image-upscaler?action=upload&id=${encodeURIComponent(created.job.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'X-Upscale-Token': created.uploadToken },
      body: source.blob,
      signal,
    })
  )
  const resultUrl = `${functionsBase}/image-upscaler?action=result&id=${encodeURIComponent(uploaded.job.id)}`
  try {
    return await loadImage(resultUrl, true, signal)
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    // The result endpoint may allow display but omit a canvas CORS header.
    // Drawing without anonymous mode still works; only canvas export is tainted.
    return loadImage(resultUrl, false, signal)
  }
}
