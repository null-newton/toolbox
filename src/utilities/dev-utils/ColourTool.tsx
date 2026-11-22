import { useMemo, useState } from 'react'
import { ToolHeader } from '../../components/ToolHeader'
import { useT } from '../../i18n/LanguageContext'
import { CopyButton, Panel } from './ui'

const STR = {
  en: {
    intro: 'Paste any CSS colour — hex, rgb(), hsl(), oklch() or a name like "tomato" — and get it in every common format, with WCAG contrast checks.',
    colour: 'Colour', invalid: 'Not a colour the browser understands.', formats: 'Formats', contrast: 'Contrast',
    against: 'Against', text: 'Sample text', normal: 'Normal text', large: 'Large text', pass: 'Pass', fail: 'Fail',
    shades: 'Tints & shades',
  },
  nl: {
    intro: 'Plak eender welke CSS-kleur — hex, rgb(), hsl(), oklch() of een naam zoals "tomato" — en krijg ze in alle gangbare formaten, met WCAG-contrastcontroles.',
    colour: 'Kleur', invalid: 'Geen kleur die de browser begrijpt.', formats: 'Formaten', contrast: 'Contrast',
    against: 'Tegen', text: 'Voorbeeldtekst', normal: 'Normale tekst', large: 'Grote tekst', pass: 'OK', fail: 'Niet OK',
    shades: 'Tinten',
  },
}

type RGBA = { r: number; g: number; b: number; a: number }

let ctx: CanvasRenderingContext2D | null = null
function parseColour(input: string): RGBA | null {
  const s = input.trim()
  if (!s) return null
  ctx ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  // fillStyle silently ignores invalid values, so check it against two sentinels.
  ctx.fillStyle = '#010203'
  ctx.fillStyle = s
  const a1 = ctx.fillStyle
  ctx.fillStyle = '#040506'
  ctx.fillStyle = s
  if (a1 !== ctx.fillStyle) return null
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return { r, g, b, a: Math.round((a / 255) * 100) / 100 }
}

const round = (n: number, d = 0) => Number(n.toFixed(d))
const hex2 = (n: number) => n.toString(16).padStart(2, '0')

function toHsl({ r, g, b }: RGBA) {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min
  let h = 0
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 }
}

const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }

function toOklch({ r, g, b }: RGBA) {
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(A, Bb)
  return { L: L * 100, C, h: C < 1e-4 ? 0 : (Math.atan2(Bb, A) * 180 / Math.PI + 360) % 360 }
}

const luminance = ({ r, g, b }: RGBA) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a: RGBA, b: RGBA) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

function formats(c: RGBA) {
  const { h, s, l } = toHsl(c)
  const ok = toOklch(c)
  const alpha = c.a < 1
  const k = 1 - Math.max(c.r, c.g, c.b) / 255
  const cmyk = k === 1 ? [0, 0, 0, 100] : [c.r, c.g, c.b].map((v) => round(((1 - v / 255 - k) / (1 - k)) * 100)).concat(round(k * 100))
  const w = (Math.min(c.r, c.g, c.b) / 255) * 100, bl = (1 - Math.max(c.r, c.g, c.b) / 255) * 100
  return [
    ['HEX', `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${alpha ? hex2(Math.round(c.a * 255)) : ''}`],
    ['RGB', alpha ? `rgb(${c.r} ${c.g} ${c.b} / ${c.a})` : `rgb(${c.r}, ${c.g}, ${c.b})`],
    ['HSL', alpha ? `hsl(${round(h)} ${round(s)}% ${round(l)}% / ${c.a})` : `hsl(${round(h)}, ${round(s)}%, ${round(l)}%)`],
    ['HWB', `hwb(${round(h)} ${round(w)}% ${round(bl)}%${alpha ? ` / ${c.a}` : ''})`],
    ['OKLCH', `oklch(${round(ok.L, 1)}% ${round(ok.C, 3)} ${round(ok.h, 1)}${alpha ? ` / ${c.a}` : ''})`],
    ['CMYK', `cmyk(${cmyk.map((v) => `${v}%`).join(', ')})`],
    ['Tailwind', `[#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}]`],
  ] as const
}

function mix(c: RGBA, target: number, amount: number): string {
  const m = (v: number) => Math.round(v + (target - v) * amount)
  return `#${hex2(m(c.r))}${hex2(m(c.g))}${hex2(m(c.b))}`
}

export function ColourTool() {
  const t = useT(STR)
  const [input, setInput] = useState('#c8ff3d')
  const [bgInput, setBgInput] = useState('#071013')
  const c = useMemo(() => parseColour(input), [input])
  const bg = useMemo(() => parseColour(bgInput), [bgInput])
  const opaque = c && { ...c, a: 1 }
  const hex = opaque ? formats(opaque)[0][1] : '#000000'
  const cr = c && bg ? ratio(c, bg) : null

  return (
    <div>
      <ToolHeader intro={t.intro} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-4">
          <Panel title={t.colour}>
            <div className="flex gap-3">
              <label className="relative size-12 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/15" style={{ background: c ? input : 'transparent' }}>
                <input type="color" value={hex} onChange={(e) => setInput(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t.colour} />
              </label>
              <input value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} autoCapitalize="off" className="form-input font-mono text-base" />
            </div>
            {!c && input.trim() && <p className="mt-3 text-sm text-rose-300">{t.invalid}</p>}
            <div className="mt-4 h-28 rounded-xl border border-white/10" style={{ background: c ? input : 'repeating-linear-gradient(45deg,#1b2a2e 0 8px,#0d181c 8px 16px)' }} />
          </Panel>
          {c && (
            <Panel title={t.shades}>
              <div className="grid grid-cols-9 overflow-hidden rounded-xl">
                {[0.8, 0.6, 0.4, 0.2].map((a) => mix(c, 255, a)).concat(hex, [0.2, 0.4, 0.6, 0.8].map((a) => mix(c, 0, a))).map((h, i) => (
                  <button key={i} type="button" title={h} onClick={() => setInput(h)} className="no-glow h-12" style={{ background: h }} aria-label={h} />
                ))}
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title={t.formats}>
            {c ? (
              <ul className="divide-y divide-white/5">
                {formats(c).map(([name, value]) => (
                  <li key={name} className="flex items-center gap-3 py-2">
                    <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-500">{name}</span>
                    <span className="min-w-0 flex-1 break-all font-mono text-sm text-slate-100">{value}</span>
                    <CopyButton value={value} />
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">—</p>}
          </Panel>

          <Panel title={t.contrast}>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">{t.against}</span>
              <input value={bgInput} onChange={(e) => setBgInput(e.target.value)} spellCheck={false} className="form-input max-w-48 font-mono" />
              <button type="button" onClick={() => setBgInput('#ffffff')} className="size-7 shrink-0 rounded-md border border-white/20 bg-white" aria-label="white" />
              <button type="button" onClick={() => setBgInput('#000000')} className="size-7 shrink-0 rounded-md border border-white/20 bg-black" aria-label="black" />
            </div>
            {c && bg && cr != null && (
              <>
                <div className="mt-4 rounded-xl px-4 py-5" style={{ background: bgInput, color: input }}>
                  <p className="text-2xl font-bold">{t.text}</p>
                  <p className="text-sm">The quick brown fox jumps over the lazy dog.</p>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <p className="text-3xl font-extrabold tabular-nums text-white">{cr.toFixed(2)}<span className="text-lg text-slate-500">:1</span></p>
                  {([[t.normal, 4.5, 7], [t.large, 3, 4.5]] as const).map(([label, aa, aaa]) => (
                    <div key={label} className="text-xs">
                      <p className="text-slate-400">{label}</p>
                      <p className="mt-0.5 flex gap-2 font-semibold">
                        <span className={cr >= aa ? 'text-lime-300' : 'text-rose-300'}>AA {cr >= aa ? '✓' : '✗'}</span>
                        <span className={cr >= aaa ? 'text-lime-300' : 'text-rose-300'}>AAA {cr >= aaa ? '✓' : '✗'}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
