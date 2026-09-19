import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import {
  Check,
  Download,
  FileImage,
  Image as ImageIcon,
  Lock,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  WandSparkles,
  X,
} from 'lucide-react'
import { useT } from '../../i18n/LanguageContext'

type OutputFormat = 'jpeg' | 'png' | 'webp'

interface SourceImage {
  file: File
  url: string
  width: number
  height: number
}

interface ResultImage {
  blob: Blob
  url: string
  width: number
  height: number
  name: string
}

const MAX_FILE_BYTES = 40 * 1024 * 1024
const MAX_OUTPUT_PIXELS = 64_000_000

const STR = {
  en: {
    eyebrow: 'Private image workshop',
    titleStart: 'Polish every image.',
    titleAccent: 'Keep it yours.',
    intro: 'Resize, compress and convert images without uploading them. Exporting also strips embedded metadata.',
    dropTitle: 'Drop an image here',
    dropCopy: 'or choose one from your device',
    choose: 'Choose image',
    formats: 'JPG, PNG or WebP · up to 40 MB',
    settings: 'Export settings',
    format: 'File format',
    quality: 'Quality',
    qualityHint: 'Higher quality creates a larger file',
    dimensions: 'Dimensions',
    originalSize: 'Original size',
    customSize: 'Resize image',
    width: 'Width',
    height: 'Height',
    pixels: 'px',
    linked: 'Aspect ratio locked',
    output: 'Expected output',
    process: 'Create optimized image',
    processing: 'Optimizing image',
    result: 'Your image is ready',
    resultHint: 'The exported file contains fresh pixels only; EXIF and location metadata are removed.',
    original: 'Original',
    optimized: 'Optimized',
    smaller: 'smaller',
    larger: 'larger',
    download: 'Download image',
    another: 'Use another image',
    change: 'Change image',
    local: '100% on-device',
    localHint: 'Your image never leaves this browser.',
    clean: 'Metadata removed',
    cleanHint: 'EXIF, camera and GPS data are not copied.',
    flexible: 'Ready anywhere',
    flexibleHint: 'Export as JPG, PNG or modern WebP.',
    invalidType: 'Choose a JPG, PNG or WebP image.',
    tooLarge: 'This image is larger than 40 MB.',
    decodeError: 'This image could not be read by your browser.',
    invalidDimensions: 'Enter valid dimensions of at least 1 pixel.',
    outputTooLarge: 'The output would be over 64 megapixels. Choose smaller dimensions.',
    failed: 'The image could not be exported. Try another format or smaller dimensions.',
  },
  nl: {
    eyebrow: 'Privé-beeldwerkplaats',
    titleStart: 'Werk elk beeld af.',
    titleAccent: 'Houd het van jou.',
    intro: 'Verklein, comprimeer en converteer afbeeldingen zonder ze te uploaden. Bij export verdwijnt ook alle ingebedde metadata.',
    dropTitle: 'Sleep een afbeelding hierheen',
    dropCopy: 'of kies er een op je apparaat',
    choose: 'Afbeelding kiezen',
    formats: 'JPG, PNG of WebP · tot 40 MB',
    settings: 'Exportinstellingen',
    format: 'Bestandsformaat',
    quality: 'Kwaliteit',
    qualityHint: 'Hogere kwaliteit maakt een groter bestand',
    dimensions: 'Afmetingen',
    originalSize: 'Origineel formaat',
    customSize: 'Afbeelding verkleinen',
    width: 'Breedte',
    height: 'Hoogte',
    pixels: 'px',
    linked: 'Beeldverhouding vergrendeld',
    output: 'Verwachte uitvoer',
    process: 'Geoptimaliseerde afbeelding maken',
    processing: 'Afbeelding optimaliseren',
    result: 'Je afbeelding is klaar',
    resultHint: 'Het exportbestand bevat alleen nieuwe pixels; EXIF- en locatiemetadata zijn verwijderd.',
    original: 'Origineel',
    optimized: 'Geoptimaliseerd',
    smaller: 'kleiner',
    larger: 'groter',
    download: 'Afbeelding downloaden',
    another: 'Andere afbeelding gebruiken',
    change: 'Afbeelding wijzigen',
    local: '100% op je apparaat',
    localHint: 'Je afbeelding verlaat deze browser nooit.',
    clean: 'Metadata verwijderd',
    cleanHint: 'EXIF-, camera- en gps-data worden niet overgenomen.',
    flexible: 'Overal klaar voor',
    flexibleHint: 'Exporteer als JPG, PNG of moderne WebP.',
    invalidType: 'Kies een JPG-, PNG- of WebP-afbeelding.',
    tooLarge: 'Deze afbeelding is groter dan 40 MB.',
    decodeError: 'Je browser kon deze afbeelding niet lezen.',
    invalidDimensions: 'Vul geldige afmetingen van minstens 1 pixel in.',
    outputTooLarge: 'De uitvoer zou groter zijn dan 64 megapixels. Kies kleinere afmetingen.',
    failed: 'De afbeelding kon niet worden geëxporteerd. Probeer een ander formaat of kleinere afmetingen.',
  },
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function readImage(url: string) {
  return new Promise<{ image: HTMLImageElement; width: number; height: number }>((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve({ image, width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = reject
    image.src = url
  })
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('export-failed')), type, quality)
  })
}

function outputName(name: string, format: OutputFormat) {
  const base = name.replace(/\.[^.]+$/, '') || 'image'
  const extension = format === 'jpeg' ? 'jpg' : format
  return `${base}-optimized.${extension}`
}

export function ImageToolbox() {
  const t = useT(STR)
  const inputRef = useRef<HTMLInputElement>(null)
  const sourceUrlRef = useRef<string | null>(null)
  const resultUrlRef = useRef<string | null>(null)
  const [source, setSource] = useState<SourceImage | null>(null)
  const [result, setResult] = useState<ResultImage | null>(null)
  const [format, setFormat] = useState<OutputFormat>('webp')
  const [quality, setQuality] = useState(82)
  const [resize, setResize] = useState(false)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
  }, [])

  const outputWidth = resize ? Number(width) : source?.width ?? 0
  const outputHeight = resize ? Number(height) : source?.height ?? 0
  const dimensionsValid = Number.isInteger(outputWidth) && Number.isInteger(outputHeight) && outputWidth > 0 && outputHeight > 0
  const outputTooLarge = dimensionsValid && outputWidth * outputHeight > MAX_OUTPUT_PIXELS

  const sizeChange = useMemo(() => {
    if (!source || !result || source.file.size === 0) return null
    return Math.round(Math.abs(1 - result.blob.size / source.file.size) * 100)
  }, [result, source])

  const clearResult = () => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    resultUrlRef.current = null
    setResult(null)
  }

  const reset = () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    sourceUrlRef.current = null
    clearResult()
    setSource(null)
    setResize(false)
    setWidth('')
    setHeight('')
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

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
      const decoded = await readImage(url)
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
      sourceUrlRef.current = url
      clearResult()
      setSource({ file, url, width: decoded.width, height: decoded.height })
      setWidth(String(decoded.width))
      setHeight(String(decoded.height))
      setFormat(file.type === 'image/png' ? 'png' : 'webp')
    } catch {
      URL.revokeObjectURL(url)
      setError(t.decodeError)
    }
  }

  const updateWidth = (next: string) => {
    setWidth(next)
    if (source && Number(next) > 0) setHeight(String(Math.max(1, Math.round(Number(next) * source.height / source.width))))
    clearResult()
  }

  const updateHeight = (next: string) => {
    setHeight(next)
    if (source && Number(next) > 0) setWidth(String(Math.max(1, Math.round(Number(next) * source.width / source.height))))
    clearResult()
  }

  const processImage = async () => {
    if (!source) return
    setError('')
    if (!dimensionsValid) {
      setError(t.invalidDimensions)
      return
    }
    if (outputTooLarge) {
      setError(t.outputTooLarge)
      return
    }

    setProcessing(true)
    try {
      const { image } = await readImage(source.url)
      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = outputHeight
      const context = canvas.getContext('2d', { alpha: format !== 'jpeg' })
      if (!context) throw new Error('canvas-unavailable')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      if (format === 'jpeg') {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, outputWidth, outputHeight)
      }
      context.drawImage(image, 0, 0, outputWidth, outputHeight)
      const blob = await canvasBlob(canvas, `image/${format}`, format === 'png' ? undefined : quality / 100)
      clearResult()
      const url = URL.createObjectURL(blob)
      resultUrlRef.current = url
      setResult({ blob, url, width: outputWidth, height: outputHeight, name: outputName(source.file.name, format) })
    } catch {
      setError(t.failed)
    } finally {
      setProcessing(false)
    }
  }

  const download = () => {
    if (!result) return
    const anchor = document.createElement('a')
    anchor.href = result.url
    anchor.download = result.name
    anchor.click()
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    void chooseFile(event.dataTransfer.files[0])
  }

  const settingChanged = () => {
    clearResult()
    setError('')
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-up pb-12">
      <div className="max-w-3xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">
          <Sparkles className="size-3.5" />
          {t.eyebrow}
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          {t.titleStart} <span className="text-gradient">{t.titleAccent}</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">{t.intro}</p>
      </div>

      {!source ? (
        <div className="mt-10">
          <div
            onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
            onDrop={handleDrop}
            className={`glass relative grid min-h-80 place-items-center overflow-hidden rounded-3xl border-2 border-dashed p-8 text-center transition-all ${
              dragging ? 'border-cyan-300 bg-cyan-400/10' : 'border-white/10 hover:border-indigo-400/40'
            }`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgb(34_211_238/0.10),transparent_45%)]" />
            <div className="relative">
              <div className="mx-auto grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500/20 to-cyan-400/20 text-cyan-200 ring-1 ring-white/10">
                <UploadCloud className="size-9" />
              </div>
              <h2 className="mt-6 text-xl font-bold">{t.dropTitle}</h2>
              <p className="mt-2 text-sm text-slate-400">{t.dropCopy}</p>
              <button onClick={() => inputRef.current?.click()} className="mt-6 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:brightness-110">
                {t.choose}
              </button>
              <p className="mt-3 text-xs text-slate-500">{t.formats}</p>
            </div>
          </div>
          {error && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
        </div>
      ) : (
        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <section className="glass overflow-hidden rounded-3xl">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{source.file.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{source.width} × {source.height} · {formatBytes(source.file.size)}</p>
              </div>
              <button onClick={reset} title={t.change} className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white">
                <X className="size-4" />
              </button>
            </div>
            <div className="relative grid min-h-[360px] place-items-center bg-black/20 p-5 sm:min-h-[520px]">
              <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(45deg,#64748b_25%,transparent_25%),linear-gradient(-45deg,#64748b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#64748b_75%),linear-gradient(-45deg,transparent_75%,#64748b_75%)] [background-position:0_0,0_8px,8px_-8px,-8px_0] [background-size:16px_16px]" />
              <img src={result?.url ?? source.url} alt="" className="relative max-h-[480px] max-w-full rounded-lg object-contain shadow-2xl" />
              <span className="absolute bottom-4 left-4 rounded-lg bg-black/65 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
                {result ? t.optimized : t.original}
              </span>
            </div>
            {result && (
              <div className="border-t border-white/8 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Check className="size-4" />{t.result}</div>
                    <p className="mt-1 text-xs text-slate-500">
                      {result.width} × {result.height} · {formatBytes(result.blob.size)}
                      {sizeChange !== null && sizeChange > 0 && ` · ${sizeChange}% ${result.blob.size <= source.file.size ? t.smaller : t.larger}`}
                    </p>
                  </div>
                  <button onClick={download} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:brightness-110">
                    <Download className="size-4" />{t.download}
                  </button>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">{t.resultHint}</p>
              </div>
            )}
          </section>

          <aside className="glass h-fit rounded-3xl p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-white"><SlidersHorizontal className="size-4 text-indigo-300" />{t.settings}</div>

            <div className="mt-6">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{t.format}</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['jpeg', 'png', 'webp'] as const).map((option) => (
                  <button key={option} onClick={() => { setFormat(option); settingChanged() }} className={`rounded-xl border px-3 py-2 text-sm font-semibold uppercase transition-colors ${format === option ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200' : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}>
                    {option === 'jpeg' ? 'JPG' : option}
                  </button>
                ))}
              </div>
            </div>

            {format !== 'png' && (
              <div className="mt-6">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="image-quality" className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{t.quality}</label>
                  <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs text-slate-300">{quality}%</span>
                </div>
                <input id="image-quality" type="range" min="35" max="100" value={quality} onChange={(event) => { setQuality(Number(event.target.value)); settingChanged() }} className="mt-3 w-full accent-indigo-500" />
                <p className="mt-1 text-xs text-slate-600">{t.qualityHint}</p>
              </div>
            )}

            <div className="mt-6">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{t.dimensions}</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={() => { setResize(false); settingChanged() }} className={`rounded-xl border px-3 py-2 text-sm font-medium ${!resize ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200' : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'}`}>{t.originalSize}</button>
                <button onClick={() => { setResize(true); settingChanged() }} className={`rounded-xl border px-3 py-2 text-sm font-medium ${resize ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200' : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'}`}>{t.customSize}</button>
              </div>
              {resize && (
                <div className="mt-4">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    <label className="text-xs text-slate-500">{t.width}<span className="relative mt-1 flex items-center"><input type="number" min="1" value={width} onChange={(event) => updateWidth(event.target.value)} className="form-input pr-9" /><span className="pointer-events-none absolute right-3 text-xs text-slate-600">{t.pixels}</span></span></label>
                    <Lock className="mb-3 size-4 text-indigo-300" />
                    <label className="text-xs text-slate-500">{t.height}<span className="relative mt-1 flex items-center"><input type="number" min="1" value={height} onChange={(event) => updateHeight(event.target.value)} className="form-input pr-9" /><span className="pointer-events-none absolute right-3 text-xs text-slate-600">{t.pixels}</span></span></label>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600"><Lock className="size-3" />{t.linked}</p>
                </div>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-white/8 bg-black/15 p-4">
              <div className="flex items-center justify-between text-xs"><span className="text-slate-500">{t.output}</span><span className="font-mono text-slate-300">{dimensionsValid ? `${outputWidth} × ${outputHeight}` : '—'}</span></div>
              {outputTooLarge && <p className="mt-2 text-xs text-amber-300">{t.outputTooLarge}</p>}
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-sm text-red-200">{error}</p>}
            <button disabled={processing || !dimensionsValid || outputTooLarge} onClick={() => void processImage()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              {processing ? <RefreshCw className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
              {processing ? t.processing : t.process}
            </button>
            {result && <button onClick={reset} className="no-glow mt-3 flex w-full items-center justify-center gap-2 py-1 text-sm text-slate-500 hover:text-white"><RefreshCw className="size-3.5" />{t.another}</button>}
          </aside>
        </div>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          [ShieldCheck, t.local, t.localHint],
          [FileImage, t.clean, t.cleanHint],
          [ImageIcon, t.flexible, t.flexibleHint],
        ].map(([Icon, title, hint]) => (
          <div key={String(title)} className="glass rounded-2xl p-4">
            <Icon className="size-5 text-indigo-300" />
            <p className="mt-3 text-sm font-semibold text-white">{String(title)}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{String(hint)}</p>
          </div>
        ))}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0])} />
    </div>
  )
}
