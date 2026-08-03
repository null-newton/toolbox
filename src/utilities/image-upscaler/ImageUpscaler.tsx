import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import {
  ArrowRight,
  Check,
  Download,
  FileImage,
  Image as ImageIcon,
  ImagePlus,
  Maximize2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  WandSparkles,
  X,
} from 'lucide-react'
import { functionsBase } from '../../lib/supabase'
import { useT } from '../../i18n/LanguageContext'

type Model = 'photo' | 'illustration'
type OutputFormat = 'same' | 'png' | 'jpg' | 'webp'
type Phase = 'idle' | 'uploading' | 'processing' | 'done'

interface SourceImage {
  file: File
  url: string
  width: number
  height: number
}

interface UpscaleJob {
  id: string
  status: string
  resultName: string
  resultSize: number
  outputWidth: number
  outputHeight: number
  expiresAt: string
}

interface CreateJobResponse {
  job: { id: string }
  uploadToken: string
}

const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_OUTPUT_PIXELS = 64_000_000

const STR = {
  en: {
    eyebrow: 'Self-hosted AI upscaler',
    titleStart: 'Make every pixel',
    titleAccent: 'count.',
    subtitle: 'Turn small or soft images into crisp, high-resolution assets with Real-ESRGAN. No account, no watermark.',
    private: 'Private by design',
    privateHint: 'Files expire automatically after one hour.',
    dropTitle: 'Drop an image here',
    dropCopy: 'or choose one from your device',
    choose: 'Choose image',
    formats: 'JPG, PNG or WebP · up to 20 MB',
    scale: 'Upscale size',
    scaleHint: 'Width and height multiplier',
    model: 'Image type',
    photo: 'Photo',
    photoHint: 'People, products and real-world scenes',
    illustration: 'Illustration',
    illustrationHint: 'Artwork, anime, icons and clean lines',
    format: 'Output format',
    same: 'Same as input',
    result: 'Expected result',
    megapixels: 'megapixels',
    upscale: 'Upscale image',
    uploading: 'Uploading image',
    processing: 'Reconstructing details',
    processingHint: 'Larger images and 4× jobs can take a few minutes.',
    cancel: 'Cancel',
    complete: 'Your image is ready',
    completeHint: 'Drag the handle to compare the original with the upscaled result.',
    before: 'Before',
    after: 'After',
    download: 'Download upscaled image',
    another: 'Upscale another image',
    change: 'Change image',
    invalidType: 'Choose a JPG, PNG, or WebP image.',
    tooLarge: 'This image is larger than 20 MB.',
    decodeError: 'This image could not be read.',
    outputTooLarge: 'This output would be over 64 megapixels. Choose a lower scale.',
    failed: 'Upscaling failed. Please try again.',
    noAccount: 'No account required',
    engine: 'Real-ESRGAN engine',
    secure: 'Temporary processing',
  },
  nl: {
    eyebrow: 'Zelf-gehoste AI-upscaler',
    titleStart: 'Laat elke pixel',
    titleAccent: 'tellen.',
    subtitle: 'Maak van kleine of zachte beelden scherpe bestanden in hoge resolutie met Real-ESRGAN. Geen account, geen watermerk.',
    private: 'Privacy als uitgangspunt',
    privateHint: 'Bestanden worden na één uur automatisch verwijderd.',
    dropTitle: 'Sleep een afbeelding hierheen',
    dropCopy: 'of kies er een op je apparaat',
    choose: 'Afbeelding kiezen',
    formats: 'JPG, PNG of WebP · tot 20 MB',
    scale: 'Vergroting',
    scaleHint: 'Vermenigvuldiging van breedte en hoogte',
    model: 'Afbeeldingstype',
    photo: 'Foto',
    photoHint: 'Mensen, producten en echte scènes',
    illustration: 'Illustratie',
    illustrationHint: 'Kunst, anime, iconen en strakke lijnen',
    format: 'Uitvoerformaat',
    same: 'Zelfde als invoer',
    result: 'Verwacht resultaat',
    megapixels: 'megapixels',
    upscale: 'Afbeelding vergroten',
    uploading: 'Afbeelding uploaden',
    processing: 'Details reconstrueren',
    processingHint: 'Grotere afbeeldingen en 4×-taken kunnen enkele minuten duren.',
    cancel: 'Annuleren',
    complete: 'Je afbeelding is klaar',
    completeHint: 'Sleep de hendel om het origineel en het resultaat te vergelijken.',
    before: 'Voor',
    after: 'Na',
    download: 'Vergrote afbeelding downloaden',
    another: 'Nog een afbeelding vergroten',
    change: 'Afbeelding wijzigen',
    invalidType: 'Kies een JPG-, PNG- of WebP-afbeelding.',
    tooLarge: 'Deze afbeelding is groter dan 20 MB.',
    decodeError: 'Deze afbeelding kon niet worden gelezen.',
    outputTooLarge: 'Deze uitvoer zou groter zijn dan 64 megapixels. Kies een lagere vergroting.',
    failed: 'Vergroten mislukt. Probeer het opnieuw.',
    noAccount: 'Geen account nodig',
    engine: 'Real-ESRGAN-engine',
    secure: 'Tijdelijke verwerking',
  },
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function loadDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = reject
    image.src = url
  })
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok || payload.error) throw new Error(payload.error || `Request failed (${response.status}).`)
  return payload
}

function uploadJob(url: string, token: string, file: File, onProgress: (progress: number) => void, onUploaded: () => void) {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<UpscaleJob>((resolve, reject) => {
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.setRequestHeader('X-Upscale-Token', token)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.upload.onload = onUploaded
    xhr.onerror = () => reject(new Error('Network error while uploading the image.'))
    xhr.onabort = () => reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' }))
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText.trim() || '{}') as { job?: UpscaleJob; error?: string }
        if (xhr.status < 200 || xhr.status >= 300 || payload.error || !payload.job) {
          reject(new Error(payload.error || `Request failed (${xhr.status}).`))
        } else resolve(payload.job)
      } catch {
        reject(new Error('The server returned an invalid response.'))
      }
    }
    xhr.send(file)
  })
  return { xhr, promise }
}

export function ImageUpscaler() {
  const t = useT(STR)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef<XMLHttpRequest | null>(null)
  const sourceUrlRef = useRef<string | null>(null)
  const [source, setSource] = useState<SourceImage | null>(null)
  const [scale, setScale] = useState<2 | 3 | 4>(2)
  const [model, setModel] = useState<Model>('photo')
  const [format, setFormat] = useState<OutputFormat>('same')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [comparison, setComparison] = useState(50)
  const [job, setJob] = useState<UpscaleJob | null>(null)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
  }, [])

  useEffect(() => {
    if (phase !== 'uploading' && phase !== 'processing') return
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  const resultUrl = job ? `${functionsBase}/image-upscaler?action=result&id=${encodeURIComponent(job.id)}` : ''
  const outputWidth = source ? source.width * scale : 0
  const outputHeight = source ? source.height * scale : 0
  const outputPixels = outputWidth * outputHeight
  const outputTooLarge = outputPixels > MAX_OUTPUT_PIXELS
  const outputMegapixels = outputPixels / 1_000_000

  const duration = useMemo(() => {
    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [elapsed])

  const chooseFile = async (file?: File) => {
    if (!file) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(t.invalidType)
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(t.tooLarge)
      return
    }
    const url = URL.createObjectURL(file)
    try {
      const dimensions = await loadDimensions(url)
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
      sourceUrlRef.current = url
      setSource({ file, url, ...dimensions })
      setJob(null)
      setPhase('idle')
      setComparison(50)
    } catch {
      URL.revokeObjectURL(url)
      setError(t.decodeError)
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    chooseFile(event.dataTransfer.files[0])
  }

  const startUpscale = async () => {
    if (!source || outputTooLarge) return
    setError('')
    setProgress(0)
    setElapsed(0)
    setPhase('uploading')
    try {
      const created = await jsonResponse<CreateJobResponse>(await fetch(`${functionsBase}/image-upscaler?action=create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: source.file.name,
          size: source.file.size,
          mimeType: source.file.type,
          scale,
          model,
          format,
        }),
      }))
      const request = uploadJob(
        `${functionsBase}/image-upscaler?action=upload&id=${encodeURIComponent(created.job.id)}`,
        created.uploadToken,
        source.file,
        setProgress,
        () => setPhase('processing'),
      )
      requestRef.current = request.xhr
      const finished = await request.promise
      setJob(finished)
      setPhase('done')
    } catch (upscaleError) {
      if ((upscaleError as Error)?.name !== 'AbortError') {
        setError(upscaleError instanceof Error ? upscaleError.message : t.failed)
      }
      setPhase('idle')
    } finally {
      requestRef.current = null
    }
  }

  const cancel = () => {
    requestRef.current?.abort()
    setPhase('idle')
    setProgress(0)
  }

  const reset = () => {
    setJob(null)
    setPhase('idle')
    setProgress(0)
    setElapsed(0)
    setComparison(50)
    setError('')
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    sourceUrlRef.current = null
    setSource(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const isWorking = phase === 'uploading' || phase === 'processing'

  return (
    <div className="mx-auto max-w-6xl animate-fade-up pb-10">
      <header className="mx-auto max-w-3xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-200">
          <Sparkles className="size-3.5" /> {t.eyebrow}
        </div>
        <h1 className="mt-5 text-3xl font-extrabold tracking-[-0.04em] text-white sm:text-5xl">
          {t.titleStart} <span className="text-gradient">{t.titleAccent}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">{t.subtitle}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-400" /> {t.noAccount}</span>
          <span className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-400" /> {t.engine}</span>
          <span className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-400" /> {t.secure}</span>
        </div>
      </header>

      {phase === 'done' && source && job ? (
        <section className="mt-9">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Check className="size-4" /> {t.complete}</div>
              <p className="mt-1 text-sm text-slate-500">{t.completeHint}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="rounded-lg bg-white/5 px-2.5 py-1.5">{source.width} × {source.height}</span>
              <ArrowRight className="size-3.5" />
              <span className="rounded-lg bg-indigo-500/10 px-2.5 py-1.5 font-semibold text-indigo-200">{job.outputWidth} × {job.outputHeight}</span>
            </div>
          </div>

          <div className="glass overflow-hidden rounded-3xl p-2 sm:p-3">
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-[linear-gradient(45deg,#111827_25%,transparent_25%),linear-gradient(-45deg,#111827_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#111827_75%),linear-gradient(-45deg,transparent_75%,#111827_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0]">
              <img src={resultUrl} alt={t.after} className="absolute inset-0 size-full object-contain" />
              <img
                src={source.url}
                alt={t.before}
                className="absolute inset-0 size-full object-contain"
                style={{ clipPath: `inset(0 ${100 - comparison}% 0 0)` }}
              />
              <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_18px_rgb(0_0_0/0.8)]" style={{ left: `calc(${comparison}% - 1px)` }}>
                <span className="absolute left-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-slate-950/80 shadow-xl">
                  <span className="flex gap-1"><span className="h-3 w-px bg-white/70" /><span className="h-3 w-px bg-white/70" /></span>
                </span>
              </div>
              <span className="absolute left-4 top-4 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur">{t.before}</span>
              <span className="absolute right-4 top-4 rounded-lg bg-indigo-500/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur">{t.after}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={comparison}
                onChange={(event) => setComparison(Number(event.target.value))}
                aria-label={`${t.before} / ${t.after}`}
                className="absolute inset-0 size-full cursor-ew-resize opacity-0"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              href={`${resultUrl}&download=1`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-110"
            >
              <Download className="size-4" /> {t.download} <span className="font-normal text-white/60">· {formatBytes(job.resultSize)}</span>
            </a>
            <button type="button" onClick={reset} className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10">
              <RefreshCw className="size-4" /> {t.another}
            </button>
          </div>
        </section>
      ) : (
        <div className="mt-9 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <section className="glass rounded-3xl p-3 sm:p-5">
            {!source ? (
              <div
                onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
                onDrop={onDrop}
                className={`group grid min-h-[390px] place-items-center rounded-2xl border border-dashed p-8 text-center transition-all sm:min-h-[470px] ${dragging ? 'border-indigo-300 bg-indigo-500/10' : 'border-white/15 bg-black/10 hover:border-indigo-400/40 hover:bg-indigo-500/[0.04]'}`}
              >
                <div>
                  <span className="mx-auto grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500/20 via-violet-500/10 to-cyan-400/10 text-indigo-200 ring-1 ring-indigo-400/20 transition-transform duration-300 group-hover:-translate-y-1">
                    <ImagePlus className="size-9" />
                  </span>
                  <h2 className="mt-6 text-xl font-bold text-white">{t.dropTitle}</h2>
                  <p className="mt-2 text-sm text-slate-500">{t.dropCopy}</p>
                  <button type="button" onClick={() => inputRef.current?.click()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-white/5 hover:bg-indigo-50">
                    <UploadCloud className="size-4" /> {t.choose}
                  </button>
                  <p className="mt-4 text-xs text-slate-600">{t.formats}</p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[390px] flex-col sm:min-h-[470px]">
                <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black/30">
                  <img src={source.url} alt={source.file.name} className="max-h-[420px] w-full object-contain" />
                  {!isWorking && (
                    <button type="button" onClick={() => inputRef.current?.click()} className="absolute right-3 top-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/80">
                      <RefreshCw className="size-3.5" /> {t.change}
                    </button>
                  )}
                  {isWorking && (
                    <div className="absolute inset-0 grid place-items-center bg-slate-950/75 p-8 text-center backdrop-blur-sm">
                      <div className="w-full max-w-sm">
                        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/25">
                          <WandSparkles className="size-7 animate-pulse" />
                        </span>
                        <h2 className="mt-5 text-lg font-bold text-white">{phase === 'uploading' ? t.uploading : t.processing}</h2>
                        <p className="mt-2 text-sm text-slate-400">{t.processingHint}</p>
                        <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
                          <div className={`h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-400 to-cyan-400 transition-all duration-500 ${phase === 'processing' ? 'w-full animate-pulse' : ''}`} style={phase === 'uploading' ? { width: `${progress}%` } : undefined} />
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{phase === 'uploading' ? `${progress}%` : t.processing}</span><span>{duration}</span></div>
                        <button type="button" onClick={cancel} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"><X className="size-3.5" /> {t.cancel}</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white/[0.035] px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3"><FileImage className="size-5 shrink-0 text-indigo-300" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{source.file.name}</p><p className="mt-0.5 text-xs text-slate-500">{source.width} × {source.height} · {formatBytes(source.file.size)}</p></div></div>
                  <span className="shrink-0 rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Ready</span>
                </div>
              </div>
            )}
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0])} />
          </section>

          <aside className="glass flex flex-col rounded-3xl p-5 sm:p-6">
            <div>
              <div className="flex items-end justify-between"><div><label className="text-sm font-bold text-white">{t.scale}</label><p className="mt-1 text-xs text-slate-500">{t.scaleHint}</p></div><Maximize2 className="size-4 text-indigo-300" /></div>
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-black/20 p-1.5">
                {([2, 3, 4] as const).map((value) => (
                  <button key={value} type="button" disabled={isWorking} onClick={() => setScale(value)} className={`rounded-xl py-2.5 text-sm font-bold ${scale === value ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>{value}×</button>
                ))}
              </div>
            </div>

            <div className="mt-7 border-t border-white/8 pt-6">
              <label className="text-sm font-bold text-white">{t.model}</label>
              <div className="mt-3 space-y-2">
                {([
                  { value: 'photo' as const, label: t.photo, hint: t.photoHint, icon: ImageIcon },
                  { value: 'illustration' as const, label: t.illustration, hint: t.illustrationHint, icon: Sparkles },
                ]).map((option) => {
                  const Icon = option.icon
                  return <button key={option.value} type="button" disabled={isWorking} onClick={() => setModel(option.value)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${model === option.value ? 'border-indigo-400/35 bg-indigo-500/10' : 'border-white/8 bg-white/[0.025] hover:bg-white/5'}`}><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${model === option.value ? 'bg-indigo-500/20 text-indigo-200' : 'bg-white/5 text-slate-400'}`}><Icon className="size-4" /></span><span><span className="block text-sm font-semibold text-white">{option.label}</span><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{option.hint}</span></span>{model === option.value && <Check className="ml-auto size-4 shrink-0 text-indigo-300" />}</button>
                })}
              </div>
            </div>

            <div className="mt-7 border-t border-white/8 pt-6">
              <label htmlFor="upscale-format" className="text-sm font-bold text-white">{t.format}</label>
              <select id="upscale-format" value={format} disabled={isWorking} onChange={(event) => setFormat(event.target.value as OutputFormat)} className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-400/50">
                <option value="same">{t.same}</option><option value="png">PNG</option><option value="jpg">JPG</option><option value="webp">WebP</option>
              </select>
            </div>

            {source && (
              <div className={`mt-6 rounded-2xl p-4 ring-1 ${outputTooLarge ? 'bg-rose-500/8 ring-rose-400/20' : 'bg-indigo-500/8 ring-indigo-400/15'}`}>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t.result}</p>
                <div className="mt-2 flex items-end justify-between gap-3"><p className="text-lg font-bold text-white">{outputWidth.toLocaleString()} × {outputHeight.toLocaleString()}</p><p className="text-xs text-slate-500">{outputMegapixels.toFixed(1)} {t.megapixels}</p></div>
                {outputTooLarge && <p className="mt-2 text-xs leading-5 text-rose-300">{t.outputTooLarge}</p>}
              </div>
            )}

            <div className="mt-auto pt-6">
              <button type="button" disabled={!source || isWorking || outputTooLarge} onClick={startUpscale} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35">
                <WandSparkles className="size-4" /> {t.upscale}
              </button>
              <div className="mt-4 flex items-start gap-2.5 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" /><p><span className="font-semibold text-slate-300">{t.private}.</span> {t.privateHint}</p></div>
            </div>
          </aside>
        </div>
      )}

      {error && <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-200">{error}</div>}
    </div>
  )
}
