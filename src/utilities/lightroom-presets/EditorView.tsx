import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import {
  Aperture, BookmarkPlus, ChevronLeft, ChevronRight, CircleDashed, ClipboardCopy, ClipboardPaste, CloudFog, Contrast, Copy, Download,
  Droplet, Droplets, Ellipsis, Eye, FileUp, Film, Gem, Grid3x3, Moon, Pencil, Pipette, Plus, RotateCcw, SlidersHorizontal, Sparkles,
  Sun, SunDim, SunMedium, Thermometer, Trash2, X,
} from 'lucide-react'
import { useLang, useT } from '../../i18n/LanguageContext'
import { editDev, isEdited, presetCode, type ApplyOptions, type Edit, type Preset, type ToolKey } from './develop'
import { PresetEditor } from './PresetEditor'
import { LABELS, STR } from './strings'
import { MonoSlider, MonoToggle, Portal, RenderedCanvas, SheetBar } from './ui'
import { decodeImage, shrink, useRendered } from './image'
import { ZoomBubble } from './ZoomBubble'
import type { Photo } from './types'

type IconT = ComponentType<{ className?: string }>
const TOOLS: { key: ToolKey; icon: IconT; min: number; max: number; step?: number }[] = [
  { key: 'Exposure2012', icon: Sun, min: -3, max: 3, step: 0.05 },
  { key: 'Contrast2012', icon: Contrast, min: -100, max: 100 },
  { key: 'Highlights2012', icon: SunDim, min: -100, max: 100 },
  { key: 'Shadows2012', icon: Moon, min: -100, max: 100 },
  { key: 'Whites2012', icon: SunMedium, min: -100, max: 100 },
  { key: 'Blacks2012', icon: CircleDashed, min: -100, max: 100 },
  { key: 'Saturation', icon: Droplet, min: -100, max: 100 },
  { key: 'Vibrance', icon: Droplets, min: -100, max: 100 },
  { key: 'IncrementalTemperature', icon: Thermometer, min: -100, max: 100 },
  { key: 'IncrementalTint', icon: Pipette, min: -100, max: 100 },
  { key: 'Clarity2012', icon: Gem, min: -100, max: 100 },
  { key: 'Texture', icon: Grid3x3, min: -100, max: 100 },
  { key: 'Dehaze', icon: CloudFog, min: -100, max: 100 },
  { key: 'PostCropVignetteAmount', icon: Aperture, min: -100, max: 100 },
  { key: 'GrainAmount', icon: Film, min: 0, max: 100 },
]

export interface EditorApi {
  photos: Photo[]
  presets: Preset[]
  presetById: Map<string, Preset>
  defaults: ApplyOptions
  clipboard: Edit | null
  editingPreset: Preset | null
  setEdit: (photoId: string, edit: Edit | null) => void
  close: () => void
  setEditingPresetId: (id: string | null) => void
  updatePreset: (p: Preset) => void
  createPreset: () => void
  duplicatePreset: (p: Preset) => void
  deletePreset: (p: Preset) => void
  downloadPreset: (p: Preset) => void
  saveEditAsPreset: (edit: Edit) => void
  copyEdits: (edit: Edit) => void
  exportPhotos: (photos: Photo[]) => void
  importPresets: () => void
}

type Sheet =
  | { kind: 'strength'; snapshot: Edit | null }
  | { kind: 'tool'; key: ToolKey; snapshot: Edit | null }
  | { kind: 'more' }
  | { kind: 'preset'; preset: Preset }
  | null

function PresetTile({ label, active, onTap, onLong, children }: {
  label: string; active: boolean; onTap: () => void; onLong?: () => void; children: ReactNode
}) {
  const timer = useRef<number | undefined>(undefined)
  const long = useRef(false)
  const start = () => {
    long.current = false
    if (onLong) timer.current = window.setTimeout(() => { long.current = true; onLong() }, 450)
  }
  const stop = () => window.clearTimeout(timer.current)
  return (
    <button
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onContextMenu={(e) => { if (!onLong) return; e.preventDefault(); stop(); long.current = true; onLong() }}
      onClick={() => { if (!long.current) onTap() }}
      className="no-glow group flex w-[68px] shrink-0 flex-col items-center gap-1.5 sm:w-20"
    >
      <span className={`relative block aspect-square w-full overflow-hidden rounded-sm bg-neutral-900 ring-offset-2 ring-offset-[#0b0b0b] transition ${active ? 'ring-2 ring-white' : 'opacity-85 group-hover:opacity-100'}`}>
        {children}
      </span>
      <span className={`max-w-full truncate text-[11px] font-semibold tracking-wider ${active ? 'text-white' : 'text-neutral-500'}`}>{label}</span>
    </button>
  )
}

export function EditorView({ api, index, onNavigate }: { api: EditorApi; index: number; onNavigate: (i: number) => void }) {
  const t = useT(STR)
  const { lang } = useLang()
  const L = LABELS[lang]
  const photo = api.photos[index]
  const edit = photo.edit
  const preset = edit?.presetId ? api.presetById.get(edit.presetId) ?? null : null
  const [mode, setMode] = useState<'presets' | 'tools'>('presets')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [compare, setCompare] = useState(false)
  const [preview, setPreview] = useState<{ id: string; data: ImageData } | null>(null)
  const editing = api.editingPreset

  // Lock page scroll behind the full-screen editor.
  useEffect(() => {
    const html = document.documentElement.style.overflow, body = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = html; document.body.style.overflow = body }
  }, [])

  // Larger copy of the photo for the main canvas.
  useEffect(() => {
    if (preview?.id === photo.id) return
    let cancelled = false
    decodeImage(photo.file, 2048).then((data) => { if (!cancelled) setPreview({ id: photo.id, data }) }).catch(() => {})
    return () => { cancelled = true }
  }, [photo, preview?.id])
  const source = preview?.id === photo.id ? preview.data : photo.thumb

  const baseEdit = (): Edit => edit ?? { presetId: null, ...api.defaults, tools: {} }
  const commit = (next: Edit | null) => api.setEdit(photo.id, next && isEdited(next) ? next : null)

  const shown = useMemo(() => {
    if (editing) {
      const e: Edit = { ...(edit ?? { ...api.defaults, tools: {} }), presetId: editing.id }
      return editDev(e, editing, photo.stats)
    }
    return edit ? editDev(edit, preset, photo.stats) : null
  }, [editing, edit, preset, photo.stats, api.defaults])
  const canvasRef = useRendered(source, compare ? null : shown?.dev ?? null)

  // Strip tiles: this photo, small, rendered through every preset with the current settings.
  const tileSource = useMemo(() => shrink(photo.thumb, 150), [photo.thumb])
  const tileDevs = useMemo(() => {
    const e = edit ?? { presetId: null, ...api.defaults, tools: {} }
    return new Map(api.presets.map((p) => [p.id, editDev({ ...e, presetId: p.id }, p, photo.stats).dev]))
  }, [api.presets, edit, api.defaults, photo.stats])
  const noneDev = useMemo(() => (edit ? editDev({ ...edit, presetId: null }, null, photo.stats).dev : null), [edit, photo.stats])

  const pickPreset = (p: Preset | null) => {
    if (p && edit?.presetId === p.id) { setSheet({ kind: 'strength', snapshot: edit }); return }
    commit({ ...baseEdit(), presetId: p?.id ?? null })
  }

  const cancelSheet = () => {
    if (sheet && (sheet.kind === 'strength' || sheet.kind === 'tool')) commit(sheet.snapshot)
    setSheet(null)
  }

  // Keyboard: ← → to move between photos, Esc to close sheets / editor, \ to compare.
  const latest = useRef({ sheet, editing, index, count: api.photos.length })
  useEffect(() => { latest.current = { sheet, editing, index, count: api.photos.length } })
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select')) return
      const s = latest.current
      if (e.key === '\\') setCompare(true)
      if (e.key === 'Escape') {
        if (s.sheet) setSheet(null)
        else if (s.editing) api.setEditingPresetId(null)
        else api.close()
      }
      if (!s.sheet && e.key === 'ArrowLeft' && s.index > 0) onNavigate(s.index - 1)
      if (!s.sheet && e.key === 'ArrowRight' && s.index < s.count - 1) onNavigate(s.index + 1)
    }
    const up = (e: KeyboardEvent) => { if (e.key === '\\') setCompare(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [api, onNavigate])

  const toolDef = sheet?.kind === 'tool' ? TOOLS.find((x) => x.key === sheet.key)! : null
  const editingPanel = editing && (
    <PresetEditor preset={editing} onChange={api.updatePreset} onDone={() => api.setEditingPresetId(null)} />
  )
  const changes = shown?.changes ?? []
  const adaptiveOn = !!edit?.presetId && edit.adaptive

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0b0b] text-white">
      {/* top bar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-2 sm:px-4">
        <button onClick={api.close} aria-label={t.back} title={t.back} className="no-glow grid size-10 place-items-center text-neutral-300 hover:text-white"><ChevronLeft className="size-6" /></button>
        <div className="flex min-w-0 items-center gap-1">
          <button onClick={() => onNavigate(index - 1)} disabled={index === 0} aria-label="Previous" className="no-glow grid size-8 place-items-center text-neutral-500 hover:text-white disabled:opacity-25"><ChevronLeft className="size-4" /></button>
          <div className="min-w-0 text-center">
            <p className="truncate text-xs font-medium text-neutral-200">{editing ? t.previewing(editing.name) : photo.name}</p>
            <p className="text-[10px] tracking-widest text-neutral-500">{t.position(index + 1, api.photos.length)}</p>
          </div>
          <button onClick={() => onNavigate(index + 1)} disabled={index >= api.photos.length - 1} aria-label="Next" className="no-glow grid size-8 place-items-center text-neutral-500 hover:text-white disabled:opacity-25"><ChevronRight className="size-4" /></button>
        </div>
        <div className="flex items-center">
          <button
            onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)}
            disabled={!shown} title={t.compare} aria-label={t.compare}
            className={`no-glow grid size-10 select-none place-items-center disabled:opacity-25 ${compare ? 'text-white' : 'text-neutral-400 hover:text-white'}`}
          ><Eye className="size-5" /></button>
          <button onClick={() => setSheet(sheet?.kind === 'more' ? null : { kind: 'more' })} aria-label={t.more} title={t.more} className="no-glow grid size-10 place-items-center text-neutral-400 hover:text-white"><Ellipsis className="size-5" /></button>
        </div>
      </div>

      {/* photo (+ preset editor on desktop) */}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0 flex items-center justify-center px-3 pb-2 sm:px-8">
            <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
          </div>
          <ZoomBubble canvasRef={canvasRef} resetKey={photo.id} label={t.closeZoom} />
          <span className="pointer-events-none absolute left-3 top-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500 sm:left-8">
            {compare ? 'Original' : `${t.scene}: ${t.scenes[photo.stats.scene]}`}
          </span>
          <span className="pointer-events-none absolute right-3 top-1 hidden text-[10px] uppercase tracking-[0.2em] text-neutral-600 sm:right-8 sm:block">{t.zoomHint}</span>
        </div>
        {editing && <aside className="hidden w-96 shrink-0 overflow-y-auto border-l border-white/10 p-5 lg:block">{editingPanel}</aside>}
      </div>

      {/* bottom controls */}
      <div className="shrink-0 border-t border-white/5 pb-[env(safe-area-inset-bottom)]">
        {editing ? (
          <div className="max-h-[46dvh] overflow-y-auto p-4 lg:hidden">{editingPanel}</div>
        ) : sheet?.kind === 'strength' && preset ? (
          <div className="mx-auto max-w-xl px-4 pb-4">
            <SheetBar title={preset.name} onCancel={cancelSheet} onConfirm={() => setSheet(null)} />
            <div className="space-y-4 pt-1">
              <MonoSlider big value={edit!.amount} min={0} max={200} def={100} format={(v) => `${v}%`} onChange={(amount) => commit({ ...edit!, amount })} />
              <MonoToggle checked={edit!.adaptive} onChange={(adaptive) => commit({ ...edit!, adaptive })} label={<><Sparkles className="size-4" />{t.adaptive}</>} />
              {edit!.adaptive && (
                <>
                  <MonoSlider label={t.adaptiveStrength} value={edit!.strength} min={0} max={100} def={70} format={(v) => `${v}%`} onChange={(strength) => commit({ ...edit!, strength })} />
                  <div className="flex flex-wrap gap-1.5">
                    {changes.length ? changes.map((c) => (
                      <span key={c.field} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-neutral-400">
                        {L[c.field] ?? c.field} <span className="font-mono text-white">{c.field === 'exposure' ? `${c.from > 0 ? '+' : ''}${c.from.toFixed(2)} → ${c.to > 0 ? '+' : ''}${c.to.toFixed(2)}` : `${Math.round(c.from)} → ${Math.round(c.to)}`}</span>
                      </span>
                    )) : <span className="text-xs text-neutral-600">{t.noChanges}</span>}
                  </div>
                </>
              )}
              <p className="text-[11px] leading-relaxed text-neutral-600">{t.adaptiveHint}</p>
            </div>
          </div>
        ) : sheet?.kind === 'tool' && toolDef ? (
          <div className="mx-auto max-w-xl px-4 pb-5">
            <SheetBar title={L[toolDef.key] ?? toolDef.key} onCancel={cancelSheet} onConfirm={() => setSheet(null)} />
            <MonoSlider big value={edit?.tools[toolDef.key] ?? 0} min={toolDef.min} max={toolDef.max} step={toolDef.step} onChange={(v) => { const e = baseEdit(); commit({ ...e, tools: { ...e.tools, [toolDef.key]: v } }) }} />
          </div>
        ) : sheet?.kind === 'preset' ? (
          <div className="mx-auto max-w-xl px-4 pb-4">
            <div className="flex items-center justify-between py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-300">{sheet.preset.name}</span>
              <button onClick={() => setSheet(null)} aria-label="Close" className="no-glow grid size-10 place-items-center text-neutral-400 hover:text-white"><X className="size-5" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {([
                [Pencil, t.edit, () => { api.setEditingPresetId(sheet.preset.id); setSheet(null) }],
                [Copy, t.duplicate, () => { api.duplicatePreset(sheet.preset); setSheet(null) }],
                [Download, t.download, () => api.downloadPreset(sheet.preset)],
                [Trash2, t.delete, () => { api.deletePreset(sheet.preset); setSheet(null) }],
              ] as const).map(([Icon, label, action]) => (
                <button key={label} onClick={action} className="no-glow flex flex-col items-center gap-1.5 rounded-xl py-3 text-[11px] text-neutral-400 hover:bg-white/5 hover:text-white">
                  <Icon className="size-5" />{label}
                </button>
              ))}
            </div>
          </div>
        ) : sheet?.kind === 'more' ? (
          <div className="mx-auto max-w-xl px-4 pb-4">
            <div className="flex items-center justify-between py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-300">{t.more}</span>
              <button onClick={() => setSheet(null)} aria-label="Close" className="no-glow grid size-10 place-items-center text-neutral-400 hover:text-white"><X className="size-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {([
                [ClipboardCopy, t.copyEdits, !edit, () => { api.copyEdits(edit!); setSheet(null) }],
                [ClipboardPaste, t.pasteEdits, !api.clipboard, () => { commit(api.clipboard); setSheet(null) }],
                [BookmarkPlus, t.saveAsPreset, !edit, () => { api.saveEditAsPreset(edit!); setSheet(null) }],
                [RotateCcw, t.resetEdits, !edit, () => { commit(null); setSheet(null) }],
                [Download, t.exportPhoto, !edit, () => { api.exportPhotos([photo]); setSheet(null) }],
              ] as const).map(([Icon, label, disabled, action]) => (
                <button key={label} onClick={action} disabled={disabled} className="no-glow flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-center text-[11px] text-neutral-400 hover:bg-white/5 hover:text-white disabled:opacity-30">
                  <Icon className="size-5" />{label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {mode === 'presets' ? (
              <div>
                <div className="flex h-8 items-center justify-between gap-3 px-4">
                  <span className="truncate text-[11px] uppercase tracking-[0.2em] text-neutral-400">{preset ? `${preset.name} · ${edit!.amount}%` : t.none}</span>
                  {preset && (
                    <button onClick={() => commit({ ...edit!, adaptive: !edit!.adaptive })} className={`no-glow flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${adaptiveOn ? 'bg-white text-black' : 'bg-white/10 text-neutral-400'}`}>
                      <Sparkles className="size-3" />{t.adaptive}
                    </button>
                  )}
                </div>
                <div className="vsco-strip flex gap-2.5 overflow-x-auto px-4 pb-3 pt-2">
                  <PresetTile label={t.none} active={!preset} onTap={() => pickPreset(null)}>
                    <RenderedCanvas source={tileSource} dev={noneDev} className="size-full object-cover" />
                  </PresetTile>
                  {api.presets.map((p) => (
                    <PresetTile key={p.id} label={presetCode(p.name)} active={preset?.id === p.id} onTap={() => pickPreset(p)} onLong={() => setSheet({ kind: 'preset', preset: p })}>
                      <RenderedCanvas source={tileSource} dev={tileDevs.get(p.id) ?? null} delay={120} className="size-full object-cover" />
                      {preset?.id === p.id && (
                        <span onClick={(e) => { e.stopPropagation(); setSheet({ kind: 'preset', preset: p }) }} className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/60 text-white"><Ellipsis className="size-3" /></span>
                      )}
                    </PresetTile>
                  ))}
                  <PresetTile label={t.newPreset} active={false} onTap={() => (edit ? api.saveEditAsPreset(edit) : api.createPreset())}>
                    <span className="grid size-full place-items-center text-neutral-500"><Plus className="size-6" /></span>
                  </PresetTile>
                  <PresetTile label={t.importPhotos} active={false} onTap={api.importPresets}>
                    <span className="grid size-full place-items-center text-neutral-500"><FileUp className="size-6" /></span>
                  </PresetTile>
                </div>
              </div>
            ) : (
              <div className="vsco-strip flex gap-1 overflow-x-auto px-3 pb-2 pt-3">
                {TOOLS.map(({ key, icon: Icon }) => {
                  const value = edit?.tools[key] ?? 0
                  return (
                    <button key={key} onClick={() => setSheet({ kind: 'tool', key, snapshot: edit })} className="no-glow flex w-[72px] shrink-0 flex-col items-center gap-1.5 py-1 text-neutral-400 hover:text-white">
                      <span className="relative grid size-11 place-items-center rounded-full border border-white/10">
                        <Icon className="size-5" />
                        {value !== 0 && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-white" />}
                      </span>
                      <span className="max-w-full truncate text-[10px] tracking-wide">{L[key] ?? key}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="flex h-12 items-center justify-center gap-10 border-t border-white/5">
              {([['presets', Grid3x3, t.presetsTab], ['tools', SlidersHorizontal, t.toolsTab]] as const).map(([id, Icon, label]) => (
                <button key={id} onClick={() => setMode(id)} aria-pressed={mode === id} title={label} className={`no-glow flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] ${mode === id ? 'text-white' : 'text-neutral-600 hover:text-neutral-300'}`}>
                  <Icon className="size-5" /><span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
    </Portal>
  )
}
