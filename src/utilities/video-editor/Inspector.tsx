import type { ReactNode } from 'react'
import { Crop, Scissors, Trash2, Volume2, VolumeX } from 'lucide-react'
import { cropForAspect, FULL_RECT, type AudioTrack, type Overlay, type Rect, type VideoClip } from './types'
import type { T } from './strings'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const btn = 'rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-300 transition hover:bg-white/10'
const on = 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white'

export const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="flex items-center justify-between gap-2 text-xs text-slate-400"><span className="shrink-0">{label}</span>{children}</label>

export function NumberInput({ value, onChange, min, max, step = 0.1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <input type="number" value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0} min={min} max={max} step={step} onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))} className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right text-white focus:border-indigo-400/60 focus:outline-none" />
}

export function Pills<V extends string>({ value, options, onChange }: { value: V; options: Array<[V, string]>; onChange: (v: V) => void }) {
  return <div className="flex flex-wrap overflow-hidden rounded-lg border border-white/10">{options.map(([v, l]) => <button key={v} onClick={() => onChange(v)} className={`px-2.5 py-1 text-xs font-medium transition ${value === v ? on : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>{l}</button>)}</div>
}

const DeleteButton = ({ label, onClick }: { label: string; onClick: () => void }) => <button onClick={onClick} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-1.5 text-sm text-slate-300 transition hover:bg-rose-500/20 hover:text-rose-300"><Trash2 className="size-4" /> {label}</button>
const Section = ({ title, children }: { title: string; children: ReactNode }) => <div className="space-y-2 border-t border-white/5 pt-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>{children}</div>

function VolumeRow({ volume, muted, t, onChange }: { volume: number; muted: boolean; t: T; onChange: (p: { volume?: number; muted?: boolean }) => void }) {
  return <div className="flex items-center gap-2">
    <button onClick={() => onChange({ muted: !muted })} title={muted ? t.unmute : t.mute} className={`grid size-7 shrink-0 place-items-center rounded-lg border ${muted ? 'border-amber-400/40 bg-amber-500/10 text-amber-300' : 'border-white/10 bg-white/5 text-slate-300'}`}>{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
    <input type="range" min={0} max={1} step={0.01} value={volume} disabled={muted} onChange={(e) => onChange({ volume: Number(e.target.value) })} className="flex-1 accent-indigo-500 disabled:opacity-40" />
    <span className="w-9 text-right font-mono text-[10px] text-slate-500">{Math.round(volume * 100)}%</span>
  </div>
}

export function ClipInspector({ clip, t, outAspect, cropMode, cropLock, onChange, onMove, onSplit, onDelete, onCropMode, onCropLock }: {
  clip: VideoClip; t: T; outAspect: number; cropMode: boolean; cropLock: 'free' | 'output'
  onChange: (p: Partial<VideoClip>) => void; onMove: (d: -1 | 1) => void; onSplit: () => void; onDelete: () => void; onCropMode: (v: boolean) => void; onCropLock: (v: 'free' | 'output') => void
}) {
  const c = clip.crop, setCrop = (r: Partial<Rect>) => onChange({ crop: { ...c, ...r } })
  const edge = (k: 'l' | 't' | 'r' | 'b', pct: number) => {
    const v = clamp(pct / 100, 0, 0.95)
    if (k === 'l') setCrop({ x: Math.min(v, c.x + c.w - 0.05), w: c.x + c.w - Math.min(v, c.x + c.w - 0.05) })
    else if (k === 't') setCrop({ y: Math.min(v, c.y + c.h - 0.05), h: c.y + c.h - Math.min(v, c.y + c.h - 0.05) })
    else if (k === 'r') setCrop({ w: clamp(1 - v - c.x, 0.05, 1 - c.x) })
    else setCrop({ h: clamp(1 - v - c.y, 0.05, 1 - c.y) })
  }
  return <div className="space-y-3">
    <p className="truncate text-sm font-medium text-white" title={clip.name}>{clip.name}</p>
    <div className="grid grid-cols-2 gap-2">
      <Field label={t.trimStart}><NumberInput value={clip.trimStart} min={0} onChange={(v) => onChange({ trimStart: clamp(v, 0, clip.trimEnd - 0.1) })} /></Field>
      <Field label={t.trimEnd}><NumberInput value={clip.trimEnd} max={clip.duration} onChange={(v) => onChange({ trimEnd: clamp(v, clip.trimStart + 0.1, clip.duration) })} /></Field>
    </div>
    <VolumeRow volume={clip.volume} muted={clip.muted} t={t} onChange={onChange} />
    <Section title={t.transform}>
      <Field label={t.scale}><input type="range" min={0.1} max={4} step={0.01} value={clip.scale} onChange={(e) => onChange({ scale: Number(e.target.value) })} className="w-28 accent-indigo-500" /><span className="w-10 text-right font-mono text-[10px]">{Math.round(clip.scale * 100)}%</span></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t.posX}><NumberInput value={clip.tx * 100} step={1} onChange={(v) => onChange({ tx: v / 100 })} /></Field>
        <Field label={t.posY}><NumberInput value={clip.ty * 100} step={1} onChange={(v) => onChange({ ty: v / 100 })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2"><button className={btn} onClick={() => onChange({ tx: 0, ty: 0 })}>{t.center}</button><button className={btn} onClick={() => onChange({ tx: 0, ty: 0, scale: 1 })}>{t.resetTransform}</button></div>
    </Section>
    <Section title={t.crop}>
      <button onClick={() => onCropMode(!cropMode)} className={`flex w-full items-center justify-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition ${cropMode ? `border-transparent ${on}` : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}><Crop className="size-3.5" /> {cropMode ? t.doneCrop : t.editCrop}</button>
      <Field label={t.cropAspect}><Pills value={cropLock} options={[['free', t.free], ['output', t.outputShape]]} onChange={(v) => { onCropLock(v); if (v === 'output') onChange({ crop: cropForAspect(clip.width, clip.height, outAspect) }) }} /></Field>
      <div className="flex flex-wrap gap-1">{([['16:9', 16 / 9], ['9:16', 9 / 16], ['1:1', 1], ['4:5', 4 / 5]] as const).map(([l, r]) => <button key={l} className={btn} onClick={() => { onCropLock('free'); onChange({ crop: cropForAspect(clip.width, clip.height, r) }) }}>{l}</button>)}</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t.cropL}><NumberInput value={c.x * 100} step={1} onChange={(v) => edge('l', v)} /></Field>
        <Field label={t.cropR}><NumberInput value={(1 - c.x - c.w) * 100} step={1} onChange={(v) => edge('r', v)} /></Field>
        <Field label={t.cropT}><NumberInput value={c.y * 100} step={1} onChange={(v) => edge('t', v)} /></Field>
        <Field label={t.cropB}><NumberInput value={(1 - c.y - c.h) * 100} step={1} onChange={(v) => edge('b', v)} /></Field>
      </div>
      <button className={`${btn} w-full`} onClick={() => { onCropLock('free'); onChange({ crop: FULL_RECT }) }}>{t.resetCrop}</button>
    </Section>
    <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
      <button onClick={() => onMove(-1)} className={btn}>← {t.moveLeft}</button>
      <button onClick={onSplit} className={`${btn} flex items-center justify-center gap-1`}><Scissors className="size-3.5" /> {t.split.replace(/ \(.*\)/, '')}</button>
      <button onClick={() => onMove(1)} className={btn}>{t.moveRight} →</button>
    </div>
    <DeleteButton label={t.delete} onClick={onDelete} />
  </div>
}

function BoxFields({ o, t, onChange }: { o: Overlay; t: T; onChange: (p: Partial<Overlay>) => void }) {
  return <>
    <div className="grid grid-cols-2 gap-2">
      <Field label={t.start}><NumberInput value={o.start} min={0} onChange={(v) => onChange({ start: Math.max(0, v) })} /></Field>
      <Field label={t.duration}><NumberInput value={o.duration} min={0.1} onChange={(v) => onChange({ duration: Math.max(0.1, v) })} /></Field>
      <Field label={t.posX}><NumberInput value={o.x} step={0.01} onChange={(v) => onChange({ x: v })} /></Field>
      <Field label={t.posY}><NumberInput value={o.y} step={0.01} onChange={(v) => onChange({ y: v })} /></Field>
      <Field label={t.width}><NumberInput value={o.w} min={0.02} step={0.01} onChange={(v) => onChange({ w: Math.max(0.02, v) })} /></Field>
      <Field label={t.height}><NumberInput value={o.h} min={0.02} step={0.01} onChange={(v) => onChange({ h: Math.max(0.02, v) })} /></Field>
    </div>
  </>
}

const colorInput = 'size-8 cursor-pointer rounded-lg border border-white/10 bg-transparent disabled:opacity-30'

export function OverlayInspector({ overlay: o, t, onChange, onSplit, onDelete }: { overlay: Overlay; t: T; onChange: (p: Partial<Overlay>) => void; onSplit: () => void; onDelete: () => void }) {
  return <div className="space-y-3">
    {o.type === 'text' && <>
      <textarea value={o.text} onChange={(e) => onChange({ text: e.target.value })} rows={2} className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-indigo-400/60 focus:outline-none" />
      <Field label={t.color}><input type="color" value={o.color} onChange={(e) => onChange({ color: e.target.value })} className={colorInput} /></Field>
      <Field label={t.background}><div className="flex items-center gap-2"><input type="color" value={o.bg ?? '#000000'} disabled={o.bg === null} onChange={(e) => onChange({ bg: e.target.value })} className={colorInput} /><button onClick={() => onChange({ bg: o.bg === null ? '#000000' : null })} className={btn}>{o.bg === null ? '+' : t.none}</button></div></Field>
      <Field label={t.fontSize}><input type="range" min={0.02} max={0.2} step={0.005} value={o.fontScale} onChange={(e) => onChange({ fontScale: Number(e.target.value) })} className="w-28 accent-indigo-500" /></Field>
      <Field label={t.align}><Pills value={o.align} options={[['left', 'L'], ['center', 'C'], ['right', 'R']]} onChange={(align) => onChange({ align })} /></Field>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={o.bold} onChange={(e) => onChange({ bold: e.target.checked })} className="size-3.5 accent-indigo-500" />{t.bold}</label>
    </>}
    {o.type === 'color' && <>
      <Field label={t.color}><input type="color" value={o.color} onChange={(e) => onChange({ color: e.target.value })} className={colorInput} /></Field>
      <Field label={t.opacity}><input type="range" min={0} max={1} step={0.01} value={o.opacity} onChange={(e) => onChange({ opacity: Number(e.target.value) })} className="w-28 accent-indigo-500" /></Field>
    </>}
    {o.type === 'image' && <p className="truncate text-sm font-medium text-white" title={o.name}>{o.name}</p>}
    <BoxFields o={o} t={t} onChange={onChange} />
    <button onClick={onSplit} className={`${btn} flex w-full items-center justify-center gap-1`}><Scissors className="size-3.5" /> {t.split}</button>
    <DeleteButton label={t.delete} onClick={onDelete} />
  </div>
}

export function AudioInspector({ track, t, onChange, onSplit, onDelete }: { track: AudioTrack; t: T; onChange: (p: Partial<AudioTrack>) => void; onSplit: () => void; onDelete: () => void }) {
  return <div className="space-y-3">
    <p className="truncate text-sm font-medium text-white" title={track.name}>{track.name}</p>
    <div className="grid grid-cols-2 gap-2">
      <Field label={t.start}><NumberInput value={track.start} min={0} onChange={(v) => onChange({ start: Math.max(0, v) })} /></Field>
      <Field label={t.trimStart}><NumberInput value={track.trimStart} min={0} onChange={(v) => { const ts = clamp(v, 0, track.duration - 0.1); onChange({ trimStart: ts, length: Math.min(track.length, track.duration - ts) }) }} /></Field>
      <Field label={t.duration}><NumberInput value={track.length} min={0.1} onChange={(v) => onChange({ length: clamp(v, 0.1, track.duration - track.trimStart) })} /></Field>
    </div>
    <VolumeRow volume={track.volume} muted={track.muted} t={t} onChange={onChange} />
    <button onClick={onSplit} className={`${btn} flex w-full items-center justify-center gap-1`}><Scissors className="size-3.5" /> {t.split}</button>
    <DeleteButton label={t.delete} onClick={onDelete} />
  </div>
}
