import { backendFetch as fetch } from '../../lib/backend-fetch'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  BookCheck, BookOpen, Check, ExternalLink, LibraryBig, Plus, ScanBarcode, Search, Trash2, X,
} from 'lucide-react'
import { SaveStatus } from '../../components/SaveStatus'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { useT } from '../../i18n/LanguageContext'
import { functionsBase } from '../../lib/supabase'
import { STR } from './strings'
import {
  DEFAULTS, albumFromEdition, editionCode, matchesQuery, normalizeIsbn, sameEdition, sortAlbums,
  type Album, type Edition, type LookupResult, type SortKey, type StripLibraryConfig,
} from './model'

type Strings = (typeof STR)['en']

// BarcodeDetector is not in TypeScript's DOM lib yet (Chromium/Android only).
interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = (new (options: { formats: string[] }) => BarcodeDetectorLike) & { getSupportedFormats?: () => Promise<string[]> }
const FORMATS = ['ean_13', 'ean_8', 'upc_a']

// Uses the native detector when it reads EAN-13, else the self-hosted zxing-wasm ponyfill (iOS, Firefox, desktop).
async function loadDetector(): Promise<BarcodeDetectorLike> {
  const native = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (native && (await native.getSupportedFormats?.().catch((): string[] => []))?.includes('ean_13')) return new native({ formats: FORMATS })
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([import('barcode-detector/ponyfill'), import('zxing-wasm/reader/zxing_reader.wasm?url')])
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => path.endsWith('.wasm') ? wasmUrl : prefix + path } })
  return new BarcodeDetector({ formats: FORMATS as ('ean_13' | 'ean_8' | 'upc_a')[] })
}

type QueueEntry = { id: number; code: string; status: 'queued' | 'active' | 'ok' | 'warn' | 'error'; text?: string }

class LookupError extends Error {}

async function lookupIsbn(isbn: string, t: Strings): Promise<LookupResult> {
  // A plain string keeps the relative dev base (/functions/v1) recognizable to backendFetch.
  const url = `${functionsBase}/strip-library?${new URLSearchParams({ action: 'lookup', isbn })}`
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new LookupError(t.unavailable)
  }
  const body = await response.json().catch(() => null)
  if (response.ok && body?.match) return body as LookupResult
  const byCode: Record<string, string> = {
    invalid_isbn: t.invalidIsbn, not_found: t.notFound, rate_limited: t.rateLimited,
    timeout: t.unavailable, upstream: t.unavailable,
  }
  throw new LookupError(byCode[body?.code] ?? body?.error ?? t.lookupFailed)
}

/**
 * stripinfo.be serves covers with Cross-Origin-Resource-Policy: same-site, so
 * they are loaded through the backend's public cover relay instead.
 */
function coverSrc(image: string | null): string | null {
  const match = image?.match(/^https:\/\/(?:www\.)?stripinfo\.be\/image\.php\?i=(\d+)&s=(\d+)$/)
  return match ? `${functionsBase}/strip-library?${new URLSearchParams({ action: 'cover', i: match[1], s: match[2] })}` : null
}

function Cover({ src: image, alt, className = '' }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const src = coverSrc(image)
  if (!src || failed) {
    return (
      <div className={`grid place-items-center bg-white/5 text-slate-600 ${className}`}>
        <BookOpen className="size-8" />
      </div>
    )
  }
  return (
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)}
      className={`bg-white/5 object-cover ${className}`} />
  )
}

const albumLabel = (a: { series: string | null; issueNumber: string | null }) =>
  [a.series, a.issueNumber && `#${a.issueNumber}`].filter(Boolean).join(' ')

function editionLabel(edition: Edition) {
  return [edition.year, edition.details.Kaft, editionCode(edition)].filter(Boolean).join(' · ') || edition.title
}

function LookupCard({ result, albums, onAdd, onClose, t }: {
  result: LookupResult
  albums: Album[]
  onAdd: (edition: Edition) => void
  onClose: () => void
  t: Strings
}) {
  const [index, setIndex] = useState(() => Math.max(0, result.editions.findIndex((e) => e === result.match || (e.url && e.url === result.match.url))))
  const edition = result.editions[index] ?? result.match
  const owned = albums.some((album) => sameEdition(album, edition))
  const d = edition.details
  const facts: [string, string | undefined][] = [
    [t.writer, d.Scenario], [t.artist, d.Tekeningen], [t.publisher, d['Uitgever(s)'] ?? d.Uitgever],
    [t.year, edition.year?.toString()], [t.cover, d.Kaft], [t.pages, d["Pagina's"]],
  ]

  return (
    <section className="glass relative flex flex-col gap-5 rounded-3xl p-5 sm:flex-row">
      {/* Site CSS gives buttons position: relative, so place a wrapper instead. */}
      <div className="absolute right-4 top-4 z-10">
        <button onClick={onClose} aria-label={t.close} className="no-glow text-slate-500 hover:text-white">
          <X className="size-5" />
        </button>
      </div>
      <Cover src={edition.image} alt={edition.title} className="aspect-[3/4] w-36 shrink-0 self-center rounded-xl shadow-xl sm:self-start" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="pr-8">
          {albumLabel(edition) && <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">{albumLabel(edition)}</p>}
          <h2 className="text-xl font-bold">{edition.title}</h2>
        </div>
        {!result.exact && <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{t.noExact}</p>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          {facts.filter(([, v]) => v && v !== 'geen').map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="truncate text-slate-200" title={value}>{value}</dd>
            </div>
          ))}
        </dl>
        {result.editions.length > 1 && (
          <label className="block text-xs text-slate-500">
            {t.edition} ({t.editions(result.editions.length)})
            <select value={index} onChange={(e) => setIndex(Number(e.target.value))}
              className="glass mt-1 block w-full rounded-xl px-3 py-2 text-sm text-white outline-none">
              {result.editions.map((e, i) => (
                <option key={e.url ?? i} value={i} className="bg-slate-900">
                  {editionLabel(e)}{editionCode(e) === result.isbn ? ' ✓' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={() => onAdd(edition)} disabled={owned}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold shadow-lg shadow-amber-500/15 hover:brightness-110 disabled:cursor-default disabled:from-emerald-600/40 disabled:to-emerald-600/40 disabled:shadow-none">
            {owned ? <><Check className="size-4" />{t.added}</> : <><Plus className="size-4" />{t.add}</>}
          </button>
          {edition.url && (
            <a href={edition.url} target="_blank" rel="noreferrer noopener"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-400 hover:text-white">
              <ExternalLink className="size-4" />{t.onStripinfo}
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

function Scanner({ onCode, onClose, continuous, setContinuous, queue, t }: {
  onCode: (code: string) => void
  onClose: () => void
  continuous: boolean
  setContinuous: (v: boolean) => void
  queue: QueueEntry[]
  t: Strings
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const onCodeRef = useRef(onCode)
  useEffect(() => { onCodeRef.current = onCode })

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let detector: BarcodeDetectorLike | null = null
    let last = ''
    let lastAt = 0

    const tick = async () => {
      const video = videoRef.current
      if (stopped || !video) return
      if (detector && video.readyState >= 2) {
        try {
          const codes = await detector.detect(video)
          const code = codes.map((c) => normalizeIsbn(c.rawValue)).find(Boolean)
          // Ignore the same barcode for a few seconds so one album isn't read twice.
          if (code && (code !== last || Date.now() - lastAt > 4000)) {
            last = code
            lastAt = Date.now()
            navigator.vibrate?.(60)
            flashRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' })
            onCodeRef.current(code)
          }
        } catch { /* a frame that fails to decode is fine */ }
      }
      timer = setTimeout(tick, 250)
    }

    (navigator.mediaDevices ? navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }) : Promise.reject(new Error('no camera')))
      .then(async (s) => {
        if (stopped) { s.getTracks().forEach((track) => track.stop()); return }
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          await videoRef.current.play().catch(() => {})
        }
        detector = await loadDetector()
        tick()
      })
      .catch(() => setError(t.cameraError))

    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [t.cameraError])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t.scannerTitle}>
      <div className="glass-strong w-full max-w-md space-y-3 rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t.scannerTitle}</h2>
          <button onClick={onClose} aria-label={t.close} className="no-glow text-slate-400 hover:text-white"><X className="size-5" /></button>
        </div>
        {error ? (
          <p className="rounded-xl bg-rose-500/10 px-3 py-6 text-center text-sm text-rose-300">{error}</p>
        ) : (
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-amber-300/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
            <div ref={flashRef} className="pointer-events-none absolute inset-0 bg-emerald-400/45 opacity-0 shadow-[inset_0_0_0_4px_rgb(52_211_153)]" />
          </div>
        )}
        <p className="text-xs text-slate-400">{t.scannerHint}</p>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} className="accent-amber-500" />
          {t.continuous}
        </label>
        {queue.length > 0 && <LookupQueue queue={queue} t={t} />}
      </div>
    </div>
  )
}

const QUEUE_STYLE: Record<QueueEntry['status'], string> = { queued: 'text-slate-500', active: 'text-amber-300', ok: 'text-emerald-300', warn: 'text-slate-300', error: 'text-rose-300' }

function LookupQueue({ queue, t }: { queue: QueueEntry[]; t: Strings }) {
  const waiting = queue.filter((e) => e.status === 'queued' || e.status === 'active').length
  return (
    <div className="space-y-1.5 rounded-xl bg-white/5 p-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-200">{t.queueTitle}</span>
        <span className={waiting ? 'tabular-nums text-amber-300' : 'text-emerald-300'}>{waiting ? t.queueWaiting(waiting) : t.queueIdle}</span>
      </div>
      <ul className="max-h-36 space-y-1 overflow-y-auto text-xs" aria-live="polite">
        {queue.map((e) => (
          <li key={e.id} className={`flex items-center gap-2 ${QUEUE_STYLE[e.status]}`}>
            {e.status === 'active' ? <span className="size-2 shrink-0 animate-pulse rounded-full bg-amber-300" /> : <span className={`size-2 shrink-0 rounded-full ${e.status === 'queued' ? 'border border-slate-500' : 'bg-current'}`} />}
            <span className="truncate">{e.text ?? `${e.code} · ${e.status === 'active' ? t.lookingUpCode : t.queued}`}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AlbumCard({ album, onToggleRead, onRemove, t }: {
  album: Album
  onToggleRead: () => void
  onRemove: () => void
  t: Strings
}) {
  return (
    <article className="group glass flex flex-col overflow-hidden rounded-2xl">
      <div className="relative">
        <Cover src={album.image} alt={album.title} className="aspect-[3/4] w-full" />
        {album.read && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
            <BookCheck className="size-3" />{t.read}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {album.issueNumber && <p className="text-[11px] font-semibold text-amber-300">#{album.issueNumber}</p>}
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug" title={album.title}>{album.title}</h3>
        <p className="truncate text-xs text-slate-500">{[album.year, album.cover].filter(Boolean).join(' · ')}</p>
        <div className="mt-auto flex items-center gap-1 pt-2">
          <button onClick={onToggleRead} title={album.read ? t.markUnread : t.markRead} aria-label={album.read ? t.markUnread : t.markRead}
            className={`no-glow rounded-lg p-1.5 ${album.read ? 'text-emerald-400' : 'text-slate-500 hover:text-white'}`}>
            <BookCheck className="size-4" />
          </button>
          {album.url && (
            <a href={album.url} target="_blank" rel="noreferrer noopener" title={t.onStripinfo} aria-label={t.onStripinfo}
              className="rounded-lg p-1.5 text-slate-500 hover:text-white">
              <ExternalLink className="size-4" />
            </a>
          )}
          <button onClick={onRemove} title={t.remove} aria-label={t.remove}
            className="no-glow ml-auto rounded-lg p-1.5 text-slate-600 hover:text-rose-400">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </article>
  )
}

export function StripLibrary() {
  const t = useT(STR)
  const { config, setConfig, loading, saving, error: configError } = useUtilityConfig<StripLibraryConfig>('strip-library', DEFAULTS)
  const albumsRef = useRef(config.albums)
  useEffect(() => { albumsRef.current = config.albums }, [config.albums])

  const [isbn, setIsbn] = useState('')
  const [busy, setBusy] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [result, setResult] = useState<LookupResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [continuous, setContinuous] = useState(false)
  const [queue, setQueue] = useState<QueueEntry[]>([])
  const pendingRef = useRef<QueueEntry[]>([])
  const drainingRef = useRef(false)
  const nextIdRef = useRef(0)
  const [query, setQuery] = useState('')
  const [series, setSeries] = useState('')
  const [readFilter, setReadFilter] = useState<'all' | 'read' | 'unread'>('all')

  const addEdition = (edition: Edition, code: string) => {
    if (albumsRef.current.some((album) => sameEdition(album, edition))) return false
    const album = albumFromEdition(edition, code)
    albumsRef.current = [...albumsRef.current, album]
    setConfig((prev) => ({ ...prev, albums: [...prev.albums, album] }))
    return true
  }

  const runLookup = async (raw: string) => {
    const code = normalizeIsbn(raw)
    setLookupError('')
    if (!code) { setLookupError(t.invalidIsbn); return }
    setBusy(true)
    try {
      setResult(await lookupIsbn(code, t))
    } catch (e) {
      setResult(null)
      setLookupError(e instanceof Error ? e.message : t.lookupFailed)
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    runLookup(isbn)
  }

  const onScan = async (code: string) => {
    setIsbn(code)
    if (!continuous) {
      setScanning(false)
      runLookup(code)
      return
    }
    if (pendingRef.current.some((e) => e.code === code)) return
    const entry: QueueEntry = { id: nextIdRef.current++, code, status: 'queued' }
    pendingRef.current.push(entry)
    setQueue((q) => [entry, ...q].slice(0, 30))
    drainQueue()
  }

  // Looks up queued scans one at a time; each GET starts only after the previous one finished.
  const drainQueue = async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    const patch = (id: number, p: Partial<QueueEntry>) => setQueue((q) => q.map((e) => (e.id === id ? { ...e, ...p } : e)))
    while (pendingRef.current.length) {
      const { id, code } = pendingRef.current[0]
      patch(id, { status: 'active' })
      try {
        const found = await lookupIsbn(code, t)
        if (!found.exact) { setResult(found); patch(id, { status: 'warn', text: t.scannedNeedsChoice(code) }) }
        else patch(id, addEdition(found.match, code) ? { status: 'ok', text: t.scannedAdded(found.match.title) } : { status: 'warn', text: t.scannedDuplicate(found.match.title) })
      } catch (e) {
        patch(id, { status: 'error', text: t.scannedFailed(code, e instanceof Error ? e.message : t.lookupFailed) })
      }
      pendingRef.current.shift()
    }
    drainingRef.current = false
  }

  const updateAlbum = (id: string, patch: Partial<Album>) =>
    setConfig((prev) => ({ ...prev, albums: prev.albums.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
  const removeAlbum = (album: Album) => {
    if (!window.confirm(t.confirmRemove(album.title))) return
    setConfig((prev) => ({ ...prev, albums: prev.albums.filter((a) => a.id !== album.id) }))
  }

  const seriesNames = useMemo(
    () => [...new Set(config.albums.map((a) => a.series).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b)),
    [config.albums],
  )
  const visible = useMemo(() => sortAlbums(
    config.albums.filter((a) =>
      matchesQuery(a, query) &&
      (!series || a.series === series) &&
      (readFilter === 'all' || (readFilter === 'read') === a.read)),
    config.sort,
  ), [config.albums, config.sort, query, series, readFilter])

  // Group by series only when sorted that way; other sorts show one flat grid.
  const groups = useMemo(() => {
    if (config.sort !== 'series') return [{ name: '', albums: visible }]
    const map = new Map<string, Album[]>()
    for (const album of visible) {
      const key = album.series ?? ''
      map.set(key, [...(map.get(key) ?? []), album])
    }
    return [...map].map(([name, albums]) => ({ name, albums }))
  }, [visible, config.sort])

  const readCount = config.albums.filter((a) => a.read).length
  const sortOptions: [SortKey, string][] = [
    ['series', t.sortSeries], ['added', t.sortAdded], ['title', t.sortTitle], ['year', t.sortYear],
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/25 to-orange-500/20 text-amber-300 ring-1 ring-amber-300/20">
              <LibraryBig className="size-6" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
              <SaveStatus saving={saving} error={configError} />
            </div>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">{t.subtitle}</p>
        </div>
        <dl className="flex gap-2">
          {[[t.albums, config.albums.length], [t.series, seriesNames.length], [t.read, readCount]].map(([label, value]) => (
            <div key={label} className="glass min-w-20 rounded-2xl px-4 py-2 text-center">
              <dd className="text-xl font-bold tabular-nums">{value}</dd>
              <dt className="text-[11px] uppercase tracking-wider text-slate-500">{label}</dt>
            </div>
          ))}
        </dl>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <label className="glass flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3 focus-within:border-amber-400/40">
          <Search className="size-5 shrink-0 text-slate-500" />
          <input value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder={t.isbnPlaceholder} inputMode="numeric" autoComplete="off"
            onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
        </label>
        <button type="submit" disabled={busy || !isbn.trim()}
          className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-500/15 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? t.lookingUp : t.lookUp}
        </button>
        <button type="button" onClick={() => { setQueue((q) => q.filter((e) => e.status === 'queued' || e.status === 'active')); setScanning(true) }}
          className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/8 hover:text-white">
          <ScanBarcode className="size-4" />{t.scan}
        </button>
      </form>
      {lookupError && <p role="alert" className="-mt-3 text-sm text-rose-300">{lookupError}</p>}
      {!scanning && queue.some((e) => e.status === 'queued' || e.status === 'active') && <LookupQueue queue={queue} t={t} />}

      {result && (
        <LookupCard key={`${result.isbn}-${result.match.url}`} result={result} albums={config.albums} t={t}
          onAdd={(edition) => addEdition(edition, result.isbn)} onClose={() => setResult(null)} />
      )}

      {scanning && (
        <Scanner onCode={onScan} onClose={() => setScanning(false)} continuous={continuous} setContinuous={setContinuous} queue={queue} t={t} />
      )}

      <section className="space-y-4">
        {config.albums.length > 0 && (
          <div className="flex flex-col gap-2 md:flex-row">
            <label className="glass flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 md:min-w-56">
              <Search className="size-4 shrink-0 text-slate-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search}
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
            </label>
            <select value={series} onChange={(e) => setSeries(e.target.value)} aria-label={t.series}
              className="glass rounded-xl px-3 py-2 text-sm text-white outline-none">
              <option value="" className="bg-slate-900">{t.allSeries}</option>
              {seriesNames.map((name) => <option key={name} value={name} className="bg-slate-900">{name}</option>)}
            </select>
            <div className="glass flex items-center gap-1 rounded-xl p-1 text-xs">
              {([['all', t.filterAll], ['read', t.read], ['unread', t.unread]] as const).map(([value, label]) => (
                <button key={value} onClick={() => setReadFilter(value)}
                  className={`rounded-lg px-3 py-1.5 font-semibold ${readFilter === value ? 'bg-amber-400/20 text-amber-200' : 'text-slate-400 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
            <select value={config.sort} onChange={(e) => setConfig({ sort: e.target.value as SortKey })} aria-label="Sort"
              className="glass rounded-xl px-3 py-2 text-sm text-white outline-none">
              {sortOptions.map(([value, label]) => <option key={value} value={value} className="bg-slate-900">{label}</option>)}
            </select>
          </div>
        )}

        {loading ? (
          <p className="glass rounded-3xl p-10 text-center text-slate-400">{t.loading}</p>
        ) : config.albums.length === 0 ? (
          <div className="glass rounded-3xl p-10 text-center text-slate-400">
            <LibraryBig className="mx-auto mb-3 size-9 text-amber-300/70" />{t.empty}
          </div>
        ) : visible.length === 0 ? (
          <p className="glass rounded-3xl p-10 text-center text-slate-400">{t.noMatches}</p>
        ) : (
          groups.map((group) => (
            <div key={group.name || '_'} className="space-y-3">
              {config.sort === 'series' && (
                <h2 className="flex items-baseline gap-2 text-lg font-semibold">
                  {group.name || t.noSeries}
                  <span className="text-xs font-normal text-slate-500">{group.albums.length}</span>
                </h2>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {group.albums.map((album) => (
                  <AlbumCard key={album.id} album={album} t={t}
                    onToggleRead={() => updateAlbum(album.id, { read: !album.read })}
                    onRemove={() => removeAlbum(album)} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
