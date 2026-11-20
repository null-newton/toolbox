import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Clapperboard, Crop, Download, Image as ImageIcon, Link2, Loader2, Music, Pause, Play, Plus, SkipBack, Square, Type, X } from 'lucide-react'
import { useT } from '../../i18n/LanguageContext'
import { useAuth } from '../../auth/auth-context'
import { ToolHeader } from '../../components/ToolHeader'
import { TimelineDriver, syncAudioElements } from './engine'
import { drawFrame, type ActiveOverlay } from './render'
import { exportTimeline, recorderSupported, supportedFormats, triggerDownload, type ClipFormat } from './export'
import { clipAt, cropStage, DEFAULT_HEIGHT, MIN_LEN, DEFAULT_WIDTH, dimsForAspect, FULL_RECT, layoutClips, overlaysAt, placeClip, totalDuration, type AudioTrack, type ColorOverlay, type FitMode, type ImageOverlay, type Overlay, type Rect, type TextOverlay, type VideoClip } from './types'
import { STR, fmtTime } from './strings'
import { AudioInspector, ClipInspector, OverlayInspector, Pills } from './Inspector'
import { Timeline, type Selection } from './Timeline'
import { UrlImport } from './UrlImport'
import { mimeFor, takeVideoEditorInbox } from '../yt-dlp/download'

/**
 * Video Editor — stitch clips on a magnetic timeline, crop/scale/position each clip, layer text/image/colour overlays
 * and extra audio, then export via WebCodecs (fast) or MediaRecorder (fallback). Preview and export share drawFrame().
 */

type Doc = { clips: VideoClip[]; overlays: Overlay[]; audio: AudioTrack[] }
type Stage =
  | { kind: 'ovMove'; id: string; n0: [number, number]; o: Overlay }
  | { kind: 'ovSize'; id: string; h: [number, number]; o: Overlay }
  | { kind: 'clipMove'; id: string; n0: [number, number]; c: VideoClip }
  | { kind: 'clipScale'; id: string; n0: [number, number]; c: VideoClip }
  | { kind: 'cropPan'; id: string; n0: [number, number]; c: VideoClip }
  | { kind: 'cropSize'; id: string; h: [number, number]; c: VideoClip }

const EMPTY: Doc = { clips: [], overlays: [], audio: [] }
let seq = 0
// Cheap WebCodecs check; the fast exporter (and mediabunny) is only loaded on export.
const fastExportSupported = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof AudioEncoder !== 'undefined'
const uid = (p: string) => `${p}${(seq += 1)}${Date.now().toString(36)}`
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const btnBase = 'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition'
const btnPrimary = `${btnBase} bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25 hover:opacity-90`
const btnGhost = `${btnBase} border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white`

function probe<K extends 'video' | 'audio'>(kind: K, url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind)
    el.preload = 'metadata'
    el.onloadedmetadata = () => resolve({ duration: isFinite(el.duration) ? el.duration : 0, width: (el as HTMLVideoElement).videoWidth || 0, height: (el as HTMLVideoElement).videoHeight || 0 })
    el.onerror = () => reject(new Error('probe failed'))
    el.src = url
  })
}
const probeImage = (url: string) => new Promise<{ width: number; height: number }>((res, rej) => { const i = new Image(); i.onload = () => res({ width: i.naturalWidth, height: i.naturalHeight }); i.onerror = rej; i.src = url })

export function VideoEditor() {
  const t = useT(STR)
  const { user, canUseApp } = useAuth()
  const [doc, setDocState] = useState<Doc>(EMPTY)
  const [selection, setSelection] = useState<Selection>(null)
  const [cropMode, setCropMode] = useState(false)
  const [cropLock, setCropLock] = useState<'free' | 'output'>('free')
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [snap, setSnap] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [exportError, setExportError] = useState(false)
  const [histLen, setHistLen] = useState({ past: 0, future: 0 })
  const formats = useMemo(() => { const f = supportedFormats(), fast = fastExportSupported(); return { mp4: f.mp4 || fast, webm: f.webm || fast } }, [])
  const canExport = useMemo(() => recorderSupported() || fastExportSupported(), [])
  const [format, setFormat] = useState<ClipFormat>(() => (formats.mp4 ? 'mp4' : 'webm'))
  const [project, setProject] = useState<{ w: number; h: number; fit: FitMode; aspect: string }>({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT, fit: 'cover', aspect: 'original' })

  const canvasRef = useRef<HTMLCanvasElement>(null), stageRef = useRef<HTMLDivElement>(null), poolRef = useRef<HTMLDivElement>(null)
  const clipInputRef = useRef<HTMLInputElement>(null), imageInputRef = useRef<HTMLInputElement>(null), audioInputRef = useRef<HTMLInputElement>(null)
  const videoEls = useRef(new Map<string, HTMLVideoElement>()), audioEls = useRef(new Map<string, HTMLMediaElement>()), imageEls = useRef(new Map<string, HTMLImageElement>())
  const driverRef = useRef<TimelineDriver | null>(null), abortRef = useRef<AbortController | null>(null), urls = useRef(new Set<string>())
  const docRef = useRef(doc), selRef = useRef(selection), projRef = useRef(project), cropRef = useRef(false), playingRef = useRef(playing)
  const hist = useRef<{ past: Doc[]; future: Doc[]; key: string; at: number }>({ past: [], future: [], key: '', at: 0 })
  const bump = () => setHistLen({ past: hist.current.past.length, future: hist.current.future.length })
  useEffect(() => { selRef.current = selection; projRef.current = project; cropRef.current = cropMode && selection?.kind === 'clip'; playingRef.current = playing })

  // ---- Document + history -------------------------------------------------
  const setDoc = useCallback((fn: (d: Doc) => Doc) => { const n = fn(docRef.current); docRef.current = n; setDocState(n) }, [])
  // Snapshot for undo; edits sharing `key` within 800ms coalesce into one step.
  const record = useCallback((key = '') => {
    const h = hist.current, now = Date.now()
    if (key && key === h.key && now - h.at < 800) { h.at = now; return }
    h.past.push(docRef.current); if (h.past.length > 100) h.past.shift(); h.future = []; h.key = key; h.at = now; bump()
  }, [])
  const undo = useCallback(() => { const h = hist.current, prev = h.past.pop(); if (!prev) return; h.future.push(docRef.current); h.key = ''; setDoc(() => prev); bump() }, [setDoc])
  const redo = useCallback(() => { const h = hist.current, next = h.future.pop(); if (!next) return; h.past.push(docRef.current); h.key = ''; setDoc(() => next); bump() }, [setDoc])
  const patchClip = useCallback((id: string, p: Partial<VideoClip>) => setDoc((d) => ({ ...d, clips: d.clips.map((c) => (c.id === id ? { ...c, ...p } : c)) })), [setDoc])
  const patchOverlay = useCallback((id: string, p: Partial<Overlay>) => setDoc((d) => ({ ...d, overlays: d.overlays.map((o) => (o.id === id ? ({ ...o, ...p } as Overlay) : o)) })), [setDoc])
  const patchAudio = useCallback((id: string, p: Partial<AudioTrack>) => setDoc((d) => ({ ...d, audio: d.audio.map((a) => (a.id === id ? { ...a, ...p } : a)) })), [setDoc])
  const editKey = (id: string, p: object) => `${id}:${Object.keys(p).sort().join(',')}`

  const select = useCallback((s: Selection) => { if (s?.id !== selRef.current?.id) setCropMode(false); setSelection(s) }, [])
  const { clips, overlays, audio } = doc
  const placed = useMemo(() => layoutClips(clips), [clips])
  const total = useMemo(() => totalDuration(clips), [clips])
  const rulerDuration = useMemo(() => Math.max(1, total, ...overlays.map((o) => o.start + o.duration), ...audio.map((a) => a.start + a.length)), [total, overlays, audio])

  // ---- Media element pools ------------------------------------------------
  const timingKey = clips.map((c) => `${c.id}:${c.trimStart}:${c.trimEnd}`).join('|')
  useEffect(() => {
    const map = videoEls.current, cs = docRef.current.clips
    for (const [id, el] of [...map]) if (!cs.some((c) => c.id === id)) { el.pause(); el.remove(); map.delete(id) }
    for (const c of cs) if (!map.has(c.id)) {
      const el = Object.assign(document.createElement('video'), { src: c.url, preload: 'auto', playsInline: true, crossOrigin: 'anonymous' })
      poolRef.current?.appendChild(el); map.set(c.id, el)
    }
    const prev = driverRef.current, driver = new TimelineDriver(cs, map)
    driver.playing = playingRef.current; driverRef.current = driver; driver.seek(Math.min(prev?.playhead ?? 0, driver.total))
  }, [timingKey])
  useEffect(() => { for (const c of clips) { const el = videoEls.current.get(c.id); if (el) { el.volume = c.volume; el.muted = c.muted } } }, [clips])
  useEffect(() => {
    const map = audioEls.current
    for (const [id, el] of [...map]) if (!audio.some((a) => a.id === id)) { el.pause(); el.remove(); map.delete(id) }
    for (const a of audio) {
      let el = map.get(a.id)
      if (!el) { el = Object.assign(document.createElement('audio'), { src: a.url, preload: 'auto', crossOrigin: 'anonymous' }); poolRef.current?.appendChild(el); map.set(a.id, el) }
      el.volume = a.volume; el.muted = a.muted
      if (!el.paused) el.pause() // resync on the next frame against the edited timing
    }
  }, [audio])
  useEffect(() => {
    const map = imageEls.current, want = overlays.filter((o): o is ImageOverlay => o.type === 'image')
    for (const [id] of [...map]) if (!want.some((o) => o.id === id)) map.delete(id)
    for (const o of want) if (!map.has(o.id)) { const img = new Image(); img.crossOrigin = 'anonymous'; img.src = o.url; map.set(o.id, img) }
  }, [overlays])
  // Object URLs are shared by split clips and kept for undo, so they're only revoked on unmount.
  useEffect(() => () => { for (const u of urls.current) URL.revokeObjectURL(u) }, [])

  // ---- Render loop --------------------------------------------------------
  useEffect(() => {
    let raf = 0, last = -1
    const loop = () => {
      const canvas = canvasRef.current, ctx = canvas?.getContext('2d'), driver = driverRef.current
      if (canvas && ctx) {
        const frame = driver?.update() ?? null, head = driver?.playhead ?? 0
        if (driver?.playing) {
          syncAudioElements(docRef.current.audio, audioEls.current, head, true)
          if (head >= driver.total - 1e-3) { driver.pause(); for (const el of audioEls.current.values()) el.pause(); setPlaying(false) }
        }
        const d = docRef.current, proj = projRef.current
        const active: ActiveOverlay[] = overlaysAt(d.overlays, head).map((o) => ({ overlay: o, image: o.type === 'image' ? imageEls.current.get(o.id) ?? null : null }))
        if (canvas.width !== proj.w) canvas.width = proj.w
        if (canvas.height !== proj.h) canvas.height = proj.h
        const clip = frame ? d.clips.find((c) => c.id === frame.clip.id) ?? frame.clip : null
        drawFrame(ctx, proj.w, proj.h, frame && clip ? { ...frame, clip } : null, active, proj.fit, !!clip && cropRef.current && selRef.current?.id === clip.id)
        if (Math.abs(head - last) > 1e-4) { last = head; setPlayhead(head) }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ---- Transport ----------------------------------------------------------
  const headNow = () => driverRef.current?.playhead ?? 0
  const pauseAll = () => { driverRef.current?.pause(); for (const el of audioEls.current.values()) el.pause(); setPlaying(false) }
  const togglePlay = () => {
    const dr = driverRef.current
    if (!dr || dr.total <= 0) return
    if (playingRef.current) return pauseAll()
    if (dr.playhead >= dr.total - 1e-3) dr.seek(0)
    dr.play(); dr.seek(dr.playhead); syncAudioElements(docRef.current.audio, audioEls.current, dr.playhead, true); setPlaying(true)
  }
  const seekTo = (tt: number) => { const dr = driverRef.current; if (!dr) return; dr.seek(tt); for (const el of audioEls.current.values()) el.pause(); setPlayhead(dr.playhead) }

  // ---- Adding media -------------------------------------------------------
  const objUrl = (f: Blob) => { const u = URL.createObjectURL(f); urls.current.add(u); return u }
  const addFiles = useCallback(async (files: File[]) => {
    setLoadError(false)
    const add: Partial<Doc> & { clips: VideoClip[]; audio: AudioTrack[]; overlays: Overlay[] } = { clips: [], audio: [], overlays: [] }
    const at = driverRef.current?.playhead ?? 0
    for (const file of files) {
      const type = file.type || mimeFor(file.name), url = objUrl(file)
      try {
        if (type.startsWith('image/')) {
          const { width, height } = await probeImage(url), p = projRef.current, w = 0.4
          add.overlays.push({ id: uid('img'), type: 'image', name: file.name, url, start: at, duration: 3, x: 0.05, y: 0.05, w, h: Math.min(0.9, (w * p.w) / (width / height || 1) / p.h) })
        } else {
          const m = await probe(type.startsWith('audio/') ? 'audio' : 'video', url)
          if (m.width && m.height) add.clips.push({ id: uid('clip'), name: file.name, url, file, duration: m.duration, width: m.width, height: m.height, trimStart: 0, trimEnd: m.duration, muted: false, volume: 1, crop: FULL_RECT, tx: 0, ty: 0, scale: 1 })
          else if (m.duration) add.audio.push({ id: uid('aud'), name: file.name, url, file, duration: m.duration, trimStart: 0, length: m.duration, start: at, volume: 1, muted: false })
          else throw new Error('unsupported')
        }
      } catch { setLoadError(true) }
    }
    if (!add.clips.length && !add.audio.length && !add.overlays.length) return
    const wasEmpty = docRef.current.clips.length === 0, first = add.clips[0]
    record()
    setDoc((d) => ({ clips: [...d.clips, ...add.clips], audio: [...d.audio, ...add.audio], overlays: [...d.overlays, ...add.overlays] }))
    if (wasEmpty && first && projRef.current.aspect === 'original') { const { width, height } = dimsForAspect(first.width / first.height); setProject((p) => ({ ...p, w: width, h: height })) }
    const last = add.overlays[0] ? { kind: 'overlay' as const, id: add.overlays[0].id } : null
    if (last) setSelection(last)
  }, [record, setDoc])
  useEffect(() => { const inbox = takeVideoEditorInbox(); if (inbox.length) queueMicrotask(() => void addFiles(inbox)) }, [addFiles])

  const addOverlay = (o: Overlay) => { record(); setDoc((d) => ({ ...d, overlays: [...d.overlays, o] })); select({ kind: 'overlay', id: o.id }) }
  const addText = () => addOverlay({ id: uid('txt'), type: 'text', start: headNow(), duration: 3, x: 0.1, y: 0.72, w: 0.8, h: 0.2, text: 'Your text', color: '#ffffff', bg: null, fontScale: 0.07, align: 'center', bold: true } as TextOverlay)
  const addColor = () => addOverlay({ id: uid('col'), type: 'color', start: headNow(), duration: 3, x: 0, y: 0, w: 1, h: 1, color: '#4ee6e0', opacity: 1 } as ColorOverlay)

  const setAspect = (aspect: string) => {
    const first = clips[0], [aw, ah] = aspect.split(':').map(Number)
    const { width, height } = dimsForAspect(aspect === 'original' ? (first?.width && first.height ? first.width / first.height : DEFAULT_WIDTH / DEFAULT_HEIGHT) : aw / ah)
    setProject((p) => ({ ...p, aspect, w: width, h: height }))
  }

  // ---- Editing ------------------------------------------------------------
  const moveClip = (id: string, dir: -1 | 1) => { const i = clips.findIndex((c) => c.id === id); if (i < 0 || i + dir < 0 || i + dir >= clips.length) return; record(); reorder(id, i + dir) }
  const reorder = (id: string, to: number) => setDoc((d) => { const c = d.clips.find((x) => x.id === id); if (!c) return d; const rest = d.clips.filter((x) => x.id !== id); rest.splice(clamp(to, 0, rest.length), 0, c); return { ...d, clips: rest } })
  const removeSelected = () => {
    const s = selRef.current; if (!s) return
    record(); setDoc((d) => ({ clips: d.clips.filter((x) => x.id !== s.id), overlays: d.overlays.filter((x) => x.id !== s.id), audio: d.audio.filter((x) => x.id !== s.id) })); select(null)
  }
  // Cut the selected item (or the clip under the playhead) at the playhead.
  const split = () => {
    const T = headNow(), d = docRef.current, s = selRef.current
    if (s?.kind === 'overlay') {
      const o = d.overlays.find((x) => x.id === s.id); if (!o || T <= o.start + MIN_LEN || T >= o.start + o.duration - MIN_LEN) return
      const b = { ...o, id: uid(o.type.slice(0, 3)), start: T, duration: o.start + o.duration - T } as Overlay
      record(); setDoc((dd) => ({ ...dd, overlays: dd.overlays.flatMap((x) => (x.id === o.id ? [{ ...x, duration: T - x.start } as Overlay, b] : [x])) })); return select({ kind: 'overlay', id: b.id })
    }
    if (s?.kind === 'audio') {
      const a = d.audio.find((x) => x.id === s.id); if (!a || T <= a.start + MIN_LEN || T >= a.start + a.length - MIN_LEN) return
      const k = T - a.start, b = { ...a, id: uid('aud'), start: T, trimStart: a.trimStart + k, length: a.length - k }
      record(); setDoc((dd) => ({ ...dd, audio: dd.audio.flatMap((x) => (x.id === a.id ? [{ ...x, length: k }, b] : [x])) })); return select({ kind: 'audio', id: b.id })
    }
    const lay = layoutClips(d.clips), hit = (s?.kind === 'clip' && lay.find((p) => p.clip.id === s.id && T > p.offset && T < p.offset + p.length)) || clipAt(lay, T)?.placed
    if (!hit) return
    const k = T - hit.offset; if (k < MIN_LEN || hit.length - k < MIN_LEN) return
    const cut = hit.clip.trimStart + k, b = { ...hit.clip, id: uid('clip'), trimStart: cut }
    record(); setDoc((dd) => ({ ...dd, clips: dd.clips.flatMap((x) => (x.id === hit.clip.id ? [{ ...x, trimEnd: cut }, b] : [x])) })); select({ kind: 'clip', id: b.id })
  }

  // ---- Keyboard -----------------------------------------------------------
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return
    const k = e.key, mod = e.ctrlKey || e.metaKey
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo() }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); return redo() }
    if (mod || e.altKey) return
    const act: Record<string, () => void> = {
      ' ': togglePlay, s: split, S: split, Delete: removeSelected, Backspace: removeSelected, Home: () => seekTo(0), End: () => seekTo(total),
      ArrowLeft: () => seekTo(headNow() - (e.shiftKey ? 1 : 1 / 30)), ArrowRight: () => seekTo(headNow() + (e.shiftKey ? 1 : 1 / 30)),
      '+': () => setZoom((z) => z * 1.5), '=': () => setZoom((z) => z * 1.5), '-': () => setZoom((z) => Math.max(1, z / 1.5)),
      Escape: () => (cropMode ? setCropMode(false) : select(null)),
    }
    if (act[k] && docRef.current.clips.length + docRef.current.overlays.length + docRef.current.audio.length) { e.preventDefault(); act[k]() }
  }
  useLayoutEffect(() => { keyRef.current = onKey })
  useEffect(() => { const h = (e: KeyboardEvent) => keyRef.current(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [])

  // ---- Preview interaction (move / scale / crop) --------------------------
  const selClip = selection?.kind === 'clip' ? clips.find((c) => c.id === selection.id) : undefined
  const selOverlay = selection?.kind === 'overlay' ? overlays.find((o) => o.id === selection.id) : undefined
  const clipAtHead = clipAt(placed, playhead)?.placed.clip
  const fullPlace = (c: VideoClip) => cropStage(c.width, c.height, project.w, project.h)
  const norm = (e: { clientX: number; clientY: number }): [number, number] => { const r = stageRef.current!.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] }
  const inBox = ([x, y]: [number, number], b: Rect) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
  const clipBox = (c: VideoClip): Rect => { const p = placeClip(c, c.width, c.height, project.w, project.h, project.fit); return { x: p.dx / project.w, y: p.dy / project.h, w: p.dw / project.w, h: p.dh / project.h } }
  const cropBox = (c: VideoClip): Rect => { const u = fullPlace(c); return { x: (u.dx + c.crop.x * u.dw) / project.w, y: (u.dy + c.crop.y * u.dh) / project.h, w: (c.crop.w * u.dw) / project.w, h: (c.crop.h * u.dh) / project.h } }
  const cropActive = cropMode && !!selClip && clipAtHead?.id === selClip.id

  const stageMove = (s: Stage, n: [number, number]) => {
    const p = projRef.current, cw = p.w, ch = p.h
    if (s.kind === 'ovMove') return patchOverlay(s.id, { x: clamp(s.o.x + n[0] - s.n0[0], -s.o.w + 0.02, 0.98), y: clamp(s.o.y + n[1] - s.n0[1], -s.o.h + 0.02, 0.98) })
    if (s.kind === 'ovSize') {
      const { o } = s, fx = s.h[0] ? o.x : o.x + o.w, fy = s.h[1] ? o.y : o.y + o.h, w = Math.max(0.02, Math.abs(n[0] - fx)), h = Math.max(0.02, Math.abs(n[1] - fy))
      return patchOverlay(s.id, { x: s.h[0] ? fx : fx - w, y: s.h[1] ? fy : fy - h, w, h })
    }
    const c = s.c
    if (s.kind === 'clipMove') {
      const b = clipBox(c), snapAxis = (v: number, size: number) => { const lo = 0.5 + v - size / 2, hi = lo + size, e = 0.012; return Math.abs(v) < e ? 0 : Math.abs(lo) < e ? size / 2 - 0.5 : Math.abs(hi - 1) < e ? 0.5 - size / 2 : v }
      return patchClip(s.id, { tx: snapAxis(c.tx + n[0] - s.n0[0], b.w), ty: snapAxis(c.ty + n[1] - s.n0[1], b.h) })
    }
    if (s.kind === 'clipScale') {
      const cx = (0.5 + c.tx) * cw, cy = (0.5 + c.ty) * ch, dist = (q: [number, number]) => Math.hypot(q[0] * cw - cx, q[1] * ch - cy)
      return patchClip(s.id, { scale: clamp((c.scale * dist(n)) / Math.max(1, dist(s.n0)), 0.05, 10) })
    }
    const u = cropStage(c.width, c.height, cw, ch), sx = clamp((n[0] * cw - u.dx) / u.dw, 0, 1), sy = clamp((n[1] * ch - u.dy) / u.dh, 0, 1), r0 = c.crop
    if (s.kind === 'cropPan') return patchClip(s.id, { crop: { ...r0, x: clamp(r0.x + ((n[0] - s.n0[0]) * cw) / u.dw, 0, 1 - r0.w), y: clamp(r0.y + ((n[1] - s.n0[1]) * ch) / u.dh, 0, 1 - r0.h) } })
    const [hx, hy] = s.h, M = 0.03
    if (cropLock === 'output' && hx !== 0.5 && hy !== 0.5) {
      const rr = (cw / ch) * (c.height / c.width), fx = hx ? r0.x : r0.x + r0.w, fy = hy ? r0.y : r0.y + r0.h
      let w = Math.max(M, Math.abs(sx - fx), Math.abs(sy - fy) * rr), h = w / rr
      const maxW = hx ? 1 - fx : fx, maxH = hy ? 1 - fy : fy
      if (w > maxW) { w = maxW; h = w / rr } if (h > maxH) { h = maxH; w = h * rr }
      return patchClip(s.id, { crop: { x: hx ? fx : fx - w, y: hy ? fy : fy - h, w, h } })
    }
    let { x, y, w, h } = r0
    if (hx === 0) { const r = x + w; x = Math.min(sx, r - M); w = r - x } else if (hx === 1) w = Math.max(M, sx - x)
    if (hy === 0) { const b = y + h; y = Math.min(sy, b - M); h = b - y } else if (hy === 1) h = Math.max(M, sy - y)
    patchClip(s.id, { crop: { x, y, w, h } })
  }
  const onStageDown = (e: React.PointerEvent) => {
    if (!stageRef.current) return
    const n = norm(e), hd = (e.target as HTMLElement).dataset.h?.split(',').map(Number) as [number, number] | undefined
    let s: Stage | null = null
    if (hd && selOverlay) s = { kind: 'ovSize', id: selOverlay.id, h: hd, o: selOverlay }
    else if (hd && selClip) s = cropActive ? { kind: 'cropSize', id: selClip.id, h: hd, c: selClip } : { kind: 'clipScale', id: selClip.id, n0: n, c: selClip }
    else if (cropActive && selClip) { if (inBox(n, cropBox(selClip))) s = { kind: 'cropPan', id: selClip.id, n0: n, c: selClip } }
    else {
      const ov = [...overlaysAt(overlays, playhead)].reverse().find((o) => inBox(n, o))
      if (ov) { select({ kind: 'overlay', id: ov.id }); s = { kind: 'ovMove', id: ov.id, n0: n, o: ov } }
      else if (clipAtHead && inBox(n, clipBox(clipAtHead))) { select({ kind: 'clip', id: clipAtHead.id }); s = { kind: 'clipMove', id: clipAtHead.id, n0: n, c: clipAtHead } }
      else select(null)
    }
    if (!s) return
    e.preventDefault(); record()
    const st = s, mv = (ev: PointerEvent) => stageMove(st, norm(ev)), up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  const handleBox: { box: Rect; handles: Array<[number, number]>; tone: string } | null =
    selOverlay && playhead >= selOverlay.start && playhead < selOverlay.start + selOverlay.duration ? { box: selOverlay, handles: [[0, 0], [1, 0], [0, 1], [1, 1]], tone: 'border-violet-300' }
      : selClip && clipAtHead?.id === selClip.id ? (cropActive
        ? { box: cropBox(selClip), handles: cropLock === 'output' ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]], tone: 'border-amber-300' }
        : { box: clipBox(selClip), handles: [[0, 0], [1, 0], [0, 1], [1, 1]], tone: 'border-indigo-300' }) : null

  // ---- Export -------------------------------------------------------------
  const handleExport = async () => {
    if (!clips.length) return
    pauseAll(); setCropMode(false); setExporting(true); setProgress(0); setExportError(false)
    const controller = (abortRef.current = new AbortController())
    const opts = { format, width: project.w, height: project.h, fit: project.fit, onProgress: setProgress, signal: controller.signal }
    try {
      let result: { blob: Blob; ext: string }
      const fast = await import('./export-fast')
      try { result = await fast.exportTimelineFast(clips, overlays, audio, opts) } catch (err) { if (!(err instanceof fast.FastExportUnsupportedError)) throw err; setProgress(0); result = await exportTimeline(clips, overlays, audio, opts) }
      triggerDownload(result.blob, `video-${Date.now()}.${result.ext}`)
    } catch (err) { if (!(err instanceof DOMException && err.name === 'AbortError')) { console.error(err); setExportError(true) } } finally { setExporting(false); setProgress(0); abortRef.current = null }
  }

  const selected = selClip ?? selOverlay ?? (selection?.kind === 'audio' ? audio.find((a) => a.id === selection.id) : undefined)
  const hasAny = clips.length + overlays.length + audio.length > 0
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.length) void addFiles([...e.target.files]); e.target.value = '' }

  return <div onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false) }} onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) void addFiles([...e.dataTransfer.files]) }}>
    <ToolHeader title={t.title} intro={t.intro} />

    <div className="glass flex flex-wrap gap-2 rounded-2xl p-3">
      <button className={btnPrimary} onClick={() => clipInputRef.current?.click()}><Plus className="size-4" />{t.addClip}</button>
      <button className={`${btnGhost} ${urlOpen ? '!border-indigo-400/50 !bg-indigo-500/20 !text-white' : ''}`} onClick={() => setUrlOpen((v) => !v)}><Link2 className="size-4" />{t.fromUrl}</button>
      <button className={btnGhost} onClick={addText}><Type className="size-4" />{t.addText}</button>
      <button className={btnGhost} onClick={() => imageInputRef.current?.click()}><ImageIcon className="size-4" />{t.addImage}</button>
      <button className={btnGhost} onClick={addColor}><Square className="size-4" />{t.addColor}</button>
      <button className={btnGhost} onClick={() => audioInputRef.current?.click()}><Music className="size-4" />{t.addAudio}</button>
      <input ref={clipInputRef} type="file" accept="video/*" multiple className="hidden" onChange={onPick} />
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <input ref={audioInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={onPick} />
    </div>
    {urlOpen && <UrlImport t={t} allowed={!!user && canUseApp('yt-dlp')} onFile={(f) => addFiles([f])} onClose={() => setUrlOpen(false)} />}
    {loadError && <p className="mt-3 text-sm text-rose-400">{t.loadError}</p>}

    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className={`glass flex min-h-[320px] flex-col rounded-2xl p-4 transition ${dragOver ? 'ring-2 ring-indigo-400/60' : ''}`}>
        <div className="flex flex-1 items-center justify-center">
          <div className={`relative w-fit max-w-full ${clips.length ? '' : 'hidden'}`}>
            <canvas ref={canvasRef} width={project.w} height={project.h} className="block max-h-[58vh] max-w-full rounded-xl bg-black shadow-2xl shadow-black/40" />
            <div ref={stageRef} onPointerDown={onStageDown} className={`absolute inset-0 touch-none overflow-hidden rounded-xl ${cropActive ? 'cursor-move' : ''}`}>
              {handleBox && <div className={`pointer-events-none absolute border-2 border-dashed ${handleBox.tone}`} style={{ left: `${handleBox.box.x * 100}%`, top: `${handleBox.box.y * 100}%`, width: `${handleBox.box.w * 100}%`, height: `${handleBox.box.h * 100}%` }}>
                {cropActive && <><div className="absolute inset-y-0 left-1/3 border-l border-white/30" /><div className="absolute inset-y-0 left-2/3 border-l border-white/30" /><div className="absolute inset-x-0 top-1/3 border-t border-white/30" /><div className="absolute inset-x-0 top-2/3 border-t border-white/30" /></>}
                {handleBox.handles.map(([hx, hy]) => <div key={`${hx},${hy}`} data-h={`${hx},${hy}`} className="pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-slate-900 bg-white shadow" style={{ left: `${hx * 100}%`, top: `${hy * 100}%`, cursor: hx === 0.5 ? 'ns-resize' : hy === 0.5 ? 'ew-resize' : hx === hy ? 'nwse-resize' : 'nesw-resize' }} />)}
              </div>}
            </div>
          </div>
          {!clips.length && <div className="py-16 text-center"><Clapperboard className="mx-auto size-12 text-slate-600" /><p className="mt-3 font-medium text-slate-300">{t.empty}</p><p className="text-sm text-slate-500">{t.emptyHint}</p></div>}
        </div>
        {clips.length > 0 && <div className="mt-4 flex items-center gap-3">
          <button onClick={togglePlay} title={playing ? t.pause : t.play} className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-90">{playing ? <Pause className="size-5" /> : <Play className="size-5" />}</button>
          <button onClick={() => { pauseAll(); seekTo(0) }} title={t.stop} className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"><SkipBack className="size-4" /></button>
          <input type="range" min={0} max={total || 0} step={0.01} value={Math.min(playhead, total)} onChange={(e) => seekTo(Number(e.target.value))} className="flex-1 accent-indigo-500" />
          {selClip && clipAtHead?.id === selClip.id && <button onClick={() => setCropMode((v) => !v)} title={cropMode ? t.doneCrop : t.editCrop} className={`grid size-9 shrink-0 place-items-center rounded-full border transition ${cropMode ? 'border-amber-300/60 bg-amber-400/20 text-amber-200' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}><Crop className="size-4" /></button>}
          <span className="shrink-0 font-mono text-xs tabular-nums text-slate-400">{fmtTime(playhead)} / {fmtTime(total)}</span>
        </div>}
      </div>

      <div className="glass rounded-2xl p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">{t.inspector}</h2>
        <div className="mt-3">
          {!selected ? <p className="text-sm text-slate-500">{t.nothingSelected}</p>
            : selClip ? <ClipInspector clip={selClip} t={t} outAspect={project.w / project.h} cropMode={cropMode} cropLock={cropLock} onChange={(p) => { record(editKey(selClip.id, p)); patchClip(selClip.id, p) }} onMove={(d) => moveClip(selClip.id, d)} onSplit={split} onDelete={removeSelected}
              onCropMode={(v) => { setCropMode(v); const p = placed.find((x) => x.clip.id === selClip.id); if (v && p && (playhead < p.offset || playhead >= p.offset + p.length)) seekTo(p.offset) }} onCropLock={setCropLock} />
              : selOverlay ? <OverlayInspector overlay={selOverlay} t={t} onChange={(p) => { record(editKey(selOverlay.id, p)); patchOverlay(selOverlay.id, p) }} onSplit={split} onDelete={removeSelected} />
                : <AudioInspector track={selected as AudioTrack} t={t} onChange={(p) => { record(editKey(selected.id, p)); patchAudio(selected.id, p) }} onSplit={split} onDelete={removeSelected} />}
        </div>
      </div>
    </div>

    {clips.length > 0 && <div className="glass mt-6 rounded-2xl p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300"><Crop className="size-4" /> {t.output}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2"><span className="text-xs text-slate-400">{t.aspect}</span><Pills value={project.aspect} options={(['original', '16:9', '9:16', '1:1', '4:5', '4:3'] as const).map((a) => [a, a === 'original' ? t.original : a])} onChange={setAspect} /></div>
        <div className="flex items-center gap-2"><span className="text-xs text-slate-400">{t.fit}</span><Pills value={project.fit} options={[['cover', t.fill], ['contain', t.letterbox]]} onChange={(fit) => setProject((p) => ({ ...p, fit }))} /></div>
        <span className="font-mono text-xs text-slate-500">{project.w}×{project.h}</span>
      </div>
    </div>}

    {hasAny && <Timeline t={t} placed={placed} overlays={overlays} audio={audio} total={total} rulerDuration={rulerDuration} playhead={playhead} playing={playing} selection={selection}
      zoom={zoom} setZoom={setZoom} snap={snap} setSnap={setSnap} canUndo={histLen.past > 0} canRedo={histLen.future > 0}
      onSeek={seekTo} onSelect={select} onBegin={() => record()} onUndo={undo} onRedo={redo} onSplit={split} onDelete={removeSelected}
      onUpdateClip={patchClip} onUpdateOverlay={patchOverlay} onUpdateAudio={patchAudio} onReorder={reorder} />}

    <div className="glass mt-6 rounded-2xl p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300"><Download className="size-4" /> {t.export}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2"><span className="text-xs text-slate-400">{t.format}</span>
          <div className="flex overflow-hidden rounded-lg border border-white/10">{(['mp4', 'webm'] as ClipFormat[]).map((f) => <button key={f} onClick={() => setFormat(f)} disabled={!formats[f] || exporting} title={!formats[f] ? t.mp4Unsupported : undefined} className={`px-3 py-1 text-xs font-medium uppercase transition disabled:opacity-30 ${format === f ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>{f}</button>)}</div>
        </div>
        {exporting ? <div className="flex min-w-[220px] flex-1 items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <span className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="size-3.5 animate-spin" /> {Math.round(progress * 100)}%</span>
          <button onClick={() => abortRef.current?.abort()} className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10"><X className="size-3" /> {t.cancel}</button>
        </div> : <button onClick={handleExport} disabled={!clips.length || !canExport} className={`${btnPrimary} disabled:cursor-not-allowed disabled:opacity-40`}><Download className="size-4" /> {t.exportVideo}</button>}
      </div>
      <p className="mt-2 text-xs text-slate-500">{t.exportNote}</p>
      {!formats[format] && <p className="mt-1 text-xs text-amber-400">{t.mp4Unsupported}</p>}
      {!canExport && <p className="mt-1 text-xs text-amber-400">{t.recordUnsupported}</p>}
      {exportError && <p className="mt-2 text-sm text-rose-400">{t.exportError}</p>}
    </div>

    <div ref={poolRef} className="pointer-events-none fixed left-[-200vw] top-0 size-px overflow-hidden" aria-hidden />
  </div>
}
