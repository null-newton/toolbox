// Recurring-charge detection over Bank Viewer transactions. Pure: no React, no storage.
import type { Tx } from '../bank-viewer/model'

export type Cadence = 'weekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'halfyearly' | 'yearly'
export type Category = 'streaming' | 'software' | 'fitness' | 'insurance' | 'telecom' | 'energy' | 'news' | 'housing' | 'other'
export interface PriceChange { date: string; from: number; to: number }
export interface Subscription {
  id: string; name: string; key: string; cadence: Cadence; category: Category; currency: string; accounts: string[]
  charges: { date: string; amount: number; account: string }[]
  amount: number; monthly: number; yearly: number; first: string; last: string; next: string
  active: boolean; confidence: 'high' | 'medium'; changes: PriceChange[]
}
export type AccountTx = Tx & { account: string }

const DAY = 86_400_000
export const CADENCES: { id: Cadence; days: number; tol: number; perYear: number }[] = [
  { id: 'weekly', days: 7, tol: 2, perYear: 52 }, { id: 'monthly', days: 30.44, tol: 6, perYear: 12 },
  { id: 'bimonthly', days: 61, tol: 8, perYear: 6 }, { id: 'quarterly', days: 91.3, tol: 12, perYear: 4 },
  { id: 'halfyearly', days: 182.6, tol: 18, perYear: 2 }, { id: 'yearly', days: 365.25, tol: 25, perYear: 1 },
]
const NOISE = new Set(['sepa', 'europese', 'europäische', 'domiciliering', 'domiciliëring', 'domiciliation', 'europeenne', 'européenne', 'direct', 'debit', 'lastschrift',
  'betaling', 'paiement', 'payment', 'aankoop', 'achat', 'bancontact', 'maestro', 'visa', 'mastercard', 'debit', 'kaart', 'card', 'carte', 'met', 'via', 'van', 'naar', 'to', 'from',
  'mandaat', 'mandate', 'ref', 'referentie', 'reference', 'communication', 'mededeling', 'contract', 'klant', 'client', 'customer', 'nr', 'no', 'bv', 'nv', 'sa', 'srl', 'bvba', 'ltd',
  'inc', 'llc', 'gmbh', 'bv', 'sarl', 'the', 'de', 'het', 'le', 'la', 'les', 'www', 'com', 'be', 'nl', 'eu', 'net', 'org', 'io', 'ie', 'lu', 'apple', 'pay', 'google', 'contactloos', 'online'])
const KEEP_BRAND = /\b(apple|google)\b/ // brands that are also payment wallets: keep them when they are the only word
const CATS: [Category, RegExp][] = [
  ['streaming', /netflix|spotify|disney|youtube|hbo|max\b|streamz|prime ?video|videoland|deezer|tidal|apple ?(tv|music)|dazn|viaplay|play ?sports|crunchyroll|audible|storytel|twitch/],
  ['software', /icloud|apple\.com|microsoft|office ?365|adobe|dropbox|google ?(one|storage|workspace)|github|openai|chatgpt|anthropic|claude|notion|1password|bitwarden|nordvpn|expressvpn|proton|canva|figma|jetbrains|steam|playstation|xbox|nintendo|patreon/],
  ['fitness', /basic[- ]?fit|jims|fitness|gym|sportcity|anytime|crossfit|yoga|padel|sport|zwembad|swim|strava|peloton/],
  ['insurance', /verzeker|assurance|insurance|versicherung|ethias|\bag\b|axa|baloise|dvv|p&v|allianz|belfius ins|kbc ins|federale|vivium|mutualit|ziekenfonds|\bcm\b|partena|solidaris|helan|hospitalisatie|dkv/],
  ['telecom', /proximus|telenet|orange|\bbase\b|mobile ?vikings|scarlet|voo|hey!|yoin|lycamobile|kpn|vodafone|t-mobile|ziggo|edpnet/],
  ['energy', /engie|luminus|eneco|total ?energies|mega|bolt|octa\+|watergroep|farys|pidpa|water-link|fluvius|ores|swde|vivaqua|dats/],
  ['news', /standaard|nieuwsblad|\bhln\b|\btijd\b|knack|humo|morgen|gazet|het belang|le soir|nyt|economist|medium|substack/],
  ['housing', /huur|loyer|rent\b|lening|krediet|hypothe|syndic|vve|kinderopvang|creche/],
]

const days = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY)
const addDays = (d: string, n: number) => new Date(new Date(d).getTime() + n * DAY).toISOString().slice(0, 10)
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const r2 = (n: number) => Math.round(n * 100) / 100

// Stable merchant key: counterparty first, else the remittance text, minus noise words, numbers and references.
export function merchantKey(tx: Pick<Tx, 'counterparty' | 'text'>): string {
  const raw = (tx.counterparty.trim() || tx.text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  const words = raw.replace(/https?:\/\//g, ' ').replace(/[^a-z0-9&+ ]+/g, ' ').split(/\s+/).filter((w) => w && !/\d/.test(w) && w.length > 1)
  const kept = words.filter((w) => !NOISE.has(w)).slice(0, 3)
  return kept.length ? kept.join(' ') : words.find((w) => KEEP_BRAND.test(w)) || words.slice(0, 2).join(' ')
}
export const categorize = (s: string): Category => CATS.find(([, re]) => re.test(s.toLowerCase()))?.[0] || 'other'
const LEGAL = /[\s,.]+(bv|nv|sa|srl|bvba|ltd|inc|llc|gmbh|sarl|ab|oy|as|plc|sas|spa|co)\.?$/i
const titleCase = (s: string) => s.replace(LEGAL, '').replace(/(^|[\s\-/(.&])(\p{Ll})/gu, (_, b, c) => b + c.toUpperCase())

// Fit the closest cadence to a run of dates; null when the gaps are not regular enough.
function fitCadence(dates: string[]) {
  const gaps = dates.slice(1).map((d, i) => days(dates[i], d)), med = median(gaps)
  const c = CADENCES.find((c) => Math.abs(med - c.days) <= c.tol)
  if (!c) return null
  const ok = gaps.filter((g) => Math.abs(g - c.days) <= c.tol || Math.abs(g - 2 * c.days) <= c.tol).length / gaps.length // a skipped month still counts
  return ok >= 0.75 ? { cadence: c, gap: med } : null
}

// Split one merchant's charges into chains of similar amounts (two Apple subs, a price bump within 35% stays one chain).
function chains(txs: AccountTx[]): AccountTx[][] {
  const out: AccountTx[][] = []
  for (const t of txs) {
    const a = -t.amount
    const fit = out.filter((c) => { const l = c[c.length - 1]; return days(l.date, t.date) >= 5 && Math.abs(-l.amount - a) <= Math.max(1, -l.amount * 0.35) })
      .sort((x, y) => Math.abs(-x[x.length - 1].amount - a) - Math.abs(-y[y.length - 1].amount - a))[0]
    if (fit) fit.push(t); else out.push([t])
  }
  return out
}

// Price changes that stuck: the new amount is still charged on the next charge (or it is the latest one).
function priceChanges(c: { date: string; amount: number }[]): PriceChange[] {
  const out: PriceChange[] = []
  let level = c[0].amount
  c.forEach((x, i) => {
    if (i === 0 || Math.abs(x.amount - level) < Math.max(0.05, level * 0.01)) return
    const next = c[i + 1]
    if (!next || Math.abs(next.amount - x.amount) < Math.max(0.05, x.amount * 0.01)) { out.push({ date: x.date, from: level, to: x.amount }); level = x.amount }
  })
  return out
}

// Find recurring outgoing charges across accounts. `today` decides whether a subscription is still running.
export function detect(txs: AccountTx[], today: string, ownIbans: string[] = []): Subscription[] {
  const own = ownIbans.map((i) => i.replace(/\s/g, '').toLowerCase()).filter(Boolean)
  const groups = new Map<string, AccountTx[]>()
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date))) {
    const hay = `${t.counterparty} ${t.text}`.replace(/\s/g, '').toLowerCase()
    if (t.amount >= 0 || own.some((i) => hay.includes(i))) continue
    const k = merchantKey(t)
    if (k) groups.set(`${k}|${t.currency}`, [...(groups.get(`${k}|${t.currency}`) || []), t])
  }
  const subs: Subscription[] = [], seen = new Map<string, number>()
  const uid = (id: string) => { const n = (seen.get(id) || 0) + 1; seen.set(id, n); return n > 1 ? `${id}#${n}` : id } // shared plans: two identical charges on the same day
  for (const [gk, all] of groups) {
    const [key, currency] = gk.split('|')
    const found = chains(all).map((c) => ({ c, fit: c.length >= 2 ? fitCadence(c.map((t) => t.date)) : null }))
      .filter((x): x is { c: AccountTx[]; fit: NonNullable<ReturnType<typeof fitCadence>> } => !!x.fit && (x.c.length >= 3 || x.fit.cadence.days >= 180))
    for (const { c, fit } of found) {
      const charges = c.map((t) => ({ date: t.date, amount: r2(-t.amount), account: t.account }))
      const amount = charges[charges.length - 1].amount, last = charges[charges.length - 1].date, f = fit.cadence
      const spread = median(charges.map((x) => Math.abs(x.amount - amount) / amount))
      const noisy = all.length > c.length * 3 || spread > 0.15 // a shop you visit often, or wobbly amounts
      const label = c[c.length - 1].counterparty.trim() || key
      subs.push({
        id: uid(`${key}|${f.id}|${charges[0].date}`), key, name: titleCase(label.length > 40 ? key : label.toLowerCase()), cadence: f.id, currency,
        category: categorize(`${label} ${key} ${c[c.length - 1].text}`), accounts: [...new Set(charges.map((x) => x.account))], charges, amount,
        monthly: r2((amount * f.perYear) / 12), yearly: r2(amount * f.perYear), first: charges[0].date, last, next: addDays(last, Math.round(f.days)),
        active: days(last, today) <= f.days + Math.max(f.tol * 2, 10), confidence: noisy || (c.length < 3 && f.days < 180) ? 'medium' : 'high', changes: priceChanges(charges),
      })
    }
  }
  return subs.sort((a, b) => Number(b.active) - Number(a.active) || b.monthly - a.monthly)
}

export type Mark = 'known' | 'ignored'
export interface Flag { kind: 'yearly' | 'small' | 'long' | 'increase' | 'duplicate'; value?: number }

// Reasons a charge may have slipped your mind. Only for active ones you have not marked as known.
export function forgottenFlags(s: Subscription, all: Subscription[], mark?: Mark): Flag[] {
  if (!s.active || mark) return []
  const f: Flag[] = []
  if (s.cadence === 'yearly' || s.cadence === 'halfyearly') f.push({ kind: 'yearly' })
  if (s.monthly < 15 && s.cadence !== 'yearly') f.push({ kind: 'small' })
  const inc = s.changes.filter((c) => c.to > c.from).at(-1)
  if (inc) f.push({ kind: 'increase', value: inc.to - inc.from })
  if (s.category === 'streaming' && all.some((o) => o.active && o.category === 'streaming' && o.key !== s.key)) f.push({ kind: 'duplicate' })
  return f.length && s.charges.length >= 6 ? [...f, { kind: 'long', value: s.charges.length }] : f
}
