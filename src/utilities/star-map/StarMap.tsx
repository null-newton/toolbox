import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bookmark, Clock, Download, FileDown, LocateFixed, Loader2, MapPin, Search, Trash2 } from 'lucide-react'
import { useAuth } from '../../auth/auth-context'
import { ToolHeader } from '../../components/ToolHeader'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { useLang, useT } from '../../i18n/LanguageContext'
import { allTimeZones, localTz, zonedToUtc } from '../countdown-board/time'
import { observer, toHorizontal } from './astro'
import { FONTS, THEMES, loadPosterFonts, renderPoster, type MapOptions, type Palette, type SkyData } from './render'

const STR = {
  en: {
    intro: 'Make a print-ready poster of the night sky exactly as it looked from any place, at any moment — a birthday, a first date, the night someone was born.',
    loading: 'Loading your star map…', moment: 'Place & moment', place: 'Place', placePh: 'Search a city or address…', search: 'Search', noResults: 'No places found.',
    myLocation: 'My location', lat: 'Latitude', lon: 'Longitude', date: 'Date', time: 'Time', zone: 'Time zone', now: 'Now',
    text: 'Text', title: 'Title', subtitle: 'Subtitle', placeLabel: 'Place name on poster', showPlace: 'Place', showDate: 'Date & time', showCoords: 'Coordinates',
    layout: 'Layout', poster: 'Poster with text', mapOnly: 'Map only', frame: 'Frame',
    style: 'Style', theme: 'Theme', font: 'Font', colors: 'Custom colours', bg: 'Background', sky: 'Sky', stars: 'Stars', lines: 'Lines', textColor: 'Text', resetColors: 'Reset to theme',
    ring: 'Border', ringNone: 'None', ringThin: 'Thin', ringDouble: 'Double', ringTicks: 'Ticks',
    sky2: 'Sky', constellations: 'Constellation lines', constellationNames: 'Constellation names', starNames: 'Star names', planets: 'Planets', moon: 'Moon', milkyWay: 'Milky Way',
    grid: 'Coordinate grid', compass: 'Compass points', starColors: 'True star colours', glow: 'Glow',
    magLimit: 'Faintest stars', starScale: 'Star size', lineWidth: 'Line thickness', projection: 'Projection', equidistant: 'Classic', stereographic: 'Stereographic',
    export: 'Export', paper: 'Paper size', quality: 'Quality', draft: 'Draft (150 dpi)', print: 'Print (300 dpi)', pdf: 'Download PDF', png: 'Download PNG', exporting: 'Preparing…',
    defaultTitle: 'Under these stars', summary: (n: number) => `${n.toLocaleString()} stars above the horizon`,
    tzNote: 'Time is read in the selected time zone. Searching a place sets it automatically.',
    presets: 'Presets', presetPh: 'Preset name, e.g. Anniversary gift', savePreset: 'Save', includeMoment: 'Include place, moment & text',
    noPresets: 'No presets yet. Style a map, give it a name and save it to reuse it later.', styleOnly: 'Style only', full: 'Full poster',
    apply: 'Apply preset', remove: 'Delete preset', replaceHint: 'Saving under an existing name replaces that preset.', applied: 'Applied',
    localOnly: 'Log in to keep presets on all your devices — for now they are saved in this browser.',
  },
  nl: {
    intro: 'Maak een printklare poster van de sterrenhemel precies zoals die eruitzag vanaf elke plek, op elk moment — een verjaardag, een eerste date, de nacht dat iemand geboren werd.',
    loading: 'Je sterrenkaart laden…', moment: 'Plaats en moment', place: 'Plaats', placePh: 'Zoek een stad of adres…', search: 'Zoeken', noResults: 'Geen plaatsen gevonden.',
    myLocation: 'Mijn locatie', lat: 'Breedtegraad', lon: 'Lengtegraad', date: 'Datum', time: 'Tijd', zone: 'Tijdzone', now: 'Nu',
    text: 'Tekst', title: 'Titel', subtitle: 'Ondertitel', placeLabel: 'Plaatsnaam op poster', showPlace: 'Plaats', showDate: 'Datum en tijd', showCoords: 'Coördinaten',
    layout: 'Opmaak', poster: 'Poster met tekst', mapOnly: 'Alleen kaart', frame: 'Kader',
    style: 'Stijl', theme: 'Thema', font: 'Lettertype', colors: 'Eigen kleuren', bg: 'Achtergrond', sky: 'Hemel', stars: 'Sterren', lines: 'Lijnen', textColor: 'Tekst', resetColors: 'Terug naar thema',
    ring: 'Rand', ringNone: 'Geen', ringThin: 'Dun', ringDouble: 'Dubbel', ringTicks: 'Streepjes',
    sky2: 'Hemel', constellations: 'Sterrenbeeldlijnen', constellationNames: 'Namen sterrenbeelden', starNames: 'Sternamen', planets: 'Planeten', moon: 'Maan', milkyWay: 'Melkweg',
    grid: 'Coördinatenraster', compass: 'Windrichtingen', starColors: 'Echte sterkleuren', glow: 'Gloed',
    magLimit: 'Zwakste sterren', starScale: 'Stergrootte', lineWidth: 'Lijndikte', projection: 'Projectie', equidistant: 'Klassiek', stereographic: 'Stereografisch',
    export: 'Exporteren', paper: 'Papierformaat', quality: 'Kwaliteit', draft: 'Concept (150 dpi)', print: 'Print (300 dpi)', pdf: 'PDF downloaden', png: 'PNG downloaden', exporting: 'Bezig…',
    defaultTitle: 'Onder deze sterren', summary: (n: number) => `${n.toLocaleString('nl')} sterren boven de horizon`,
    tzNote: 'De tijd geldt in de gekozen tijdzone. Een plaats zoeken stelt die automatisch in.',
    presets: 'Presets', presetPh: 'Naam, bv. Jubileumcadeau', savePreset: 'Opslaan', includeMoment: 'Plaats, moment en tekst meenemen',
    noPresets: 'Nog geen presets. Maak een kaart op, geef ze een naam en sla ze op om later te hergebruiken.', styleOnly: 'Alleen stijl', full: 'Volledige poster',
    apply: 'Preset toepassen', remove: 'Preset verwijderen', replaceHint: 'Opslaan onder een bestaande naam vervangt die preset.', applied: 'Toegepast',
    localOnly: 'Meld je aan om presets op al je toestellen te bewaren — voorlopig staan ze in deze browser.',
  },
}

const PAPERS: Record<string, { label: string; w: number; h: number }> = {
  a4: { label: 'A4 · 21 × 29.7 cm', w: 210, h: 297 },
  a3: { label: 'A3 · 29.7 × 42 cm', w: 297, h: 420 },
  a2: { label: 'A2 · 42 × 59.4 cm', w: 420, h: 594 },
  '50x70': { label: '50 × 70 cm', w: 500, h: 700 },
  letter: { label: 'US Letter · 8.5 × 11 in', w: 215.9, h: 279.4 },
  '8x10': { label: '8 × 10 in', w: 203.2, h: 254 },
  '12x16': { label: '12 × 16 in', w: 304.8, h: 406.4 },
  '18x24': { label: '18 × 24 in', w: 457.2, h: 609.6 },
  sq30: { label: '30 × 30 cm', w: 300, h: 300 },
  sq50: { label: '50 × 50 cm', w: 500, h: 500 },
}

interface Preset { id: string; name: string; thumb?: string; withMoment: boolean; settings: Record<string, unknown> }

/** Settings that describe a specific poster rather than a look; only stored when "include place, moment & text" is on. */
const MOMENT_KEYS = ['place', 'lat', 'lon', 'tz', 'date', 'time', 'title', 'subtitle', 'placeLabel', 'showPlace', 'showDate', 'showCoords']
const LOCAL_PRESETS = 'toolbox.star-map.presets'
function readLocalPresets(): Preset[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_PRESETS) ?? '[]') as Preset[] } catch { return [] }
}

interface GeoResult { id: number; name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string }

const pad = (n: number) => String(n).padStart(2, '0')
function wallNow(tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(Date.now()).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

function dms(v: number, pos: string, neg: string) {
  const a = Math.abs(v)
  const d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60)
  return `${d}°${pad(m)}′${pad(s === 60 ? 59 : s)}″${v >= 0 ? pos : neg}`
}

const label = 'text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500'

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/8 bg-black/20 p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-white">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-cyan-400" />
      {children}
    </label>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-black/30 p-1">
      {options.map(([v, text]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`no-glow flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${value === v ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-400 hover:text-white'}`}>
          {text}
        </button>
      ))}
    </div>
  )
}

function Slider({ name, value, min, max, step, onChange, format }: { name: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="block">
      <span className="flex justify-between"><span className={label}>{name}</span><span className="text-xs text-slate-400">{format ? format(value) : value}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-cyan-400" />
    </label>
  )
}

export function StarMap() {
  const t = useT(STR)
  const { lang } = useLang()
  const zones = useMemo(() => allTimeZones(), [])
  const initial = useMemo(() => ({ ...wallNow('Europe/Brussels') }), [])
  const { config, setConfig, loading, saving, error } = useUtilityConfig('star-map', {
    place: 'Brussels, Belgium', lat: 50.8503, lon: 4.3517, tz: 'Europe/Brussels',
    date: initial.date, time: '22:00',
    title: t.defaultTitle, subtitle: '', placeLabel: '', showPlace: true, showDate: true, showCoords: true,
    layout: 'poster' as MapOptions['layout'], frame: false,
    theme: 'midnight', font: 'playfair', colors: {} as Partial<Palette>,
    ring: 'double' as MapOptions['ring'], projection: 'equidistant' as MapOptions['projection'],
    constellations: true, constellationNames: false, starNames: false, planets: true, moon: true, milkyWay: true,
    grid: false, compass: false, starColors: false, glow: true,
    magLimit: 6, starScale: 1, lineWidth: 1,
    paper: 'a3', dpi: 300,
    presets: [] as Preset[],
  })
  const set = <K extends keyof typeof config>(key: K, value: (typeof config)[K]) => setConfig((c) => ({ ...c, [key]: value }))

  const [data, setData] = useState<SkyData | null>(null)
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    import('./sky-data.json').then((m) => setData(m.default as unknown as SkyData))
    loadPosterFonts().then(() => setFontsReady(true))
  }, [])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const { user } = useAuth()
  const [localPresets, setLocalPresets] = useState<Preset[]>(readLocalPresets)
  const presets = user ? config.presets : localPresets
  const savePresets = (list: Preset[]) => {
    if (user) { setConfig((c) => ({ ...c, presets: list })); return }
    setLocalPresets(list)
    try { localStorage.setItem(LOCAL_PRESETS, JSON.stringify(list)) } catch { /* storage unavailable: keep in memory */ }
  }
  const [presetName, setPresetName] = useState('')
  const [withMoment, setWithMoment] = useState(true)
  const [justApplied, setJustApplied] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)

  const instant = useMemo(() => zonedToUtc(`${config.date}T${config.time}`, config.tz), [config.date, config.time, config.tz])
  const theme = THEMES[config.theme] ?? THEMES.midnight
  const palette: Palette = { ...theme.palette, ...config.colors }
  const paper = PAPERS[config.paper] ?? PAPERS.a3

  const mapOptions = useMemo((): MapOptions | null => {
    if (!Number.isFinite(instant)) return null
    const wall = new Date(`${config.date}T${config.time}:00Z`)
    const locale = lang === 'nl' ? 'nl-BE' : 'en-GB'
    const dateText = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(wall)
    const timeText = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: lang === 'en' ? undefined : false }).format(wall)
    const lines = [
      config.showPlace ? (config.placeLabel || config.place) : '',
      config.showDate ? `${dateText} · ${timeText}` : '',
      config.showCoords ? `${dms(config.lat, 'N', lang === 'nl' ? 'Z' : 'S')}  ${dms(config.lon, lang === 'nl' ? 'O' : 'E', 'W')}` : '',
    ]
    return {
      lat: config.lat, lon: config.lon, time: instant, projection: config.projection, palette, font: config.font, glow: config.glow,
      constellations: config.constellations, constellationNames: config.constellationNames, starNames: config.starNames,
      planets: config.planets, moon: config.moon, milkyWay: config.milkyWay, grid: config.grid, compass: config.compass, starColors: config.starColors,
      magLimit: config.magLimit, starScale: config.starScale, lineWidth: config.lineWidth, ring: config.ring, layout: config.layout, frame: config.frame,
      title: config.title, subtitle: config.subtitle, lines, lang,
    }
    // palette is derived from config.theme + config.colors
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, instant, lang])

  // live preview
  useEffect(() => {
    if (!data || !mapOptions || !previewRef.current) return
    const id = requestAnimationFrame(() => {
      const w = 1100
      renderPoster(previewRef.current!, w, (w * paper.h) / paper.w, data, mapOptions)
    })
    return () => cancelAnimationFrame(id)
  }, [data, mapOptions, paper.w, paper.h, fontsReady])

  if (loading) return <p className="animate-pulse text-slate-400">{t.loading}</p>

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
      url.searchParams.set('name', query.trim())
      url.searchParams.set('count', '6')
      url.searchParams.set('language', lang)
      url.searchParams.set('format', 'json')
      const res = await fetch(url)
      const json = await res.json()
      setResults(json.results ?? [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }
  const pick = (r: GeoResult) => {
    const name = [r.name, r.country].filter(Boolean).join(', ')
    setConfig((c) => ({ ...c, place: name, placeLabel: '', lat: r.latitude, lon: r.longitude, tz: r.timezone && zones.includes(r.timezone) ? r.timezone : c.tz }))
    setResults(null)
    setQuery('')
  }
  const locate = () => navigator.geolocation?.getCurrentPosition((pos) => {
    setConfig((c) => ({ ...c, place: t.myLocation, lat: Number(pos.coords.latitude.toFixed(4)), lon: Number(pos.coords.longitude.toFixed(4)), tz: localTz() }))
  })

  const exportFile = async (kind: 'pdf' | 'png') => {
    if (!data || !mapOptions) return
    setExporting(kind)
    try {
      await new Promise((r) => setTimeout(r, 30)) // let the button state paint
      let pw = (paper.w / 25.4) * config.dpi, ph = (paper.h / 25.4) * config.dpi
      const MAX = 14_000_000 // stay under Safari's canvas area limit
      if (pw * ph > MAX) { const s = Math.sqrt(MAX / (pw * ph)); pw *= s; ph *= s }
      const canvas = document.createElement('canvas')
      renderPoster(canvas, pw, ph, data, mapOptions)
      const base = `star-map-${(config.placeLabel || config.place).split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'sky'}-${config.date}`
      if (kind === 'png') {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
        if (!blob) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${base}.png`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      } else {
        const { jsPDF } = await import('jspdf')
        const doc = new jsPDF({ unit: 'mm', format: [paper.w, paper.h], orientation: paper.w > paper.h ? 'landscape' : 'portrait', compress: true })
        doc.setProperties({ title: mapOptions.title || 'Star map', creator: 'Toolbox Star Map' })
        doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, paper.w, paper.h, undefined, 'FAST')
        doc.save(`${base}.pdf`)
      }
    } finally {
      setExporting(null)
    }
  }

  const savePreset = () => {
    const name = presetName.trim()
    if (!name || !data || !mapOptions) return
    const settings: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(config)) {
      if (k === 'presets' || (!withMoment && MOMENT_KEYS.includes(k))) continue
      settings[k] = v
    }
    let thumb: string | undefined
    try {
      const c = document.createElement('canvas')
      renderPoster(c, 150, (150 * paper.h) / paper.w, data, mapOptions)
      thumb = c.toDataURL('image/jpeg', 0.72)
    } catch { /* thumbnail is optional */ }
    const existing = presets.find((p) => p.name.toLowerCase() === name.toLowerCase())
    const preset: Preset = { id: existing?.id ?? Math.random().toString(36).slice(2, 10), name, thumb, withMoment, settings }
    savePresets(existing ? presets.map((p) => (p.id === existing.id ? preset : p)) : [...presets, preset])
    setPresetName('')
  }
  const applyPreset = (p: Preset) => {
    setConfig((c) => ({ ...c, ...(p.settings as Partial<typeof c>), presets: c.presets }))
    setJustApplied(p.id)
    setTimeout(() => setJustApplied((id) => (id === p.id ? null : id)), 1500)
  }

  const tzOffset = (() => {
    if (!Number.isFinite(instant)) return ''
    const name = new Intl.DateTimeFormat('en-US', { timeZone: config.tz, timeZoneName: 'shortOffset' }).formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value
    return name ?? ''
  })()

  return (
    <div>
      <ToolHeader intro={t.intro} save={{ saving, error }} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <Panel title={t.presets}>
            {presets.length === 0 ? <p className="text-sm text-slate-500">{t.noPresets}</p> : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {presets.map((p) => (
                  <div key={p.id} className="group relative">
                    <button type="button" onClick={() => applyPreset(p)} title={t.apply}
                      className="no-glow block w-full overflow-hidden rounded-xl border border-white/10 bg-black/30 text-left transition-colors hover:border-cyan-300/60">
                      {p.thumb ? <img src={p.thumb} alt="" className="block aspect-[3/4] w-full object-cover" />
                        : <span className="flex aspect-[3/4] w-full items-center justify-center text-slate-600"><Bookmark className="size-6" /></span>}
                      <span className="block truncate px-2 pt-1.5 text-xs font-semibold text-slate-200">{p.name}</span>
                      <span className="block px-2 pb-1.5 text-[10px] text-slate-500">{justApplied === p.id ? <span className="text-lime-300">{t.applied} ✓</span> : p.withMoment ? t.full : t.styleOnly}</span>
                    </button>
                    <button type="button" onClick={() => savePresets(presets.filter((x) => x.id !== p.id))} title={t.remove} aria-label={t.remove}
                      className="no-glow absolute right-1.5 top-1.5 rounded-lg bg-black/60 p-1 text-slate-300 opacity-0 transition-opacity hover:bg-rose-500/30 hover:text-rose-100 focus:opacity-100 group-hover:opacity-100">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); savePreset() }}>
              <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder={t.presetPh} maxLength={40} className="form-input min-w-0 flex-1" />
              <button type="submit" disabled={!presetName.trim() || !data} className="acid-button inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">
                <Bookmark className="size-4" />{t.savePreset}
              </button>
            </form>
            <Toggle checked={withMoment} onChange={setWithMoment}>{t.includeMoment}</Toggle>
            <p className="text-xs text-slate-500">{t.replaceHint}{!user && <> {t.localOnly}</>}</p>
          </Panel>
          <Panel title={t.moment}>
            <div>
              <span className={label}>{t.place}</span>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-white"><MapPin className="size-4 text-cyan-300" />{config.place}
                <span className="text-xs text-slate-500">· {config.lat.toFixed(3)}°, {config.lon.toFixed(3)}°</span></p>
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void search() }}>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.placePh} className="form-input min-w-0 flex-1" />
                <button type="submit" disabled={searching || !query.trim()} className="acid-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40" aria-label={t.search}>
                  {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                </button>
                <button type="button" onClick={locate} title={t.myLocation} aria-label={t.myLocation}
                  className="no-glow rounded-lg border border-white/10 bg-white/5 px-3 text-slate-300 hover:bg-white/10 hover:text-white"><LocateFixed className="size-4" /></button>
              </form>
              {results && (
                <ul className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                  {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">{t.noResults}</li>}
                  {results.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => pick(r)} className="no-glow block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10">
                        {r.name}<span className="text-slate-500">{[r.admin1, r.country].filter(Boolean).length ? ' · ' + [r.admin1, r.country].filter(Boolean).join(', ') : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label><span className={label}>{t.lat}</span>
                <input type="number" step="0.0001" min={-90} max={90} value={config.lat} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && Math.abs(v) <= 90) set('lat', v) }} className="form-input mt-1.5" /></label>
              <label><span className={label}>{t.lon}</span>
                <input type="number" step="0.0001" min={-180} max={180} value={config.lon} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && Math.abs(v) <= 180) set('lon', v) }} className="form-input mt-1.5" /></label>
              <label><span className={label}>{t.date}</span>
                <input type="date" value={config.date} onChange={(e) => e.target.value && set('date', e.target.value)} className="form-input mt-1.5 [color-scheme:dark]" /></label>
              <label><span className={label}>{t.time}</span>
                <div className="mt-1.5 flex gap-2">
                  <input type="time" value={config.time} onChange={(e) => e.target.value && set('time', e.target.value)} className="form-input min-w-0 flex-1 [color-scheme:dark]" />
                  <button type="button" onClick={() => setConfig((c) => ({ ...c, ...wallNow(c.tz) }))} title={t.now}
                    className="no-glow inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-slate-300 hover:bg-white/10 hover:text-white"><Clock className="size-3.5" />{t.now}</button>
                </div></label>
            </div>
            <label className="block"><span className={label}>{t.zone}</span>
              <div className="mt-1.5 flex items-center gap-2">
                <select value={config.tz} onChange={(e) => set('tz', e.target.value)} className="form-input min-w-0 flex-1">
                  {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
                </select>
                <span className="shrink-0 text-xs text-slate-400">{tzOffset}</span>
              </div>
              <span className="mt-1.5 block text-xs text-slate-500">{t.tzNote}</span>
            </label>
          </Panel>

          <Panel title={t.text}>
            <label className="block"><span className={label}>{t.title}</span>
              <input value={config.title} onChange={(e) => set('title', e.target.value)} maxLength={60} className="form-input mt-1.5" /></label>
            <label className="block"><span className={label}>{t.subtitle}</span>
              <input value={config.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="Emma & Noah" maxLength={90} className="form-input mt-1.5" /></label>
            <label className="block"><span className={label}>{t.placeLabel}</span>
              <input value={config.placeLabel} onChange={(e) => set('placeLabel', e.target.value)} placeholder={config.place} maxLength={80} className="form-input mt-1.5" /></label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Toggle checked={config.showPlace} onChange={(v) => set('showPlace', v)}>{t.showPlace}</Toggle>
              <Toggle checked={config.showDate} onChange={(v) => set('showDate', v)}>{t.showDate}</Toggle>
              <Toggle checked={config.showCoords} onChange={(v) => set('showCoords', v)}>{t.showCoords}</Toggle>
            </div>
            <div><span className={label}>{t.layout}</span>
              <div className="mt-1.5 flex items-center gap-4">
                <div className="flex-1"><Segmented value={config.layout} onChange={(v) => set('layout', v)} options={[['poster', t.poster], ['map', t.mapOnly]]} /></div>
                <Toggle checked={config.frame} onChange={(v) => set('frame', v)}>{t.frame}</Toggle>
              </div></div>
          </Panel>

          <Panel title={t.style}>
            <div><span className={label}>{t.theme}</span>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {Object.entries(THEMES).map(([id, th]) => (
                  <button key={id} type="button" onClick={() => setConfig((c) => ({ ...c, theme: id, font: th.font, glow: th.glow, colors: {} }))}
                    className={`no-glow group flex flex-col items-center gap-1.5 rounded-xl p-1.5 text-[10px] font-medium transition-colors ${config.theme === id ? 'bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-300/60' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                    <span className="relative flex aspect-[3/4] w-full items-start justify-center rounded-md pt-1.5" style={{ background: th.palette.bg }}>
                      <span className="block aspect-square w-3/4 rounded-full" style={{ background: th.palette.sky, boxShadow: `inset 0 0 0 1px ${th.palette.ring}55` }}>
                        <span className="absolute left-[38%] top-[22%] size-0.5 rounded-full" style={{ background: th.palette.star }} />
                        <span className="absolute left-[58%] top-[34%] size-1 rounded-full" style={{ background: th.palette.star }} />
                        <span className="absolute left-[46%] top-[44%] size-0.5 rounded-full" style={{ background: th.palette.star }} />
                      </span>
                      <span className="absolute bottom-1.5 h-0.5 w-1/2 rounded" style={{ background: th.palette.text }} />
                    </span>
                    {th.name[lang]}
                  </button>
                ))}
              </div></div>
            <div className="grid grid-cols-2 gap-3">
              <label><span className={label}>{t.font}</span>
                <select value={config.font} onChange={(e) => set('font', e.target.value)} className="form-input mt-1.5">
                  {Object.entries(FONTS).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}
                </select></label>
              <label><span className={label}>{t.ring}</span>
                <select value={config.ring} onChange={(e) => set('ring', e.target.value as MapOptions['ring'])} className="form-input mt-1.5">
                  <option value="none">{t.ringNone}</option><option value="thin">{t.ringThin}</option><option value="double">{t.ringDouble}</option><option value="ticks">{t.ringTicks}</option>
                </select></label>
            </div>
            <details className="group rounded-xl border border-white/8 bg-black/20 px-3 py-2">
              <summary className="cursor-pointer text-sm text-slate-300">{t.colors}</summary>
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
                {([['bg', t.bg], ['sky', t.sky], ['star', t.stars], ['line', t.lines], ['text', t.textColor]] as [keyof Palette, string][]).map(([key, name]) => (
                  <label key={key} className="flex flex-col items-center gap-1 text-[11px] text-slate-400">
                    <input type="color" value={palette[key]} className="h-9 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent"
                      onChange={(e) => {
                        const v = e.target.value
                        const extra: Partial<Palette> = key === 'line' ? { line: v, grid: v, label: v, ring: v } : key === 'star' ? { star: v, milky: v } : { [key]: v }
                        setConfig((c) => ({ ...c, colors: { ...c.colors, ...extra } }))
                      }} />
                    {name}
                  </label>
                ))}
              </div>
              {Object.keys(config.colors).length > 0 && (
                <button type="button" onClick={() => set('colors', {})} className="no-glow mt-3 text-xs text-cyan-300 hover:text-cyan-100">{t.resetColors}</button>
              )}
            </details>
          </Panel>

          <Panel title={t.sky2}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <Toggle checked={config.constellations} onChange={(v) => set('constellations', v)}>{t.constellations}</Toggle>
              <Toggle checked={config.constellationNames} onChange={(v) => set('constellationNames', v)}>{t.constellationNames}</Toggle>
              <Toggle checked={config.starNames} onChange={(v) => set('starNames', v)}>{t.starNames}</Toggle>
              <Toggle checked={config.milkyWay} onChange={(v) => set('milkyWay', v)}>{t.milkyWay}</Toggle>
              <Toggle checked={config.planets} onChange={(v) => set('planets', v)}>{t.planets}</Toggle>
              <Toggle checked={config.moon} onChange={(v) => set('moon', v)}>{t.moon}</Toggle>
              <Toggle checked={config.grid} onChange={(v) => set('grid', v)}>{t.grid}</Toggle>
              <Toggle checked={config.compass} onChange={(v) => set('compass', v)}>{t.compass}</Toggle>
              <Toggle checked={config.starColors} onChange={(v) => set('starColors', v)}>{t.starColors}</Toggle>
              <Toggle checked={config.glow} onChange={(v) => set('glow', v)}>{t.glow}</Toggle>
            </div>
            <Slider name={t.magLimit} value={config.magLimit} min={3} max={6.5} step={0.1} onChange={(v) => set('magLimit', v)} format={(v) => `mag ${v.toFixed(1)}`} />
            <Slider name={t.starScale} value={config.starScale} min={0.5} max={2} step={0.05} onChange={(v) => set('starScale', v)} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider name={t.lineWidth} value={config.lineWidth} min={0.4} max={3} step={0.1} onChange={(v) => set('lineWidth', v)} format={(v) => `${Math.round(v * 100)}%`} />
            <div><span className={label}>{t.projection}</span>
              <div className="mt-1.5"><Segmented value={config.projection} onChange={(v) => set('projection', v)} options={[['equidistant', t.equidistant], ['stereographic', t.stereographic]]} /></div></div>
          </Panel>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-white/8 bg-black/30 p-4 sm:p-6">
            <div className="mx-auto" style={{ maxWidth: paper.w >= paper.h ? '100%' : `${(paper.w / paper.h) * 78}vh` }}>
              <canvas ref={previewRef} className="block h-auto w-full rounded shadow-2xl shadow-black/60" />
            </div>
            {!data && <p className="mt-3 animate-pulse text-center text-sm text-slate-400">{t.loading}</p>}
            {data && mapOptions && <StarCount data={data} opt={mapOptions} format={t.summary} />}
          </div>
          <div className="mt-5"><Panel title={t.export}>
            <div className="grid grid-cols-2 gap-3">
              <label><span className={label}>{t.paper}</span>
                <select value={config.paper} onChange={(e) => set('paper', e.target.value)} className="form-input mt-1.5">
                  {Object.entries(PAPERS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
                </select></label>
              <label><span className={label}>{t.quality}</span>
                <select value={config.dpi} onChange={(e) => set('dpi', Number(e.target.value))} className="form-input mt-1.5">
                  <option value={150}>{t.draft}</option><option value={300}>{t.print}</option>
                </select></label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={!data || !!exporting} onClick={() => void exportFile('pdf')}
                className="acid-button inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40">
                {exporting === 'pdf' ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}{exporting === 'pdf' ? t.exporting : t.pdf}
              </button>
              <button type="button" disabled={!data || !!exporting} onClick={() => void exportFile('png')}
                className="no-glow inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40">
                {exporting === 'png' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{exporting === 'png' ? t.exporting : t.png}
              </button>
            </div>
          </Panel></div>
        </div>
      </div>
    </div>
  )
}

function StarCount({ data, opt, format }: { data: SkyData; opt: MapOptions; format: (n: number) => string }) {
  const n = useMemo(() => {
    const o = observer(opt.time, opt.lat, opt.lon)
    let count = 0
    for (const [ra, dec, mag] of data.stars) if (mag <= opt.magLimit && toHorizontal(o, ra, dec).alt > 0) count++
    return count
  }, [data, opt.time, opt.lat, opt.lon, opt.magLimit])
  return <p className="mt-3 text-center text-xs text-slate-500">{format(n)}</p>
}
