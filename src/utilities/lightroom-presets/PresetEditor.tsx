import { useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown, RotateCcw, TriangleAlert } from 'lucide-react'
import { useLang, useT } from '../../i18n/LanguageContext'
import { HSL_COLORS, toNumber, type Preset, type SettingValue } from './develop'
import { LABELS, STR } from './strings'

interface SliderDef { key: string; min: number; max: number; step?: number; def?: number; track?: string }

const stamp = () => Date.now()
const HUE_TRACK = 'linear-gradient(90deg,#f33,#fb3,#ff3,#3f3,#3ff,#33f,#f3f,#f33)'
const HSL_SWATCH: Record<string, string> = { Red: '#f87171', Orange: '#fb923c', Yellow: '#facc15', Green: '#4ade80', Aqua: '#22d3ee', Blue: '#60a5fa', Purple: '#a78bfa', Magenta: '#f472b6' }

const LIGHT: SliderDef[] = [
  { key: 'Exposure2012', min: -5, max: 5, step: 0.05 },
  { key: 'Contrast2012', min: -100, max: 100 },
  { key: 'Highlights2012', min: -100, max: 100 },
  { key: 'Shadows2012', min: -100, max: 100 },
  { key: 'Whites2012', min: -100, max: 100 },
  { key: 'Blacks2012', min: -100, max: 100 },
]
const PRESENCE: SliderDef[] = [
  { key: 'Texture', min: -100, max: 100 },
  { key: 'Clarity2012', min: -100, max: 100 },
  { key: 'Dehaze', min: -100, max: 100 },
]
const CURVE: SliderDef[] = [
  { key: 'ParametricHighlights', min: -100, max: 100 },
  { key: 'ParametricLights', min: -100, max: 100 },
  { key: 'ParametricDarks', min: -100, max: 100 },
  { key: 'ParametricShadows', min: -100, max: 100 },
]
const EFFECTS: SliderDef[] = [
  { key: 'PostCropVignetteAmount', min: -100, max: 100 },
  { key: 'PostCropVignetteMidpoint', min: 0, max: 100, def: 50 },
  { key: 'PostCropVignetteFeather', min: 0, max: 100, def: 50 },
  { key: 'PostCropVignetteRoundness', min: -100, max: 100 },
  { key: 'GrainAmount', min: 0, max: 100 },
  { key: 'GrainSize', min: 0, max: 100, def: 25 },
]

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-t border-white/8 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 hover:text-white">
        {title}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  )
}

export function Slider({ label, value, min, max, step = 1, def = 0, track, onChange, format }: {
  label: string; value: number; min: number; max: number; step?: number; def?: number; track?: string
  onChange: (v: number) => void; format?: (v: number) => string
}) {
  const shown = format ? format(value) : step < 1 ? (value > 0 ? '+' : '') + value.toFixed(2) : (value > 0 && min < 0 ? '+' : '') + Math.round(value)
  return (
    <label className="block" onDoubleClick={() => onChange(def)}>
      <span className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={`font-mono ${value !== def ? 'text-cyan-200' : 'text-slate-600'}`}>{shown}</span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-indigo-500"
      />
      {track && <span className="-mt-1 block h-1 rounded-full opacity-70" style={{ background: track }} />}
    </label>
  )
}

function CurvePreview({ points }: { points: number[] }) {
  const pts: string[] = []
  for (let i = 0; i + 1 < points.length; i += 2) pts.push(`${(points[i] / 255) * 100},${100 - (points[i + 1] / 255) * 100}`)
  return (
    <svg viewBox="0 0 100 100" className="aspect-square w-full rounded-lg border border-white/10 bg-black/30">
      {[25, 50, 75].map((v) => <g key={v} stroke="rgb(255 255 255 / 0.07)"><line x1={v} y1="0" x2={v} y2="100" /><line x1="0" y1={v} x2="100" y2={v} /></g>)}
      <line x1="0" y1="100" x2="100" y2="0" stroke="rgb(255 255 255 / 0.15)" strokeDasharray="2 2" />
      <polyline points={pts.join(' ')} fill="none" stroke="#67e8f9" strokeWidth="1.5" />
      {pts.map((p) => { const [x, y] = p.split(','); return <circle key={p} cx={x} cy={y} r="1.8" fill="#67e8f9" /> })}
    </svg>
  )
}

export function PresetEditor({ preset, onChange, onDone }: {
  preset: Preset
  onChange: (next: Preset) => void
  onDone: () => void
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const L = LABELS[lang]
  const [hslTab, setHslTab] = useState<'hue' | 'sat' | 'lum'>('sat')
  const s = preset.settings

  const num = (key: string, def = 0) => toNumber(s[key]) ?? def
  const set = (patch: Record<string, SettingValue | undefined>) => {
    const settings = { ...s }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete settings[k]
      else settings[k] = v
    }
    onChange({ ...preset, settings, updatedAt: stamp() })
  }
  const slider = (d: SliderDef, label = L[d.key] ?? d.key) => (
    <Slider key={d.key} label={label} value={num(d.key, d.def)} min={d.min} max={d.max} step={d.step} def={d.def} track={d.track} onChange={(v) => set({ [d.key]: v })} />
  )

  const absoluteWb = toNumber(s.Temperature) !== undefined && toNumber(s.IncrementalTemperature) === undefined
  const gray = s.ConvertToGrayscale === true || s.ConvertToGrayscale === 'True'
  const curve = Array.isArray(s.ToneCurvePV2012) && !s.ToneCurvePV2012.every((v, i, a) => i % 2 === 0 || v === a[i - 1]) ? s.ToneCurvePV2012 : null
  const hslPrefix = { hue: 'HueAdjustment', sat: 'SaturationAdjustment', lum: 'LuminanceAdjustment' }[hslTab]

  const zone = (title: string, hueKey: string, satKey: string, lumKey: string) => (
    <div className="rounded-xl border border-white/8 bg-black/15 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
        <span className="size-3 rounded-full ring-1 ring-white/20" style={{ background: num(satKey) ? `hsl(${num(hueKey)} ${Math.min(100, num(satKey) * 1.2 + 20)}% 55%)` : '#475569' }} />
        {title}
      </div>
      <div className="space-y-2">
        {slider({ key: hueKey, min: 0, max: 359, track: HUE_TRACK }, t.hue)}
        {slider({ key: satKey, min: 0, max: 100 }, t.sat)}
        {slider({ key: lumKey, min: -100, max: 100 }, t.lum)}
      </div>
    </div>
  )

  return (
    <aside className="glass h-fit rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-white">{t.editor}</h2>
        <button onClick={onDone} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110">
          <Check className="size-3.5" />{t.done}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_0.7fr] gap-2">
        <label className="text-xs text-slate-500">{t.name}<input value={preset.name} onChange={(e) => onChange({ ...preset, name: e.target.value, updatedAt: stamp() })} className="form-input mt-1" /></label>
        <label className="text-xs text-slate-500">{t.group}<input value={preset.group} onChange={(e) => onChange({ ...preset, group: e.target.value, updatedAt: stamp() })} className="form-input mt-1" /></label>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
        <span>{t.resetHint}</span>
        <button onClick={() => onChange({ ...preset, settings: { ProcessVersion: '11.0' }, ignored: [], updatedAt: stamp() })} className="no-glow inline-flex items-center gap-1 text-slate-500 hover:text-white"><RotateCcw className="size-3" />{t.resetAll}</button>
      </div>
      {preset.ignored.length > 0 && (
        <p className="mt-3 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{t.ignored} {preset.ignored.join(', ')}</span>
        </p>
      )}

      <div className="mt-3 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
        <Section title={t.sections.light} open>{LIGHT.map((d) => slider(d))}</Section>
        <Section title={t.sections.color} open>
          {absoluteWb
            ? slider({ key: 'Temperature', min: 2000, max: 20000, step: 50, def: 5500, track: 'linear-gradient(90deg,#60a5fa,#e5e7eb,#fbbf24)' })
            : slider({ key: 'IncrementalTemperature', min: -100, max: 100, track: 'linear-gradient(90deg,#60a5fa,#e5e7eb,#fbbf24)' })}
          {absoluteWb && toNumber(s.Tint) !== undefined
            ? slider({ key: 'Tint', min: -150, max: 150, track: 'linear-gradient(90deg,#4ade80,#e5e7eb,#e879f9)' })
            : slider({ key: 'IncrementalTint', min: -100, max: 100, track: 'linear-gradient(90deg,#4ade80,#e5e7eb,#e879f9)' })}
          {slider({ key: 'Vibrance', min: -100, max: 100 })}
          {slider({ key: 'Saturation', min: -100, max: 100 })}
        </Section>
        <Section title={t.sections.presence}>{PRESENCE.map((d) => slider(d))}</Section>
        <Section title={t.sections.curve}>
          {CURVE.map((d) => slider(d))}
          {curve && (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
                <span>{t.pointCurve}</span>
                <button onClick={() => set({ ToneCurvePV2012: [0, 0, 255, 255], ToneCurveName2012: 'Linear' })} className="no-glow inline-flex items-center gap-1 hover:text-white"><RotateCcw className="size-3" />{t.resetCurve}</button>
              </div>
              <div className="mx-auto max-w-44"><CurvePreview points={curve} /></div>
            </div>
          )}
        </Section>
        <Section title={gray ? t.sections.bw : t.sections.hsl}>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={gray} onChange={(e) => set({ ConvertToGrayscale: e.target.checked })} className="accent-indigo-500" />
            {t.convertBw}
          </label>
          {!gray && (
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/20 p-1">
              {(['hue', 'sat', 'lum'] as const).map((k) => (
                <button key={k} onClick={() => setHslTab(k)} className={`rounded-lg px-2 py-1 text-xs font-semibold ${hslTab === k ? 'bg-indigo-500/25 text-indigo-100' : 'text-slate-500 hover:text-white'}`}>{t.hslTabs[k]}</button>
              ))}
            </div>
          )}
          {HSL_COLORS.map((c) => {
            const key = gray ? `GrayMixer${c}` : `${hslPrefix}${c}`
            return (
              <div key={key} className="grid grid-cols-[10px_1fr] items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: HSL_SWATCH[c] }} />
                {slider({ key, min: -100, max: 100 }, L[c])}
              </div>
            )
          })}
        </Section>
        <Section title={t.sections.grading}>
          {zone(t.shadowsZone, 'SplitToningShadowHue', 'SplitToningShadowSaturation', 'ColorGradeShadowLum')}
          {zone(t.midtonesZone, 'ColorGradeMidtoneHue', 'ColorGradeMidtoneSat', 'ColorGradeMidtoneLum')}
          {zone(t.highlightsZone, 'SplitToningHighlightHue', 'SplitToningHighlightSaturation', 'ColorGradeHighlightLum')}
          {slider({ key: 'SplitToningBalance', min: -100, max: 100 })}
        </Section>
        <Section title={t.sections.effects}>{EFFECTS.map((d) => slider(d))}</Section>
      </div>
    </aside>
  )
}
