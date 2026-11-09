export type Series = (number | null)[]

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())

// `count` weekdays after `from` (yyyy-mm-dd), for projection dates.
export function businessDays(count: number, from: string) {
  const out: string[] = [], d = new Date(`${from}T12:00:00`)
  for (d.setDate(d.getDate() + 1); out.length < count; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  return out
}

export const sma = (d: number[], p: number): Series => d.map((_, i) => i < p - 1 ? null : d.slice(i - p + 1, i + 1).reduce((s, v) => s + v, 0) / p)

export function ema(d: number[], p: number): Series {
  if (d.length < p) return d.map(() => null)
  const k = 2 / (p + 1), out: Series = Array(p - 1).fill(null)
  let prev = d.slice(0, p).reduce((s, v) => s + v, 0) / p
  out.push(prev)
  for (let i = p; i < d.length; i++) out.push(prev = d[i] * k + prev * (1 - k))
  return out
}

// Wilder-smoothed RSI of the latest point.
export function rsi(d: number[], p = 14) {
  if (d.length <= p) return null
  let g = 0, l = 0
  for (let i = 1; i <= p; i++) { const x = d[i] - d[i - 1]; if (x > 0) g += x; else l -= x }
  g /= p; l /= p
  for (let i = p + 1; i < d.length; i++) { const x = d[i] - d[i - 1]; g = (g * (p - 1) + Math.max(x, 0)) / p; l = (l * (p - 1) + Math.max(-x, 0)) / p }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l)
}

export function bollinger(d: number[], p = 20, k = 2) {
  const m = sma(d, p), sd = m.map((v, i) => v === null ? null : Math.sqrt(d.slice(i - p + 1, i + 1).reduce((s, x) => s + (x - v) ** 2, 0) / p))
  return { upper: m.map((v, i) => v === null ? null : v + k * sd[i]!), lower: m.map((v, i) => v === null ? null : v - k * sd[i]!) }
}

// MACD (12/26) and its 9-period signal line, latest values.
export function macd(d: number[]) {
  const a = ema(d, 12), b = ema(d, 26), line = d.map((_, i) => a[i] !== null && b[i] !== null ? a[i]! - b[i]! : null).filter((v): v is number => v !== null)
  const sig = ema(line, 9)
  return { macd: line.at(-1) ?? 0, signal: sig.at(-1) ?? 0 }
}

const returns = (d: number[]) => d.slice(1).map((v, i) => v / d[i] - 1)
const std = (x: number[]) => { const m = x.reduce((s, v) => s + v, 0) / x.length; return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / x.length) }

// Standard deviation of the last 20 daily returns, in %.
export const volatility = (d: number[]) => std(returns(d.slice(-21))) * 100

export function linearForecast(d: number[], days: number, lookback = 50) {
  const n = Math.min(d.length, lookback), y = d.slice(-n), mx = (n - 1) / 2, my = y.reduce((s, v) => s + v, 0) / n
  const slope = y.reduce((s, v, i) => s + (i - mx) * (v - my), 0) / y.reduce((s, _, i) => s + (i - mx) ** 2, 0)
  return Array.from({ length: days }, (_, i) => my + slope * (n + i - mx))
}

export function monteCarlo(d: number[], days: number, paths = 3) {
  const s = std(returns(d.slice(-51)))
  return Array.from({ length: paths }, () => { const out = [d.at(-1)!]; for (let i = 0; i < days; i++) out.push(Math.max(0.01, out[i] * (1 + s * gauss(Math.random)))); return out.slice(1) })
}

export type Signal = 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL'

export function analyse(d: number[]) {
  const last = d.at(-1)!, r = rsi(d), trend = sma(d, 50).at(-1) ?? last, mom = last - d[d.length - 5], m = macd(d)
  const score = (last > trend ? 1 : -1) + (r === null ? 0 : r > 70 ? -2 : r < 30 ? 2 : 0) + (mom > 0 ? 1 : -1)
  const signal: Signal = score >= 3 ? 'STRONG BUY' : score >= 1 ? 'BUY' : score <= -3 ? 'STRONG SELL' : score <= -1 ? 'SELL' : 'HOLD'
  return { last, change: (last / d[d.length - 2] - 1) * 100, rsi: r, vol: volatility(d), aboveTrend: last > trend, mom, macdBull: m.macd > m.signal, score, signal }
}
