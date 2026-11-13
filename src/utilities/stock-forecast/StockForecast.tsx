import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Activity, ChartSpline, Cpu, Crosshair, KeyRound, Loader2, RefreshCw, Search, Sparkles, Star, Zap } from 'lucide-react'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { useAuth } from '../../auth/auth-context'
import { useLang, useT } from '../../i18n/LanguageContext'
import { backendFetch } from '../../lib/backend-fetch'
import { functionsBase } from '../../lib/supabase'
import { analyse, bollinger, businessDays, ema, linearForecast, monteCarlo, sma, type Series, type Signal } from './analysis'
import { ToolHeader } from '../../components/ToolHeader'

const STR = {
  en: {
    title: 'Stock Forecast', src: { yahoo: 'Daily closing prices via Yahoo Finance (unofficial API). Not financial advice.', fmp: 'Daily closing prices via Financial Modeling Prep. Not financial advice.' }, dataSource: 'Data source', srcOpt: { yahoo: 'Yahoo Finance (no key)', fmp: 'FMP (free key, US)' },
    asset: 'Stock or ETF', searchPh: { yahoo: 'Search ticker or name (e.g. VWCE, Apple)', fmp: 'Search ticker (e.g. SPY, QQQ)' }, noResults: 'No matches', fmpKey: 'FMP API key', fmpKeyPh: 'Paste your FMP key', fmpHelp: 'Get a free key at financialmodelingprep.com.', needKey: 'Enter your free Financial Modeling Prep key to load real prices.', loading: 'Loading prices…', tooShort: 'Not enough price history for this symbol.', premium: 'This symbol needs a paid FMP plan. The free plan mostly covers US-listed stocks and ETFs.', indicators: 'Indicators', boll: 'Bollinger Bands', engine: 'Forecast engine', linear: 'Linear regression (trend)', mc: 'Monte Carlo (risk)',
    horizon: 'Horizon', days: 'days', run: 'Run projection', clear: 'Clear', regen: 'Refresh', price: 'Last close', change: 'Daily change',
    live: 'Live analysis', strength: 'Signal', vol: 'Volatility (20d)', insights: 'Algorithmic insights', trend: 'Trend', momentum: 'Momentum (MACD)', action: 'Actionable signal',
    above: 'Price is above the 50-day SMA: bullish trend.', below: 'Price is below the 50-day SMA: bearish trend.',
    momText: (pos: boolean, macdBull: boolean, rsi: string) => `5-day momentum is ${pos ? 'positive' : 'negative'}, MACD is ${macdBull ? 'above' : 'below'} its signal line, RSI is ${rsi}.`,
    overbought: 'overbought', oversold: 'oversold', neutral: 'neutral',
    actions: { 'STRONG BUY': 'Technicals suggest a strong entry point. Momentum is positive and the asset may be oversold.', BUY: 'Positive trend identified. Consider accumulating positions.', HOLD: 'Market conditions are neutral. Wait for a clearer setup.', SELL: 'Bearish pressure detected. Be cautious with long positions.', 'STRONG SELL': 'Asset is overextended or breaking down. Consider exiting.' } as Record<Signal, string>,
    ai: 'Gemini AI analyst', aiHelp: 'Generate a short report from the current technicals with your own Gemini API key.', aiKey: 'Gemini API key', aiKeyNote: 'Saved to your account; sent only to Google.', aiKeyGuest: 'Kept in this tab only. Log in to save it.',
    favs: 'Favourites', fav: 'Add to favourites', unfav: 'Remove from favourites', generate: 'Generate report', analysing: 'Analysing…', aiFail: 'Analysis failed', forecast: 'Forecast', path: 'Sim path',
  },
  nl: {
    title: 'Aandelenprognose', src: { yahoo: 'Dagelijkse slotkoersen via Yahoo Finance (onofficiële API). Geen financieel advies.', fmp: 'Dagelijkse slotkoersen via Financial Modeling Prep. Geen financieel advies.' }, dataSource: 'Databron', srcOpt: { yahoo: 'Yahoo Finance (geen sleutel)', fmp: 'FMP (gratis sleutel, VS)' },
    asset: 'Aandeel of ETF', searchPh: { yahoo: 'Zoek ticker of naam (bv. VWCE, Apple)', fmp: 'Zoek ticker (bv. SPY, QQQ)' }, noResults: 'Geen resultaten', fmpKey: 'FMP API-sleutel', fmpKeyPh: 'Plak je FMP-sleutel', fmpHelp: 'Haal een gratis sleutel op via financialmodelingprep.com.', needKey: 'Vul je gratis Financial Modeling Prep-sleutel in om echte koersen te laden.', loading: 'Koersen laden…', tooShort: 'Te weinig koershistoriek voor dit symbool.', premium: 'Dit symbool vereist een betalend FMP-abonnement. Het gratis plan dekt vooral Amerikaanse aandelen en ETF’s.', indicators: 'Indicatoren', boll: 'Bollinger-banden', engine: 'Prognosemodel', linear: 'Lineaire regressie (trend)', mc: 'Monte Carlo (risico)',
    horizon: 'Horizon', days: 'dagen', run: 'Projectie berekenen', clear: 'Wissen', regen: 'Vernieuwen', price: 'Laatste slot', change: 'Dagverschil',
    live: 'Live analyse', strength: 'Signaal', vol: 'Volatiliteit (20d)', insights: 'Algoritmische inzichten', trend: 'Trend', momentum: 'Momentum (MACD)', action: 'Signaal',
    above: 'Koers staat boven het 50-daags gemiddelde: stijgende trend.', below: 'Koers staat onder het 50-daags gemiddelde: dalende trend.',
    momText: (pos: boolean, macdBull: boolean, rsi: string) => `Momentum over 5 dagen is ${pos ? 'positief' : 'negatief'}, MACD staat ${macdBull ? 'boven' : 'onder'} de signaallijn, RSI is ${rsi}.`,
    overbought: 'overkocht', oversold: 'oververkocht', neutral: 'neutraal',
    actions: { 'STRONG BUY': 'De technische analyse wijst op een sterk instapmoment. Momentum is positief en het activum is mogelijk oververkocht.', BUY: 'Positieve trend. Overweeg posities op te bouwen.', HOLD: 'Neutrale marktomstandigheden. Wacht op een duidelijker signaal.', SELL: 'Verkoopdruk gedetecteerd. Wees voorzichtig met long-posities.', 'STRONG SELL': 'Het activum is overspannen of breekt neer. Overweeg uit te stappen.' } as Record<Signal, string>,
    ai: 'Gemini AI-analist', aiHelp: 'Maak een kort rapport op basis van de huidige technische analyse met je eigen Gemini API-sleutel.', aiKey: 'Gemini API-sleutel', aiKeyNote: 'Bewaard in je account; enkel naar Google verstuurd.', aiKeyGuest: 'Enkel in dit tabblad bewaard. Meld je aan om hem te bewaren.',
    favs: 'Favorieten', fav: 'Toevoegen aan favorieten', unfav: 'Verwijderen uit favorieten', generate: 'Rapport maken', analysing: 'Analyseren…', aiFail: 'Analyse mislukt', forecast: 'Prognose', path: 'Simulatie',
  },
}

type Source = 'yahoo' | 'fmp'
interface Config extends Record<string, unknown> { source: Source; ticker: string; name: string; currency: string; fmpKey: string; sma: boolean; ema: boolean; boll: boolean; method: 'linear' | 'montecarlo'; horizon: number; geminiKey: string; favorites: Fav[] }
interface Fav { source: Source; ticker: string; name: string; currency: string }
const DEFAULTS: Config = { source: 'yahoo', ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', currency: 'USD', fmpKey: '', sma: false, ema: false, boll: false, method: 'linear', horizon: 30, geminiKey: '', favorites: [] }
interface Hit { id: string; name: string; exchange: string | null; currency: string | null }
const PICKS: Record<Source, [string, string][]> = {
  yahoo: [['SPY', 'SPDR S&P 500 ETF Trust'], ['VWCE.DE', 'Vanguard FTSE All-World UCITS ETF'], ['IWDA.AS', 'iShares Core MSCI World UCITS ETF'], ['QQQ', 'Invesco QQQ Trust'], ['ASML.AS', 'ASML Holding'], ['^GSPC', 'S&P 500'], ['BTC-USD', 'Bitcoin USD']],
  fmp: [['SPY', 'SPDR S&P 500 ETF Trust'], ['QQQ', 'Invesco QQQ Trust'], ['VOO', 'Vanguard S&P 500 ETF'], ['VT', 'Vanguard Total World Stock ETF'], ['AAPL', 'Apple Inc.'], ['NVDA', 'NVIDIA Corporation'], ['BTCUSD', 'Bitcoin USD']],
}
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Calls the Yahoo (keyless) or FMP (user's own key) proxy for search/history.
async function api<T>(source: Source, key: string, params: Record<string, string>): Promise<T> {
  const res = await backendFetch(`${functionsBase}/${source}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, ...(source === 'fmp' ? { 'x-fmp-key': key } : {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body.data as T
}
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
const SIGNAL_STYLE: Record<Signal, [string, number]> = { 'STRONG BUY': ['bg-emerald-400 text-slate-950', 90], BUY: ['bg-emerald-300/80 text-slate-950', 70], HOLD: ['bg-slate-600 text-white', 50], SELL: ['bg-rose-300/80 text-slate-950', 30], 'STRONG SELL': ['bg-rose-400 text-slate-950', 10] }
const input = 'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-indigo-300/60'
const label = 'mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500'

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`glass rounded-2xl p-5 ${className}`}>{children}</section>
}

export function StockForecast() {
  const t = useT(STR)
  const { locale } = useLang()
  const { user } = useAuth()
  const { config: c, setConfig } = useUtilityConfig<Config>('stock-forecast', DEFAULTS)
  const key = c.fmpKey.trim(), ready = c.source === 'yahoo' || !!key
  const [hist, setHist] = useState<{ req: string; prices: number[]; dates: string[]; currency: string | null; error: string } | null>(null)
  const [nonce, setNonce] = useState(0), req = `${c.source}|${key}|${c.ticker}|${nonce}`
  const [q, setQ] = useState(''), [hits, setHits] = useState<Hit[] | null>(null)
  const [projection, setProjection] = useState<{ method: Config['method']; paths: number[][]; dates: string[] } | null>(null)
  const [ai, setAi] = useState<{ busy: boolean; text: string; error: boolean }>({ busy: false, text: '', error: false })
  useEffect(() => {
    if (!ready) return
    let off = false
    api<{ currency: string | null; series: { date: string; value: number }[] }>(c.source, key, { action: 'history', id: c.ticker, start: daysAgo(400) })
      .then(d => { const s = d.series.slice(-250); if (s.length < 60) throw new Error(t.tooShort); if (!off) setHist({ req, prices: s.map(p => p.value), dates: s.map(p => p.date), currency: d.currency, error: '' }) })
      .catch(e => { if (!off) setHist({ req, prices: [], dates: [], currency: null, error: (m => /402|restricted|premium|subscription/i.test(m) ? t.premium : m)(e instanceof Error ? e.message : String(e)) }) })
    return () => { off = true }
  }, [ready, c.source, key, c.ticker, req, t.tooShort, t.premium])
  useEffect(() => {
    if (!ready || !q.trim()) return
    const id = setTimeout(() => api<Hit[]>(c.source, key, { action: 'search', q: q.trim() }).then(setHits).catch(() => setHits([])), 350)
    return () => clearTimeout(id)
  }, [ready, c.source, key, q])
  const pick = useCallback((ticker: string, name: string, currency?: string | null) => { setProjection(null); setAi({ busy: false, text: '', error: false }); setQ(''); setHits(null); setConfig({ ticker, name, currency: currency || 'USD' }) }, [setConfig])
  const load = { busy: ready && hist?.req !== req, error: hist?.req === req ? hist.error : '' }, shown = q.trim() ? hits : null
  const prices = useMemo(() => hist?.req === req ? hist.prices : [], [hist, req])
  const dates = hist?.req === req ? hist.dates : []
  const a = useMemo(() => prices.length ? analyse(prices) : null, [prices])
  const asset = { id: c.ticker, name: c.name || c.ticker }
  const money = (n: number) => { try { return new Intl.NumberFormat(locale, { style: 'currency', currency: (hist?.req === req && hist.currency) || c.currency || 'USD', maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n) } catch { return n.toFixed(2) } }
  const rsiWord = !a || a.rsi === null ? t.neutral : a.rsi > 70 ? t.overbought : a.rsi < 30 ? t.oversold : t.neutral
  const [sigClass, meter] = SIGNAL_STYLE[a?.signal ?? 'HOLD']
  const isFav = c.favorites.some(f => f.source === c.source && f.ticker === c.ticker)
  const toggleFav = () => setConfig(p => ({ ...p, favorites: isFav ? p.favorites.filter(f => !(f.source === p.source && f.ticker === p.ticker)) : [...p.favorites, { source: p.source, ticker: p.ticker, name: p.name, currency: p.currency }] }))
  const openFav = (f: Fav) => { if (f.source !== c.source) setConfig({ source: f.source }); pick(f.ticker, f.name, f.currency) }
  const reset = () => { setProjection(null); setAi({ busy: false, text: '', error: false }) }

  function run() {
    if (!prices.length) return
    const future = businessDays(c.horizon, dates.at(-1)!)
    setProjection({ method: c.method, dates: future, paths: c.method === 'linear' ? [linearForecast(prices, c.horizon)] : monteCarlo(prices, c.horizon) })
  }

  const lines = useMemo(() => {
    const pad = (s: Series) => [...s, ...Array(projection?.dates.length ?? 0).fill(null)]
    const out: Line[] = [{ label: asset.id, data: pad(prices), color: '#c8ff3d', width: 2, fill: true }]
    if (c.sma) out.push({ label: 'SMA (20)', data: pad(sma(prices, 20)), color: '#f59e0b', width: 1.5 })
    if (c.ema) out.push({ label: 'EMA (50)', data: pad(ema(prices, 50)), color: '#a78bfa', width: 1.5 })
    if (c.boll) { const b = bollinger(prices); out.push({ label: 'BB +2σ', data: pad(b.upper), color: 'rgba(234,179,8,.6)', width: 1, dash: '5 5' }, { label: 'BB −2σ', data: pad(b.lower), color: 'rgba(234,179,8,.6)', width: 1, dash: '5 5' }) }
    if (!prices.length) return []
    projection?.paths.forEach((p, i) => out.push({ label: projection.method === 'linear' ? t.forecast : `${t.path} ${i + 1}`, data: [...Array(prices.length - 1).fill(null), prices.at(-1)!, ...p], color: projection.method === 'linear' ? '#34d399' : i === 1 ? '#4ee6e0' : '#7e918f', width: projection.method === 'linear' ? 2 : 1.25, dash: projection.method === 'linear' ? '6 5' : '2 3' }))
    return out
  }, [prices, c.sma, c.ema, c.boll, projection, asset.id, t])

  async function report() {
    if (!a) return
    setAi({ busy: true, text: '', error: false })
    const prompt = `Role: senior quantitative analyst. Analyse this technical data (daily closes) for ${asset.id} (${asset.name}).\n- Price: ${money(a.last)} (${a.change.toFixed(2)}% today)\n- RSI (14): ${a.rsi?.toFixed(1) ?? 'n/a'}\n- 20-day volatility: ${a.vol.toFixed(2)}%\n- Price ${a.aboveTrend ? 'above' : 'below'} the 50-day SMA, MACD ${a.macdBull ? 'above' : 'below'} signal\n- Algo signal: ${a.signal}\nWrite a 2-sentence executive summary, then one "Bull case" line and one "Bear case" line. Plain text, no markdown.${locale.startsWith('nl') ? ' Answer in Dutch.' : ''}`
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.geminiKey.trim() }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
      setAi({ busy: false, text: (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim(), error: false })
    } catch (e) { setAi({ busy: false, text: `${t.aiFail}: ${e instanceof Error ? e.message : e}`, error: true }) }
  }

  return (
    <div className="space-y-5">
      <ToolHeader title={t.title} intro={t.src[c.source]} actions={<button disabled={!ready || load.busy} onClick={() => { reset(); setNonce(n => n + 1) }} className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 hover:text-white disabled:opacity-40"><RefreshCw className={`size-4 ${load.busy ? 'animate-spin' : ''}`} />{t.regen}</button>} />
      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <aside className="space-y-5">
          <Card className="space-y-5">
            <div><span className={label}>{t.dataSource}</span><select aria-label={t.dataSource} className={input} value={c.source} onChange={e => { reset(); setQ(''); setHits(null); setConfig({ source: e.target.value as Source }) }}>{(['yahoo', 'fmp'] as const).map(v => <option key={v} value={v}>{t.srcOpt[v]}</option>)}</select></div>
            {c.source === 'fmp' && <div><span className={label}>{t.fmpKey}</span>
              <input type="password" autoComplete="off" aria-label={t.fmpKey} placeholder={t.fmpKeyPh} className={input} value={c.fmpKey} onChange={e => setConfig({ fmpKey: e.target.value })} />
              <p className="mt-1.5 text-[11px] text-slate-500">{t.fmpHelp}</p></div>}
            <div className="relative"><span className={label}>{t.asset}</span>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input disabled={!ready} aria-label={t.asset} placeholder={t.searchPh[c.source]} className={`${input} pl-9 disabled:opacity-40`} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && shown?.[0]) pick(shown[0].id, shown[0].name, shown[0].currency); if (e.key === 'Escape') setQ('') }} /></div>
              {shown && <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-white/10 bg-slate-900/95 py-1 text-sm shadow-xl">{shown.length ? shown.map(h => <li key={`${h.id}-${h.exchange}`}><button onClick={() => pick(h.id, h.name, h.currency)} className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-white/5"><span className="font-mono font-semibold text-white">{h.id}</span><span className="truncate text-slate-400">{h.name}</span><span className="ml-auto shrink-0 text-[10px] text-slate-500">{h.exchange}</span></button></li>) : <li className="px-3 py-1.5 text-slate-500">{t.noResults}</li>}</ul>}
              {c.favorites.length > 0 && <div className="mt-3"><span className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><Star className="size-3 fill-amber-300 text-amber-300" />{t.favs}</span><div className="flex flex-wrap gap-1.5">{c.favorites.map(f => <button key={`${f.source}|${f.ticker}`} title={`${f.name}${f.source !== c.source ? ` · ${t.srcOpt[f.source]}` : ''}`} disabled={f.source === 'fmp' && !key} onClick={() => openFav(f)} className={`rounded-lg px-2 py-0.5 font-mono text-xs disabled:opacity-40 ${f.source === c.source && f.ticker === c.ticker ? 'bg-amber-300 text-slate-950' : 'bg-amber-300/10 text-amber-200 hover:bg-amber-300/20'}`}>{f.ticker}</button>)}</div></div>}
              <div className="mt-2 flex flex-wrap gap-1.5">{PICKS[c.source].map(([id, n]) => <button key={id} disabled={!ready} onClick={() => pick(id, n, 'USD')} className={`rounded-lg px-2 py-0.5 font-mono text-xs disabled:opacity-40 ${id === c.ticker ? 'bg-[#c8ff3d] text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>{id}</button>)}</div></div>
            <div><span className={label}>{t.indicators}</span><div className="space-y-2 text-sm">
              {([['sma', 'SMA (20)'], ['ema', 'EMA (50)'], ['boll', t.boll]] as const).map(([k, l]) => <label key={k} className="flex cursor-pointer items-center gap-2 text-slate-300 hover:text-white"><input type="checkbox" className="accent-[#c8ff3d]" checked={c[k]} onChange={e => setConfig(p => ({ ...p, [k]: e.target.checked }))} />{l}</label>)}
            </div></div>
            <div className="space-y-3"><span className={label}>{t.engine}</span>
              <select aria-label={t.engine} className={input} value={c.method} onChange={e => setConfig({ method: e.target.value as Config['method'] })}><option value="linear">{t.linear}</option><option value="montecarlo">{t.mc}</option></select>
              <label className="block text-sm text-slate-400"><span className="flex justify-between">{t.horizon}<span className="font-mono text-indigo-300">{c.horizon} {t.days}</span></span><input type="range" min={7} max={90} value={c.horizon} onChange={e => setConfig({ horizon: Number(e.target.value) })} className="mt-2 w-full accent-[#c8ff3d]" /></label>
              <div className="flex gap-2"><button disabled={!a} onClick={run} className="disabled:opacity-40 acid-button flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold"><Zap className="size-4" />{t.run}</button>{projection && <button onClick={() => setProjection(null)} className="glass rounded-xl px-3 py-2 text-sm text-slate-300 hover:text-white">{t.clear}</button>}</div>
            </div>
          </Card>
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">{t.live}</h3>
            <div className="flex items-center justify-between text-xs text-slate-500">{t.strength}<span className={`rounded px-2 py-1 font-bold ${sigClass}`}>{a?.signal ?? '—'}</span></div>
            <div className="h-2 rounded-full bg-white/10"><div className={`h-2 rounded-full transition-all duration-500 ${sigClass.split(' ')[0]}`} style={{ width: `${meter}%` }} /></div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-black/20 p-2"><div className="text-[10px] uppercase text-slate-500">RSI (14)</div><div className={`font-mono text-lg font-bold ${a?.rsi != null && a.rsi > 70 ? 'text-rose-300' : a?.rsi != null && a.rsi < 30 ? 'text-emerald-300' : ''}`}>{a?.rsi?.toFixed(1) ?? '—'}</div></div>
              <div className="rounded-xl bg-black/20 p-2"><div className="text-[10px] uppercase text-slate-500">{t.vol}</div><div className="font-mono text-lg font-bold">{a ? `${a.vol.toFixed(2)}%` : '—'}</div></div>
            </div>
          </Card>
          <Card className="space-y-3 border border-violet-400/20">
            <h3 className="flex items-center gap-2 text-sm font-bold text-violet-300"><Sparkles className="size-4" />{t.ai}</h3>
            <p className="text-xs text-slate-400">{t.aiHelp}</p>
            <input type="password" autoComplete="off" aria-label={t.aiKey} placeholder={t.aiKey} className={input} value={c.geminiKey} onChange={e => setConfig({ geminiKey: e.target.value })} />
            <p className="text-[11px] text-slate-500">{user ? t.aiKeyNote : t.aiKeyGuest}</p>
            <button disabled={!c.geminiKey.trim() || ai.busy || !a} onClick={() => void report()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500/80 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40">{ai.busy ? <><Loader2 className="size-4 animate-spin" />{t.analysing}</> : <><Sparkles className="size-4" />{t.generate}</>}</button>
            {ai.text && <p className={`whitespace-pre-line rounded-xl bg-black/30 p-3 text-xs leading-relaxed ${ai.error ? 'text-rose-300' : 'text-slate-300'}`}>{ai.text}</p>}
          </Card>
        </aside>
        <div className="min-w-0 space-y-5">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
              <div><h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">{asset.id}<button onClick={toggleFav} title={isFav ? t.unfav : t.fav} aria-label={isFav ? t.unfav : t.fav} aria-pressed={isFav} className={`grid size-8 place-items-center rounded-lg ${isFav ? 'bg-amber-400/15 text-amber-300' : 'text-slate-500 hover:bg-white/5 hover:text-amber-300'}`}><Star className="size-4" fill={isFav ? 'currentColor' : 'none'} /></button></h2><p className="text-xs text-slate-500">{asset.name}</p></div>
              {a && <><div><div className="text-xs font-semibold uppercase text-slate-500">{t.price}</div><div className="font-mono text-lg font-bold">{money(a.last)}</div></div>
              <div><div className="text-xs font-semibold uppercase text-slate-500">{t.change}</div><div className={`font-mono text-lg font-bold ${a.change >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{a.change >= 0 ? '+' : ''}{a.change.toFixed(2)}%</div></div>
              <div className="text-xs text-slate-500">{new Date(dates.at(-1)!).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</div></>}
            </div>
            {a ? <Chart lines={lines} dates={[...dates, ...(projection?.dates ?? [])]} money={money} locale={locale} />
              : <div className="flex h-[360px] items-center justify-center gap-2 rounded-xl bg-black/20 px-6 text-center text-sm text-slate-400">{!ready ? <><KeyRound className="size-4 shrink-0" />{t.needKey}</> : load.busy ? <><Loader2 className="size-4 animate-spin" />{t.loading}</> : <span className="text-rose-300">{load.error}</span>}</div>}
          </Card>
          {a && <Card>
            <h3 className="mb-4 flex items-center gap-2 font-bold"><Cpu className="size-5 text-violet-300" />{t.insights}</h3>
            <div className="grid gap-5 md:grid-cols-3">
              <Insight icon={<Activity className="size-5" />} tone="text-indigo-300 bg-indigo-300/10" title={t.trend} text={a.aboveTrend ? t.above : t.below} />
              <Insight icon={<ChartSpline className="size-5" />} tone="text-violet-300 bg-violet-300/10" title={t.momentum} text={t.momText(a.mom > 0, a.macdBull, rsiWord)} />
              <Insight icon={<Crosshair className="size-5" />} tone="text-emerald-300 bg-emerald-300/10" title={t.action} text={t.actions[a.signal]} />
            </div>
          </Card>}
        </div>
      </div>
    </div>
  )
}

function Insight({ icon, tone, title, text }: { icon: ReactNode; tone: string; title: string; text: string }) {
  return <div className="flex items-start gap-3"><div className={`rounded-xl p-2.5 ${tone}`}>{icon}</div><div><h4 className="text-sm font-semibold text-slate-200">{title}</h4><p className="mt-1 text-sm text-slate-400">{text}</p></div></div>
}

interface Line { label: string; data: Series; color: string; width: number; dash?: string; fill?: boolean }

function Chart({ lines, dates, money, locale }: { lines: Line[]; dates: string[]; money: (n: number) => string; locale: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(800)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(([e]) => setW(e.contentRect.width)); ro.observe(el); return () => ro.disconnect() }, [])
  const h = 360, L = 8, R = 64, T = 8, B = 24, n = dates.length
  const vals = lines.flatMap(l => l.data.filter((v): v is number => v !== null))
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1, min = lo - span * 0.05, max = hi + span * 0.05
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (w - L - R), y = (v: number) => T + (1 - (v - min) / (max - min)) * (h - T - B)
  const path = (d: Series) => d.reduce((s, v, i) => v === null ? s : `${s}${s && d[i - 1] !== null && d[i - 1] !== undefined ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`, '')
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * (i + 0.5)) / 5)
  const xt = Array.from({ length: 6 }, (_, i) => Math.round((i * (n - 1)) / 5))
  const price = lines[0].data, firstI = price.findIndex(v => v !== null), lastI = price.reduce<number>((m, v, i) => v === null ? m : i, 0)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">{lines.map(l => <span key={l.label} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: l.color }} />{l.label}</span>)}</div>
      <div ref={ref} className="relative">
        <svg width={w} height={h} className="block" onMouseLeave={() => setHover(null)} onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left - L) / (w - L - R)) * (n - 1))))) }}>
          {ticks.map(v => <g key={v}><line x1={L} x2={w - R} y1={y(v)} y2={y(v)} className="stroke-white/[0.06]" /><text x={w - R + 6} y={y(v) + 4} className="fill-slate-500 font-mono" fontSize={11}>{money(v)}</text></g>)}
          {xt.map(i => <text key={i} x={x(i)} y={h - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-slate-500" fontSize={11}>{new Date(dates[i]).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</text>)}
          <defs><linearGradient id="sf-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c8ff3d" stopOpacity={0.18} /><stop offset="1" stopColor="#c8ff3d" stopOpacity={0} /></linearGradient></defs>
          <path d={`${path(price)}L${x(lastI)},${h - B}L${x(firstI)},${h - B}Z`} fill="url(#sf-fill)" />
          {lines.map(l => <path key={l.label} d={path(l.data)} fill="none" stroke={l.color} strokeWidth={l.width} strokeDasharray={l.dash} strokeLinejoin="round" />)}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={h - B} className="stroke-white/20" strokeDasharray="3 3" />}
        </svg>
        {hover !== null && <div className="pointer-events-none absolute top-2 rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 text-xs shadow-xl" style={x(hover) > w / 2 ? { right: w - x(hover) + 12 } : { left: x(hover) + 12 }}>
          <div className="mb-1 font-semibold text-white">{new Date(dates[hover]).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
          {lines.filter(l => l.data[hover] !== null && l.data[hover] !== undefined).map(l => <div key={l.label} className="flex justify-between gap-4 text-slate-300"><span style={{ color: l.color }}>{l.label}</span><span className="font-mono">{money(l.data[hover]!)}</span></div>)}
        </div>}
      </div>
    </div>
  )
}
