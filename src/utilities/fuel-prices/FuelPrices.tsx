import { backendFetch as fetch } from '../../lib/backend-fetch'
import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, ExternalLink, RefreshCw } from 'lucide-react'
import { useLang, useT } from '../../i18n/LanguageContext'
import { functionsBase } from '../../lib/supabase'
import { ToolHeader } from '../../components/ToolHeader'

type Group = 'e95' | 'e98' | 'diesel'

interface FuelProduct {
  id: string
  label: string
  group: Group
  priceIncl: number
  priceExcl: number | null
  previousPrice: number | null
  previousDate: string | null
  change: number | null
}

interface FuelSnapshot {
  source: string
  sourceUrl: string
  validFrom: string
  fetchedAt: string
  stale: boolean
  products: FuelProduct[]
  history: ({ date: string } & Record<string, number | string>)[]
}

// Main pump grade per group; the other blend is shown as a variant.
const MAIN: Record<Group, string> = { e95: 'e95', e98: 'e98', diesel: 'diesel' }
const GROUPS: { group: Group; title: string; color: string; text: string }[] = [
  { group: 'e95', title: 'Euro 95', color: '#34d399', text: 'text-emerald-300' },
  { group: 'e98', title: 'Super 98', color: '#38bdf8', text: 'text-sky-300' },
  { group: 'diesel', title: 'Diesel', color: '#fbbf24', text: 'text-amber-300' },
]

const STR = {
  en: {
    subtitle: 'Official Belgian maximum pump prices set by FOD Economie. Stations may charge less, never more.',
    validFrom: 'Valid from',
    perLitre: 'per litre incl. VAT',
    exclVat: 'excl. VAT',
    vsPrevious: 'vs.',
    unchanged: 'Unchanged',
    variant: 'Also',
    trend: 'Last 30 tariffs',
    fetched: 'Fetched',
    stale: 'The latest refresh failed; showing the last known tariff.',
    failed: 'Could not load fuel prices.',
    retry: 'Try again',
    source: 'Source: FOD Economie, official tariff of petroleum products (be.STAT). Refreshed daily.',
  },
  nl: {
    subtitle: 'Officiële Belgische maximumprijzen aan de pomp, vastgelegd door FOD Economie. Een station mag goedkoper zijn, nooit duurder.',
    validFrom: 'Geldig vanaf',
    perLitre: 'per liter incl. btw',
    exclVat: 'excl. btw',
    vsPrevious: 't.o.v.',
    unchanged: 'Ongewijzigd',
    variant: 'Ook',
    trend: 'Laatste 30 tarieven',
    fetched: 'Opgehaald',
    stale: 'De laatste update is mislukt; dit is het laatst gekende tarief.',
    failed: 'Brandstofprijzen konden niet geladen worden.',
    retry: 'Opnieuw proberen',
    source: 'Bron: FOD Economie, officieel tarief van de aardolieproducten (be.STAT). Dagelijks bijgewerkt.',
  },
}

function parseDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function TrendChart({ history, locale }: { history: FuelSnapshot['history']; locale: string }) {
  const width = 640
  const height = 200
  const pad = { l: 44, r: 12, t: 12, b: 26 }
  const series = GROUPS.map((g) => ({
    ...g,
    points: history
      .map((row, index) => ({ index, value: row[MAIN[g.group]] }))
      .filter((p): p is { index: number; value: number } => typeof p.value === 'number'),
  }))
  const values = series.flatMap((s) => s.points.map((p) => p.value))
  if (history.length < 2 || !values.length) return null
  const min = Math.floor(Math.min(...values) * 20) / 20
  const max = Math.ceil(Math.max(...values) * 20) / 20 || min + 0.05
  const x = (i: number) => pad.l + (i / (history.length - 1)) * (width - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (height - pad.t - pad.b)
  const ticks = [min, (min + max) / 2, max]
  const fmtDay = (iso: string) => parseDay(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Fuel price trend" className="h-auto w-full">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} stroke="rgb(255 255 255 / .08)" />
          <text x={pad.l - 6} y={y(tick) + 4} textAnchor="end" fill="#64748b" fontSize="11">€{tick.toFixed(2)}</text>
        </g>
      ))}
      {series.map((s) => (
        <polyline
          key={s.group}
          points={s.points.map((p) => `${x(p.index)},${y(p.value)}`).join(' ')}
          fill="none"
          stroke={s.color}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      ))}
      <text x={pad.l} y={height - 6} fill="#64748b" fontSize="11">{fmtDay(history[0].date)}</text>
      <text x={width - pad.r} y={height - 6} textAnchor="end" fill="#64748b" fontSize="11">{fmtDay(history.at(-1)!.date)}</text>
    </svg>
  )
}

export function FuelPrices() {
  const t = useT(STR)
  const { locale } = useLang()
  const [data, setData] = useState<FuelSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchSnapshot = async () => {
    try {
      const response = await fetch(`${functionsBase}/fuel-prices`)
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || t.failed)
      setData(body as FuelSnapshot)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed)
    } finally {
      setLoading(false)
    }
  }

  const load = () => {
    setLoading(true)
    setError('')
    void fetchSnapshot()
  }

  useEffect(() => {
    // Initial load: the fetch only sets state after it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSnapshot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const euro = useMemo(() => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 3, maximumFractionDigits: 3 }), [locale])
  const fmtDate = (iso: string) => parseDay(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const fmtShort = (iso: string) => parseDay(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' })

  return (
    <div className="space-y-6">
      <ToolHeader intro={t.subtitle} actions={
        <button onClick={load} disabled={loading} className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-50" aria-label={t.retry}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      } />

      {error && !data && (
        <div className="glass rounded-2xl p-5 text-sm text-rose-200">
          <p>{error}</p>
          <button onClick={load} className="mt-3 rounded-lg bg-rose-400/15 px-3 py-1.5 font-semibold hover:bg-rose-400/25">{t.retry}</button>
        </div>
      )}

      {loading && !data && (
        <div className="grid gap-4 sm:grid-cols-3">
          {GROUPS.map((g) => <div key={g.group} className="glass h-40 animate-pulse rounded-2xl" />)}
        </div>
      )}

      {data && (
        <>
          <p className="text-sm text-slate-400">
            {t.validFrom} <span className="font-semibold text-white">{fmtDate(data.validFrom)}</span>
          </p>
          {data.stale && <p className="rounded-xl bg-amber-400/10 px-4 py-2 text-sm text-amber-200">{t.stale}</p>}

          <div className="grid gap-4 sm:grid-cols-3">
            {GROUPS.map((g) => {
              const main = data.products.find((p) => p.id === MAIN[g.group])
              const variants = data.products.filter((p) => p.group === g.group && p.id !== MAIN[g.group])
              if (!main) return null
              const change = main.change ?? 0
              const ChangeIcon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : ArrowRight
              const changeTone = change > 0 ? 'text-rose-300' : change < 0 ? 'text-emerald-300' : 'text-slate-400'
              return (
                <section key={g.group} className="glass rounded-2xl p-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className={`text-sm font-bold uppercase tracking-wide ${g.text}`}>{g.title}</h2>
                    <span className="text-xs text-slate-500">{main.label.replace(/^.*\((.*)\)$/, '$1')}</span>
                  </div>
                  <div className="mt-3 text-4xl font-extrabold tabular-nums text-white">{euro.format(main.priceIncl)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t.perLitre}
                    {main.priceExcl !== null && <> · {euro.format(main.priceExcl)} {t.exclVat}</>}
                  </div>
                  {main.change !== null && main.previousDate && (
                    <div className={`mt-3 flex items-center gap-1 text-sm font-semibold ${changeTone}`}>
                      <ChangeIcon className="size-4" />
                      {change === 0
                        ? t.unchanged
                        : `${change > 0 ? '+' : '−'}${euro.format(Math.abs(change))}`}
                      <span className="font-normal text-slate-500">{t.vsPrevious} {fmtShort(main.previousDate)}</span>
                    </div>
                  )}
                  {variants.map((v) => (
                    <div key={v.id} className="mt-3 border-t border-white/8 pt-3 text-xs text-slate-400">
                      {t.variant} {v.label}: <span className="font-semibold tabular-nums text-slate-200">{euro.format(v.priceIncl)}</span>
                    </div>
                  ))}
                </section>
              )
            })}
          </div>

          {data.history.length > 1 && (
            <section className="glass rounded-2xl p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-white">{t.trend}</h2>
                <div className="flex gap-4 text-xs text-slate-400">
                  {GROUPS.map((g) => (
                    <span key={g.group} className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: g.color }} />{g.title}
                    </span>
                  ))}
                </div>
              </div>
              <TrendChart history={data.history} locale={locale} />
            </section>
          )}

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{t.source}</span>
            <span>{t.fetched}: {new Date(data.fetchedAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-400 hover:text-white">
              economie.fgov.be <ExternalLink className="size-3" />
            </a>
          </p>
        </>
      )}
    </div>
  )
}
