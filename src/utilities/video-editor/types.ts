// Data model for the video editor: in-memory media (object URLs + the Blob for fast export) arranged on a timeline.

export const DEFAULT_WIDTH = 1280
export const DEFAULT_HEIGHT = 720
export type FitMode = 'cover' | 'contain'

// Even-integer canvas dimensions for an aspect ratio, longer side capped at `base`.
export function dimsForAspect(aspect: number, base = DEFAULT_WIDTH): { width: number; height: number } {
  if (!isFinite(aspect) || aspect <= 0) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  return aspect >= 1 ? { width: even(base), height: even(base / aspect) } : { width: even(base * aspect), height: even(base) }
}

/** Normalized (0..1) rectangle. */
export interface Rect { x: number; y: number; w: number; h: number }
export const FULL_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 }

/** A trimmed segment on the video track; clips play back-to-back in array order. */
export interface VideoClip {
  id: string
  name: string
  url: string
  file: Blob
  duration: number
  width: number
  height: number
  trimStart: number
  trimEnd: number
  muted: boolean
  volume: number
  /** Source crop, normalized to the source frame. */
  crop: Rect
  /** Centre offset from the canvas centre, normalized to canvas size. */
  tx: number
  ty: number
  /** Multiplier on top of the project fit (1 = fitted). */
  scale: number
}

export const clipLength = (c: VideoClip) => Math.max(0, c.trimEnd - c.trimStart)

export type OverlayType = 'text' | 'image' | 'color'
interface OverlayBase { id: string; type: OverlayType; start: number; duration: number; x: number; y: number; w: number; h: number }
export interface TextOverlay extends OverlayBase { type: 'text'; text: string; color: string; bg: string | null; fontScale: number; align: 'left' | 'center' | 'right'; bold: boolean }
export interface ImageOverlay extends OverlayBase { type: 'image'; name: string; url: string }
export interface ColorOverlay extends OverlayBase { type: 'color'; color: string; opacity: number }
export type Overlay = TextOverlay | ImageOverlay | ColorOverlay

/** Extra audio laid over the timeline; `trimStart` is the in-point inside the source. */
export interface AudioTrack {
  id: string
  name: string
  url: string
  file: Blob
  duration: number
  trimStart: number
  length: number
  start: number
  volume: number
  muted: boolean
}

export interface PlacedClip { clip: VideoClip; offset: number; length: number }

export function layoutClips(clips: VideoClip[]): PlacedClip[] {
  let offset = 0
  return clips.map((clip) => { const length = clipLength(clip), p = { clip, offset, length }; offset += length; return p })
}

export const totalDuration = (clips: VideoClip[]) => clips.reduce((s, c) => s + clipLength(c), 0)

// Clip showing at global time t and the matching source time; clamps the very end to the last frame.
export function clipAt(placed: PlacedClip[], t: number): { placed: PlacedClip; sourceTime: number } | null {
  for (const p of placed) if (t >= p.offset && t < p.offset + p.length) return { placed: p, sourceTime: p.clip.trimStart + (t - p.offset) }
  const last = placed[placed.length - 1]
  return last && t >= last.offset + last.length && last.length > 0 ? { placed: last, sourceTime: last.clip.trimEnd } : null
}

export const overlaysAt = (overlays: Overlay[], t: number) => overlays.filter((o) => t >= o.start && t < o.start + o.duration)

/** Where a clip's (cropped) source lands on the canvas, in canvas pixels. */
export interface Placement { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }

// Map a source frame of size (vw,vh) through the clip's crop, fit, scale and offset onto a cw×ch canvas.
export function placeClip(c: Pick<VideoClip, 'crop' | 'tx' | 'ty' | 'scale'>, vw: number, vh: number, cw: number, ch: number, fit: FitMode, crop = c.crop, ox = 0, oy = 0): Placement {
  const sw = vw * crop.w, sh = vh * crop.h
  const base = sw && sh ? (fit === 'cover' ? Math.max(cw / sw, ch / sh) : Math.min(cw / sw, ch / sh)) : 1
  const k = base * c.scale, dw = sw * k, dh = sh * k
  return { sx: vw * crop.x, sy: vh * crop.y, sw, sh, dx: ox + cw * (0.5 + c.tx) - dw / 2, dy: oy + ch * (0.5 + c.ty) - dh / 2, dw, dh }
}

// Crop-mode view: the whole source frame letterboxed into the canvas, ignoring position/scale, so every handle is reachable.
export const cropStage = (vw: number, vh: number, cw: number, ch: number) => placeClip({ crop: FULL_RECT, tx: 0, ty: 0, scale: 1 }, vw, vh, cw * 0.92, ch * 0.92, 'contain', FULL_RECT, cw * 0.04, ch * 0.04)

export const MIN_LEN = 0.1

// Largest centred crop of a vw×vh source with pixel aspect `r`.
export function cropForAspect(vw: number, vh: number, r: number): Rect {
  if (!vw || !vh || !r) return FULL_RECT
  const w = Math.min(1, (r * vh) / vw), h = Math.min(1, vw / (r * vh))
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}
