import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import {
  Archive, CheckSquare, Copy, Download, Eye, FileUp, Images, Layers, Pencil, Plus, RefreshCw, ShieldCheck, Sparkles, Square,
  Trash2, UploadCloud, Wand2, X,
} from 'lucide-react'
import { useLang, useT } from '../../i18n/LanguageContext'
import { ToolHeader } from '../../components/ToolHeader'
import { useAuth } from '../../auth/auth-context'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { analyzePixels, createRenderer, devFor, type AdaptiveChange, type ApplyOptions, type Dev, type ImageStats, type Preset } from './develop'
import { createZip, parsePresetFile, presetToXmp, safeFileName } from './formats'
import { loadPresets, newId, savePresets } from './storage'
import { renderFile, type OutputFormat } from './render'
import { PresetEditor, Slider } from './PresetEditor'
import { LABELS, STR } from './strings'

interface Assignment extends ApplyOptions { presetId: string }

interface Photo {
  id: string
  file: File
  name: string
  thumb: ImageData
  stats: ImageStats
  assignment: Assignment | null
}

const THUMB = 360
const PREVIEW = 1600
const PRESET_EXT = /\.(xmp|lrtemplate|zip)$/i
const DEFAULT_OPTIONS: ApplyOptions = { amount: 100, adaptive: true, strength: 70 }
const stamp = () => Date.now()
const NO_PRESETS: Preset[] = []

// Per-photo develop settings, memoized on the (immutable) photo object so
// thumbnails that aren't affected by an edit keep the same `dev` and skip re-rendering.
type DevResult = { dev: Dev; changes: AdaptiveChange[] }
const devCaches = { assigned: new WeakMap<Photo, { key: string; value: DevResult }>(), preview: new WeakMap<Photo, { key: string; value: DevResult }>() }
function devOf(photo: Photo, preset: Preset, opts: ApplyOptions, slot: keyof typeof devCaches): DevResult {
  const key = `${preset.id}:${preset.updatedAt}:${opts.amount}:${opts.adaptive}:${opts.strength}`
  const cache = devCaches[slot]
  const hit = cache.get(photo)
  if (hit?.key === key) return hit.value
  const value = devFor(preset, opts, photo.stats)
  cache.set(photo, { key, value })
  return value
}

async function decode(file: Blob, max: number): Promise<ImageData> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return ctx.getImageData(0, 0, w, h)
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Draws `source` through `dev` onto a canvas, coalescing rapid updates into one frame. */
function useRendered(source: ImageData | null, dev: Dev | null, delay = 0) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !source) return
    let frame = 0
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(() => {
        if (canvas.width !== source.width) canvas.width = source.width
        if (canvas.height !== source.height) canvas.height = source.height
        const out = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height)
        if (dev) createRenderer(dev)(out.data, out.width, out.height)
        canvas.getContext('2d')!.putImageData(out, 0, 0)
      })
    }, delay)
    return () => { clearTimeout(timer); cancelAnimationFrame(frame) }
  }, [source, dev, delay])
  return ref
}

function Thumb({ photo, dev, focused, selected, presetName, onFocus, onToggle }: {
  photo: Photo; dev: Dev | null; focused: boolean; selected: boolean; presetName: string | null
  onFocus: () => void; onToggle: (range: boolean) => void
}) {
  const ref = useRendered(photo.thumb, dev, 90)
  return (
    <div className={`group relative overflow-hidden rounded-xl border bg-black/30 transition-colors ${focused ? 'border-cyan-300/70 ring-2 ring-cyan-300/30' : selected ? 'border-indigo-400/60' : 'border-white/8 hover:border-white/20'}`}>
      <button onClick={(e) => (e.metaKey || e.ctrlKey || e.shiftKey ? onToggle(e.shiftKey) : onFocus())} className="no-glow block aspect-[4/3] w-full">
        <canvas ref={ref} className="size-full object-cover" />
      </button>
      <button onClick={() => onToggle(false)} aria-label="select" className={`no-glow absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-md backdrop-blur ${selected ? 'bg-indigo-500 text-white' : 'bg-black/50 text-slate-300 opacity-0 group-hover:opacity-100'}`}>
        {selected ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-5">
        <p className="truncate text-[11px] text-slate-300">{photo.name}</p>
        {presetName && <p className="truncate text-[10px] font-semibold text-cyan-200">{presetName}</p>}
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="no-glow flex w-full items-center justify-between gap-3 text-sm text-slate-200">
      <span className="flex items-center gap-2">{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

const btn = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'
const primary = 'flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40'
const iconBtn = 'no-glow grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-white/10 hover:text-white'

export function LightroomPresets() {
  const t = useT(STR)
  const { lang } = useLang()
  const L = LABELS[lang]

  const { user } = useAuth()
  // Signed in: presets live in the account (utility_configs). Signed out: in this browser.
  const [localPresets, setLocalPresets] = useState<Preset[]>(loadPresets)
  const cloud = useUtilityConfig<{ presets: Preset[] | null }>('lightroom-presets', { presets: null })
  const cloudReady = !!user && !cloud.loading
  const presets = user ? (cloud.loading ? NO_PRESETS : cloud.config.presets ?? localPresets) : localPresets
  const setPresets = (update: (prev: Preset[]) => Preset[]) => {
    if (user) cloud.setConfig((c) => ({ ...c, presets: update(c.presets ?? localPresets) }))
    else setLocalPresets(update)
  }
  const [storageError, setStorageError] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [focusId, setFocusId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [options, setOptions] = useState<ApplyOptions>(DEFAULT_OPTIONS)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  const [loadingCount, setLoadingCount] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [compare, setCompare] = useState(false)
  const [preview, setPreview] = useState<{ id: string; data: ImageData } | null>(null)
  const [format, setFormat] = useState<OutputFormat>('jpeg')
  const [quality, setQuality] = useState(90)
  const [suffix, setSuffix] = useState(true)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const cancelRef = useRef(false)
  const lastToggled = useRef<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const presetInput = useRef<HTMLInputElement>(null)

  // Signed out: persist presets in this browser whenever they change.
  const firstSave = useRef(true)
  useEffect(() => {
    if (firstSave.current) { firstSave.current = false; return }
    if (user) return
    const ok = savePresets(localPresets)
    const timer = setTimeout(() => setStorageError(!ok), 0)
    return () => clearTimeout(timer)
  }, [localPresets, user])

  // First visit while signed in: seed the account with this browser's presets
  // (or the starters), so earlier local work isn't lost.
  const { setConfig: setCloudConfig } = cloud
  const needsSeed = cloudReady && !cloud.error && cloud.config.presets === null
  useEffect(() => {
    if (needsSeed) setCloudConfig({ presets: localPresets })
  }, [needsSeed, setCloudConfig, localPresets])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  const presetById = useMemo(() => new Map(presets.map((p) => [p.id, p])), [presets])
  const active = activeId ? presetById.get(activeId) ?? null : null
  const editing = editingId ? presetById.get(editingId) ?? null : null
  const focused = photos.find((p) => p.id === focusId) ?? photos[0] ?? null

  const assignedDev = (photo: Photo) => {
    const a = photo.assignment
    const preset = a ? presetById.get(a.presetId) : null
    return a && preset ? devOf(photo, preset, a, 'assigned') : null
  }

  // What the big preview shows: the preset being edited, else a preset picked
  // in the library (not applied yet), else whatever is applied.
  const previewInfo = useMemo(() => {
    if (!focused) return null
    const a = focused.assignment
    const show = editing ?? active
    if (show) {
      const opts = a?.presetId === show.id ? a : options
      return { preset: show, applied: a?.presetId === show.id && !editing, adaptive: opts.adaptive, ...devOf(focused, show, opts, 'preview') }
    }
    const preset = a ? presetById.get(a.presetId) : null
    if (a && preset) return { preset, applied: true, adaptive: a.adaptive, ...devOf(focused, preset, a, 'preview') }
    return null
  }, [focused, editing, active, options, presetById])

  // Load a larger copy of the focused photo for the preview canvas.
  useEffect(() => {
    if (!focused || preview?.id === focused.id) return
    let cancelled = false
    decode(focused.file, PREVIEW).then((data) => { if (!cancelled) setPreview({ id: focused.id, data }) }).catch(() => {})
    return () => { cancelled = true }
  }, [focused, preview?.id])
  const previewData = preview && preview.id === focused?.id ? preview.data : focused?.thumb ?? null
  const previewRef = useRendered(previewData, compare ? null : previewInfo?.dev ?? null)

  // ───── adding files ─────
  const addPhotos = async (files: File[]) => {
    if (!files.length) return
    setLoadingCount((n) => n + files.length)
    let failed = 0
    const added: Photo[] = []
    for (const file of files) {
      try {
        const thumb = await decode(file, THUMB)
        added.push({ id: newId(), file, name: file.name, thumb, stats: analyzePixels(thumb.data), assignment: null })
      } catch {
        failed++
      }
      setLoadingCount((n) => n - 1)
      if (added.length % 12 === 0 && added.length) {
        const batch = added.splice(0)
        setPhotos((prev) => [...prev, ...batch])
      }
    }
    if (added.length) setPhotos((prev) => [...prev, ...added])
    if (failed) setNotice({ text: t.unreadable(failed), tone: 'warn' })
  }

  const importPresets = async (files: File[]) => {
    const created: Preset[] = []
    let failed = 0
    for (const file of files) {
      try {
        const { presets: parsed, failed: bad } = await parsePresetFile(file.name, await file.arrayBuffer())
        failed += bad.length
        const now = stamp()
        for (const p of parsed) created.push({ id: newId(), name: p.name, group: p.group, settings: p.settings, ignored: p.ignored, createdAt: now, updatedAt: now })
      } catch {
        failed++
      }
    }
    if (created.length) {
      setPresets((prev) => [...prev, ...created])
      setActiveId(created[0].id)
    }
    const parts = [created.length ? t.imported(created.length) : '', failed ? t.importFailed(failed) : ''].filter(Boolean)
    if (parts.length) setNotice({ text: parts.join(' · '), tone: failed ? 'warn' : 'ok' })
  }

  const handleFiles = (list: FileList | File[] | null) => {
    const files = [...(list ?? [])]
    const presetFiles = files.filter((f) => PRESET_EXT.test(f.name))
    const images = files.filter((f) => !PRESET_EXT.test(f.name) && (f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(f.name)))
    if (presetFiles.length) void importPresets(presetFiles)
    if (images.length) void addPhotos(images)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  // ───── preset library ─────
  const updatePreset = (next: Preset) => setPresets((prev) => prev.map((p) => (p.id === next.id ? next : p)))

  const createPreset = () => {
    const now = stamp()
    const preset: Preset = { id: newId(), name: t.newName, group: '', settings: { ProcessVersion: '11.0' }, ignored: [], createdAt: now, updatedAt: now }
    setPresets((prev) => [...prev, preset])
    setActiveId(preset.id)
    setEditingId(preset.id)
  }

  const duplicatePreset = (p: Preset) => {
    const now = stamp()
    const copy: Preset = { ...p, id: newId(), name: `${p.name} ${t.copySuffix}`, settings: structuredClone(p.settings), ignored: [...p.ignored], createdAt: now, updatedAt: now }
    setPresets((prev) => {
      const i = prev.findIndex((x) => x.id === p.id)
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)]
    })
    setActiveId(copy.id)
  }

  const deletePreset = (p: Preset) => {
    if (!confirm(t.confirmDelete(p.name))) return
    setPresets((prev) => prev.filter((x) => x.id !== p.id))
    setPhotos((prev) => prev.map((ph) => (ph.assignment?.presetId === p.id ? { ...ph, assignment: null } : ph)))
    if (activeId === p.id) setActiveId(null)
    if (editingId === p.id) setEditingId(null)
  }

  const downloadPreset = (p: Preset) => downloadBlob(new Blob([presetToXmp(p)], { type: 'application/rdf+xml' }), `${safeFileName(p.name)}.xmp`)

  const exportAllPresets = () => {
    const enc = new TextEncoder()
    const files = presets.map((p) => ({ name: `${p.group ? `${safeFileName(p.group)}/` : ''}${safeFileName(p.name)}.xmp`, data: enc.encode(presetToXmp(p)) }))
    downloadBlob(new Blob([createZip(files)], { type: 'application/zip' }), 'lightroom-presets.zip')
  }

  const filtered = presets.filter((p) => !query || `${p.name} ${p.group}`.toLowerCase().includes(query.toLowerCase()))

  // ───── selection + applying ─────
  const toggleSelect = (id: string, range: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (range && lastToggled.current) {
        const a = photos.findIndex((p) => p.id === lastToggled.current), b = photos.findIndex((p) => p.id === id)
        const [lo, hi] = a < b ? [a, b] : [b, a]
        for (let i = lo; i <= hi; i++) next.add(photos[i].id)
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastToggled.current = id
  }

  const applyTo = (ids: Set<string> | null) => {
    if (!active) return
    setPhotos((prev) => prev.map((p) => (!ids || ids.has(p.id) ? { ...p, assignment: { presetId: active.id, ...options } } : p)))
  }
  const clearSelected = () => setPhotos((prev) => prev.map((p) => (selected.has(p.id) ? { ...p, assignment: null } : p)))
  const removeSelected = () => {
    setPhotos((prev) => prev.filter((p) => !selected.has(p.id)))
    setSelected(new Set())
  }

  // ───── export ─────
  const toExport = photos.filter((p) => p.assignment && presetById.has(p.assignment.presetId))

  const runExport = async () => {
    if (!toExport.length) return
    cancelRef.current = false
    setProgress({ done: 0, total: toExport.length })
    const jobs = toExport.map((photo) => {
      const preset = presetById.get(photo.assignment!.presetId)!
      const { dev } = devFor(preset, photo.assignment!, photo.stats)
      const ext = format === 'jpeg' ? 'jpg' : format
      const base = photo.name.replace(/\.[^.]+$/, '') || 'photo'
      return { photo, dev, name: `${base}${suffix ? ` - ${safeFileName(preset.name)}` : ''}.${ext}` }
    })
    const results: { name: string; blob: Blob }[] = []
    let failed = 0
    const canWork = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
    const poolSize = canWork ? Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1)) : 1
    const workers = canWork ? Array.from({ length: poolSize }, () => new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' })) : []
    let next = 0
    let done = 0
    const runOne = (worker: Worker | null, job: (typeof jobs)[number], id: number) =>
      worker
        ? new Promise<Blob>((resolve, reject) => {
          worker.onmessage = (e: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => { if (e.data.id === id) { if (e.data.blob) resolve(e.data.blob); else reject(new Error(e.data.error)) } }
          worker.onerror = () => reject(new Error('worker-failed'))
          worker.postMessage({ id, file: job.photo.file, dev: job.dev, format, quality })
        })
        : renderFile(job.photo.file, job.dev, format, quality)
    const lane = async (worker: Worker | null) => {
      while (next < jobs.length && !cancelRef.current) {
        const id = next++
        const job = jobs[id]
        try { results[id] = { name: job.name, blob: await runOne(worker, job, id) } } catch { failed++ }
        done++
        setProgress({ done, total: jobs.length })
      }
    }
    try {
      await Promise.all(canWork ? workers.map(lane) : [lane(null)])
    } finally {
      workers.forEach((w) => w.terminate())
    }
    setProgress(null)
    if (cancelRef.current) return
    const ok = results.filter(Boolean)
    if (ok.length === 1) downloadBlob(ok[0].blob, ok[0].name)
    else if (ok.length > 1) {
      const files = await Promise.all(ok.map(async (r) => ({ name: r.name, data: new Uint8Array(await r.blob.arrayBuffer()) })))
      downloadBlob(new Blob([createZip(files)], { type: 'application/zip' }), 'edited-photos.zip')
    }
    if (failed) setNotice({ text: t.exportFailed(failed), tone: 'warn' })
  }

  // ───── render ─────
  const scene = focused?.stats.scene
  const fmtChange = (c: AdaptiveChange) => {
    const f = (v: number) => (c.field === 'exposure' ? `${v > 0 ? '+' : ''}${v.toFixed(2)}` : `${v > 0 ? '+' : ''}${Math.round(v)}`)
    return `${f(c.from)} → ${f(c.to)}`
  }

  const presetPanel = (
    <aside className="glass h-fit rounded-3xl p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Layers className="size-4 text-indigo-300" />{t.presets}</h2>
        <span className="text-xs text-slate-600">{presets.length}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <button onClick={() => presetInput.current?.click()} className={btn}><FileUp className="size-3.5" />{t.import}</button>
        <button onClick={createPreset} className={btn}><Plus className="size-3.5" />{t.new}</button>
        <button onClick={exportAllPresets} disabled={!presets.length} title={t.exportAll} className={btn}><Archive className="size-3.5" />.zip</button>
      </div>
      {presets.length > 6 && <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="form-input mt-3" />}
      <ul className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto pr-1">
        {!presets.length && <li className="px-1 py-4 text-xs leading-relaxed text-slate-500">{t.noPresets}</li>}
        {filtered.map((p) => {
          const isActive = p.id === activeId
          const uses = photos.filter((ph) => ph.assignment?.presetId === p.id).length
          return (
            <li key={p.id} className={`group rounded-xl border transition-colors ${isActive ? 'border-indigo-400/50 bg-indigo-500/15' : 'border-transparent hover:bg-white/5'}`}>
              <button onClick={() => setActiveId(isActive ? null : p.id)} onDoubleClick={() => { setActiveId(p.id); setEditingId(p.id) }} className="no-glow block w-full px-2.5 py-2 text-left">
                <span className={`block truncate text-sm ${isActive ? 'font-semibold text-white' : 'text-slate-300'}`}>{p.name || '—'}</span>
                <span className="block truncate text-[11px] text-slate-600">{[p.group, uses ? `${uses} ×` : ''].filter(Boolean).join(' · ') || '\u00a0'}</span>
              </button>
              {isActive && (
                <div className="flex gap-0.5 border-t border-white/8 px-1.5 py-1">
                  <button onClick={() => setEditingId(p.id)} title={t.edit} className={iconBtn}><Pencil className="size-3.5" /></button>
                  <button onClick={() => duplicatePreset(p)} title={t.duplicate} className={iconBtn}><Copy className="size-3.5" /></button>
                  <button onClick={() => downloadPreset(p)} title={t.download} className={iconBtn}><Download className="size-3.5" /></button>
                  <button onClick={() => deletePreset(p)} title={t.remove} className={`${iconBtn} ml-auto hover:text-rose-300`}><Trash2 className="size-3.5" /></button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </aside>
  )

  const applyPanel = (
    <aside className="space-y-4">
      <section className="glass rounded-3xl p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Wand2 className="size-4 text-indigo-300" />{t.apply}</h2>
        <div className="mt-4 rounded-2xl border border-white/8 bg-black/15 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{t.activePreset}</p>
          <p className={`mt-1 truncate text-sm ${active ? 'font-semibold text-white' : 'text-slate-500'}`}>{active?.name ?? t.pickPreset}</p>
        </div>
        <div className="mt-4 space-y-4">
          <Slider label={t.amount} value={options.amount} min={0} max={200} def={100} format={(v) => `${v}%`} onChange={(amount) => setOptions((o) => ({ ...o, amount }))} />
          <Toggle checked={options.adaptive} onChange={(adaptive) => setOptions((o) => ({ ...o, adaptive }))} label={<><Sparkles className="size-4 text-cyan-300" />{t.adaptive}</>} />
          <p className="-mt-2 text-xs leading-relaxed text-slate-500">{t.adaptiveHint}</p>
          {options.adaptive && <Slider label={t.strength} value={options.strength} min={0} max={100} def={70} format={(v) => `${v}%`} onChange={(strength) => setOptions((o) => ({ ...o, strength }))} />}
        </div>
        <div className="mt-5 space-y-2">
          <button onClick={() => applyTo(selected)} disabled={!active || !selected.size} className={primary}><Wand2 className="size-4" />{t.applySelected(selected.size)}</button>
          <button onClick={() => applyTo(null)} disabled={!active || !photos.length} className={`${btn} w-full py-2.5 text-sm`}>{t.applyAll(photos.length)}</button>
          {selected.size > 0 && <button onClick={clearSelected} className="no-glow flex w-full items-center justify-center gap-1.5 py-1 text-xs text-slate-500 hover:text-white"><X className="size-3.5" />{t.clearSelected}</button>}
        </div>
      </section>

      <section className="glass rounded-3xl p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Download className="size-4 text-indigo-300" />{t.export}</h2>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{t.format}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(['jpeg', 'webp', 'png'] as const).map((f) => (
            <button key={f} onClick={() => setFormat(f)} className={`rounded-xl border px-3 py-1.5 text-xs font-semibold uppercase ${format === f ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200' : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'}`}>{f === 'jpeg' ? 'JPG' : f}</button>
          ))}
        </div>
        {format !== 'png' && <div className="mt-4"><Slider label={t.quality} value={quality} min={50} max={100} def={90} format={(v) => `${v}%`} onChange={setQuality} /></div>}
        <label className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={suffix} onChange={(e) => setSuffix(e.target.checked)} className="accent-indigo-500" />{t.suffix}
        </label>
        {progress ? (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><RefreshCw className="size-3 animate-spin" />{t.exporting(progress.done, progress.total)}</span>
              <button onClick={() => { cancelRef.current = true }} className="no-glow hover:text-white">{t.cancel}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => void runExport()} disabled={!toExport.length} className={`${primary} mt-4`}>
            <Download className="size-4" />{toExport.length ? t.exportCount(toExport.length) : t.exportNone}
          </button>
        )}
      </section>
    </aside>
  )

  return (
    <div
      onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
      onDrop={onDrop}
      className="relative"
    >
      <ToolHeader eyebrow={t.eyebrow} intro={t.intro} save={{ saving: cloud.saving, error: cloud.error }} />

      {(notice || storageError) && (
        <div className="mb-4 space-y-2">
          {storageError && <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-sm text-red-200">{t.storageFull}</p>}
          {notice && <p className={`rounded-xl border px-4 py-2.5 text-sm ${notice.tone === 'ok' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-amber-400/20 bg-amber-400/10 text-amber-100'}`}>{notice.text}</p>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        {presetPanel}

        <div className="min-w-0 space-y-5">
          {!photos.length ? (
            <div className={`glass grid min-h-96 place-items-center rounded-3xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? 'border-cyan-300 bg-cyan-400/10' : 'border-white/10'}`}>
              <div>
                <div className="mx-auto grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500/20 to-cyan-400/20 text-cyan-200 ring-1 ring-white/10"><UploadCloud className="size-9" /></div>
                <h2 className="mt-6 text-xl font-bold">{t.dropTitle}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{t.dropCopy}</p>
                <button onClick={() => photoInput.current?.click()} className="mt-6 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:brightness-110">{t.choosePhotos}</button>
                {loadingCount > 0 && <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400"><RefreshCw className="size-4 animate-spin" />{t.loading(loadingCount)}</p>}
              </div>
            </div>
          ) : (
            <>
              <section className="glass overflow-hidden rounded-3xl">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{focused?.name}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {compare ? t.original
                        : previewInfo ? (editing ? t.editingPreview(previewInfo.preset.name) : previewInfo.applied ? t.applied(previewInfo.preset.name) : t.previewing(previewInfo.preset.name))
                          : t.noPreset}
                    </p>
                  </div>
                  <button
                    onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)}
                    disabled={!previewInfo} className={`${btn} select-none`}
                  ><Eye className="size-3.5" />{t.holdCompare}</button>
                </div>
                <div className="relative grid min-h-[320px] place-items-center bg-black/30 p-4 sm:min-h-[460px]">
                  <canvas ref={previewRef} className="max-h-[62vh] max-w-full rounded-lg object-contain shadow-2xl" />
                  {scene && (
                    <span className="absolute bottom-3 left-3 rounded-lg bg-black/65 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
                      {t.scene}: <span className="text-cyan-200">{t.scenes[scene]}</span>
                    </span>
                  )}
                </div>
                {previewInfo?.adaptive && (
                  <div className="border-t border-white/8 px-5 py-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Sparkles className="size-3.5 text-cyan-300" />{t.adaptiveChanges}</p>
                    {previewInfo.changes.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {previewInfo.changes.map((c) => (
                          <span key={c.field} className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-300">{L[c.field] ?? c.field} <span className="font-mono text-cyan-200">{fmtChange(c)}</span></span>
                        ))}
                      </div>
                    ) : <p className="mt-1 text-xs text-slate-600">{t.noChanges}</p>}
                  </div>
                )}
              </section>

              <section className="glass rounded-3xl p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Images className="size-4 text-indigo-300" />{t.photos}<span className="font-normal text-slate-500">· {t.selected(selected.size, photos.length)}</span></h2>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setSelected(new Set(photos.map((p) => p.id)))} className={btn}><CheckSquare className="size-3.5" />{t.selectAll}</button>
                    <button onClick={() => setSelected(new Set())} disabled={!selected.size} className={btn}><Square className="size-3.5" />{t.selectNone}</button>
                    <button onClick={removeSelected} disabled={!selected.size} className={btn}><Trash2 className="size-3.5" />{t.removeSelected}</button>
                    <button onClick={() => photoInput.current?.click()} className={btn}><Plus className="size-3.5" />{t.addPhotos}</button>
                  </div>
                </div>
                {loadingCount > 0 && <p className="mb-3 flex items-center gap-2 text-xs text-slate-400"><RefreshCw className="size-3.5 animate-spin" />{t.loading(loadingCount)}</p>}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                  {photos.map((photo) => (
                    <Thumb
                      key={photo.id}
                      photo={photo}
                      dev={assignedDev(photo)?.dev ?? null}
                      focused={photo.id === focused?.id}
                      selected={selected.has(photo.id)}
                      presetName={photo.assignment ? presetById.get(photo.assignment.presetId)?.name ?? null : null}
                      onFocus={() => setFocusId(photo.id)}
                      onToggle={(range) => toggleSelect(photo.id, range)}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        <div className="lg:col-span-2 2xl:col-span-1">
          {editing ? <PresetEditor preset={editing} onChange={updatePreset} onDone={() => setEditingId(null)} /> : applyPanel}
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {([[ShieldCheck, t.privacy, t.privacyHint], [Layers, t.compat, t.compatHint], [Images, t.batch, t.batchHint]] as const).map(([Icon, title, hint]) => (
          <div key={title} className="glass rounded-2xl p-4">
            <Icon className="size-5 text-indigo-300" />
            <p className="mt-3 text-sm font-semibold text-white">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>
          </div>
        ))}
      </div>

      {dragging && photos.length > 0 && <div className="pointer-events-none fixed inset-4 z-50 rounded-3xl border-2 border-dashed border-cyan-300 bg-cyan-400/10" />}
      <input ref={photoInput} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
      <input ref={presetInput} type="file" multiple accept=".xmp,.lrtemplate,.zip" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
    </div>
  )
}
