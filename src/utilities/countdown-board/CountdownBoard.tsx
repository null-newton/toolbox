import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Plus, Trash2 } from 'lucide-react'
import { ToolHeader } from '../../components/ToolHeader'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { useLang, useT } from '../../i18n/LanguageContext'
import { CityClock, CountdownCard } from './BoardView'
import { allTimeZones, cityFromZone, encodeEmbed, localTz, newId, useNow, type City, type CountdownEvent, type EmbedOptions } from './time'

const STR = {
  en: {
    loading: 'Loading your board…',
    intro: 'Count down to the moments that matter and see what time it is for the people and places you care about. Put the board on any website with an embed.',
    countdowns: 'Countdowns', clocks: 'World clock', addEvent: 'Add countdown', addCity: 'Add city',
    title: 'Title', titlePh: 'e.g. Summer holiday', when: 'Date & time', zone: 'Time zone', yearly: 'Repeat every year',
    cityPh: 'Search a city or time zone…', label: 'Label (optional)', noEvents: 'No countdowns yet — add your first one.', noCities: 'No cities yet.',
    clock24: '24-hour clock', plan: 'Plan a time', planHint: 'Slide to see what a time in your zone is everywhere else.', reset: 'Now',
    remove: 'Remove', unknownZone: 'Pick a time zone from the list.',
    embed: 'Embed on another site', embedIntro: 'Copy this code into any site that accepts HTML (WordPress, Notion embeds, Squarespace…). The board is stored in the link itself, so after editing here, copy the new code.',
    include: 'Show', theme: 'Theme', dark: 'Dark', light: 'Light', transparent: 'Transparent background', heading: 'Heading (optional)',
    language: 'Language', height: 'Height', code: 'Embed code', link: 'Direct link', copy: 'Copy', copied: 'Copied', preview: 'Preview',
  },
  nl: {
    loading: 'Je bord laden…',
    intro: 'Tel af naar de momenten die ertoe doen en zie hoe laat het is voor de mensen en plaatsen die je belangrijk vindt. Zet het bord op elke website met een embed.',
    countdowns: 'Aftellers', clocks: 'Wereldklok', addEvent: 'Aftelling toevoegen', addCity: 'Stad toevoegen',
    title: 'Titel', titlePh: 'bv. Zomervakantie', when: 'Datum en tijd', zone: 'Tijdzone', yearly: 'Elk jaar herhalen',
    cityPh: 'Zoek een stad of tijdzone…', label: 'Label (optioneel)', noEvents: 'Nog geen aftellers — voeg je eerste toe.', noCities: 'Nog geen steden.',
    clock24: '24-uursklok', plan: 'Tijd plannen', planHint: 'Schuif om te zien hoe laat een tijdstip in jouw zone elders is.', reset: 'Nu',
    remove: 'Verwijderen', unknownZone: 'Kies een tijdzone uit de lijst.',
    embed: 'Insluiten op een andere site', embedIntro: 'Plak deze code in elke site die HTML toelaat (WordPress, Notion-embeds, Squarespace…). Het bord zit in de link zelf, dus kopieer na een wijziging hier de nieuwe code.',
    include: 'Tonen', theme: 'Thema', dark: 'Donker', light: 'Licht', transparent: 'Transparante achtergrond', heading: 'Kop (optioneel)',
    language: 'Taal', height: 'Hoogte', code: 'Insluitcode', link: 'Directe link', copy: 'Kopiëren', copied: 'Gekopieerd', preview: 'Voorbeeld',
  },
}

const defaultCities = (): City[] => {
  const here = localTz()
  return [here, 'America/New_York', 'Asia/Tokyo'].filter((tz, i, a) => a.indexOf(tz) === i).map((tz) => ({ id: newId(), name: cityFromZone(tz), tz }))
}

const label = 'text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500'
const iconBtn = 'no-glow rounded-lg bg-black/40 p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-200'

function Section({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

function CopyField({ value, rows = 1 }: { value: string; rows?: number }) {
  const t = useT(STR)
  const [done, setDone] = useState(false)
  return (
    <div className="flex gap-2">
      <textarea readOnly value={value} rows={rows} onFocus={(e) => e.target.select()} className="form-input min-w-0 flex-1 resize-none break-all font-mono text-xs" />
      <button type="button" onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400) }}
        className="no-glow inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white">
        {done ? <Check className="size-3.5 text-lime-300" /> : <Copy className="size-3.5" />}{done ? t.copied : t.copy}
      </button>
    </div>
  )
}

export function CountdownBoard() {
  const t = useT(STR)
  const { lang } = useLang()
  const now = useNow(1000)
  const zones = useMemo(() => allTimeZones(), [])
  const { config, setConfig, loading, saving, error } = useUtilityConfig('countdown-board', {
    events: [] as CountdownEvent[],
    cities: defaultCities(),
    hour12: false,
  })

  const [draft, setDraft] = useState({ title: '', at: '', tz: localTz(), yearly: false })
  const [cityQuery, setCityQuery] = useState('')
  const [cityLabel, setCityLabel] = useState('')
  const [shiftMin, setShiftMin] = useState(0)
  const previewRef = useRef<HTMLIFrameElement>(null)
  const [measured, setMeasured] = useState<number | null>(null)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== previewRef.current?.contentWindow || e.data?.type !== 'toolbox-board-height') return
      const h = Number(e.data.height)
      if (Number.isFinite(h) && h > 0) setMeasured(Math.min(2000, Math.ceil(h)))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  const [embed, setEmbed] = useState<EmbedOptions & { events: boolean; cities: boolean; height: number | null }>({
    theme: 'dark', transparent: false, lang, title: '', events: true, cities: true, height: null,
  })

  if (loading) return <p className="animate-pulse text-slate-400">{t.loading}</p>

  const sortedEvents = [...config.events].sort((a, b) => a.at.localeCompare(b.at))
  const cityZone = zones.find((z) => z.toLowerCase() === cityQuery.trim().toLowerCase())
    ?? zones.find((z) => cityFromZone(z).toLowerCase() === cityQuery.trim().toLowerCase())

  const addEvent = () => {
    if (!draft.title.trim() || !draft.at) return
    setConfig((c) => ({ ...c, events: [...c.events, { id: newId(), title: draft.title.trim(), at: draft.at, tz: draft.tz, yearly: draft.yearly || undefined }] }))
    setDraft((d) => ({ ...d, title: '', at: '' }))
  }
  const addCity = () => {
    if (!cityZone) return
    setConfig((c) => ({ ...c, cities: [...c.cities, { id: newId(), name: cityLabel.trim() || cityFromZone(cityZone), tz: cityZone }] }))
    setCityQuery(''); setCityLabel('')
  }
  const removeBtn = (onClick: () => void) => (
    <button type="button" onClick={onClick} aria-label={t.remove} title={t.remove} className={iconBtn}><Trash2 className="size-3.5" /></button>
  )

  // Planned instant: now (rounded to the minute) shifted by the slider.
  const planned = shiftMin ? Math.floor(now / 60000) * 60000 + shiftMin * 60000 : now
  const plannedLocal = new Intl.DateTimeFormat(lang === 'nl' ? 'nl-BE' : 'en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: config.hour12 }).format(planned)

  // Embed
  const embedBoard = { events: embed.events ? config.events : [], cities: embed.cities ? config.cities : [], hour12: config.hour12 }
  const embedUrl = `${window.location.origin}/#/embed/board?c=${encodeEmbed(embedBoard, embed)}`
  const autoHeight = (embed.title ? 48 : 0) + 32
    + (embedBoard.events.length ? Math.ceil(embedBoard.events.length / 2) * 170 : 0)
    + (embedBoard.cities.length ? Math.ceil(embedBoard.cities.length / 3) * 160 : 0)
  const height = embed.height ?? measured ?? Math.max(160, autoHeight)
  const iframeCode = `<iframe src="${embedUrl}" title="${(embed.title || t.countdowns).replace(/"/g, '&quot;')}" width="100%" height="${height}" style="border:0;max-width:100%" loading="lazy"${embed.transparent ? ' allowtransparency="true"' : ''}></iframe>`

  return (
    <div>
      <ToolHeader intro={t.intro} save={{ saving, error }} actions={
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={!config.hour12} onChange={(e) => setConfig({ hour12: !e.target.checked })} className="size-4 accent-lime-300" />
          {t.clock24}
        </label>
      } />

      {/* Countdowns */}
      <Section title={t.countdowns}>
        <form onSubmit={(e) => { e.preventDefault(); addEvent() }} className="glass grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.3fr_1.5fr_auto_auto] lg:items-end">
          <label className="block"><span className={label}>{t.title}</span>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t.titlePh} maxLength={80} className="form-input mt-1.5" /></label>
          <label className="block"><span className={label}>{t.when}</span>
            <input type="datetime-local" value={draft.at} onChange={(e) => setDraft({ ...draft, at: e.target.value })} className="form-input mt-1.5 [color-scheme:dark]" /></label>
          <label className="block"><span className={label}>{t.zone}</span>
            <select value={draft.tz} onChange={(e) => setDraft({ ...draft, tz: e.target.value })} className="form-input mt-1.5">
              {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
            </select></label>
          <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm text-slate-300">
            <input type="checkbox" checked={draft.yearly} onChange={(e) => setDraft({ ...draft, yearly: e.target.checked })} className="size-4 accent-lime-300" />{t.yearly}</label>
          <button type="submit" disabled={!draft.title.trim() || !draft.at} className="acid-button inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40">
            <Plus className="size-4" />{t.addEvent}</button>
        </form>
        {sortedEvents.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sortedEvents.map((e) => (
              <CountdownCard key={e.id} event={e} now={now} lang={lang} hour12={config.hour12} skin="dark"
                actions={removeBtn(() => setConfig((c) => ({ ...c, events: c.events.filter((x) => x.id !== e.id) })))} />
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-slate-500">{t.noEvents}</p>}
      </Section>

      {/* World clock */}
      <Section title={t.clocks}>
        <form onSubmit={(e) => { e.preventDefault(); addCity() }} className="glass grid gap-3 rounded-2xl p-4 sm:grid-cols-[2fr_1.3fr_auto] sm:items-end">
          <label className="block"><span className={label}>{t.zone}</span>
            <input list="countdown-board-zones" value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} placeholder={t.cityPh} className="form-input mt-1.5" />
            <datalist id="countdown-board-zones">{zones.map((z) => <option key={z} value={z}>{cityFromZone(z)}</option>)}</datalist>
          </label>
          <label className="block"><span className={label}>{t.label}</span>
            <input value={cityLabel} onChange={(e) => setCityLabel(e.target.value)} placeholder={cityZone ? cityFromZone(cityZone) : 'Mom, Office…'} maxLength={60} className="form-input mt-1.5" /></label>
          <button type="submit" disabled={!cityZone} className="acid-button inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40">
            <Plus className="size-4" />{t.addCity}</button>
          {cityQuery.trim() && !cityZone && <p className="text-xs text-amber-200 sm:col-span-3">{t.unknownZone}</p>}
        </form>

        <div className="glass mt-4 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={label}>{t.plan}</p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-lime-200">{plannedLocal}{shiftMin ? ` (${shiftMin > 0 ? '+' : '−'}${Math.abs(shiftMin / 60)} h)` : ''}</span>
              {shiftMin !== 0 && <button type="button" onClick={() => setShiftMin(0)} className="text-xs text-slate-400 hover:text-white">{t.reset}</button>}
            </div>
          </div>
          <input type="range" min={-24 * 60} max={24 * 60} step={15} value={shiftMin} onChange={(e) => setShiftMin(Number(e.target.value))}
            aria-label={t.plan} className="mt-3 w-full accent-lime-300" />
          <p className="mt-1 text-xs text-slate-500">{t.planHint}</p>
        </div>

        {config.cities.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {config.cities.map((c) => (
              <CityClock key={c.id} city={c} at={planned} lang={lang} hour12={config.hour12} skin="dark"
                actions={removeBtn(() => setConfig((cfg) => ({ ...cfg, cities: cfg.cities.filter((x) => x.id !== c.id) })))} />
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-slate-500">{t.noCities}</p>}
      </Section>

      {/* Embed */}
      <Section title={t.embed}>
        <p className="-mt-2 mb-4 max-w-3xl text-sm text-slate-400">{t.embedIntro}</p>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="glass space-y-4 rounded-2xl p-4">
            <div><p className={label}>{t.include}</p>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-300">
                {(['events', 'cities'] as const).map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={embed[k]} onChange={(e) => setEmbed({ ...embed, [k]: e.target.checked })} className="size-4 accent-lime-300" />
                    {k === 'events' ? t.countdowns : t.clocks}
                  </label>
                ))}
              </div></div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className={label}>{t.theme}</span>
                <select value={embed.theme} onChange={(e) => setEmbed({ ...embed, theme: e.target.value as EmbedOptions['theme'] })} className="form-input mt-1.5">
                  <option value="dark">{t.dark}</option><option value="light">{t.light}</option>
                </select></label>
              <label className="block"><span className={label}>{t.language}</span>
                <select value={embed.lang} onChange={(e) => setEmbed({ ...embed, lang: e.target.value as EmbedOptions['lang'] })} className="form-input mt-1.5">
                  <option value="en">English</option><option value="nl">Nederlands</option>
                </select></label>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={embed.transparent} onChange={(e) => setEmbed({ ...embed, transparent: e.target.checked })} className="size-4 accent-lime-300" />{t.transparent}</label>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <label className="block"><span className={label}>{t.heading}</span>
                <input value={embed.title} onChange={(e) => setEmbed({ ...embed, title: e.target.value })} maxLength={80} className="form-input mt-1.5" /></label>
              <label className="block"><span className={label}>{t.height}</span>
                <input type="number" min={120} max={2000} step={10} value={height} onChange={(e) => setEmbed({ ...embed, height: e.target.value ? Number(e.target.value) : null })} className="form-input mt-1.5" /></label>
            </div>
            <div><p className={`${label} mb-1.5`}>{t.code}</p><CopyField value={iframeCode} rows={5} /></div>
            <div><p className={`${label} mb-1.5`}>{t.link}</p><CopyField value={embedUrl} rows={2} /></div>
          </div>
          <div className="min-w-0">
            <p className={`${label} mb-2`}>{t.preview}</p>
            <div className={`overflow-hidden rounded-2xl border border-white/10 ${embed.transparent ? 'bg-[repeating-linear-gradient(45deg,#1b2a2e_0_10px,#0d181c_10px_20px)]' : ''}`}>
              <iframe ref={previewRef} src={embedUrl} title={t.preview} width="100%" height={height} className="block border-0" />
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
