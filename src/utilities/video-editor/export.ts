/**
 * Realtime exporter — the fallback path. `export-fast.ts` has a much faster
 * offline encoder (WebCodecs) that is tried first; this module runs only when
 * the browser lacks WebCodecs or a usable codec. Here we render the timeline in
 * real time to an offscreen canvas, mix all audio through a Web Audio graph,
 * capture both as a MediaStream and record it with MediaRecorder. A 1-minute
 * timeline therefore takes ~1 minute to export.
 *
 * Audio mixing: every clip and every extra audio track gets its own offscreen
 * media element routed through a GainNode into one MediaStreamDestination. The
 * TimelineDriver pauses inactive clips, so only the audio that should be
 * sounding reaches the mix. These elements are separate from the preview ones
 * (a MediaElementAudioSourceNode permanently reroutes an element's audio), and
 * are never connected to the speakers — export is silent to the user.
 */
import { TimelineDriver, syncAudioElements } from './engine'
import { drawFrame, type ActiveOverlay } from './render'
import {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  overlaysAt,
  totalDuration,
  type AudioTrack,
  type FitMode,
  type Overlay,
  type VideoClip,
} from './types'

export type ClipFormat = 'webm' | 'mp4'

const WEBM_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
const MP4_CANDIDATES = ['video/mp4;codecs=h264,aac', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']

function firstSupported(candidates: string[]): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null
}

export function pickRecorderMime(prefer: ClipFormat = 'mp4'): string | null {
  const order =
    prefer === 'mp4' ? [MP4_CANDIDATES, WEBM_CANDIDATES] : [WEBM_CANDIDATES, MP4_CANDIDATES]
  for (const list of order) {
    const m = firstSupported(list)
    if (m) return m
  }
  return null
}

export function supportedFormats(): Record<ClipFormat, boolean> {
  return {
    webm: firstSupported(WEBM_CANDIDATES) !== null,
    mp4: firstSupported(MP4_CANDIDATES) !== null,
  }
}

export function recorderSupported(): boolean {
  return pickRecorderMime() !== null
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function loadVideo(url: string, container: HTMLElement): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('video')
    el.src = url
    el.preload = 'auto'
    el.playsInline = true
    el.muted = false
    el.volume = 1
    el.crossOrigin = 'anonymous'
    el.onloadeddata = () => resolve(el)
    el.onerror = () => reject(new Error('Could not load a video clip for export'))
    container.appendChild(el)
    el.load()
  })
}

function loadAudio(url: string, container: HTMLElement): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('audio')
    el.src = url
    el.preload = 'auto'
    el.crossOrigin = 'anonymous'
    el.onloadeddata = () => resolve(el)
    el.onerror = () => reject(new Error('Could not load an audio track for export'))
    container.appendChild(el)
    el.load()
  })
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load an image overlay for export'))
    img.src = url
  })
}

export interface ExportOptions {
  fps?: number
  format?: ClipFormat
  /** Output canvas size; defaults to 1280×720. */
  width?: number
  height?: number
  /** How clips fill the canvas; defaults to contain (letterbox). */
  fit?: FitMode
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/**
 * Render + record the whole timeline. Returns the encoded blob and the file
 * extension to use.
 */
export async function exportTimeline(
  clips: VideoClip[],
  overlays: Overlay[],
  audioTracks: AudioTrack[],
  opts: ExportOptions = {}
): Promise<{ blob: Blob; ext: string }> {
  const total = totalDuration(clips)
  if (total <= 0) throw new Error('Add at least one video clip before exporting.')

  const mime = pickRecorderMime(opts.format)
  if (!mime) throw new Error('This browser can’t record video (MediaRecorder unavailable).')

  const fps = opts.fps ?? 30
  const outW = opts.width ?? DEFAULT_WIDTH
  const outH = opts.height ?? DEFAULT_HEIGHT
  const fit = opts.fit ?? 'contain'

  // Hidden pool of media elements used only for this export.
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden'
  document.body.appendChild(container)

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    container.remove()
    throw new Error('Canvas 2D context unavailable')
  }

  const AudioCtor: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const audioCtx = new AudioCtor()
  const dest = audioCtx.createMediaStreamDestination()

  const videoEls = new Map<string, HTMLVideoElement>()
  const audioEls = new Map<string, HTMLMediaElement>()
  const images = new Map<string, HTMLImageElement>()

  const cleanup = () => {
    container.remove()
    audioCtx.close().catch(() => {})
  }

  try {
    // Load every source up front so seeking/decoding is ready.
    await Promise.all(
      clips.map(async (c) => {
        const el = await loadVideo(c.url, container)
        videoEls.set(c.id, el)
        const node = audioCtx.createMediaElementSource(el)
        const gain = audioCtx.createGain()
        gain.gain.value = c.muted ? 0 : c.volume
        node.connect(gain).connect(dest)
      })
    )
    await Promise.all(
      audioTracks.map(async (tr) => {
        const el = await loadAudio(tr.url, container)
        audioEls.set(tr.id, el)
        const node = audioCtx.createMediaElementSource(el)
        const gain = audioCtx.createGain()
        gain.gain.value = tr.muted ? 0 : tr.volume
        node.connect(gain).connect(dest)
      })
    )
    await Promise.all(
      overlays
        .filter((o): o is Extract<Overlay, { type: 'image' }> => o.type === 'image')
        .map(async (o) => {
          images.set(o.id, await loadImage(o.url))
        })
    )

    await audioCtx.resume().catch(() => {})

    const stream = canvas.captureStream(fps) as MediaStream & {
      addTrack: (t: MediaStreamTrack) => void
    }
    for (const track of dest.stream.getAudioTracks()) stream.addTrack(track)

    const recorder = new MediaRecorder(stream, { mimeType: mime })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const driver = new TimelineDriver(clips, videoEls)

    return await new Promise<{ blob: Blob; ext: string }>((resolve, reject) => {
      let rafId = 0
      let finished = false

      const stop = () => {
        cancelAnimationFrame(rafId)
        driver.pause()
        for (const el of audioEls.values()) if (!el.paused) el.pause()
        opts.signal?.removeEventListener('abort', onAbort)
      }

      const finish = () => {
        if (finished) return
        finished = true
        stop()
        if (recorder.state !== 'inactive') recorder.stop()
      }

      const onAbort = () => {
        stop()
        if (recorder.state !== 'inactive') recorder.stop()
        cleanup()
        reject(new DOMException('Export cancelled', 'AbortError'))
      }
      opts.signal?.addEventListener('abort', onAbort)

      recorder.onstop = () => {
        if (!finished) return // abort path already rejected
        cleanup()
        const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm'
        resolve({ blob: new Blob(chunks, { type: mime }), ext })
      }
      recorder.onerror = () => {
        stop()
        cleanup()
        reject(new Error('Recording failed'))
      }

      const tick = () => {
        const frame = driver.update()
        const playhead = driver.playhead
        syncAudioElements(audioTracks, audioEls, playhead, true)

        const active: ActiveOverlay[] = overlaysAt(overlays, playhead).map((o) => ({
          overlay: o,
          image: o.type === 'image' ? images.get(o.id) ?? null : null,
        }))
        drawFrame(ctx, outW, outH, frame, active, fit)

        opts.onProgress?.(Math.min(1, playhead / total))

        if (playhead >= total - 1e-3) {
          opts.onProgress?.(1)
          finish()
          return
        }
        rafId = requestAnimationFrame(tick)
      }

      recorder.start()
      driver.play()
      driver.seek(0)
      rafId = requestAnimationFrame(tick)
    })
  } catch (err) {
    cleanup()
    throw err
  }
}
