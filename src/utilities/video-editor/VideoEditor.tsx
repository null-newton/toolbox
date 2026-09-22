import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Clapperboard,
  Crop,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  Square,
  Trash2,
  Type,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useT } from '../../i18n/LanguageContext'
import { TimelineDriver, syncAudioElements } from './engine'
import { drawFrame, type ActiveOverlay } from './render'
import {
  exportTimeline,
  recorderSupported,
  supportedFormats,
  triggerDownload,
  type ClipFormat,
} from './export'
import { exportTimelineFast, FastExportUnsupportedError } from './export-fast'
import {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  dimsForAspect,
  layoutClips,
  overlaysAt,
  totalDuration,
  type AudioTrack,
  type ColorOverlay,
  type FitMode,
  type ImageOverlay,
  type Overlay,
  type TextOverlay,
  type VideoClip,
} from './types'

/**
 * Video Editor — stitch local video files on a timeline, layer text / image /
 * colour overlays and extra audio tracks, then record the whole thing to MP4
 * (or WebM) in the browser.
 *
 * Everything is in-memory: files become object URLs (no upload), and both the
 * live preview and the exporter render through the same drawFrame() pipeline
 * driven by the same TimelineDriver, so the file you download matches what you
 * see. See engine.ts / render.ts / export.ts for the moving parts.
 */

const STR = {
  en: {
    title: 'Video Editor',
    intro:
      'Stitch local video files into a timeline, layer text, images and colour cards, add extra audio tracks, then export to MP4 — all in your browser. Nothing is uploaded.',
    addClip: 'Add video',
    addText: 'Add text',
    addImage: 'Add image',
    addColor: 'Add colour',
    addAudio: 'Add audio',
    empty: 'Add a video to get started',
    emptyHint: 'Your stitched timeline will preview here.',
    play: 'Play',
    pause: 'Pause',
    stop: 'Stop',
    inspector: 'Inspector',
    nothingSelected: 'Select a clip or layer to edit it.',
    video: 'Video',
    overlays: 'Overlays',
    audio: 'Audio',
    timeline: 'Timeline',
    clip: 'Clip',
    trimStart: 'Trim start (s)',
    trimEnd: 'Trim end (s)',
    volume: 'Volume',
    mute: 'Mute',
    unmute: 'Unmute',
    moveLeft: 'Move earlier',
    moveRight: 'Move later',
    delete: 'Delete',
    text: 'Text',
    color: 'Colour',
    background: 'Background',
    none: 'None',
    fontSize: 'Font size',
    align: 'Align',
    bold: 'Bold',
    opacity: 'Opacity',
    start: 'Start (s)',
    duration: 'Duration (s)',
    posX: 'X',
    posY: 'Y',
    width: 'Width',
    height: 'Height',
    export: 'Export',
    format: 'Format',
    exportVideo: 'Export & download',
    exporting: 'Rendering…',
    cancel: 'Cancel',
    exportNote: 'Export records in real time, so it takes about as long as the video.',
    mp4Unsupported: 'This browser can’t encode MP4 — use WebM, or try Safari/Edge.',
    recordUnsupported: 'Your browser can’t record video (no MediaRecorder support).',
    exportError: 'Export failed. Try again.',
    loadError: 'Could not load that file.',
    dragHint:
      'Tip: drag overlays on the canvas to move them. On the timeline, drag a block to retime it or drag its edges to resize. Select a block and press Delete to remove it.',
    output: 'Output & crop',
    aspect: 'Aspect ratio',
    original: 'Original',
    fit: 'Fit',
    fill: 'Fill (crop)',
    letterbox: 'Fit (letterbox)',
  },
  nl: {
    title: 'Video-editor',
    intro:
      'Voeg lokale videobestanden samen op een tijdlijn, leg tekst, afbeeldingen en kleurkaarten erover, voeg extra audiotracks toe en exporteer naar MP4 — allemaal in je browser. Er wordt niets geüpload.',
    addClip: 'Video toevoegen',
    addText: 'Tekst toevoegen',
    addImage: 'Afbeelding toevoegen',
    addColor: 'Kleur toevoegen',
    addAudio: 'Audio toevoegen',
    empty: 'Voeg een video toe om te starten',
    emptyHint: 'Je samengevoegde tijdlijn verschijnt hier.',
    play: 'Afspelen',
    pause: 'Pauzeren',
    stop: 'Stoppen',
    inspector: 'Inspector',
    nothingSelected: 'Selecteer een clip of laag om te bewerken.',
    video: 'Video',
    overlays: 'Lagen',
    audio: 'Audio',
    timeline: 'Tijdlijn',
    clip: 'Clip',
    trimStart: 'Begin bijsnijden (s)',
    trimEnd: 'Einde bijsnijden (s)',
    volume: 'Volume',
    mute: 'Dempen',
    unmute: 'Dempen opheffen',
    moveLeft: 'Eerder',
    moveRight: 'Later',
    delete: 'Verwijderen',
    text: 'Tekst',
    color: 'Kleur',
    background: 'Achtergrond',
    none: 'Geen',
    fontSize: 'Lettergrootte',
    align: 'Uitlijning',
    bold: 'Vet',
    opacity: 'Dekking',
    start: 'Start (s)',
    duration: 'Duur (s)',
    posX: 'X',
    posY: 'Y',
    width: 'Breedte',
    height: 'Hoogte',
    export: 'Exporteren',
    format: 'Formaat',
    exportVideo: 'Exporteren & downloaden',
    exporting: 'Renderen…',
    cancel: 'Annuleren',
    exportNote: 'Het exporteren neemt ongeveer evenveel tijd in beslag als de video zelf.',
    mp4Unsupported: 'Deze browser kan geen MP4 maken — gebruik WebM of probeer Safari/Edge.',
    recordUnsupported: 'Je browser kan geen video opnemen (geen MediaRecorder-ondersteuning).',
    exportError: 'Export mislukt. Probeer opnieuw.',
    loadError: 'Kon dat bestand niet laden.',
    dragHint:
      'Tip: sleep lagen op het canvas om ze te verplaatsen. Sleep op de tijdlijn een blok om het te hertimen of sleep de randen om de duur aan te passen. Selecteer een blok en druk op Delete om het te verwijderen.',
    output: 'Uitvoer & uitsnede',
    aspect: 'Beeldverhouding',
    original: 'Origineel',
    fit: 'Passing',
    fill: 'Vullen (bijsnijden)',
    letterbox: 'Passend (zwarte balken)',
  },
}

let seq = 0
const uid = (p: string) => `${p}${(seq += 1)}`

function fmtTime(s: number): string {
  if (!isFinite(s)) s = 0
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`
}

function probeVideo(url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () =>
      resolve({ duration: v.duration || 0, width: v.videoWidth, height: v.videoHeight })
    v.onerror = () => reject(new Error('probe failed'))
    v.src = url
  })
}

function probeAudio(url: string): Promise<{ duration: number }> {
  return new Promise((resolve, reject) => {
    const a = document.createElement('audio')
    a.preload = 'metadata'
    a.onloadedmetadata = () => resolve({ duration: a.duration || 0 })
    a.onerror = () => reject(new Error('probe failed'))
    a.src = url
  })
}

function probeImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('probe failed'))
    img.src = url
  })
}

type Selection = { kind: 'clip' | 'overlay' | 'audio'; id: string } | null

export function VideoEditor() {
  const t = useT(STR)

  const [clips, setClips] = useState<VideoClip[]>([])
  const [overlays, setOverlays] = useState<Overlay[]>([])
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([])
  const [selection, setSelection] = useState<Selection>(null)
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [loadError, setLoadError] = useState(false)

  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [exportError, setExportError] = useState(false)
  const formats = useMemo(() => supportedFormats(), [])
  const canRecord = useMemo(() => recorderSupported(), [])
  const [format, setFormat] = useState<ClipFormat>(() => (supportedFormats().mp4 ? 'mp4' : 'webm'))

  // Output canvas: aspect 'original' tracks the first clip; presets crop to a
  // chosen ratio. `fit` decides whether clips fill (crop) or letterbox.
  const [project, setProject] = useState<{ w: number; h: number; fit: FitMode; aspect: string }>({
    w: DEFAULT_WIDTH,
    h: DEFAULT_HEIGHT,
    fit: 'cover',
    aspect: 'original',
  })

  // ---- Refs (read by the rAF loop without re-subscribing) -----------------
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const poolRef = useRef<HTMLDivElement>(null)
  const videoElsRef = useRef(new Map<string, HTMLVideoElement>())
  const audioElsRef = useRef(new Map<string, HTMLMediaElement>())
  const imageElsRef = useRef(new Map<string, HTMLImageElement>())
  const driverRef = useRef<TimelineDriver | null>(null)
  const overlaysRef = useRef(overlays)
  const audioRef = useRef(audioTracks)
  const playingRef = useRef(playing)
  const clipsRef = useRef(clips)
  const selectionRef = useRef(selection)
  const projectRef = useRef(project)
  const clipInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    overlaysRef.current = overlays
  }, [overlays])
  useEffect(() => {
    audioRef.current = audioTracks
  }, [audioTracks])
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    clipsRef.current = clips
  }, [clips])
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])
  useEffect(() => {
    projectRef.current = project
  }, [project])

  const setAspect = (aspect: string) => {
    if (aspect === 'original') {
      const first = clips[0]
      const ar = first && first.width && first.height ? first.width / first.height : DEFAULT_WIDTH / DEFAULT_HEIGHT
      const { width, height } = dimsForAspect(ar)
      setProject((p) => ({ ...p, aspect, w: width, h: height }))
      return
    }
    const [aw, ah] = aspect.split(':').map(Number)
    const { width, height } = dimsForAspect(aw / ah)
    setProject((p) => ({ ...p, aspect, w: width, h: height }))
  }

  const placed = useMemo(() => layoutClips(clips), [clips])
  const total = useMemo(() => totalDuration(clips), [clips])
  // Ruler length: the clip total, but never shorter than the latest overlay /
  // audio end so out-of-range layers stay visible while you drag them in.
  const rulerDuration = useMemo(() => {
    let d = total
    for (const o of overlays) d = Math.max(d, o.start + o.duration)
    for (const a of audioTracks) d = Math.max(d, a.start + a.length)
    return Math.max(d, 1)
  }, [total, overlays, audioTracks])

  // ---- Media element pools ------------------------------------------------
  useEffect(() => {
    const map = videoElsRef.current
    const pool = poolRef.current
    for (const [id, el] of [...map]) {
      if (!clips.some((c) => c.id === id)) {
        el.pause()
        el.remove()
        map.delete(id)
      }
    }
    for (const c of clips) {
      let el = map.get(c.id)
      if (!el) {
        el = document.createElement('video')
        el.src = c.url
        el.preload = 'auto'
        el.playsInline = true
        el.crossOrigin = 'anonymous'
        pool?.appendChild(el)
        map.set(c.id, el)
      }
      el.volume = c.volume
      el.muted = c.muted
    }
    // Rebuild the driver against the new layout, preserving position.
    const prev = driverRef.current
    const driver = new TimelineDriver(clips, map)
    driver.playing = playingRef.current
    driverRef.current = driver
    driver.seek(Math.min(prev?.playhead ?? 0, driver.total))
  }, [clips])

  useEffect(() => {
    const map = audioElsRef.current
    const pool = poolRef.current
    for (const [id, el] of [...map]) {
      if (!audioTracks.some((a) => a.id === id)) {
        el.pause()
        el.remove()
        map.delete(id)
      }
    }
    for (const a of audioTracks) {
      let el = map.get(a.id)
      if (!el) {
        el = document.createElement('audio')
        el.src = a.url
        el.preload = 'auto'
        el.crossOrigin = 'anonymous'
        pool?.appendChild(el)
        map.set(a.id, el)
      }
      el.volume = a.volume
      el.muted = a.muted
    }
  }, [audioTracks])

  useEffect(() => {
    const map = imageElsRef.current
    const wanted = overlays.filter((o): o is ImageOverlay => o.type === 'image')
    for (const [id] of [...map]) {
      if (!wanted.some((o) => o.id === id)) map.delete(id)
    }
    for (const o of wanted) {
      if (!map.has(o.id)) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = o.url
        map.set(o.id, img)
      }
    }
  }, [overlays])

  // Revoke every object URL on unmount.
  const cleanupRef = useRef({ clips, overlays, audioTracks })
  useEffect(() => {
    cleanupRef.current = { clips, overlays, audioTracks }
  })
  useEffect(() => {
    return () => {
      const { clips: cs, overlays: os, audioTracks: as } = cleanupRef.current
      cs.forEach((c) => URL.revokeObjectURL(c.url))
      os.forEach((o) => o.type === 'image' && URL.revokeObjectURL(o.url))
      as.forEach((a) => URL.revokeObjectURL(a.url))
    }
  }, [])

  // ---- The render loop ----------------------------------------------------
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      const driver = driverRef.current
      if (canvas && ctx) {
        const frame = driver ? driver.update() : null
        const head = driver?.playhead ?? 0
        if (driver && driver.playing) {
          syncAudioElements(audioRef.current, audioElsRef.current, head, true)
          if (head >= driver.total - 1e-3) {
            driver.pause()
            for (const el of audioElsRef.current.values()) if (!el.paused) el.pause()
            setPlaying(false)
          }
        }
        const active: ActiveOverlay[] = overlaysAt(overlaysRef.current, head).map((o) => ({
          overlay: o,
          image: o.type === 'image' ? imageElsRef.current.get(o.id) ?? null : null,
        }))
        const proj = projectRef.current
        if (canvas.width !== proj.w) canvas.width = proj.w
        if (canvas.height !== proj.h) canvas.height = proj.h
        drawFrame(ctx, proj.w, proj.h, frame?.source ?? null, frame?.sw ?? 0, frame?.sh ?? 0, active, proj.fit)
        setPlayhead(head)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ---- Transport ----------------------------------------------------------
  const togglePlay = () => {
    const driver = driverRef.current
    if (!driver || driver.total <= 0) return
    if (playing) {
      driver.pause()
      for (const el of audioElsRef.current.values()) if (!el.paused) el.pause()
      setPlaying(false)
    } else {
      if (driver.playhead >= driver.total - 1e-3) driver.seek(0)
      driver.play()
      driver.seek(driver.playhead) // (re)start the active clip within the gesture
      syncAudioElements(audioRef.current, audioElsRef.current, driver.playhead, true)
      setPlaying(true)
    }
  }

  const stop = () => {
    const driver = driverRef.current
    if (!driver) return
    driver.pause()
    for (const el of audioElsRef.current.values()) if (!el.paused) el.pause()
    driver.seek(0)
    setPlaying(false)
  }

  const seekTo = (tt: number) => {
    const driver = driverRef.current
    if (!driver) return
    driver.seek(tt)
    setPlayhead(driver.playhead)
  }

  // ---- Adding media -------------------------------------------------------
  const headNow = () => driverRef.current?.playhead ?? 0

  const addClipFiles = useCallback(async (files: FileList) => {
    setLoadError(false)
    const next: VideoClip[] = []
    for (const file of [...files]) {
      const url = URL.createObjectURL(file)
      try {
        const { duration, width, height } = await probeVideo(url)
        next.push({
          id: uid('clip'),
          name: file.name,
          url,
          duration,
          width,
          height,
          trimStart: 0,
          trimEnd: duration,
          muted: false,
          volume: 1,
        })
      } catch {
        URL.revokeObjectURL(url)
        setLoadError(true)
      }
    }
    if (next.length) {
      // The first clip added sets the canvas aspect ratio (while tracking
      // "original"); later additions keep it.
      const wasEmpty = clipsRef.current.length === 0
      setClips((prev) => [...prev, ...next])
      const first = next[0]
      if (wasEmpty && projectRef.current.aspect === 'original' && first.width && first.height) {
        const { width, height } = dimsForAspect(first.width / first.height)
        setProject((p) => ({ ...p, w: width, h: height }))
      }
    }
  }, [])

  const addAudioFiles = useCallback(async (files: FileList) => {
    setLoadError(false)
    const at = headNow()
    const next: AudioTrack[] = []
    for (const file of [...files]) {
      const url = URL.createObjectURL(file)
      try {
        const { duration } = await probeAudio(url)
        next.push({ id: uid('aud'), name: file.name, url, duration, length: duration, start: at, volume: 1, muted: false })
      } catch {
        URL.revokeObjectURL(url)
        setLoadError(true)
      }
    }
    if (next.length) setAudioTracks((prev) => [...prev, ...next])
  }, [])

  const addImageFile = useCallback(async (file: File) => {
    setLoadError(false)
    const url = URL.createObjectURL(file)
    try {
      const { width, height } = await probeImage(url)
      // Fit a sensible default box (max 40% width) preserving aspect.
      const aspect = width && height ? width / height : 1
      const proj = projectRef.current
      const w = 0.4
      const h = (w * proj.w) / aspect / proj.h
      const o: ImageOverlay = {
        id: uid('img'),
        type: 'image',
        name: file.name,
        url,
        start: headNow(),
        duration: 3,
        x: 0.05,
        y: 0.05,
        w,
        h: Math.min(0.9, h),
      }
      setOverlays((prev) => [...prev, o])
      setSelection({ kind: 'overlay', id: o.id })
    } catch {
      URL.revokeObjectURL(url)
      setLoadError(true)
    }
  }, [])

  const addText = () => {
    const o: TextOverlay = {
      id: uid('txt'),
      type: 'text',
      start: headNow(),
      duration: 3,
      x: 0.1,
      y: 0.72,
      w: 0.8,
      h: 0.2,
      text: 'Your text',
      color: '#ffffff',
      bg: null,
      fontScale: 0.07,
      align: 'center',
      bold: true,
    }
    setOverlays((prev) => [...prev, o])
    setSelection({ kind: 'overlay', id: o.id })
  }

  const addColor = () => {
    const o: ColorOverlay = {
      id: uid('col'),
      type: 'color',
      start: headNow(),
      duration: 3,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      color: '#4ee6e0',
      opacity: 1,
    }
    setOverlays((prev) => [...prev, o])
    setSelection({ kind: 'overlay', id: o.id })
  }

  // ---- Editing ------------------------------------------------------------
  const updateClip = (id: string, patch: Partial<VideoClip>) =>
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const updateOverlay = (id: string, patch: Partial<Overlay>) =>
    setOverlays((prev) => prev.map((o) => (o.id === id ? ({ ...o, ...patch } as Overlay) : o)))
  const updateAudio = (id: string, patch: Partial<AudioTrack>) =>
    setAudioTracks((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))

  const moveClip = (id: string, dir: -1 | 1) =>
    setClips((prev) => {
      const i = prev.findIndex((c) => c.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const copy = [...prev]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  // Stable identities (read live state from refs) so the keyboard handler can
  // bind once and still revoke the right URL.
  const removeClip = useCallback((id: string) => {
    const c = clipsRef.current.find((x) => x.id === id)
    if (c) URL.revokeObjectURL(c.url)
    setClips((prev) => prev.filter((x) => x.id !== id))
    setSelection((s) => (s?.id === id ? null : s))
  }, [])
  const removeOverlay = useCallback((id: string) => {
    const o = overlaysRef.current.find((x) => x.id === id)
    if (o?.type === 'image') URL.revokeObjectURL(o.url)
    setOverlays((prev) => prev.filter((x) => x.id !== id))
    setSelection((s) => (s?.id === id ? null : s))
  }, [])
  const removeAudio = useCallback((id: string) => {
    const a = audioRef.current.find((x) => x.id === id)
    if (a) URL.revokeObjectURL(a.url)
    setAudioTracks((prev) => prev.filter((x) => x.id !== id))
    setSelection((s) => (s?.id === id ? null : s))
  }, [])

  // Press Delete/Backspace to remove the selected timeline block (unless a
  // form field is focused).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const sel = selectionRef.current
      if (!sel) return
      e.preventDefault()
      if (sel.kind === 'clip') removeClip(sel.id)
      else if (sel.kind === 'overlay') removeOverlay(sel.id)
      else removeAudio(sel.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [removeClip, removeOverlay, removeAudio])

  // ---- Canvas overlay dragging -------------------------------------------
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    const active = overlaysAt(overlays, headNow())
    for (let i = active.length - 1; i >= 0; i--) {
      const o = active[i]
      if (nx >= o.x && nx <= o.x + o.w && ny >= o.y && ny <= o.y + o.h) {
        setSelection({ kind: 'overlay', id: o.id })
        dragRef.current = { id: o.id, dx: nx - o.x, dy: ny - o.y }
        canvas.setPointerCapture(e.pointerId)
        return
      }
    }
  }
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    const canvas = canvasRef.current
    if (!drag || !canvas) return
    const rect = canvas.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    const o = overlays.find((x) => x.id === drag.id)
    if (!o) return
    updateOverlay(drag.id, {
      x: Math.max(0, Math.min(1 - o.w, nx - drag.dx)),
      y: Math.max(0, Math.min(1 - o.h, ny - drag.dy)),
    })
  }
  const onCanvasPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      canvasRef.current?.releasePointerCapture(e.pointerId)
      dragRef.current = null
    }
  }

  // ---- Export -------------------------------------------------------------
  const handleExport = async () => {
    if (!clips.length) return
    if (playing) {
      driverRef.current?.pause()
      setPlaying(false)
    }
    setExporting(true)
    setProgress(0)
    setExportError(false)
    const controller = new AbortController()
    abortRef.current = controller
    const exportOpts = {
      format,
      width: project.w,
      height: project.h,
      fit: project.fit,
      onProgress: setProgress,
      signal: controller.signal,
    }
    try {
      // Prefer the fast WebCodecs encoder; fall back to realtime recording when
      // the browser can't run it.
      let result: { blob: Blob; ext: string }
      try {
        result = await exportTimelineFast(clips, overlays, audioTracks, exportOpts)
      } catch (err) {
        if (err instanceof FastExportUnsupportedError) {
          result = await exportTimeline(clips, overlays, audioTracks, exportOpts)
        } else {
          throw err
        }
      }
      const { blob, ext } = result
      triggerDownload(blob, `video-${Date.now()}.${ext}`)
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setExportError(true)
    } finally {
      setExporting(false)
      setProgress(0)
      abortRef.current = null
    }
  }

  const selected =
    selection?.kind === 'clip'
      ? clips.find((c) => c.id === selection.id)
      : selection?.kind === 'overlay'
        ? overlays.find((o) => o.id === selection.id)
        : selection?.kind === 'audio'
          ? audioTracks.find((a) => a.id === selection.id)
          : undefined

  return (
    <div className="animate-fade-up">
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
        <Film className="size-8 text-indigo-400" />
        {t.title}
      </h1>
      <p className="mt-2 max-w-3xl text-slate-400">{t.intro}</p>

      {/* Add media toolbar */}
      <div className="glass mt-6 flex flex-wrap gap-2 rounded-2xl p-3">
        <ToolbarButton primary onClick={() => clipInputRef.current?.click()} icon={<Plus className="size-4" />}>
          {t.addClip}
        </ToolbarButton>
        <ToolbarButton onClick={addText} icon={<Type className="size-4" />}>
          {t.addText}
        </ToolbarButton>
        <ToolbarButton onClick={() => imageInputRef.current?.click()} icon={<ImageIcon className="size-4" />}>
          {t.addImage}
        </ToolbarButton>
        <ToolbarButton onClick={addColor} icon={<Square className="size-4" />}>
          {t.addColor}
        </ToolbarButton>
        <ToolbarButton onClick={() => audioInputRef.current?.click()} icon={<Music className="size-4" />}>
          {t.addAudio}
        </ToolbarButton>
        <input
          ref={clipInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addClipFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) addImageFile(f)
            e.target.value = ''
          }}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addAudioFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {loadError && <p className="mt-3 text-sm text-rose-400">{t.loadError}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Preview + transport */}
        <div className="glass flex min-h-[320px] flex-col rounded-2xl p-4">
          <div className="flex flex-1 items-center justify-center">
            {/* Canvas stays mounted so the render loop always has a target;
                it's just hidden until there's something to show. */}
            <canvas
              ref={canvasRef}
              width={project.w}
              height={project.h}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              className={`max-h-[58vh] max-w-full touch-none rounded-xl bg-black shadow-2xl shadow-black/40 ${
                clips.length ? 'block' : 'hidden'
              }`}
            />
            {!clips.length && (
              <div className="py-16 text-center">
                <Clapperboard className="mx-auto size-12 text-slate-600" />
                <p className="mt-3 font-medium text-slate-300">{t.empty}</p>
                <p className="text-sm text-slate-500">{t.emptyHint}</p>
              </div>
            )}
          </div>

          {clips.length > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-90"
                title={playing ? t.pause : t.play}
              >
                {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
              </button>
              <button
                onClick={stop}
                className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                title={t.stop}
              >
                <Square className="size-4" />
              </button>
              <input
                type="range"
                min={0}
                max={total || 0}
                step={0.01}
                value={Math.min(playhead, total)}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <span className="shrink-0 font-mono text-xs tabular-nums text-slate-400">
                {fmtTime(playhead)} / {fmtTime(total)}
              </span>
            </div>
          )}
        </div>

        {/* Inspector */}
        <div className="glass rounded-2xl p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">{t.inspector}</h2>
          <div className="mt-3">
            {!selected ? (
              <p className="text-sm text-slate-500">{t.nothingSelected}</p>
            ) : selection?.kind === 'clip' ? (
              <ClipInspector
                clip={selected as VideoClip}
                t={t}
                onChange={(p) => updateClip(selected.id, p)}
                onMove={(d) => moveClip(selected.id, d)}
                onDelete={() => removeClip(selected.id)}
              />
            ) : selection?.kind === 'overlay' ? (
              <OverlayInspector
                overlay={selected as Overlay}
                t={t}
                onChange={(p) => updateOverlay(selected.id, p)}
                onDelete={() => removeOverlay(selected.id)}
              />
            ) : (
              <AudioInspector
                track={selected as AudioTrack}
                t={t}
                onChange={(p) => updateAudio(selected.id, p)}
                onDelete={() => removeAudio(selected.id)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Output & crop */}
      {clips.length > 0 && (
        <div className="glass mt-6 rounded-2xl p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
            <Crop className="size-4" /> {t.output}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{t.aspect}</span>
              <div className="flex flex-wrap overflow-hidden rounded-lg border border-white/10">
                {(['original', '16:9', '9:16', '1:1', '4:3'] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAspect(a)}
                    className={`px-3 py-1 text-xs font-medium transition ${
                      project.aspect === a
                        ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {a === 'original' ? t.original : a}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{t.fit}</span>
              <div className="flex overflow-hidden rounded-lg border border-white/10">
                {(['cover', 'contain'] as FitMode[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setProject((p) => ({ ...p, fit: f }))}
                    className={`px-3 py-1 text-xs font-medium transition ${
                      project.fit === f
                        ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {f === 'cover' ? t.fill : t.letterbox}
                  </button>
                ))}
              </div>
            </div>
            <span className="font-mono text-xs text-slate-500">
              {project.w}×{project.h}
            </span>
          </div>
        </div>
      )}

      {/* Timeline */}
      {(clips.length > 0 || overlays.length > 0 || audioTracks.length > 0) && (
        <Timeline
          t={t}
          placed={placed}
          overlays={overlays}
          audioTracks={audioTracks}
          rulerDuration={rulerDuration}
          playhead={playhead}
          selection={selection}
          onSeek={seekTo}
          onSelect={setSelection}
          onUpdateOverlay={updateOverlay}
          onUpdateAudio={updateAudio}
          onUpdateClip={updateClip}
        />
      )}

      {/* Export */}
      <div className="glass mt-6 rounded-2xl p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
          <Download className="size-4" /> {t.export}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{t.format}</span>
            <div className="flex overflow-hidden rounded-lg border border-white/10">
              {(['mp4', 'webm'] as ClipFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => formats[f] && setFormat(f)}
                  disabled={!formats[f] || exporting}
                  title={!formats[f] ? t.mp4Unsupported : undefined}
                  className={`px-3 py-1 text-xs font-medium uppercase transition disabled:opacity-30 ${
                    format === f
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          {exporting ? (
            <div className="flex min-w-[220px] flex-1 items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 className="size-3.5 animate-spin" /> {Math.round(progress * 100)}%
              </span>
              <button
                onClick={() => abortRef.current?.abort()}
                className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10"
              >
                <X className="size-3" /> {t.cancel}
              </button>
            </div>
          ) : (
            <button
              onClick={handleExport}
              disabled={!clips.length || !canRecord}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="size-4" /> {t.exportVideo}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">{t.exportNote}</p>
        {format === 'mp4' && !formats.mp4 && <p className="mt-1 text-xs text-amber-400">{t.mp4Unsupported}</p>}
        {!canRecord && <p className="mt-1 text-xs text-amber-400">{t.recordUnsupported}</p>}
        {exportError && <p className="mt-2 text-sm text-rose-400">{t.exportError}</p>}
      </div>

      {/* Hidden pool of media elements (kept in the DOM so they decode + play). */}
      <div ref={poolRef} className="pointer-events-none fixed left-[-200vw] top-0 size-px overflow-hidden" aria-hidden />
    </div>
  )
}

// ===========================================================================
// Sub-components
// ===========================================================================

type T = (typeof STR)['en']

function ToolbarButton({
  onClick,
  icon,
  children,
  primary,
}: {
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
        primary
          ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25 hover:opacity-90'
          : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  )
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 0.1,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right text-white focus:border-indigo-400/60 focus:outline-none"
    />
  )
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-1.5 text-sm text-slate-300 transition hover:bg-rose-500/20 hover:text-rose-300"
    >
      <Trash2 className="size-4" /> {label}
    </button>
  )
}

function ClipInspector({
  clip,
  t,
  onChange,
  onMove,
  onDelete,
}: {
  clip: VideoClip
  t: T
  onChange: (p: Partial<VideoClip>) => void
  onMove: (d: -1 | 1) => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-3">
      <p className="truncate text-sm font-medium text-white" title={clip.name}>
        {clip.name}
      </p>
      <Field label={t.trimStart}>
        <NumberInput
          value={clip.trimStart}
          min={0}
          max={clip.trimEnd - 0.1}
          onChange={(v) => onChange({ trimStart: Math.max(0, Math.min(v, clip.trimEnd - 0.1)) })}
        />
      </Field>
      <Field label={t.trimEnd}>
        <NumberInput
          value={clip.trimEnd}
          min={clip.trimStart + 0.1}
          max={clip.duration}
          onChange={(v) => onChange({ trimEnd: Math.min(clip.duration, Math.max(v, clip.trimStart + 0.1)) })}
        />
      </Field>
      <div className="flex items-center gap-2">
        <VolumeX className="size-4 text-slate-500" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={clip.volume}
          onChange={(e) => onChange({ volume: Number(e.target.value) })}
          className="flex-1 accent-indigo-500"
        />
        <Volume2 className="size-4 text-slate-500" />
      </div>
      <button
        onClick={() => onChange({ muted: !clip.muted })}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border py-1.5 text-xs transition ${
          clip.muted
            ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
            : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
        }`}
      >
        {clip.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        {clip.muted ? t.unmute : t.mute}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onMove(-1)}
          className="rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
        >
          ← {t.moveLeft}
        </button>
        <button
          onClick={() => onMove(1)}
          className="rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
        >
          {t.moveRight} →
        </button>
      </div>
      <DeleteButton label={t.delete} onClick={onDelete} />
    </div>
  )
}

function BoxFields({
  o,
  t,
  onChange,
}: {
  o: Overlay
  t: T
  onChange: (p: Partial<Overlay>) => void
}) {
  return (
    <>
      <Field label={t.start}>
        <NumberInput value={o.start} min={0} onChange={(v) => onChange({ start: Math.max(0, v) })} />
      </Field>
      <Field label={t.duration}>
        <NumberInput value={o.duration} min={0.1} onChange={(v) => onChange({ duration: Math.max(0.1, v) })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t.posX}>
          <NumberInput value={o.x} min={0} max={1} step={0.01} onChange={(v) => onChange({ x: v })} />
        </Field>
        <Field label={t.posY}>
          <NumberInput value={o.y} min={0} max={1} step={0.01} onChange={(v) => onChange({ y: v })} />
        </Field>
        <Field label={t.width}>
          <NumberInput value={o.w} min={0.02} max={1} step={0.01} onChange={(v) => onChange({ w: v })} />
        </Field>
        <Field label={t.height}>
          <NumberInput value={o.h} min={0.02} max={1} step={0.01} onChange={(v) => onChange({ h: v })} />
        </Field>
      </div>
    </>
  )
}

function OverlayInspector({
  overlay,
  t,
  onChange,
  onDelete,
}: {
  overlay: Overlay
  t: T
  onChange: (p: Partial<Overlay>) => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-3">
      {overlay.type === 'text' && (
        <>
          <textarea
            value={overlay.text}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={2}
            className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-indigo-400/60 focus:outline-none"
          />
          <Field label={t.color}>
            <input
              type="color"
              value={overlay.color}
              onChange={(e) => onChange({ color: e.target.value })}
              className="size-8 cursor-pointer rounded-lg border border-white/10 bg-transparent"
            />
          </Field>
          <Field label={t.background}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={overlay.bg ?? '#000000'}
                onChange={(e) => onChange({ bg: e.target.value })}
                className="size-8 cursor-pointer rounded-lg border border-white/10 bg-transparent disabled:opacity-30"
                disabled={overlay.bg === null}
              />
              <button
                onClick={() => onChange({ bg: overlay.bg === null ? '#000000' : null })}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
              >
                {overlay.bg === null ? '+' : t.none}
              </button>
            </div>
          </Field>
          <Field label={t.fontSize}>
            <input
              type="range"
              min={0.02}
              max={0.2}
              step={0.005}
              value={overlay.fontScale}
              onChange={(e) => onChange({ fontScale: Number(e.target.value) })}
              className="w-28 accent-indigo-500"
            />
          </Field>
          <Field label={t.align}>
            <div className="flex overflow-hidden rounded-lg border border-white/10">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => onChange({ align: a })}
                  className={`px-2 py-1 text-xs capitalize transition ${
                    overlay.align === a ? 'bg-indigo-500/30 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={overlay.bold}
              onChange={(e) => onChange({ bold: e.target.checked })}
              className="size-3.5 accent-indigo-500"
            />
            {t.bold}
          </label>
        </>
      )}

      {overlay.type === 'color' && (
        <>
          <Field label={t.color}>
            <input
              type="color"
              value={overlay.color}
              onChange={(e) => onChange({ color: e.target.value })}
              className="size-8 cursor-pointer rounded-lg border border-white/10 bg-transparent"
            />
          </Field>
          <Field label={t.opacity}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={overlay.opacity}
              onChange={(e) => onChange({ opacity: Number(e.target.value) })}
              className="w-28 accent-indigo-500"
            />
          </Field>
        </>
      )}

      {overlay.type === 'image' && (
        <p className="truncate text-sm font-medium text-white" title={overlay.name}>
          {overlay.name}
        </p>
      )}

      <BoxFields o={overlay} t={t} onChange={onChange} />
      <DeleteButton label={t.delete} onClick={onDelete} />
    </div>
  )
}

function AudioInspector({
  track,
  t,
  onChange,
  onDelete,
}: {
  track: AudioTrack
  t: T
  onChange: (p: Partial<AudioTrack>) => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-3">
      <p className="truncate text-sm font-medium text-white" title={track.name}>
        {track.name}
      </p>
      <Field label={t.start}>
        <NumberInput value={track.start} min={0} onChange={(v) => onChange({ start: Math.max(0, v) })} />
      </Field>
      <div className="flex items-center gap-2">
        <VolumeX className="size-4 text-slate-500" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={track.volume}
          onChange={(e) => onChange({ volume: Number(e.target.value) })}
          className="flex-1 accent-indigo-500"
        />
        <Volume2 className="size-4 text-slate-500" />
      </div>
      <button
        onClick={() => onChange({ muted: !track.muted })}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border py-1.5 text-xs transition ${
          track.muted
            ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
            : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
        }`}
      >
        {track.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        {track.muted ? t.unmute : t.mute}
      </button>
      <DeleteButton label={t.delete} onClick={onDelete} />
    </div>
  )
}

// ---- Timeline -------------------------------------------------------------

type Edge = 'l' | 'r'
type Drag =
  | { mode: 'scrub' }
  | { mode: 'move'; kind: 'overlay' | 'audio'; id: string; grab: number }
  | { mode: 'resize'; kind: 'overlay' | 'audio' | 'clip'; id: string; edge: Edge }

const MIN_LEN = 0.1

interface TimelineProps {
  t: T
  placed: ReturnType<typeof layoutClips>
  overlays: Overlay[]
  audioTracks: AudioTrack[]
  rulerDuration: number
  playhead: number
  selection: Selection
  onSeek: (t: number) => void
  onSelect: (s: Selection) => void
  onUpdateOverlay: (id: string, patch: Partial<Overlay>) => void
  onUpdateAudio: (id: string, patch: Partial<AudioTrack>) => void
  onUpdateClip: (id: string, patch: Partial<VideoClip>) => void
}

function Timeline({
  t,
  placed,
  overlays,
  audioTracks,
  rulerDuration,
  playhead,
  selection,
  onSeek,
  onSelect,
  onUpdateOverlay,
  onUpdateAudio,
  onUpdateClip,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const pct = (v: number) => `${(v / rulerDuration) * 100}%`

  const timeAt = (clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(rulerDuration, ((clientX - rect.left) / rect.width) * rulerDuration))
  }

  const capture = (e: React.PointerEvent) => (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

  const startScrub = (e: React.PointerEvent) => {
    dragRef.current = { mode: 'scrub' }
    onSeek(timeAt(e.clientX))
    capture(e)
  }
  const startMove = (e: React.PointerEvent, kind: 'overlay' | 'audio', id: string, start: number) => {
    e.stopPropagation()
    onSelect({ kind, id })
    dragRef.current = { mode: 'move', kind, id, grab: timeAt(e.clientX) - start }
    capture(e)
  }
  const startResize = (
    e: React.PointerEvent,
    kind: 'overlay' | 'audio' | 'clip',
    id: string,
    edge: Edge
  ) => {
    e.stopPropagation()
    onSelect({ kind, id })
    dragRef.current = { mode: 'resize', kind, id, edge }
    capture(e)
  }

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const tt = timeAt(e.clientX)
    if (d.mode === 'scrub') {
      onSeek(tt)
      return
    }
    if (d.mode === 'move') {
      const start = Math.max(0, tt - d.grab)
      if (d.kind === 'overlay') onUpdateOverlay(d.id, { start })
      else onUpdateAudio(d.id, { start })
      return
    }
    // resize
    if (d.kind === 'overlay') {
      const o = overlays.find((x) => x.id === d.id)
      if (!o) return
      if (d.edge === 'r') onUpdateOverlay(o.id, { duration: Math.max(MIN_LEN, tt - o.start) })
      else {
        const end = o.start + o.duration
        const start = Math.max(0, Math.min(tt, end - MIN_LEN))
        onUpdateOverlay(o.id, { start, duration: end - start })
      }
    } else if (d.kind === 'audio') {
      const a = audioTracks.find((x) => x.id === d.id)
      if (!a) return
      if (d.edge === 'r') onUpdateAudio(a.id, { length: Math.max(MIN_LEN, Math.min(tt - a.start, a.duration)) })
      else {
        const end = a.start + a.length
        const start = Math.max(Math.max(0, end - a.duration), Math.min(tt, end - MIN_LEN))
        onUpdateAudio(a.id, { start, length: end - start })
      }
    } else {
      // clip — resize the edges trims the source (trimStart / trimEnd).
      const p = placed.find((x) => x.clip.id === d.id)
      if (!p) return
      const c = p.clip
      if (d.edge === 'r') {
        const maxLen = c.duration - c.trimStart
        const len = Math.max(MIN_LEN, Math.min(tt - p.offset, maxLen))
        onUpdateClip(c.id, { trimEnd: c.trimStart + len })
      } else {
        const newTrimStart = Math.max(0, Math.min(c.trimStart + (tt - p.offset), c.trimEnd - MIN_LEN))
        onUpdateClip(c.id, { trimStart: newTrimStart })
      }
    }
  }

  const onUp = () => {
    dragRef.current = null
  }

  const isSel = (kind: string, id: string) => selection?.kind === kind && selection.id === id

  return (
    <div className="glass mt-6 rounded-2xl p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
        <Film className="size-4" /> {t.timeline}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t.dragHint}</p>

      <div className="mt-4 flex select-none gap-2" onPointerMove={onMove} onPointerUp={onUp}>
        {/* Label gutter — rows mirror the track column's heights exactly. */}
        <div className="w-16 shrink-0">
          <div className="h-6" />
          {[t.video, t.overlays, t.audio].map((label) => (
            <div
              key={label}
              className="mt-2 flex h-10 items-center text-[10px] font-medium uppercase tracking-wide text-slate-500"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Track column — ruler, lanes and playhead all share this width. */}
        <div ref={trackRef} className="relative flex-1">
          {/* Ruler — click or drag to scrub */}
          <div className="relative h-6 cursor-ew-resize rounded-md bg-white/5" onPointerDown={startScrub}>
            <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 font-mono text-[10px] text-slate-500">
              0:00
            </span>
            <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 font-mono text-[10px] text-slate-500">
              {fmtTime(rulerDuration)}
            </span>
          </div>

          {/* Video lane */}
          <Lane>
            {placed.map((p) => (
              <Block
                key={p.clip.id}
                left={pct(p.offset)}
                width={pct(p.length)}
                selected={isSel('clip', p.clip.id)}
                theme="indigo"
                title={p.clip.name}
                label={p.clip.name}
                onBody={(e) => {
                  e.stopPropagation()
                  onSelect({ kind: 'clip', id: p.clip.id })
                }}
                onEdge={(e, edge) => startResize(e, 'clip', p.clip.id, edge)}
              />
            ))}
          </Lane>

          {/* Overlays lane */}
          <Lane>
            {overlays.map((o) => (
              <Block
                key={o.id}
                left={pct(o.start)}
                width={pct(o.duration)}
                selected={isSel('overlay', o.id)}
                theme="violet"
                grab
                title={overlayLabel(o)}
                label={overlayLabel(o)}
                onBody={(e) => startMove(e, 'overlay', o.id, o.start)}
                onEdge={(e, edge) => startResize(e, 'overlay', o.id, edge)}
              />
            ))}
          </Lane>

          {/* Audio lane */}
          <Lane>
            {audioTracks.map((a) => (
              <Block
                key={a.id}
                left={pct(a.start)}
                width={pct(a.length)}
                selected={isSel('audio', a.id)}
                theme="emerald"
                grab
                title={a.name}
                label={a.name}
                onBody={(e) => startMove(e, 'audio', a.id, a.start)}
                onEdge={(e, edge) => startResize(e, 'audio', a.id, edge)}
              />
            ))}
          </Lane>

          {/* Playhead — spans the whole track column. */}
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-rose-400"
            style={{ left: pct(Math.min(playhead, rulerDuration)) }}
          >
            <div className="absolute -left-1 -top-1 size-2 rounded-full bg-rose-400" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Lane({ children }: { children: React.ReactNode }) {
  return <div className="relative mt-2 h-10 rounded-md bg-white/[0.03]">{children}</div>
}

const BLOCK_THEME = {
  indigo: {
    on: 'border-indigo-400 bg-indigo-500/30 text-white',
    off: 'border-indigo-400/30 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25',
  },
  violet: {
    on: 'border-violet-400 bg-violet-500/30 text-white',
    off: 'border-violet-400/30 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25',
  },
  emerald: {
    on: 'border-emerald-400 bg-emerald-500/30 text-white',
    off: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25',
  },
}

function Block({
  left,
  width,
  selected,
  theme,
  title,
  label,
  grab,
  onBody,
  onEdge,
}: {
  left: string
  width: string
  selected: boolean
  theme: keyof typeof BLOCK_THEME
  title: string
  label: string
  grab?: boolean
  onBody: (e: React.PointerEvent) => void
  onEdge: (e: React.PointerEvent, edge: Edge) => void
}) {
  const colors = BLOCK_THEME[theme]
  return (
    <div
      onPointerDown={onBody}
      style={{ left, width }}
      title={title}
      className={`group absolute inset-y-1 overflow-hidden rounded-md border text-left text-[11px] leading-7 transition ${
        grab ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${selected ? colors.on : colors.off}`}
    >
      <span className="pointer-events-none block truncate px-2">{label}</span>
      <div
        onPointerDown={(e) => onEdge(e, 'l')}
        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 transition hover:bg-white/30"
      />
      <div
        onPointerDown={(e) => onEdge(e, 'r')}
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 transition hover:bg-white/30"
      />
    </div>
  )
}

function overlayLabel(o: Overlay): string {
  if (o.type === 'text') return o.text || 'Text'
  if (o.type === 'image') return o.name
  return 'Colour'
}
