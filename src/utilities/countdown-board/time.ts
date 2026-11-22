import { useEffect, useState } from 'react'

/** Shared data model + time-zone maths for the Countdown & Time Zone board and its embed. */

export interface CountdownEvent {
  id: string
  title: string
  /** Wall-clock date-time in `tz`, as from <input type="datetime-local"> ("2026-12-31T23:59"). */
  at: string
  tz: string
  /** Roll forward every year (birthdays, anniversaries). */
  yearly?: boolean
}

export interface City {
  id: string
  name: string
  tz: string
}

export interface Board {
  events: CountdownEvent[]
  cities: City[]
  hour12: boolean
}

export const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export function allTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['UTC', 'Europe/London', 'Europe/Brussels', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney']
  }
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export const cityFromZone = (tz: string) => tz.split('/').pop()!.replace(/_/g, ' ')

export const newId = () => Math.random().toString(36).slice(2, 10)

const partsCache = new Map<string, Intl.DateTimeFormat>()
function zoneFormatter(tz: string) {
  let f = partsCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    partsCache.set(tz, f)
  }
  return f
}

/** Offset of `tz` from UTC at instant `ms`, in minutes (Brussels in winter → 60). */
export function zoneOffset(tz: string, ms: number): number {
  const p = Object.fromEntries(zoneFormatter(tz).formatToParts(ms).map((x) => [x.type, Number(x.value)]))
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000)
}

/** Convert a wall-clock "YYYY-MM-DDTHH:mm" in `tz` to a UTC timestamp. */
export function zonedToUtc(wall: string, tz: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall)
  if (!m) return NaN
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  let ms = guess - zoneOffset(tz, guess) * 60000
  ms = guess - zoneOffset(tz, ms) * 60000 // second pass settles DST transitions
  return ms
}

/** Target instant of an event; yearly events roll forward to the next occurrence. */
export function eventTarget(e: CountdownEvent, now: number): number {
  let t = zonedToUtc(e.at, e.tz)
  if (!e.yearly || Number.isNaN(t)) return t
  const m = /^(\d{4})(.*)$/.exec(e.at)!
  let year = Number(m[1])
  for (let i = 0; t < now && i < 200; i++) {
    year += 1
    t = zonedToUtc(`${year}${m[2]}`, e.tz)
  }
  return t
}

export function splitDuration(ms: number) {
  const s = Math.floor(Math.abs(ms) / 1000)
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 }
}

export const formatOffset = (min: number) => {
  const sign = min < 0 ? '−' : '+'
  const a = Math.abs(min)
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/* ---------- Embed encoding (board config lives in the URL, no backend) ---------- */

export interface EmbedOptions {
  theme: 'dark' | 'light'
  /** No page/card background, so the host site's colours show through. */
  transparent: boolean
  lang: 'en' | 'nl'
  title?: string
}

type Packed = { e: [string, string, string, 0 | 1][]; c: [string, string][]; h: 0 | 1; t: string; x?: 1; l: string; n?: string }

function toB64Url(s: string) {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64Url(s: string) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function encodeEmbed(board: Board, opts: EmbedOptions): string {
  const packed: Packed = {
    e: board.events.map((e) => [e.title, e.at, e.tz, e.yearly ? 1 : 0]),
    c: board.cities.map((c) => [c.name, c.tz]),
    h: board.hour12 ? 1 : 0,
    t: opts.theme,
    ...(opts.transparent ? { x: 1 as const } : {}),
    l: opts.lang,
    ...(opts.title ? { n: opts.title } : {}),
  }
  return toB64Url(JSON.stringify(packed))
}

const validTz = (tz: unknown): tz is string => {
  if (typeof tz !== 'string') return false
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false }
}
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Decode and validate an embed payload; anything malformed is dropped. */
export function decodeEmbed(code: string): { board: Board; opts: EmbedOptions } | null {
  try {
    const p = JSON.parse(fromB64Url(code)) as Partial<Packed>
    const events = (Array.isArray(p.e) ? p.e : []).slice(0, 20)
      .filter((e) => Array.isArray(e) && validTz(e[2]) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(e[1])))
      .map((e, i) => ({ id: `e${i}`, title: str(e[0], 80), at: String(e[1]), tz: e[2], yearly: e[3] === 1 }))
    const cities = (Array.isArray(p.c) ? p.c : []).slice(0, 24)
      .filter((c) => Array.isArray(c) && validTz(c[1]))
      .map((c, i) => ({ id: `c${i}`, name: str(c[0], 60), tz: c[1] }))
    const theme = p.t === 'light' ? 'light' : 'dark'
    const lang = p.l === 'nl' ? 'nl' : 'en'
    return { board: { events, cities, hour12: p.h === 1 }, opts: { theme, transparent: p.x === 1, lang, title: str(p.n, 80) || undefined } }
  } catch {
    return null
  }
}
