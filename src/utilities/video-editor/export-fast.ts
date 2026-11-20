/**
 * Offline (faster-than-realtime) exporter built on WebCodecs.
 *
 * Each output frame is rendered as fast as the machine allows and fed to a
 * hardware VideoEncoder; audio is decoded per segment, mixed in one shot via an
 * OfflineAudioContext and run through an AudioEncoder; chunks are muxed with
 * mp4-muxer / webm-muxer.
 *
 * Frame sourcing: each clip's file is demuxed + decoded sequentially with
 * mediabunny (WebCodecs VideoDecoder), so every packet is decoded once instead
 * of seeking a <video> element per frame. Clips mediabunny can't read fall back
 * to element seeking. Frames go through the same drawFrame() as the preview.
 *
 * Throws FastExportUnsupportedError when the browser lacks WebCodecs or a
 * usable codec, so the caller can fall back to realtime MediaRecorder export.
 */
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input, VideoSampleSink, type InputAudioTrack } from 'mediabunny'
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer'
import { Muxer as WebMMuxer, ArrayBufferTarget as WebMTarget } from 'webm-muxer'
import { loadImage, loadVideo, type ClipFormat, type ExportOptions } from './export'
import { drawFrame, type VideoLayer } from './render'
import { DEFAULT_HEIGHT, DEFAULT_WIDTH, layoutClips, overlaysAt, totalDuration, type AudioTrack, type Overlay, type PlacedClip, type VideoClip } from './types'

/** Thrown when the fast path can't run; the caller should use the realtime exporter. */
export class FastExportUnsupportedError extends Error {
  constructor(message = 'WebCodecs offline export is not available in this browser') {
    super(message)
    this.name = 'FastExportUnsupportedError'
  }
}

const SAMPLE_RATE = 48_000
const AUDIO_BITRATE = 160_000

/** True when this browser exposes the WebCodecs + OfflineAudioContext we need. */
export function fastExportSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof AudioData !== 'undefined' &&
    typeof EncodedVideoChunk !== 'undefined' &&
    (typeof OfflineAudioContext !== 'undefined' ||
      typeof (window as unknown as { webkitOfflineAudioContext?: unknown }).webkitOfflineAudioContext !==
        'undefined')
  )
}

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2)

// Prefer the hardware encoder (fastest steady-state); fall back to whatever the browser picks.
async function supportedVideo(cfg: VideoEncoderConfig): Promise<VideoEncoderConfig | null> {
  for (const c of [{ ...cfg, hardwareAcceleration: 'prefer-hardware' as const }, cfg]) if ((await VideoEncoder.isConfigSupported(c).catch(() => ({ supported: false }))).supported) return c
  return null
}

function videoBitrate(w: number, h: number, fps: number): number {
  return Math.min(16_000_000, Math.max(1_000_000, Math.round(w * h * fps * 0.12)))
}

interface ResolvedConfig {
  ext: 'mp4' | 'webm'
  mime: string
  video: VideoEncoderConfig
  audio: AudioEncoderConfig
  /** Codec id as the matching muxer expects it. */
  muxerVideoCodec: string
  muxerAudioCodec: string
}

/**
 * Pick a VideoEncoder + AudioEncoder config the browser actually supports for
 * the preferred container, falling back to the other container. Returns null
 * when neither can be configured.
 */
async function resolveConfig(
  prefer: ClipFormat,
  w: number,
  h: number,
  fps: number
): Promise<ResolvedConfig | null> {
  const bitrate = videoBitrate(w, h, fps)

  const tryMp4 = async (): Promise<ResolvedConfig | null> => {
    const audio: AudioEncoderConfig = {
      codec: 'mp4a.40.2',
      sampleRate: SAMPLE_RATE,
      numberOfChannels: 2,
      bitrate: AUDIO_BITRATE,
    }
    if (!(await AudioEncoder.isConfigSupported(audio)).supported) return null
    // High → Main → Baseline, highest level first; isConfigSupported rejects
    // codecs whose level is too low for the requested resolution.
    for (const codec of ['avc1.640034', 'avc1.640028', 'avc1.4d4028', 'avc1.42e01f']) {
      const video: VideoEncoderConfig = {
        codec,
        width: w,
        height: h,
        bitrate,
        framerate: fps,
        avc: { format: 'avc' },
      }
      const ok = await supportedVideo(video)
      if (ok) {
        return {
          ext: 'mp4',
          mime: 'video/mp4',
          video: ok,
          audio,
          muxerVideoCodec: 'avc',
          muxerAudioCodec: 'aac',
        }
      }
    }
    return null
  }

  const tryWebm = async (): Promise<ResolvedConfig | null> => {
    const audio: AudioEncoderConfig = {
      codec: 'opus',
      sampleRate: SAMPLE_RATE,
      numberOfChannels: 2,
      bitrate: AUDIO_BITRATE,
    }
    if (!(await AudioEncoder.isConfigSupported(audio)).supported) return null
    const candidates: Array<{ codec: string; muxer: string }> = [
      { codec: 'vp09.00.51.08', muxer: 'V_VP9' },
      { codec: 'vp09.00.41.08', muxer: 'V_VP9' },
      { codec: 'vp09.00.31.08', muxer: 'V_VP9' },
      { codec: 'vp09.00.10.08', muxer: 'V_VP9' },
      { codec: 'vp8', muxer: 'V_VP8' },
    ]
    for (const { codec, muxer } of candidates) {
      const ok = await supportedVideo({ codec, width: w, height: h, bitrate, framerate: fps })
      if (ok) {
        return {
          ext: 'webm',
          mime: 'video/webm',
          video: ok,
          audio,
          muxerVideoCodec: muxer,
          muxerAudioCodec: 'A_OPUS',
        }
      }
    }
    return null
  }

  const order = prefer === 'webm' ? [tryWebm, tryMp4] : [tryMp4, tryWebm]
  for (const attempt of order) {
    const cfg = await attempt()
    if (cfg) return cfg
  }
  return null
}


// Seek a media element and resolve once the frame at `time` is ready (fallback path).
function seekTo(el: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.max(0, time)
    if (el.readyState >= 2 && Math.abs(el.currentTime - target) < 1e-3) return resolve()
    let done = false
    const finish = () => { if (done) return; done = true; el.removeEventListener('seeked', finish); clearTimeout(timer); resolve() }
    const timer = setTimeout(finish, 3000)
    el.addEventListener('seeked', finish)
    try { el.currentTime = target } catch { finish() }
  })
}

// Wait for the encoder queue to drain to `target` (dequeue event where supported, else timer polling).
const drainTo = (enc: VideoEncoder | AudioEncoder, target: number) => new Promise<void>((resolve) => {
  if (enc.encodeQueueSize <= target) return resolve()
  if ('ondequeue' in enc) { const on = () => { if (enc.encodeQueueSize <= target) { enc.removeEventListener('dequeue', on); resolve() } }; enc.addEventListener('dequeue', on); return }
  const e: { encodeQueueSize: number } = enc, check = () => (e.encodeQueueSize <= target ? resolve() : setTimeout(check, 0)); check()
})

// One mediabunny Input per source Blob (split clips share a file).
class Sources {
  private map = new Map<Blob, Promise<Input | null>>()
  get(file: Blob) {
    let p = this.map.get(file)
    if (!p) { p = (async () => { try { const i = new Input({ source: new BlobSource(file), formats: ALL_FORMATS }); return (await i.canRead()) ? i : null } catch { return null } })(); this.map.set(file, p) }
    return p
  }
  async dispose() { for (const p of this.map.values()) (await p)?.dispose() }
}

// Decode [from, from+len) of a file's audio into one AudioBuffer; null = no audio track, undefined = could not decode.
async function decodeRange(src: Sources, file: Blob, from: number, len: number, ctx: BaseAudioContext): Promise<AudioBuffer | null | undefined> {
  const input = await src.get(file)
  let track: InputAudioTrack | null = null
  if (input) { try { track = await input.getPrimaryAudioTrack() } catch { track = null } }
  if (input && !track) return null
  if (track && (await track.canDecode().catch(() => false))) {
    try {
      const chunks: AudioBuffer[] = []
      let first = -1
      for await (const wb of new AudioBufferSink(track).buffers(from, from + len)) { if (first < 0) first = wb.timestamp; chunks.push(wb.buffer) }
      if (!chunks.length) return null
      const rate = chunks[0].sampleRate, chs = chunks[0].numberOfChannels, skip = Math.max(0, Math.round((from - first) * rate))
      const total = chunks.reduce((n, b) => n + b.length, 0), out = ctx.createBuffer(chs, Math.max(1, Math.min(total - skip, Math.ceil(len * rate))), rate)
      for (let c = 0; c < chs; c++) {
        const dst = out.getChannelData(c)
        let pos = -skip
        for (const b of chunks) {
          const d = b.getChannelData(Math.min(c, b.numberOfChannels - 1))
          if (pos + d.length > 0 && pos < dst.length) dst.set(d.subarray(Math.max(0, -pos), Math.min(d.length, dst.length - pos)), Math.max(0, pos))
          pos += d.length
        }
      }
      return out
    } catch { /* fall through to decodeAudioData */ }
  }
  try {
    const full = await ctx.decodeAudioData(await file.arrayBuffer()), rate = full.sampleRate, s0 = Math.floor(from * rate), n = Math.max(1, Math.min(full.length - s0, Math.ceil(len * rate)))
    const out = ctx.createBuffer(full.numberOfChannels, n, rate)
    for (let c = 0; c < full.numberOfChannels; c++) out.getChannelData(c).set(full.getChannelData(c).subarray(s0, s0 + n))
    return out
  } catch { return input ? undefined : null }
}

// Mix clip audio + extra tracks offline; returns the buffer (null if silent) and whether some audio failed to decode.
async function mixAudioOffline(src: Sources, placed: PlacedClip[], audioTracks: AudioTrack[], total: number): Promise<{ buffer: AudioBuffer | null; failed: boolean }> {
  const frames = Math.ceil(total * SAMPLE_RATE)
  if (frames <= 0) return { buffer: null, failed: false }
  const Ctor: typeof OfflineAudioContext = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
  const octx = new Ctor(2, frames, SAMPLE_RATE)
  const jobs = [
    ...placed.filter((p) => !p.clip.muted && p.clip.volume > 0 && p.length > 0).map((p) => ({ file: p.clip.file, from: p.clip.trimStart, len: p.length, at: p.offset, vol: p.clip.volume })),
    ...audioTracks.filter((t) => !t.muted && t.volume > 0 && t.length > 0 && t.start < total).map((t) => ({ file: t.file, from: t.trimStart, len: Math.min(t.length, total - t.start), at: t.start, vol: t.volume })),
  ]
  let any = false, failed = false
  const bufs = await Promise.all(jobs.map((j) => decodeRange(src, j.file, j.from, j.len, octx)))
  jobs.forEach((j, i) => {
    const b = bufs[i]
    if (b === undefined) failed = true
    if (!b) return
    const node = octx.createBufferSource(), gain = octx.createGain()
    node.buffer = b; gain.gain.value = j.vol; node.connect(gain).connect(octx.destination); node.start(Math.max(0, j.at), 0, j.len); any = true
  })
  return { buffer: any ? await octx.startRendering() : null, failed }
}

async function encodeAudio(buffer: AudioBuffer, encoder: AudioEncoder) {
  const frames = buffer.length, ch0 = buffer.getChannelData(0), ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0, CHUNK = 4096
  for (let i = 0; i < frames; i += CHUNK) {
    const n = Math.min(CHUNK, frames - i), data = new Float32Array(n * 2)
    data.set(ch0.subarray(i, i + n), 0); data.set(ch1.subarray(i, i + n), n)
    const ad = new AudioData({ format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SAMPLE_RATE) * 1e6), data })
    encoder.encode(ad); ad.close()
    if (encoder.encodeQueueSize > 64) await drainTo(encoder, 16)
  }
}

type AnyMuxer = {
  addVideoChunk: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void
  addAudioChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void
  finalize: () => void
  target: { buffer: ArrayBuffer }
}

// Render + encode the whole timeline offline; throws FastExportUnsupportedError when the fast path can't run.
export async function exportTimelineFast(clips: VideoClip[], overlays: Overlay[], audioTracks: AudioTrack[], opts: ExportOptions = {}): Promise<{ blob: Blob; ext: string }> {
  const total = totalDuration(clips)
  if (total <= 0) throw new Error('Add at least one video clip before exporting.')
  if (!fastExportSupported()) throw new FastExportUnsupportedError()
  const fps = opts.fps ?? 30, outW = even(opts.width ?? DEFAULT_WIDTH), outH = even(opts.height ?? DEFAULT_HEIGHT), fit = opts.fit ?? 'contain'
  const throwIfAborted = () => { if (opts.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError') }
  const cfg = await resolveConfig(opts.format ?? 'mp4', outW, outH, fps)
  if (!cfg) throw new FastExportUnsupportedError('No usable WebCodecs codec for this output')

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden'
  document.body.appendChild(container)
  const canvas = document.createElement('canvas')
  canvas.width = outW; canvas.height = outH
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null
  const src = new Sources(), images = new Map<string, HTMLImageElement>()
  let videoEncoder: VideoEncoder | null = null, audioEncoder: AudioEncoder | null = null
  const cleanup = () => {
    container.remove(); void src.dispose()
    for (const e of [videoEncoder, audioEncoder]) try { if (e && e.state !== 'closed') e.close() } catch { /* closed */ }
  }
  if (!ctx) { cleanup(); throw new Error('Canvas 2D context unavailable') }

  try {
    await Promise.all(overlays.filter((o): o is Extract<Overlay, { type: 'image' }> => o.type === 'image').map(async (o) => images.set(o.id, await loadImage(o.url))))
    throwIfAborted()
    opts.onProgress?.(0.02)
    const placed = layoutClips(clips)
    const { buffer: audioBuffer, failed } = await mixAudioOffline(src, placed, audioTracks, total)
    // Some audio couldn't be decoded here — defer to the realtime exporter rather than ship it silent.
    if (failed) throw new FastExportUnsupportedError('Audio could not be decoded offline')
    throwIfAborted()
    opts.onProgress?.(0.1)

    const audio = audioBuffer ? { codec: cfg.muxerAudioCodec, numberOfChannels: 2, sampleRate: SAMPLE_RATE } : undefined
    const muxer = (cfg.ext === 'mp4'
      ? new Mp4Muxer({ target: new Mp4Target(), fastStart: 'in-memory', firstTimestampBehavior: 'offset', video: { codec: cfg.muxerVideoCodec as 'avc', width: outW, height: outH, frameRate: fps }, ...(audio ? { audio: audio as { codec: 'aac'; numberOfChannels: number; sampleRate: number } } : {}) })
      : new WebMMuxer({ target: new WebMTarget(), firstTimestampBehavior: 'offset', video: { codec: cfg.muxerVideoCodec, width: outW, height: outH, frameRate: fps }, ...(audio ? { audio } : {}) })) as unknown as AnyMuxer

    let encodeError: unknown = null
    const venc = (videoEncoder = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { encodeError = e } }))
    venc.configure(cfg.video)
    if (audioBuffer) {
      audioEncoder = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { encodeError = e } })
      audioEncoder.configure(cfg.audio)
      await encodeAudio(audioBuffer, audioEncoder)
    }

    const totalFrames = Math.max(1, Math.round(total * fps)), frameDur = 1e6 / fps, keyInterval = Math.max(1, Math.round(fps * 2))
    let i = 0
    const emit = async (layer: VideoLayer | null) => {
      throwIfAborted()
      if (encodeError) throw encodeError
      drawFrame(ctx, outW, outH, layer, overlaysAt(overlays, i / fps).map((o) => ({ overlay: o, image: o.type === 'image' ? images.get(o.id) ?? null : null })), fit)
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) })
      venc.encode(frame, { keyFrame: i % keyInterval === 0 }); frame.close()
      if (venc.encodeQueueSize > 24) await drainTo(venc, 8)
      i++
      opts.onProgress?.(0.1 + 0.88 * (i / totalFrames))
    }
    for (const p of placed) {
      const endFrame = Math.min(totalFrames, Math.round((p.offset + p.length) * fps)), startFrame = i
      if (i >= endFrame) continue
      const srcTime = (f: number) => p.clip.trimStart + Math.max(0, Math.min(p.length - 1e-4, f / fps - p.offset))
      const input = await src.get(p.clip.file)
      const track = input ? await input.getPrimaryVideoTrack().catch(() => null) : null
      if (track && (await track.canDecode().catch(() => false))) {
        try {
          const first = await track.getFirstTimestamp().catch(() => 0)
          const times = Array.from({ length: endFrame - startFrame }, (_, k) => Math.max(first, srcTime(startFrame + k)))
          for await (const s of new VideoSampleSink(track).samplesAtTimestamps(times)) {
            if (s) { await emit({ source: s.toCanvasImageSource(), sw: s.displayWidth, sh: s.displayHeight, clip: p.clip }); s.close() }
            else await emit(null)
            if (i >= endFrame) break
          }
        } catch (e) { if ((e instanceof DOMException && e.name === 'AbortError') || encodeError) throw e }
      }
      if (i < endFrame) {
        // Fallback (or resume after a decode failure): seek a <video> element per frame.
        const el = await loadVideo(p.clip.url, container)
        while (i < endFrame) { await seekTo(el, srcTime(i)); await emit({ source: el, sw: el.videoWidth, sh: el.videoHeight, clip: p.clip }) }
        el.remove()
      }
    }
    while (i < totalFrames) await emit(null)

    throwIfAborted()
    await venc.flush()
    if (audioEncoder) await audioEncoder.flush()
    if (encodeError) throw encodeError
    muxer.finalize()
    opts.onProgress?.(1)
    const blob = new Blob([muxer.target.buffer], { type: cfg.mime })
    cleanup()
    return { blob, ext: cfg.ext }
  } catch (err) { cleanup(); throw err }
}
