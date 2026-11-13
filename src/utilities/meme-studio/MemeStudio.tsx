import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Download,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  Laugh,
  Loader2,
  Plus,
  RotateCw,
  Search,
  Trash2,
  Type,
  Upload,
  Video,
  X,
} from 'lucide-react'
import { useT } from '../../i18n/LanguageContext'
import {
  captionBounds,
  displayedSize,
  drawMeme,
  type Caption,
  type Rotate,
  type Transform,
} from './render'
import {
  exportStill,
  recordClip,
  recorderSupported,
  supportedFormats,
  triggerDownload,
  type ClipFormat,
} from './export'
import { ToolHeader } from '../../components/ToolHeader'

/**
 * Meme Studio — an imgflip-style meme maker.
 *
 *  • Browse 100 trending meme templates from Imgflip's free, key-less public
 *    API (api.imgflip.com/get_memes). Both the API and the image host send
 *    `Access-Control-Allow-Origin: *`, so templates load straight into a
 *    crossOrigin canvas without tainting it — no proxy/backend needed.
 *  • Or upload your own image, GIF or video.
 *  • Edit: add draggable Impact-style captions, and FLIP/ROTATE the media.
 *  • Export: still images download as PNG; videos and GIFs are re-recorded to
 *    WebM/MP4 with the flip and captions burned in (see ./export.ts).
 *
 * Nothing is uploaded or saved — everything runs in the browser, so the tool
 * needs no account.
 */

const MEMES_API = 'https://api.imgflip.com/get_memes'

interface Template {
  id: string
  name: string
  url: string
  width: number
  height: number
}

type MediaKind = 'image' | 'gif' | 'video'
interface Media {
  kind: MediaKind
  w: number
  h: number
  name: string
}

const STR = {
  en: {
    title: 'Meme Studio',
    intro:
      'Pick a trending template or upload your own image, GIF or video. Add captions, flip or rotate it, then download. Everything happens in your browser — nothing is uploaded.',
    templates: 'Templates',
    upload: 'Upload',
    searchPlaceholder: 'Search templates…',
    loadingTemplates: 'Loading templates…',
    templatesError: 'Could not load templates. Check your connection and try again.',
    retry: 'Retry',
    noResults: 'No templates match your search.',
    dropHere: 'Choose an image, GIF or video',
    dropHint: 'PNG, JPG, GIF, WebP, MP4, WebM — up to ~100 MB',
    browse: 'Browse files',
    captions: 'Captions',
    addText: 'Add text',
    noMedia: 'Pick a template or upload a file to start',
    noMediaHint: 'Your canvas will appear here.',
    textPlaceholder: 'Caption text…',
    size: 'Size',
    color: 'Color',
    outline: 'Outline',
    deleteCaption: 'Delete caption',
    transform: 'Flip & rotate',
    flipH: 'Flip horizontal',
    flipV: 'Flip vertical',
    rotate: 'Rotate 90°',
    reset: 'Reset',
    dragHint: 'Tip: drag a caption on the canvas to reposition it.',
    download: 'Download',
    downloadPng: 'Download PNG',
    downloadFrame: 'Download frame (PNG)',
    renderVideo: 'Render & download video',
    rendering: 'Rendering…',
    cancel: 'Cancel',
    gifDuration: 'Clip length (s)',
    format: 'Format',
    mp4Unsupported: 'This browser can’t encode MP4 — use WebM, or try Safari/Edge.',
    recordUnsupported: 'Your browser can’t record video — still-frame PNG export only.',
    exportError: 'Export failed. Try again.',
    loadError: 'Could not load that file.',
  },
  nl: {
    title: 'Meme Studio',
    intro:
      'Kies een populaire template of upload je eigen afbeelding, GIF of video. Voeg bijschriften toe, spiegel of draai en download. Alles gebeurt in je browser — er wordt niets geüpload.',
    templates: 'Templates',
    upload: 'Uploaden',
    searchPlaceholder: 'Templates zoeken…',
    loadingTemplates: 'Templates laden…',
    templatesError: 'Kon templates niet laden. Controleer je verbinding en probeer opnieuw.',
    retry: 'Opnieuw',
    noResults: 'Geen templates gevonden.',
    dropHere: 'Kies een afbeelding, GIF of video',
    dropHint: 'PNG, JPG, GIF, WebP, MP4, WebM — tot ~100 MB',
    browse: 'Bestanden kiezen',
    captions: 'Bijschriften',
    addText: 'Tekst toevoegen',
    noMedia: 'Kies een template of upload een bestand om te starten',
    noMediaHint: 'Je canvas verschijnt hier.',
    textPlaceholder: 'Bijschrifttekst…',
    size: 'Grootte',
    color: 'Kleur',
    outline: 'Rand',
    deleteCaption: 'Bijschrift verwijderen',
    transform: 'Spiegelen & draaien',
    flipH: 'Horizontaal spiegelen',
    flipV: 'Verticaal spiegelen',
    rotate: '90° draaien',
    reset: 'Resetten',
    dragHint: 'Tip: sleep een bijschrift op het canvas om het te verplaatsen.',
    download: 'Downloaden',
    downloadPng: 'PNG downloaden',
    downloadFrame: 'Frame downloaden (PNG)',
    renderVideo: 'Video renderen & downloaden',
    rendering: 'Renderen…',
    cancel: 'Annuleren',
    gifDuration: 'Clipduur (s)',
    format: 'Formaat',
    mp4Unsupported: 'Deze browser kan geen MP4 maken — gebruik WebM of probeer Safari/Edge.',
    recordUnsupported: 'Je browser kan geen video opnemen — alleen PNG-export.',
    exportError: 'Export mislukt. Probeer opnieuw.',
    loadError: 'Kon dat bestand niet laden.',
  },
}

let captionSeq = 0
function newCaption(ny: number, text = ''): Caption {
  captionSeq += 1
  return {
    id: `c${captionSeq}`,
    text,
    nx: 0.5,
    ny,
    size: 0.1,
    color: '#ffffff',
    outline: true,
    uppercase: true,
  }
}

const DEFAULT_TRANSFORM: Transform = { flipH: false, flipV: false, rotate: 0 }

export function MemeStudio() {
  const t = useT(STR)

  const [tab, setTab] = useState<'templates' | 'upload'>('templates')
  const [templates, setTemplates] = useState<Template[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState(false)
  const [search, setSearch] = useState('')

  const [media, setMedia] = useState<Media | null>(null)
  const [captions, setCaptions] = useState<Caption[]>([])
  const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [exportError, setExportError] = useState(false)
  const [gifDuration, setGifDuration] = useState(3)
  const [dragging, setDragging] = useState(false)
  const formats = supportedFormats()
  const [format, setFormat] = useState<ClipFormat>(() => (supportedFormats().mp4 ? 'mp4' : 'webm'))

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Latest state for the rAF loop to read without re-subscribing every frame.
  const stateRef = useRef({ media, captions, transform })
  useEffect(() => {
    stateRef.current = { media, captions, transform }
  })

  const canRecord = recorderSupported()

  // ---- Templates ----------------------------------------------------------
  const fetchTemplates = useCallback(() => {
    setTemplatesLoading(true)
    setTemplatesError(false)
    fetch(MEMES_API)
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && Array.isArray(json.data?.memes)) {
          setTemplates(
            json.data.memes.map((m: Template) => ({
              id: m.id,
              name: m.name,
              url: m.url,
              width: m.width,
              height: m.height,
            }))
          )
        } else {
          setTemplatesError(true)
        }
      })
      .catch(() => setTemplatesError(true))
      .finally(() => setTemplatesLoading(false))
  }, [])

  useEffect(() => {
    if (tab === 'templates' && templates.length === 0 && !templatesLoading && !templatesError) {
      // fetchTemplates sets loading/error state; the synchronous setState on
      // mount is intentional (kick off the request immediately).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchTemplates()
    }
  }, [tab, templates.length, templatesLoading, templatesError, fetchTemplates])

  // ---- Source loading -----------------------------------------------------
  const resetEditor = useCallback((kind: MediaKind, w: number, h: number, name: string) => {
    setCaptions([newCaption(0.12), newCaption(0.88)])
    setTransform(DEFAULT_TRANSFORM)
    setSelectedId(null)
    setLoadError(false)
    setExportError(false)
    setMedia({ kind, w, h, name })
  }, [])

  const loadTemplate = useCallback(
    (tpl: Template) => {
      const img = imgRef.current
      if (!img) return
      setLoadError(false)
      img.onload = () => resetEditor('image', img.naturalWidth, img.naturalHeight, tpl.name)
      img.onerror = () => setLoadError(true)
      img.crossOrigin = 'anonymous'
      img.src = tpl.url
    },
    [resetEditor]
  )

  const loadFile = useCallback(
    (file: File) => {
      setLoadError(false)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(file)
      objectUrlRef.current = url
      const isVideo = file.type.startsWith('video/')
      const isGif = file.type === 'image/gif'

      if (isVideo) {
        const v = videoRef.current
        if (!v) return
        v.onloadeddata = () => {
          resetEditor('video', v.videoWidth, v.videoHeight, file.name)
          v.loop = true
          v.muted = true
          v.play().catch(() => {})
        }
        v.onerror = () => setLoadError(true)
        v.crossOrigin = 'anonymous'
        v.src = url
        v.load()
      } else {
        const img = imgRef.current
        if (!img) return
        img.onload = () =>
          resetEditor(isGif ? 'gif' : 'image', img.naturalWidth, img.naturalHeight, file.name)
        img.onerror = () => setLoadError(true)
        img.removeAttribute('crossorigin') // same-origin object URL
        img.src = url
      }
    },
    [resetEditor]
  )

  // Revoke any object URL on unmount.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  // ---- Rendering ----------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const { media: m, captions: caps, transform: tf } = stateRef.current
    if (!canvas || !m) return
    const src = m.kind === 'video' ? videoRef.current : imgRef.current
    if (!src) return
    const { dw, dh } = displayedSize(m.w, m.h, tf.rotate)
    if (canvas.width !== dw) canvas.width = dw
    if (canvas.height !== dh) canvas.height = dh
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawMeme(ctx, src, m.w, m.h, tf, caps, dw, dh)
  }, [])

  // Animated sources (gif/video) redraw every frame; stills redraw on change.
  useEffect(() => {
    if (!media) return
    if (media.kind === 'gif' || media.kind === 'video') {
      let raf = 0
      const loop = () => {
        draw()
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
      return () => cancelAnimationFrame(raf)
    }
    draw()
  }, [media, draw])

  // Still images: redraw when captions/transform change (animated ones already
  // redraw continuously via the rAF loop above).
  useEffect(() => {
    if (media && media.kind === 'image') draw()
  }, [captions, transform, media, draw])

  // ---- Caption dragging on the canvas ------------------------------------
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const pointerToNorm = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      nx: (e.clientX - rect.left) / rect.width,
      ny: (e.clientY - rect.top) / rect.height,
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas || !media) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { dw, dh } = displayedSize(media.w, media.h, transform.rotate)
    const { nx, ny } = pointerToNorm(e)
    const px = nx * dw
    const py = ny * dh
    // Topmost (last drawn) caption first.
    for (let i = captions.length - 1; i >= 0; i--) {
      const cap = captions[i]
      const b = captionBounds(ctx, cap, dw, dh)
      const pad = dh * 0.02
      if (px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad) {
        setSelectedId(cap.id)
        dragRef.current = { id: cap.id, dx: nx - cap.nx, dy: ny - cap.ny }
        setDragging(true)
        canvas.setPointerCapture(e.pointerId)
        e.preventDefault()
        return
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const { nx, ny } = pointerToNorm(e)
    setCaptions((prev) =>
      prev.map((c) =>
        c.id === drag.id
          ? {
              ...c,
              nx: Math.min(1, Math.max(0, nx - drag.dx)),
              ny: Math.min(1, Math.max(0, ny - drag.dy)),
            }
          : c
      )
    )
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      canvasRef.current?.releasePointerCapture(e.pointerId)
      dragRef.current = null
      setDragging(false)
    }
  }

  // ---- Caption editing ----------------------------------------------------
  const updateCaption = (id: string, patch: Partial<Caption>) =>
    setCaptions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const addCaption = () => {
    const c = newCaption(0.5)
    setCaptions((prev) => [...prev, c])
    setSelectedId(c.id)
  }

  const removeCaption = (id: string) => {
    setCaptions((prev) => prev.filter((c) => c.id !== id))
    setSelectedId((cur) => (cur === id ? null : cur))
  }

  // ---- Transform ----------------------------------------------------------
  const rotate = () =>
    setTransform((tf) => ({ ...tf, rotate: (((tf.rotate + 90) % 360) as Rotate) }))

  // ---- Export -------------------------------------------------------------
  const currentSourceEl = () =>
    media?.kind === 'video' ? videoRef.current : imgRef.current

  const handleDownloadStill = async () => {
    const src = currentSourceEl()
    if (!media || !src) return
    setExportError(false)
    try {
      const blob = await exportStill(src, media.w, media.h, transform, captions)
      triggerDownload(blob, `meme-${Date.now()}.png`)
    } catch {
      setExportError(true)
    }
  }

  const handleRecord = async () => {
    const { kind } = media ?? {}
    if (!media || (kind !== 'video' && kind !== 'gif')) return
    const src = currentSourceEl()
    if (!src) return

    setExporting(true)
    setProgress(0)
    setExportError(false)
    const controller = new AbortController()
    abortRef.current = controller

    const video = videoRef.current
    const wasLoop = video?.loop ?? false
    if (kind === 'video' && video) video.loop = false

    try {
      const { blob, ext } = await recordClip(
        kind,
        src,
        media.w,
        media.h,
        transform,
        captions,
        {
          gifDurationSec: gifDuration,
          format,
          onProgress: setProgress,
          signal: controller.signal,
        }
      )
      triggerDownload(blob, `meme-${Date.now()}.${ext}`)
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setExportError(true)
    } finally {
      if (kind === 'video' && video) {
        video.loop = wasLoop
        video.muted = true
        video.currentTime = 0
        video.play().catch(() => {})
      }
      setExporting(false)
      setProgress(0)
      abortRef.current = null
    }
  }

  const cancelRecord = () => abortRef.current?.abort()

  // ---- Derived ------------------------------------------------------------
  const filtered = search.trim()
    ? templates.filter((tpl) => tpl.name.toLowerCase().includes(search.trim().toLowerCase()))
    : templates
  const isAnimated = media?.kind === 'gif' || media?.kind === 'video'

  return (
    <div>
      <ToolHeader title={t.title} intro={t.intro} />

      {/* Source picker */}
      <div className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex gap-2">
          <SourceTab active={tab === 'templates'} onClick={() => setTab('templates')} icon={<Search className="size-4" />}>
            {t.templates}
          </SourceTab>
          <SourceTab active={tab === 'upload'} onClick={() => setTab('upload')} icon={<Upload className="size-4" />}>
            {t.upload}
          </SourceTab>
        </div>

        {tab === 'templates' ? (
          <div className="mt-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 transition focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {templatesLoading ? (
              <p className="mt-6 flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="size-4 animate-spin" /> {t.loadingTemplates}
              </p>
            ) : templatesError ? (
              <div className="mt-6 text-sm text-slate-400">
                <p>{t.templatesError}</p>
                <button
                  onClick={fetchTemplates}
                  className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white hover:bg-white/10"
                >
                  {t.retry}
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="mt-6 text-sm text-slate-400">{t.noResults}</p>
            ) : (
              <div className="mt-4 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {filtered.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => loadTemplate(tpl)}
                    title={tpl.name}
                    className="group overflow-hidden rounded-xl border border-white/10 bg-white/5 transition hover:border-indigo-400/60"
                  >
                    <img
                      src={tpl.url}
                      alt={tpl.name}
                      loading="lazy"
                      className="aspect-square w-full object-cover transition group-hover:scale-105"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-10 text-center transition hover:border-indigo-400/60 hover:bg-white/[0.06]"
            >
              <ImagePlus className="size-8 text-indigo-400" />
              <span className="font-medium text-white">{t.dropHere}</span>
              <span className="text-xs text-slate-500">{t.dropHint}</span>
              <span className="mt-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1.5 text-sm font-medium text-white">
                {t.browse}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) loadFile(file)
                e.target.value = ''
              }}
            />
          </div>
        )}
        {loadError && <p className="mt-3 text-sm text-rose-400">{t.loadError}</p>}
      </div>

      {/* Editor */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Preview */}
        <div className="glass flex min-h-[320px] flex-col items-center justify-center rounded-2xl p-4">
          {media ? (
            <>
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className={`block h-auto max-h-[62vh] max-w-full touch-none rounded-xl shadow-2xl shadow-black/40 ${
                  dragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              />
              <p className="mt-3 text-center text-xs text-slate-500">{t.dragHint}</p>
            </>
          ) : (
            <div className="text-center">
              <Laugh className="mx-auto size-12 text-slate-600" />
              <p className="mt-3 font-medium text-slate-300">{t.noMedia}</p>
              <p className="text-sm text-slate-500">{t.noMediaHint}</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-6">
          {/* Captions */}
          <section className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
                <Type className="size-4" /> {t.captions}
              </h2>
              <button
                onClick={addCaption}
                disabled={!media}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white transition hover:bg-white/10 disabled:opacity-40"
              >
                <Plus className="size-3.5" /> {t.addText}
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {captions.map((cap) => (
                <div
                  key={cap.id}
                  onFocusCapture={() => setSelectedId(cap.id)}
                  className={`rounded-xl border p-2.5 transition ${
                    selectedId === cap.id
                      ? 'border-indigo-400/60 bg-indigo-500/5'
                      : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={cap.text}
                      onChange={(e) => updateCaption(cap.id, { text: e.target.value })}
                      placeholder={t.textPlaceholder}
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:border-indigo-400/60 focus:outline-none"
                    />
                    <input
                      type="color"
                      value={cap.color}
                      onChange={(e) => updateCaption(cap.id, { color: e.target.value })}
                      title={t.color}
                      className="size-8 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                    />
                    <button
                      onClick={() => removeCaption(cap.id)}
                      title={t.deleteCaption}
                      className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <label className="flex flex-1 items-center gap-2 text-xs text-slate-400">
                      {t.size}
                      <input
                        type="range"
                        min={0.04}
                        max={0.25}
                        step={0.005}
                        value={cap.size}
                        onChange={(e) => updateCaption(cap.id, { size: Number(e.target.value) })}
                        className="flex-1 accent-indigo-500"
                      />
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={cap.outline}
                        onChange={(e) => updateCaption(cap.id, { outline: e.target.checked })}
                        className="size-3.5 accent-indigo-500"
                      />
                      {t.outline}
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Transform */}
          <section className="glass rounded-2xl p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              {t.transform}
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <TransformButton
                active={transform.flipH}
                disabled={!media}
                onClick={() => setTransform((tf) => ({ ...tf, flipH: !tf.flipH }))}
                icon={<FlipHorizontal2 className="size-5" />}
                label={t.flipH}
              />
              <TransformButton
                active={transform.flipV}
                disabled={!media}
                onClick={() => setTransform((tf) => ({ ...tf, flipV: !tf.flipV }))}
                icon={<FlipVertical2 className="size-5" />}
                label={t.flipV}
              />
              <TransformButton
                active={transform.rotate !== 0}
                disabled={!media}
                onClick={rotate}
                icon={<RotateCw className="size-5" />}
                label={`${t.rotate}${transform.rotate ? ` (${transform.rotate}°)` : ''}`}
              />
            </div>
            <button
              onClick={() => setTransform(DEFAULT_TRANSFORM)}
              disabled={!media}
              className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
            >
              {t.reset}
            </button>
          </section>

          {/* Export */}
          <section className="glass rounded-2xl p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
              <Download className="size-4" /> {t.download}
            </h2>
            <div className="mt-3 space-y-2">
              {isAnimated ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">{t.format}</span>
                    <div className="flex overflow-hidden rounded-lg border border-white/10">
                      {(['webm', 'mp4'] as ClipFormat[]).map((f) => {
                        const enabled = formats[f]
                        return (
                          <button
                            key={f}
                            onClick={() => enabled && setFormat(f)}
                            disabled={!enabled || exporting}
                            title={!enabled ? t.mp4Unsupported : undefined}
                            className={`px-3 py-1 text-xs font-medium uppercase transition disabled:opacity-30 ${
                              format === f
                                ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white'
                                : 'bg-white/5 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {f}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {format === 'mp4' && !formats.mp4 && (
                    <p className="text-xs text-amber-400">{t.mp4Unsupported}</p>
                  )}
                  {media?.kind === 'gif' && (
                    <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
                      {t.gifDuration}
                      <input
                        type="number"
                        min={0.5}
                        max={30}
                        step={0.5}
                        value={gifDuration}
                        onChange={(e) => setGifDuration(Number(e.target.value) || 3)}
                        className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right text-white focus:border-indigo-400/60 focus:outline-none"
                      />
                    </label>
                  )}
                  {exporting ? (
                    <div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                          style={{ width: `${Math.round(progress * 100)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="size-3.5 animate-spin" /> {t.rendering}{' '}
                          {Math.round(progress * 100)}%
                        </span>
                        <button
                          onClick={cancelRecord}
                          className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-white hover:bg-white/10"
                        >
                          <X className="size-3" /> {t.cancel}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleRecord}
                      disabled={!media || !canRecord}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Video className="size-4" /> {t.renderVideo}
                    </button>
                  )}
                  {!canRecord && <p className="text-xs text-amber-400">{t.recordUnsupported}</p>}
                  <button
                    onClick={handleDownloadStill}
                    disabled={!media || exporting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-40"
                  >
                    <Download className="size-4" /> {t.downloadFrame}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDownloadStill}
                  disabled={!media}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="size-4" /> {t.downloadPng}
                </button>
              )}
              {exportError && <p className="text-sm text-rose-400">{t.exportError}</p>}
            </div>
          </section>
        </div>
      </div>

      {/* Hidden source elements — kept rendered (off-screen) so GIFs keep
          animating and videos keep decoding while we draw them to the canvas. */}
      <img ref={imgRef} alt="" className="pointer-events-none fixed left-[-200vw] top-0 opacity-0" />
      <video
        ref={videoRef}
        playsInline
        muted
        className="pointer-events-none fixed left-[-200vw] top-0 opacity-0"
      />
    </div>
  )
}

function SourceTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
        active
          ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25'
          : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function TransformButton({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean
  disabled: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] transition disabled:opacity-40 ${
        active
          ? 'border-indigo-400/60 bg-indigo-500/15 text-white'
          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon}
      <span className="leading-tight">{label}</span>
    </button>
  )
}
