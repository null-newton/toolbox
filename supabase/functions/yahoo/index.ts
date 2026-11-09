import { withAppAccess } from '../_shared/app-access.ts'
// Yahoo Finance proxy for "Stock Forecast": keyless search + daily history for every market Yahoo lists (unofficial API).
// Mirrors toolbox-backend/functions/yahoo.mjs. Deploy with: npx supabase functions deploy yahoo

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const TYPES = new Set(['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX', 'CRYPTOCURRENCY', 'CURRENCY', 'FUTURE'])
const MINOR: Record<string, string> = { GBp: 'GBX', ZAc: 'ZAX', ILA: 'ILX' }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })

async function yget(url: string): Promise<Json> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(10e3) })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) throw new Error(data?.chart?.error?.description ?? data?.finance?.error?.description ?? `Yahoo returned ${res.status}`)
  return data
}

async function search(q: string) {
  if (!q) throw new Error('Missing search term')
  const d = await yget(`https://query2.finance.yahoo.com/v1/finance/search?${new URLSearchParams({ q, quotesCount: '20', newsCount: '0', listsCount: '0' })}`)
  return (d.quotes ?? []).filter((r: Json) => r.symbol && TYPES.has(r.quoteType)).map((r: Json) => ({ id: r.symbol, name: r.longname ?? r.shortname ?? r.symbol, ticker: r.symbol, exchange: r.exchDisp ?? r.exchange ?? null, type: r.typeDisp ?? r.quoteType, currency: null }))
}

async function history(id: string, start: string | null) {
  if (!id) throw new Error('Missing security id')
  const from = Math.floor(new Date(`${start || '2020-01-01'}T00:00:00Z`).getTime() / 1000)
  const d = await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(id)}?${new URLSearchParams({ period1: String(from), period2: String(Math.floor(Date.now() / 1000)), interval: '1d', events: 'history' })}`)
  const r = d.chart?.result?.[0], close: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [], off = r?.meta?.gmtoffset ?? 0
  if (!r?.timestamp?.length) throw new Error('No price history returned for that symbol.')
  const byDate = new Map<string, number>()
  r.timestamp.forEach((ts: number, i: number) => close[i] != null && byDate.set(new Date((ts + off) * 1000).toISOString().slice(0, 10), close[i]!))
  const series = [...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date))
  if (!series.length) throw new Error('No price history in the selected range.')
  const cur = r.meta.currency ?? null
  return { currency: MINOR[cur] ?? cur, name: r.meta.longName ?? r.meta.shortName ?? null, exchange: r.meta.fullExchangeName ?? null, frequency: 'daily', series }
}

Deno.serve(withAppAccess('stock-forecast', CORS_HEADERS, async (req) => {
  const p = new URL(req.url).searchParams, action = p.get('action')
  try {
    if (action === 'search') return json({ data: await search((p.get('q') ?? '').trim()) })
    if (action === 'history') return json({ data: await history((p.get('id') ?? '').trim(), p.get('start')) })
    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Request failed' }, 502) }
}))
