import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import {
  Check,
  Download,
  Film,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Sparkles,
  UploadCloud,
  WandSparkles,
  X,
} from 'lucide-react'
import { useT } from '../../i18n/LanguageContext'
import {
  canRenderVideo,
  compositeImage,
  cutOutImage,
  downloadBlob,
  renderVideo,
  type ImageQuality,
  type VideoBackground,
} from './engine'

type MediaKind = 'image' | 'video'
type Phase = 'idle' | 'loading' | 'processing' | 'done'

interface SourceMedia {
  file: File
  url: string
  kind: MediaKind
  width: number
  height: number
  duration: number
}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_VIDEO_BYTES = 250 * 1024 * 1024
const MAX_VIDEO_SECONDS = 90

const STR = {
  en: {
    eyebrow: 'Private, on-device AI',
    titleStart: 'Keep the subject.',
    titleAccent: 'Lose the background.',
    intro: 'Clean cutouts for products, portraits and short videos. Your files are processed on this device and never uploaded.',
    image: 'Image',
    video: 'Video',
    imageHint: 'Any subject · highest quality',
    videoHint: 'People · up to 90 seconds',
    dropImage: 'Drop an image here',
    dropVideo: 'Drop a video here',
    dropHint: 'or choose a file from your device',
    choose: 'Choose file',
    imageFormats: 'PNG, JPG or WebP · up to 25 MB',
    videoFormats: 'MP4, WebM or MOV · up to 250 MB',
    settings: 'Cutout settings',
    quality: 'Model quality',
    fast: 'Fast',
    fastHint: 'Smallest model',
    balanced: 'Balanced',
    balancedHint: 'Best default',
    best: 'Best',
    bestHint: 'Maximum detail',
    background: 'Background',
    transparent: 'Clear',
    white: 'White',
    black: 'Black',
    green: 'Green',
    custom: 'Custom',
    feather: 'Edge softness',
    sharp: 'Sharp',
    soft: 'Soft',
    remove: 'Remove background',
    loading: 'Loading AI model',
    processingImage: 'Finding every edge',
    processingVideo: 'Cutting out video',
    firstRun: 'The first run downloads the open-source model. Later runs are cached.',
    original: 'Original',
    result: 'Result',
    downloadImage: 'Download PNG',
    downloadVideo: 'Download WebM',
    another: 'Start over',
    change: 'Change file',
    privacy: 'Stays on your device',
    privacyHint: 'No uploads, accounts or watermarks.',
    openSource: 'Open-source engines',
    openSourceHint: 'rembg for images · MediaPipe for video',
    local: 'Browser powered',
    localHint: 'Uses your CPU or GPU, not a paid API.',
    videoNote: 'Video mode is optimized for people. Transparent WebM support varies between editors; choose green for maximum compatibility.',
    invalidImage: 'Choose a PNG, JPG or WebP image.',
    invalidVideo: 'Choose an MP4, WebM or MOV video.',
    tooLarge: 'That file is larger than the allowed limit.',
    tooLong: 'Keep videos under 90 seconds.',
    decodeError: 'This file could not be read by your browser.',
    failed: 'Background removal failed. Try another file or quality setting.',
    unsupported: 'This browser cannot render video. Try a recent Chrome, Edge, Firefox or Safari.',
    cancel: 'Cancel',
  },
  nl: {
    eyebrow: 'Privé-AI op je apparaat',
    titleStart: 'Behoud het onderwerp.',
    titleAccent: 'Wis de achtergrond.',
    intro: 'Strakke uitsnedes voor producten, portretten en korte video’s. Je bestanden worden op dit apparaat verwerkt en nooit geüpload.',
    image: 'Afbeelding',
    video: 'Video',
    imageHint: 'Elk onderwerp · hoogste kwaliteit',
    videoHint: 'Personen · tot 90 seconden',
    dropImage: 'Sleep een afbeelding hierheen',
    dropVideo: 'Sleep een video hierheen',
    dropHint: 'of kies een bestand op je apparaat',
    choose: 'Bestand kiezen',
    imageFormats: 'PNG, JPG of WebP · tot 25 MB',
    videoFormats: 'MP4, WebM of MOV · tot 250 MB',
    settings: 'Instellingen',
    quality: 'Modelkwaliteit',
    fast: 'Snel',
    fastHint: 'Kleinste model',
    balanced: 'Gebalanceerd',
    balancedHint: 'Beste standaard',
    best: 'Beste',
    bestHint: 'Maximaal detail',
    background: 'Achtergrond',
    transparent: 'Helder',
    white: 'Wit',
    black: 'Zwart',
    green: 'Groen',
    custom: 'Eigen',
    feather: 'Zachte rand',
    sharp: 'Scherp',
    soft: 'Zacht',
    remove: 'Achtergrond verwijderen',
    loading: 'AI-model laden',
    processingImage: 'Elke rand zoeken',
    processingVideo: 'Video uitsnijden',
    firstRun: 'De eerste keer wordt het open-sourcemodel gedownload. Daarna blijft het in de cache.',
    original: 'Origineel',
    result: 'Resultaat',
    downloadImage: 'PNG downloaden',
    downloadVideo: 'WebM downloaden',
    another: 'Opnieuw beginnen',
    change: 'Bestand wijzigen',
    privacy: 'Blijft op je apparaat',
    privacyHint: 'Geen uploads, accounts of watermerken.',
    openSource: 'Open-source engines',
    openSourceHint: 'rembg voor foto’s · MediaPipe voor video',
    local: 'Door je browser',
    localHint: 'Gebruikt je CPU of GPU, geen betaalde API.',
    videoNote: 'Videomodus is geoptimaliseerd voor personen. Transparante WebM werkt niet in elke editor; kies groen voor maximale compatibiliteit.',
    invalidImage: 'Kies een PNG-, JPG- of WebP-afbeelding.',
    invalidVideo: 'Kies een MP4-, WebM- of MOV-video.',
    tooLarge: 'Dat bestand is groter dan de toegestane limiet.',
    tooLong: 'Houd video’s korter dan 90 seconden.',
    decodeError: 'Je browser kon dit bestand niet lezen.',
    failed: 'Achtergrond verwijderen is mislukt. Probeer een ander bestand of kwaliteitsniveau.',
    unsupported: 'Deze browser kan geen video maken. Probeer een recente Chrome, Edge, Firefox of Safari.',
    cancel: 'Annuleren',
  },
}

const backgroundChoices: { value: VideoBackground; color: string }[] = [
  { value: 'transparent', color: 'transparent' },
  { value: 'white', color: '#fff' },
  { value: 'black', color: '#050505' },
  { value: 'green', color: '#00e676' },
  { value: 'custom', color: 'linear-gradient(135deg,#818cf8,#22d3ee)' },
]

export function BackgroundRemover() {
  const t = useT(STR)
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceUrlRef = useRef<string | null>(null)
  const resultUrlRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [kind, setKind] = useState<MediaKind>('image')
  const [source, setSource] = useState<SourceMedia | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultUrl, setResultUrl] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [quality, setQuality] = useState<ImageQuality>('balanced')
  const [background, setBackground] = useState<VideoBackground>('transparent')
  const [customColor, setCustomColor] = useState('#7c3aed')
  const [feather, setFeather] = useState(0.45)
  const [view, setView] = useState<'original' | 'result'>('result')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => {
    abortRef.current?.abort()
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
  }, [])

  const clearResult = () => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    resultUrlRef.current = null
    setResultUrl('')
    setResultBlob(null)
    setProgress(0)
    setView('result')
  }

  const reset = () => {
    abortRef.current?.abort()
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    sourceUrlRef.current = null
    clearResult()
    setSource(null)
    setPhase('idle')
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const switchKind = (next: MediaKind) => {
    if (next === kind) return
    reset()
    setKind(next)
  }

  const chooseFile = async (file?: File) => {
    if (!file) return
    setError('')
    const nextKind: MediaKind = file.type.startsWith('video/') ? 'video' : 'image'
    if (nextKind !== kind) setKind(nextKind)
    const valid = nextKind === 'image'
      ? ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      : file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name)
    if (!valid) {
      setError(nextKind === 'image' ? t.invalidImage : t.invalidVideo)
      return
    }
    if (file.size > (nextKind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) {
      setError(t.tooLarge)
      return
    }

    setPhase('loading')
    const url = URL.createObjectURL(file)
    try {
      const metadata = nextKind === 'image' ? await readImage(url) : await readVideo(url)
      if (nextKind === 'video' && metadata.duration > MAX_VIDEO_SECONDS) throw new Error('too-long')
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
      sourceUrlRef.current = url
      clearResult()
      setSource({ file, url, kind: nextKind, ...metadata })
      setPhase('idle')
    } catch (loadError) {
      URL.revokeObjectURL(url)
      setPhase('idle')
      setError(loadError instanceof Error && loadError.message === 'too-long' ? t.tooLong : t.decodeError)
    }
  }

  const process = async () => {
    if (!source) return
    if (source.kind === 'video' && !canRenderVideo()) {
      setError(t.unsupported)
      return
    }
    setError('')
    setProgress(0.01)
    setPhase('processing')
    const abort = new AbortController()
    abortRef.current = abort
    try {
      let blob: Blob
      if (source.kind === 'image') {
        blob = await cutOutImage(source.file, quality, setProgress)
      } else {
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas) throw new Error('Video is unavailable.')
        blob = await renderVideo(video, canvas, {
          background,
          customColor,
          feather,
          onProgress: setProgress,
          signal: abort.signal,
        })
      }
      const url = URL.createObjectURL(blob)
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
      resultUrlRef.current = url
      setResultBlob(blob)
      setResultUrl(url)
      setProgress(1)
      setView('result')
      setPhase('done')
    } catch (processError) {
      if (processError instanceof DOMException && processError.name === 'AbortError') {
        setPhase('idle')
      } else {
        setError(t.failed)
        setPhase('idle')
      }
    } finally {
      abortRef.current = null
    }
  }

  const download = async () => {
    if (!source || !resultBlob) return
    const stem = source.file.name.replace(/\.[^.]+$/, '')
    if (source.kind === 'image') {
      const blob = background === 'transparent'
        ? resultBlob
        : await compositeImage(resultUrl, background, customColor)
      downloadBlob(blob, `${stem}-no-bg.png`)
    } else {
      downloadBlob(resultBlob, `${stem}-no-bg.webm`)
    }
  }

  const previewColor = getPreviewColor(background, customColor)
  const percent = Math.round(progress * 100)

  return (
    <div className="mx-auto max-w-6xl animate-fade-up pb-16">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] px-5 py-10 text-center sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(129,140,248,.18),transparent_42%)]" />
        <div className="relative">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-200">
            <Sparkles className="size-3.5" /> {t.eyebrow}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            {t.titleStart} <span className="text-gradient">{t.titleAccent}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">{t.intro}</p>
        </div>
      </section>

      <div className="mx-auto mt-6 grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="glass overflow-hidden rounded-3xl">
          <div className="border-b border-white/8 p-2">
            <div className="grid grid-cols-2 rounded-2xl bg-black/20 p-1">
              {(['image', 'video'] as const).map((mediaKind) => (
                <button
                  key={mediaKind}
                  type="button"
                  onClick={() => switchKind(mediaKind)}
                  disabled={phase === 'processing'}
                  className={`flex items-center justify-center gap-3 rounded-xl px-3 py-3 text-left ${kind === mediaKind ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {mediaKind === 'image' ? <ImageIcon className="size-5" /> : <Film className="size-5" />}
                  <span>
                    <span className="block text-sm font-semibold">{mediaKind === 'image' ? t.image : t.video}</span>
                    <span className="hidden text-[11px] text-slate-500 sm:block">{mediaKind === 'image' ? t.imageHint : t.videoHint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {!source ? (
            <div className="p-4 sm:p-6">
              <div
                onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event: DragEvent<HTMLDivElement>) => {
                  event.preventDefault()
                  setDragging(false)
                  chooseFile(event.dataTransfer.files[0])
                }}
                className={`spotlight flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center transition ${dragging ? 'border-indigo-400 bg-indigo-400/10' : 'border-white/15 bg-black/10 hover:border-white/25 hover:bg-white/[0.025]'}`}
              >
                <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-400/10 text-indigo-300 shadow-[0_0_40px_rgba(99,102,241,.14)]">
                  {phase === 'loading' ? <LoaderCircle className="size-7 animate-spin" /> : <UploadCloud className="size-7" />}
                </div>
                <h2 className="text-xl font-bold text-white">{kind === 'image' ? t.dropImage : t.dropVideo}</h2>
                <p className="mt-1 text-sm text-slate-500">{t.dropHint}</p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-6 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 hover:brightness-110"
                >
                  {t.choose}
                </button>
                <p className="mt-4 text-xs text-slate-600">{kind === 'image' ? t.imageFormats : t.videoFormats}</p>
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{source.file.name}</p>
                  <p className="text-xs text-slate-500">{source.width} × {source.height}{source.kind === 'video' ? ` · ${formatDuration(source.duration)}` : ''} · {formatBytes(source.file.size)}</p>
                </div>
                <button type="button" onClick={reset} disabled={phase === 'processing'} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white" aria-label={t.change}>
                  <X className="size-4" />
                </button>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#11151d]">
                <div className="absolute left-3 top-3 z-10 flex rounded-lg border border-white/10 bg-[#080b11]/80 p-1 backdrop-blur">
                  {(['original', 'result'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setView(option)}
                      disabled={option === 'result' && !resultUrl && phase !== 'processing'}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === option ? 'bg-white/12 text-white' : 'text-slate-500 disabled:opacity-35'}`}
                    >
                      {option === 'original' ? t.original : t.result}
                    </button>
                  ))}
                </div>

                <div
                  className={`relative flex min-h-[420px] items-center justify-center ${background === 'transparent' ? 'bg-[linear-gradient(45deg,#171b24_25%,transparent_25%),linear-gradient(-45deg,#171b24_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#171b24_75%),linear-gradient(-45deg,transparent_75%,#171b24_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0px]' : ''}`}
                  style={previewColor ? { backgroundColor: previewColor } : undefined}
                >
                  {source.kind === 'image' ? (
                    <img
                      src={view === 'result' && resultUrl ? resultUrl : source.url}
                      alt=""
                      className="max-h-[560px] w-full object-contain"
                    />
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        src={source.url}
                        controls={phase !== 'processing' && !(view === 'result' && resultUrl)}
                        playsInline
                        className={`${phase === 'processing' || (view === 'result' && resultUrl) ? 'hidden' : 'max-h-[560px] w-full object-contain'}`}
                      />
                      <canvas ref={canvasRef} className={`${phase === 'processing' ? 'max-h-[560px] w-full object-contain' : 'hidden'}`} />
                      {view === 'result' && resultUrl && phase === 'done' && (
                        <video src={resultUrl} controls autoPlay loop muted playsInline className="max-h-[560px] w-full object-contain" />
                      )}
                    </>
                  )}

                  {phase === 'processing' && source.kind === 'image' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080b11]/80 backdrop-blur-sm">
                      <LoaderCircle className="size-9 animate-spin text-indigo-300" />
                      <p className="mt-4 font-semibold text-white">{progress < 0.12 ? t.loading : t.processingImage}</p>
                      <p className="mt-1 text-xs text-slate-500">{t.firstRun}</p>
                    </div>
                  )}
                </div>

                {phase === 'processing' && (
                  <div className="absolute inset-x-0 bottom-0 z-20 bg-[#080b11]/90 p-4 backdrop-blur">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-300">{source.kind === 'video' ? t.processingVideo : t.processingImage}</span>
                      <span className="font-mono text-indigo-300">{percent}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 transition-all" style={{ width: `${percent}%` }} /></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        <aside className="space-y-5">
          <section className="glass rounded-3xl p-5">
            <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-white"><WandSparkles className="size-4 text-indigo-300" /> {t.settings}</div>

            {kind === 'image' && (
              <div className="mb-6">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">{t.quality}</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['fast', 'balanced', 'best'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setQuality(option)}
                      disabled={phase === 'processing'}
                      className={`rounded-xl border px-2 py-2.5 text-center ${quality === option ? 'border-indigo-400/40 bg-indigo-400/10 text-indigo-200' : 'border-white/8 bg-white/[0.025] text-slate-400 hover:border-white/15'}`}
                    >
                      <span className="block text-xs font-semibold">{t[option]}</span>
                      <span className="mt-0.5 block text-[9px] text-slate-600">{t[`${option}Hint`]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">{t.background}</label>
              <div className="grid grid-cols-5 gap-2">
                {backgroundChoices.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => setBackground(choice.value)}
                    disabled={phase === 'processing' || (source?.kind === 'video' && phase === 'done')}
                    className={`group rounded-xl border p-1.5 ${background === choice.value ? 'border-indigo-400/60 bg-indigo-400/10' : 'border-white/8 bg-white/[0.025]'}`}
                    title={t[choice.value]}
                  >
                    <span
                      className={`relative mx-auto flex size-7 items-center justify-center overflow-hidden rounded-lg border border-white/10 ${choice.value === 'transparent' ? 'bg-[linear-gradient(45deg,#555_25%,transparent_25%),linear-gradient(-45deg,#555_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#555_75%),linear-gradient(-45deg,transparent_75%,#555_75%)] bg-[length:8px_8px] bg-[position:0_0,0_4px,4px_-4px,-4px_0px]' : ''}`}
                      style={choice.value !== 'transparent' ? { background: choice.value === 'custom' ? choice.color : choice.color } : undefined}
                    >
                      {background === choice.value && <Check className={`size-3.5 drop-shadow ${choice.value === 'white' ? 'text-black' : 'text-white'}`} />}
                    </span>
                  </button>
                ))}
              </div>
              {background === 'custom' && (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/8 bg-black/15 p-2">
                  <input type="color" value={customColor} onChange={(event) => setCustomColor(event.target.value)} className="size-8 cursor-pointer rounded-lg border-0 bg-transparent" />
                  <span className="font-mono text-xs uppercase text-slate-400">{customColor}</span>
                </div>
              )}
            </div>

            {kind === 'video' && (
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500"><span>{t.feather}</span><span className="font-mono text-indigo-300">{Math.round(feather * 100)}%</span></div>
                <input type="range" min="0" max="1" step="0.01" value={feather} onChange={(event) => setFeather(Number(event.target.value))} disabled={phase === 'processing'} className="w-full accent-indigo-500" />
                <div className="mt-1 flex justify-between text-[10px] text-slate-600"><span>{t.sharp}</span><span>{t.soft}</span></div>
              </div>
            )}

            {error && <p className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-3 py-2.5 text-xs leading-5 text-rose-300">{error}</p>}

            {phase === 'done' ? (
              <div className="space-y-2">
                <button type="button" onClick={download} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 hover:brightness-110">
                  <Download className="size-4" /> {source?.kind === 'video' ? t.downloadVideo : t.downloadImage}
                </button>
                <button type="button" onClick={reset} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">
                  <RefreshCw className="size-4" /> {t.another}
                </button>
              </div>
            ) : phase === 'processing' ? (
              <button type="button" onClick={() => abortRef.current?.abort()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm font-semibold text-rose-300 hover:bg-rose-400/12">
                <X className="size-4" /> {t.cancel}
              </button>
            ) : (
              <button type="button" onClick={process} disabled={!source || phase === 'loading'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35">
                <WandSparkles className="size-4" /> {t.remove}
              </button>
            )}
          </section>

          {kind === 'video' && <p className="rounded-2xl border border-amber-300/10 bg-amber-300/[0.04] px-4 py-3 text-xs leading-5 text-amber-100/60">{t.videoNote}</p>}
        </aside>
      </div>

      <section className="mx-auto mt-6 grid max-w-5xl gap-3 sm:grid-cols-3">
        {[
          [LockKeyhole, t.privacy, t.privacyHint],
          [Layers3, t.openSource, t.openSourceHint],
          [Sparkles, t.local, t.localHint],
        ].map(([Icon, title, hint]) => {
          const FeatureIcon = Icon as typeof LockKeyhole
          return (
            <div key={String(title)} className="flex items-start gap-3 rounded-2xl border border-white/7 bg-white/[0.025] p-4">
              <FeatureIcon className="mt-0.5 size-4 shrink-0 text-indigo-300" />
              <div><p className="text-xs font-semibold text-slate-300">{String(title)}</p><p className="mt-1 text-[11px] leading-4 text-slate-600">{String(hint)}</p></div>
            </div>
          )
        })}
      </section>

      <input
        ref={inputRef}
        type="file"
        accept={kind === 'image' ? 'image/png,image/jpeg,image/webp' : 'video/mp4,video/webm,video/quicktime'}
        onChange={(event) => chooseFile(event.target.files?.[0])}
        className="hidden"
      />
    </div>
  )
}

function readImage(url: string) {
  return new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight, duration: 0 })
    image.onerror = reject
    image.src = url
  })
}

function readVideo(url: string) {
  return new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })
    video.onerror = reject
    video.src = url
  })
}

function getPreviewColor(background: VideoBackground, customColor: string) {
  if (background === 'transparent') return undefined
  if (background === 'white') return '#fff'
  if (background === 'black') return '#000'
  if (background === 'green') return '#00e676'
  return customColor
}

function formatBytes(bytes: number) {
  return bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}
