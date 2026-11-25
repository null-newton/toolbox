import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Check, ClipboardPaste, Copy, Download, FileUp, ImagePlus, Layers, Pencil, Plus, RefreshCw, Sparkles, Trash2, UploadCloud, X } from 'lucide-react'
import { useT } from '../../i18n/LanguageContext'
import { ToolHeader } from '../../components/ToolHeader'
import { useAuth } from '../../auth/auth-context'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { analyzePixels, bakeEdit, editDev, isEdited, presetCode, type AdaptiveChange, type ApplyOptions, type Dev, type Edit, type Preset } from './develop'
import { createZip, parsePresetFile, presetToXmp, safeFileName } from './formats'
import { loadPresets, newId, savePresets } from './storage'
import { renderFile, type OutputFormat } from './render'
import { EditorView, type EditorApi } from './EditorView'
import { PresetEditor } from './PresetEditor'
import { STR } from './strings'
import { MonoSlider, MonoToggle, Portal, RenderedCanvas, Sheet } from './ui'
import { decodeImage, downloadBlob, shrink } from './image'
import type { Photo } from './types'
import './vsco.css'

const THUMB = 360
const PRESET_EXT = /\.(xmp|lrtemplate|zip)$/i
const DEFAULTS: ApplyOptions = { amount: 100, adaptive: true, strength: 70 }
const NO_PRESETS: Preset[] = []
const stamp = () => Date.now()

// Rendered settings per photo, memoized on the (immutable) photo object so grid
// tiles that an edit doesn't touch keep the same `dev` and skip re-rendering.
type DevResult = { dev: Dev; changes: AdaptiveChange[] }
const devCache = new WeakMap<Photo, { key: string; value: DevResult | null }>()
function photoDev(photo: Photo, presetById: Map<string, Preset>): DevResult | null {
  const edit = photo.edit
  const preset = edit?.presetId ? presetById.get(edit.presetId) ?? null : null
  const key = edit ? `${JSON.stringify(edit)}:${preset?.updatedAt ?? ''}` : ''
  const hit = devCache.get(photo)
  if (hit?.key === key) return hit.value
  const value = edit && isEdited(edit) ? editDev(edit, preset, photo.stats) : null
  devCache.set(photo, { key, value })
  return value
}

const pill = 'no-glow inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30'
const pillGhost = `${pill} border border-white/15 text-neutral-200 hover:bg-white/10`
const pillSolid = `${pill} bg-white text-black hover:bg-neutral-200`

export function LightroomPresets() {
  const t = useT(STR)
  const { user } = useAuth()

  // ───── presets: account when signed in, this browser otherwise ─────
  const [localPresets, setLocalPresets] = useState<Preset[]>(loadPresets)
  const cloud = useUtilityConfig<{ presets: Preset[] | null }>('lightroom-presets', { presets: null })
  const presets = user ? (cloud.loading ? NO_PRESETS : cloud.config.presets ?? localPresets) : localPresets
  const setPresets = (update: (prev: Preset[]) => Preset[]) => {
    if (user) cloud.setConfig((c) => ({ ...c, presets: update(c.presets ?? localPresets) }))
    else setLocalPresets(update)
  }
  const [storageError, setStorageError] = useState(false)
  const firstSave = useRef(true)
  useEffect(() => {
    if (firstSave.current) { firstSave.current = false; return }
    if (user) return
    const ok = savePresets(localPresets)
    const timer = setTimeout(() => setStorageError(!ok), 0)
    return () => clearTimeout(timer)
  }, [localPresets, user])
  const { setConfig: setCloudConfig } = cloud
  const needsSeed = !!user && !cloud.loading && !cloud.error && cloud.config.presets === null
  useEffect(() => { if (needsSeed) setCloudConfig({ presets: localPresets }) }, [needsSeed, setCloudConfig, localPresets])
  const presetById = useMemo(() => new Map(presets.map((p) => [p.id, p])), [presets])

  // ───── session state ─────
  const [photos, setPhotos] = useState<Photo[]>([])
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [clipboard, setClipboard] = useState<Edit | null>(null)
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'library' | 'apply' | 'export' | null>(null)
  const [applyPresetId, setApplyPresetId] = useState<string | null>(null)
  const [applyOptions, setApplyOptions] = useState<ApplyOptions>(DEFAULTS)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  const [loadingCount, setLoadingCount] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [format, setFormat] = useState<OutputFormat>('jpeg')
  const [quality, setQuality] = useState(90)
  const [suffix, setSuffix] = useState(true)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const cancelRef = useRef(false)
  const lastToggled = useRef<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const presetInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const editingPreset = editingPresetId ? presetById.get(editingPresetId) ?? null : null
  const editedCount = photos.filter((p) => isEdited(p.edit)).length

  // ───── files ─────
  const addPhotos = async (files: File[]) => {
    if (!files.length) return
    setLoadingCount((n) => n + files.length)
    let failed = 0
    const added: Photo[] = []
    for (const file of files) {
      try {
        const thumb = await decodeImage(file, THUMB)
        added.push({ id: newId(), file, name: file.name, thumb, stats: analyzePixels(thumb.data), edit: null })
      } catch {
        failed++
      }
      setLoadingCount((n) => n - 1)
      if (added.length >= 12) {
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
    if (created.length) setPresets((prev) => [...prev, ...created])
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

  // ───── presets ─────
  const updatePreset = (next: Preset) => setPresets((prev) => prev.map((p) => (p.id === next.id ? next : p)))

  const addPreset = (name: string, settings: Preset['settings'], from?: Preset) => {
    const now = stamp()
    const preset: Preset = { id: newId(), name, group: from?.group ?? '', settings, ignored: from ? [...from.ignored] : [], createdAt: now, updatedAt: now }
    setPresets((prev) => {
      const i = from ? prev.findIndex((p) => p.id === from.id) : -1
      return i < 0 ? [...prev, preset] : [...prev.slice(0, i + 1), preset, ...prev.slice(i + 1)]
    })
    return preset
  }

  const createPreset = () => {
    const preset = addPreset(t.newName, { ProcessVersion: '11.0' })
    setEditingPresetId(preset.id)
    if (photos.length && openIndex === null) setOpenIndex(0)
  }

  const duplicatePreset = (p: Preset) => { addPreset(`${p.name} ${t.copySuffix}`, structuredClone(p.settings), p) }

  const deletePreset = (p: Preset) => {
    if (!confirm(t.confirmDelete(p.name))) return
    setPresets((prev) => prev.filter((x) => x.id !== p.id))
    setPhotos((prev) => prev.map((ph) => {
      if (ph.edit?.presetId !== p.id) return ph
      const edit = { ...ph.edit, presetId: null }
      return { ...ph, edit: isEdited(edit) ? edit : null }
    }))
    if (editingPresetId === p.id) setEditingPresetId(null)
  }

  const downloadPreset = (p: Preset) => downloadBlob(new Blob([presetToXmp(p)], { type: 'application/rdf+xml' }), `${safeFileName(p.name)}.xmp`)

  const exportAllPresets = () => {
    const enc = new TextEncoder()
    const files = presets.map((p) => ({ name: `${p.group ? `${safeFileName(p.group)}/` : ''}${safeFileName(p.name)}.xmp`, data: enc.encode(presetToXmp(p)) }))
    downloadBlob(new Blob([createZip(files)], { type: 'application/zip' }), 'presets.zip')
  }

  const saveEditAsPreset = (edit: Edit) => {
    const base = edit.presetId ? presetById.get(edit.presetId) ?? null : null
    const preset = addPreset(base ? `${base.name} ${t.edits}` : t.newName, bakeEdit(edit, base), base ?? undefined)
    setNotice({ text: t.savedPreset(preset.name), tone: 'ok' })
  }

  const editPreset = (p: Preset) => {
    setEditingPresetId(p.id)
    if (!photos.length) return // edited inside the library sheet
    setSheet(null)
    setOpenIndex(openIndex ?? Math.max(0, photos.findIndex((ph) => selected.has(ph.id))))
  }

  // ───── edits ─────
  const setEdit = useCallback((photoId: string, edit: Edit | null) => {
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, edit } : p)))
  }, [])

  const pasteTo = (ids: Set<string>) => {
    if (!clipboard) return
    setPhotos((prev) => prev.map((p) => (ids.has(p.id) ? { ...p, edit: { ...clipboard, tools: { ...clipboard.tools } } } : p)))
    setNotice({ text: t.pasted(ids.size), tone: 'ok' })
  }

  const applyToSelected = () => {
    if (!applyPresetId) return
    setPhotos((prev) => prev.map((p) => (selected.has(p.id) ? { ...p, edit: { tools: {}, ...p.edit, presetId: applyPresetId, ...applyOptions } } : p)))
    setSheet(null)
  }

  const toggleSelect = (id: string, range = false) => {
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

  const endSelect = () => { setSelecting(false); setSelected(new Set()) }

  const removeSelected = () => {
    setPhotos((prev) => prev.filter((p) => !selected.has(p.id)))
    endSelect()
  }

  // ───── export ─────
  const exportPhotos = async (list: Photo[]) => {
    const jobs = list.flatMap((photo) => {
      const result = photoDev(photo, presetById)
      if (!result) return []
      const preset = photo.edit?.presetId ? presetById.get(photo.edit.presetId) : null
      const ext = format === 'jpeg' ? 'jpg' : format
      const base = photo.name.replace(/\.[^.]+$/, '') || 'photo'
      const tag = suffix ? ` - ${preset ? safeFileName(preset.name) : 'edit'}` : ''
      return [{ photo, dev: result.dev, name: `${base}${tag}.${ext}` }]
    })
    if (!jobs.length) return
    cancelRef.current = false
    setProgress({ done: 0, total: jobs.length })
    const results: { name: string; blob: Blob }[] = []
    let failed = 0
    const canWork = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
    const poolSize = canWork ? Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1)) : 1
    const workers = canWork ? Array.from({ length: poolSize }, () => new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' })) : []
    let next = 0, done = 0
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
        try { results[id] = { name: jobs[id].name, blob: await runOne(worker, jobs[id], id) } } catch { failed++ }
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

  const exportScope = selecting && selected.size ? photos.filter((p) => selected.has(p.id) && isEdited(p.edit)) : photos.filter((p) => isEdited(p.edit))

  // ───── editor wiring ─────
  const api: EditorApi = {
    photos, presets, presetById, defaults: DEFAULTS, clipboard, editingPreset,
    setEdit,
    close: () => { setOpenIndex(null); setEditingPresetId(null) },
    setEditingPresetId, updatePreset, createPreset, duplicatePreset, deletePreset, downloadPreset, saveEditAsPreset,
    copyEdits: (edit) => { setClipboard({ ...edit, tools: { ...edit.tools } }); setNotice({ text: t.copied, tone: 'ok' }) },
    exportPhotos: (list) => void exportPhotos(list),
    importPresets: () => presetInput.current?.click(),
  }
  const openPhoto = openIndex !== null && photos[openIndex] ? openIndex : null

  // Strip for the bulk "apply preset" sheet, rendered on the first selected photo.
  const sample = photos.find((p) => selected.has(p.id)) ?? photos[0]
  const sampleSource = useMemo(() => (sample ? shrink(sample.thumb, 150) : null), [sample])
  const filtered = presets.filter((p) => !query || `${p.name} ${p.group}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <div
      onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
      onDrop={onDrop}
      className="relative"
    >
      <ToolHeader eyebrow={t.eyebrow} intro={t.intro} save={{ saving: cloud.saving, error: cloud.error }} />

      {/* studio toolbar */}
      <div className="sticky top-0 z-30 mb-3 flex flex-wrap items-center justify-between gap-2 py-2 backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
          {selecting ? t.selectedCount(selected.size) : photos.length ? t.photosCount(photos.length, editedCount) : t.library}
          {loadingCount > 0 && <span className="ml-3 inline-flex items-center gap-1.5 normal-case tracking-normal text-neutral-500"><RefreshCw className="size-3 animate-spin" />{t.loading(loadingCount)}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {selecting ? (
            <>
              <button onClick={() => setSelected(new Set(photos.map((p) => p.id)))} className={pillGhost}>{t.selectAll}</button>
              <button onClick={endSelect} className={pillSolid}>{t.done}</button>
            </>
          ) : (
            <>
              <button onClick={() => photoInput.current?.click()} className={pillGhost}><ImagePlus className="size-3.5" />{t.importPhotos}</button>
              <button onClick={() => setSheet('library')} className={pillGhost}><Layers className="size-3.5" />{t.library}<span className="text-neutral-500">{presets.length}</span></button>
              {photos.length > 0 && <button onClick={() => setSelecting(true)} className={pillGhost}><Check className="size-3.5" />{t.select}</button>}
              {photos.length > 0 && <button onClick={() => setSheet('export')} disabled={!editedCount} className={pillSolid}><Download className="size-3.5" />{t.export}</button>}
            </>
          )}
        </div>
      </div>

      {/* grid */}
      {!photos.length ? (
        <button onClick={() => photoInput.current?.click()} className={`no-glow grid min-h-[50vh] w-full place-items-center rounded-2xl border border-dashed p-8 text-center transition-colors ${dragging ? 'border-white bg-white/5' : 'border-white/15 hover:border-white/30'}`}>
          <span>
            <UploadCloud className="mx-auto size-10 text-neutral-400" />
            <span className="mt-5 block text-lg font-semibold text-white">{t.dropTitle}</span>
            <span className="mx-auto mt-2 block max-w-md text-sm text-neutral-500">{t.dropCopy}</span>
            <span className={`${pillSolid} mt-6`}>{t.choosePhotos}</span>
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-0.5 pb-24 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
          {photos.map((photo, i) => {
            const result = photoDev(photo, presetById)
            const preset = photo.edit?.presetId ? presetById.get(photo.edit.presetId) : null
            const isSel = selected.has(photo.id)
            return (
              <button
                key={photo.id}
                onClick={(e) => {
                  if (selecting) toggleSelect(photo.id, e.shiftKey)
                  else if (e.shiftKey || e.metaKey || e.ctrlKey) { setSelecting(true); toggleSelect(photo.id) }
                  else setOpenIndex(i)
                }}
                onContextMenu={(e) => { e.preventDefault(); setSelecting(true); toggleSelect(photo.id) }}
                className="no-glow group relative block aspect-square overflow-hidden bg-neutral-900"
              >
                <RenderedCanvas source={photo.thumb} dev={result?.dev ?? null} delay={90} className={`size-full object-cover transition ${selecting && !isSel ? 'opacity-50' : 'group-hover:opacity-90'}`} />
                {isEdited(photo.edit) && (
                  <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white backdrop-blur">
                    {preset ? presetCode(preset.name) : '•'}{photo.edit?.adaptive && preset ? ' ✦' : ''}
                  </span>
                )}
                {selecting && (
                  <span className={`absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full border ${isSel ? 'border-white bg-white text-black' : 'border-white/70 bg-black/30'}`}>
                    {isSel && <Check className="size-3.5" />}
                  </span>
                )}
                {isSel && <span className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-white" />}
              </button>
            )
          })}
        </div>
      )}

      {/* selection action bar */}
      {selecting && (
        <Portal>
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-neutral-950/95 p-1.5 shadow-2xl backdrop-blur">
            <button onClick={() => { setApplyPresetId(null); setSheet('apply') }} disabled={!selected.size} className={pillSolid}><Layers className="size-3.5" />{t.applyPreset}</button>
            <button onClick={() => pasteTo(selected)} disabled={!selected.size || !clipboard} className={`${pill} text-neutral-200 hover:bg-white/10`}><ClipboardPaste className="size-3.5" />{t.pasteEdits}</button>
            <button onClick={() => setSheet('export')} disabled={!exportScope.length} className={`${pill} text-neutral-200 hover:bg-white/10`}><Download className="size-3.5" />{t.export}</button>
            <button onClick={removeSelected} disabled={!selected.size} className={`${pill} text-neutral-200 hover:bg-white/10`}><Trash2 className="size-3.5" />{t.remove}</button>
          </div>
        </div>
        </Portal>
      )}

      {/* preset library */}
      <Sheet open={sheet === 'library'} onClose={() => { setSheet(null); if (!photos.length) setEditingPresetId(null) }} title={t.library}>
        {editingPreset && !photos.length ? (
          <PresetEditor preset={editingPreset} onChange={updatePreset} onDone={() => setEditingPresetId(null)} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => presetInput.current?.click()} className={`${pillGhost} justify-center`}><FileUp className="size-3.5" />{t.importPhotos}</button>
              <button onClick={() => { createPreset(); if (photos.length) setSheet(null) }} className={`${pillGhost} justify-center`}><Plus className="size-3.5" />{t.newPreset}</button>
              <button onClick={exportAllPresets} disabled={!presets.length} title={t.exportAll} className={`${pillGhost} justify-center`}><Download className="size-3.5" />.zip</button>
            </div>
            {presets.length > 8 && <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="form-input mt-3" />}
            <ul className="mt-3 divide-y divide-white/5">
              {!presets.length && <li className="py-6 text-center text-sm text-neutral-500">{t.noPresets}</li>}
              {filtered.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-9 w-11 shrink-0 place-items-center rounded bg-white/5 text-[11px] font-bold tracking-wider text-neutral-300">{presetCode(p.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{p.name}</span>
                    {p.group && <span className="block truncate text-[11px] text-neutral-500">{p.group}</span>}
                  </span>
                  {([[Pencil, t.edit, () => editPreset(p)], [Copy, t.duplicate, () => duplicatePreset(p)], [Download, t.download, () => downloadPreset(p)], [Trash2, t.delete, () => deletePreset(p)]] as const).map(([Icon, label, action]) => (
                    <button key={label} onClick={action} title={label} aria-label={label} className="no-glow grid size-8 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-white/10 hover:text-white"><Icon className="size-4" /></button>
                  ))}
                </li>
              ))}
            </ul>
          </>
        )}
      </Sheet>

      {/* bulk apply */}
      <Sheet open={sheet === 'apply'} onClose={() => setSheet(null)} title={t.applyPreset}>
        <div className="vsco-strip -mx-5 flex gap-2.5 overflow-x-auto px-5 pb-2 pt-1">
          {sampleSource && sample && presets.map((p) => {
            const active = applyPresetId === p.id
            return (
              <button key={p.id} onClick={() => setApplyPresetId(p.id)} className="no-glow flex w-20 shrink-0 flex-col items-center gap-1.5">
                <span className={`block aspect-square w-full overflow-hidden rounded-sm ring-offset-2 ring-offset-neutral-950 ${active ? 'ring-2 ring-white' : 'opacity-80'}`}>
                  <RenderedCanvas source={sampleSource} dev={editDev({ presetId: p.id, ...applyOptions, tools: {} }, p, sample.stats).dev} delay={120} className="size-full object-cover" />
                </span>
                <span className={`max-w-full truncate text-[11px] font-semibold tracking-wider ${active ? 'text-white' : 'text-neutral-500'}`}>{presetCode(p.name)}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 truncate text-center text-xs text-neutral-400">{applyPresetId ? presetById.get(applyPresetId)?.name : '—'}</p>
        <div className="mt-4 space-y-4">
          <MonoSlider label={t.amount} value={applyOptions.amount} min={0} max={200} def={100} format={(v) => `${v}%`} onChange={(amount) => setApplyOptions((o) => ({ ...o, amount }))} />
          <MonoToggle checked={applyOptions.adaptive} onChange={(adaptive) => setApplyOptions((o) => ({ ...o, adaptive }))} label={<><Sparkles className="size-4" />{t.adaptive}</>} />
          {applyOptions.adaptive && <MonoSlider label={t.adaptiveStrength} value={applyOptions.strength} min={0} max={100} def={70} format={(v) => `${v}%`} onChange={(strength) => setApplyOptions((o) => ({ ...o, strength }))} />}
          <p className="text-[11px] leading-relaxed text-neutral-600">{t.adaptiveHint}</p>
        </div>
        <button onClick={applyToSelected} disabled={!applyPresetId} className={`${pillSolid} mt-5 w-full justify-center py-3 text-sm`}>{t.applyTo(selected.size)}</button>
      </Sheet>

      {/* export */}
      <Sheet open={sheet === 'export'} onClose={() => setSheet(null)} title={t.export}>
        <p className="text-sm text-neutral-300">{selecting && selected.size ? t.exportScopeSelected(exportScope.length) : t.exportScopeAll(exportScope.length)}</p>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{t.format}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(['jpeg', 'webp', 'png'] as const).map((f) => (
            <button key={f} onClick={() => setFormat(f)} className={`no-glow rounded-full py-2 text-xs font-semibold uppercase ${format === f ? 'bg-white text-black' : 'border border-white/15 text-neutral-400 hover:text-white'}`}>{f === 'jpeg' ? 'JPG' : f}</button>
          ))}
        </div>
        {format !== 'png' && <div className="mt-5"><MonoSlider label={t.quality} value={quality} min={50} max={100} def={90} format={(v) => `${v}%`} onChange={setQuality} /></div>}
        <label className="mt-5 flex items-center gap-2 text-xs text-neutral-400">
          <input type="checkbox" checked={suffix} onChange={(e) => setSuffix(e.target.checked)} className="accent-white" />{t.suffix}
        </label>
        <button onClick={() => { setSheet(null); void exportPhotos(exportScope) }} disabled={!exportScope.length} className={`${pillSolid} mt-5 w-full justify-center py-3 text-sm`}>
          <Download className="size-4" />{exportScope.length ? t.exportCount(exportScope.length) : t.exportNone}
        </button>
      </Sheet>

      {openPhoto !== null && <EditorView api={api} index={openPhoto} onNavigate={(i) => setOpenIndex(Math.max(0, Math.min(photos.length - 1, i)))} />}

      {/* export progress + notices */}
      <Portal>
      <div className="fixed left-1/2 top-3 z-[70] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 space-y-2">
        {progress && (
          <div className="rounded-xl border border-white/10 bg-neutral-950/95 p-3 shadow-2xl backdrop-blur">
            <div className="h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-white transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
            <div className="mt-2 flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1.5"><RefreshCw className="size-3 animate-spin" />{t.exporting(progress.done, progress.total)}</span>
              <button onClick={() => { cancelRef.current = true }} className="no-glow hover:text-white">{t.cancel}</button>
            </div>
          </div>
        )}
        {storageError && <p className="rounded-xl border border-red-400/30 bg-red-950/90 px-4 py-2.5 text-sm text-red-100 shadow-xl">{t.storageFull}</p>}
        {notice && (
          <p className={`flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-xl backdrop-blur ${notice.tone === 'ok' ? 'border-white/10 bg-neutral-950/95 text-neutral-100' : 'border-amber-400/30 bg-amber-950/90 text-amber-100'}`}>
            <span className="flex-1">{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Close" className="no-glow text-neutral-500 hover:text-white"><X className="size-4" /></button>
          </p>
        )}
      </div>
      {dragging && photos.length > 0 && <div className="pointer-events-none fixed inset-4 z-50 rounded-2xl border-2 border-dashed border-white/70 bg-white/5" />}
      </Portal>
      <input ref={photoInput} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
      <input ref={presetInput} type="file" multiple accept=".xmp,.lrtemplate,.zip" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
    </div>
  )
}
