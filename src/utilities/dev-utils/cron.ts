/**
 * Standard 5-field cron parsing (minute hour day-of-month month day-of-week),
 * human-readable descriptions and next-run calculation.
 * Supports *, lists, ranges, steps, month/day names, 7 = Sunday and the
 * @yearly/@monthly/@weekly/@daily/@hourly macros.
 */
import type { Lang } from '../../i18n/LanguageContext'

export interface Field {
  values: Set<number>
  /** True when the field starts with '*' (unrestricted for dom/dow OR logic). */
  star: boolean
  raw: string
}
export interface Cron { minute: Field; hour: Field; dom: Field; month: Field; dow: Field }

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *',
}
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

const SPECS = [
  { key: 'minute', min: 0, max: 59 },
  { key: 'hour', min: 0, max: 23 },
  { key: 'dom', min: 1, max: 31 },
  { key: 'month', min: 1, max: 12, names: MONTH_NAMES, offset: 1 },
  { key: 'dow', min: 0, max: 7, names: DAY_NAMES, offset: 0 },
] as const

export class CronError extends Error {}

function parseField(raw: string, spec: (typeof SPECS)[number]): Field {
  const values = new Set<number>()
  const num = (s: string) => {
    const up = s.toUpperCase()
    if ('names' in spec) {
      const i = (spec.names as readonly string[]).indexOf(up)
      if (i >= 0) return i + spec.offset
    }
    if (!/^\d+$/.test(s)) throw new CronError(`"${s}" is not valid in the ${spec.key} field`)
    const n = Number(s)
    if (n < spec.min || n > spec.max) throw new CronError(`${n} is out of range for ${spec.key} (${spec.min}–${spec.max})`)
    return n
  }
  for (const part of raw.split(',')) {
    const [range, stepStr] = part.split('/')
    const step = stepStr === undefined ? 1 : Number(stepStr)
    if (!Number.isInteger(step) || step < 1) throw new CronError(`Invalid step "${stepStr}" in ${spec.key}`)
    let lo: number, hi: number
    if (range === '*' || range === '?') { lo = spec.min; hi = spec.key === 'dow' ? 6 : spec.max }
    else if (range.includes('-')) {
      const [a, b] = range.split('-')
      lo = num(a); hi = num(b)
      if (lo > hi) throw new CronError(`Range ${range} runs backwards in ${spec.key}`)
    } else {
      lo = num(range)
      hi = stepStr === undefined ? lo : spec.key === 'dow' ? 6 : spec.max
    }
    for (let v = lo; v <= hi; v += step) values.add(spec.key === 'dow' && v === 7 ? 0 : v)
  }
  return { values, star: raw.startsWith('*') || raw.startsWith('?'), raw }
}

export function parseCron(expr: string): Cron {
  const trimmed = expr.trim().toLowerCase()
  const src = MACROS[trimmed] ?? expr.trim()
  if (trimmed === '@reboot') throw new CronError('@reboot runs once at startup and has no schedule')
  const parts = src.split(/\s+/)
  if (parts.length !== 5) throw new CronError(`Expected 5 fields (minute hour day month weekday), got ${parts.length}`)
  const [minute, hour, dom, month, dow] = parts.map((p, i) => parseField(p, SPECS[i]))
  return { minute, hour, dom, month, dow }
}

function matchesDay(c: Cron, d: Date) {
  const domOk = c.dom.values.has(d.getDate())
  const dowOk = c.dow.values.has(d.getDay())
  if (!c.dom.star && !c.dow.star) return domOk || dowOk
  return domOk && dowOk
}

export function nextRuns(c: Cron, from: Date, count: number): Date[] {
  const out: Date[] = []
  const d = new Date(from)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1)
  const limit = from.getTime() + 5 * 366 * 86400_000
  while (out.length < count && d.getTime() < limit) {
    if (!c.month.values.has(d.getMonth() + 1)) { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0); continue }
    if (!matchesDay(c, d)) { d.setDate(d.getDate() + 1); d.setHours(0, 0); continue }
    if (!c.hour.values.has(d.getHours())) { d.setHours(d.getHours() + 1, 0); continue }
    if (!c.minute.values.has(d.getMinutes())) { d.setMinutes(d.getMinutes() + 1); continue }
    out.push(new Date(d))
    d.setMinutes(d.getMinutes() + 1)
  }
  return out
}

/* ---------- Descriptions ---------- */

const W = {
  en: {
    everyMinute: 'every minute', everyNMin: (n: number) => `every ${n} minutes`, atMinute: (l: string) => `at minute ${l}`,
    pastHour: 'past the hour', everyHour: 'every hour', everyNHour: (n: number) => `every ${n} hours`, hours: (l: string) => `during hour ${l}`,
    at: 'At', and: 'and', or: 'or', through: 'through', onDom: (l: string) => `on day ${l} of the month`,
    everyNDays: (n: number) => `every ${n} days of the month`, onDow: (l: string) => `on ${l}`, inMonth: (l: string) => `in ${l}`,
    everyNMonths: (n: number) => `every ${n} months`,
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    fromStep: (start: string, n: number, unit: string) => `every ${n} ${unit} from ${start}`,
    unit: { minute: 'minutes', hour: 'hours', dom: 'days', month: 'months', dow: 'days' },
  },
  nl: {
    everyMinute: 'elke minuut', everyNMin: (n: number) => `elke ${n} minuten`, atMinute: (l: string) => `op minuut ${l}`,
    pastHour: 'na het uur', everyHour: 'elk uur', everyNHour: (n: number) => `elke ${n} uur`, hours: (l: string) => `tijdens uur ${l}`,
    at: 'Om', and: 'en', or: 'of', through: 'tot en met', onDom: (l: string) => `op dag ${l} van de maand`,
    everyNDays: (n: number) => `elke ${n} dagen van de maand`, onDow: (l: string) => `op ${l}`, inMonth: (l: string) => `in ${l}`,
    everyNMonths: (n: number) => `elke ${n} maanden`,
    months: ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'],
    days: ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'],
    fromStep: (start: string, n: number, unit: string) => `elke ${n} ${unit} vanaf ${start}`,
    unit: { minute: 'minuten', hour: 'uur', dom: 'dagen', month: 'maanden', dow: 'dagen' },
  },
}

type Words = (typeof W)['en']
type Key = keyof Words['unit']

function joinList(items: string[], w: Words, conj = w.and) {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`
}

/** Describe the raw comma parts of a field ("1-5", "MON", "*\/2" …) in words. */
function describeParts(f: Field, key: Key, w: Words): string {
  const name = (s: string) => {
    const up = s.toUpperCase()
    if (key === 'month') { const i = MONTH_NAMES.indexOf(up); return w.months[i >= 0 ? i : Number(s) - 1] }
    if (key === 'dow') { const i = DAY_NAMES.indexOf(up); return w.days[i >= 0 ? i : Number(s) % 7] }
    return s
  }
  return joinList(f.raw.split(',').map((part) => {
    const [range, step] = part.split('/')
    const base = range.includes('-') ? range.split('-').map(name).join(` ${w.through} `) : name(range)
    return step ? w.fromStep(range === '*' ? name(String(SPECS.find((s) => s.key === key)!.min)) : base, Number(step), w.unit[key]) : base
  }), w)
}

const singleValues = (f: Field) => !f.raw.includes('*') && !f.raw.includes('/') && !f.raw.includes('-')
const pad = (n: number) => String(n).padStart(2, '0')

export function describeCron(c: Cron, lang: Lang): string {
  const w = W[lang]
  const parts: string[] = []
  const starStep = (f: Field) => /^\*\/(\d+)$/.exec(f.raw)?.[1]

  // Time of day
  if (singleValues(c.minute) && singleValues(c.hour) && c.minute.values.size * c.hour.values.size <= 6) {
    const times = [...c.hour.values].sort((a, b) => a - b).flatMap((h) => [...c.minute.values].sort((a, b) => a - b).map((m) => `${pad(h)}:${pad(m)}`))
    parts.push(`${w.at} ${joinList(times, w)}`)
  } else {
    const m = c.minute.raw === '*' ? w.everyMinute : starStep(c.minute) ? w.everyNMin(Number(starStep(c.minute))) : `${w.atMinute(describeParts(c.minute, 'minute', w))} ${w.pastHour}`
    parts.push(m.charAt(0).toUpperCase() + m.slice(1))
    if (c.hour.raw !== '*') parts.push(starStep(c.hour) ? w.everyNHour(Number(starStep(c.hour))) : w.hours(describeParts(c.hour, 'hour', w)))
  }

  // Days
  const dom = c.dom.raw === '*' || c.dom.raw === '?' ? null : starStep(c.dom) ? w.everyNDays(Number(starStep(c.dom))) : w.onDom(describeParts(c.dom, 'dom', w))
  const dow = c.dow.raw === '*' || c.dow.raw === '?' ? null : w.onDow(describeParts(c.dow, 'dow', w))
  if (dom && dow) parts.push(!c.dom.star && !c.dow.star ? `${dom} ${w.or} ${dow}` : `${dom} ${w.and} ${dow}`)
  else if (dom || dow) parts.push((dom ?? dow)!)

  if (c.month.raw !== '*') parts.push(starStep(c.month) ? w.everyNMonths(Number(starStep(c.month))) : w.inMonth(describeParts(c.month, 'month', w)))

  return parts.join(', ') + '.'
}
