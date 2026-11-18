// Sorts outgoing transactions into spending categories, per month. Pure: no React, no storage.
import type { Tx } from '../bank-viewer/model'
import { merchantKey } from '../subscription-radar/detect.ts'

export type ExpenseCat = 'housing' | 'groceries' | 'dining' | 'transport' | 'shopping' | 'subscriptions' | 'health' | 'savings' | 'transfers' | 'other'
// Built-in order = fixed colour per category; "other" stays neutral. Your own categories (ids "c_…") sit between "transfers" and "other".
export const EXPENSE_CATS: ExpenseCat[] = ['housing', 'groceries', 'dining', 'transport', 'shopping', 'subscriptions', 'health', 'savings', 'transfers', 'other']
export const CAT_COLORS: Record<ExpenseCat, string> = {
  housing: '#3987e5', groceries: '#d95926', dining: '#199e70', transport: '#c98500', shopping: '#d55181', subscriptions: '#0ca30c', health: '#9085e9', savings: '#e66767', transfers: '#22a6c3', other: '#64748b',
}
// Colours offered for your own categories.
export const CUSTOM_COLORS = ['#7aa8f0', '#f08a5d', '#4fc79a', '#e3b341', '#ec8fb4', '#5cc95c', '#b3a9f2', '#f29a9a', '#2dd4bf', '#a3a3a3', '#c084fc', '#facc15']
export interface CustomCat { id: string; name: string; color: string }
// First match wins, so specific rules (fuel, savings) come before broad ones.
const RULES: [ExpenseCat, RegExp][] = [
  ['savings', /spaar|pensioen|epargne|épargne|savings|belegg|invest|bolero|keytrade|degiro|trade ?republic|bitvavo|aandelen|fonds/],
  ['transport', /\btotal\b(?! ?energies)|shell|\bq8\b|esso|texaco|lukoil|dats ?24|gabriels|octa\+|\bnmbs\b|\bsncb\b|de ?lijn|\bstib\b|mivb|\btec\b|parking|interparking|q-park|\buber\b(?! ?eats)|\bbolt\b|poppy|cambio|blue-bike|viapass|ryanair|brussels airlines|\bklm\b|easyjet|\btui\b|carglass|car ?wash|autowas|\bvab\b|touring|allego|ionity|tesla|blue ?corner|tankstation|station service|garage/],
  ['housing', /huur|loyer|\brent\b|lening|krediet|crédit|credit|hypothe|syndic|\bvve\b|engie|luminus|eneco|total ?energies|mega\b|octa|watergroep|farys|pidpa|water-link|fluvius|\bores\b|swde|vivaqua|proximus|telenet|orange|\bbase\b|mobile ?vikings|scarlet|\bvoo\b|kinderopvang|creche|crèche|onroerende|kadaster/],
  ['subscriptions', /netflix|spotify|disney|youtube|\bhbo\b|streamz|prime ?video|videoland|deezer|tidal|dazn|play ?sports|audible|storytel|icloud|apple\.com|itunes|microsoft|adobe|dropbox|google|github|openai|chatgpt|anthropic|notion|1password|nordvpn|proton|canva|playstation|xbox|nintendo|steam|patreon|basic[- ]?fit|jims|fitness|\bgym\b|standaard|nieuwsblad|\bhln\b|\btijd\b|knack|humo|de ?morgen|gazet/],
  ['health', /verzeker|assurance|insurance|ethias|\bag\b|axa|baloise|\bdvv\b|allianz|vivium|mutualit|ziekenfonds|\bcm\b|partena|solidaris|helan|hospitalisatie|apothe|pharma|farmac|dokter|huisarts|tandarts|kine|ziekenhuis|hôpital|hopital|\baz\b|\buz\b|opticien|pearle|hans anders|labo/],
  ['groceries', /colruyt|delhaize|aldi|lidl|carrefour|albert ?heijn|\bah\b|jumbo|\bspar\b|okay|intermarch|\bmatch\b|\bcora\b|bio-planet|proxy|smatch|slager|bakker|boulang|boucher|day ?by ?day|ekoplaza|hello ?fresh|crf |supermar/],
  ['dining', /restaurant|resto\b|brasserie|\bcafe\b|café|bistro|pizz|sushi|kebab|frituur|friterie|mcdonald|burger|\bquick\b|\bkfc\b|starbucks|deliveroo|uber ?eats|takeaway|just ?eat|taverne|lunch|snack|ijssalon|glacier|coffee|koffie/],
  ['shopping', /amazon|bol\.com|zalando|ikea|\baction\b|\bhema\b|kruidvat|media ?markt|coolblue|vanden ?borre|krefel|\bfnac\b|decathlon|primark|h&m|\bzara\b|c&a|\bjbc\b|ici paris|\bdi\b|torfs|brico|gamma|hubo|leroy|aveve|temu|shein|aliexpress|ebay|vinted|veritas|boekhandel|dreamland|\bclub\b|apple store|e5 ?mode|bershka|mango|zeeman|wibra|bel ?& ?bo|xenos|blokker|fun\b/],
]

export type Overrides = Record<string, string> // merchant key -> built-in or own category id
export type Expense = Tx & { account: string; key: string; cat: string }

const COMPANY = /\b(bv|bvba|nv|sa|srl|sprl|vzw|asbl|cv|cvba|comm|gcv|ltd|inc|gmbh|sarl|centrum|center|shop|store|winkel|services?|group|company|bank|vof|bvio)\b/i
// A counterparty that reads like a person's name: 2–4 words, no digits or company words; all-caps names only with 2 words (all-caps 3+ is usually "SHOP CITY").
export function isPerson(name: string): boolean {
  const n = name.replace(/\s+[-–&]\s+/g, ' ').trim(), words = n.split(/\s+/)
  if (words.length < 2 || words.length > 4 || /[\d*@#/]/.test(n) || COMPANY.test(n) || !/^[\p{L}'’.\- ]+$/u.test(n)) return false
  return n !== n.toUpperCase() || words.length === 2
}

export function categorize(tx: Pick<Tx, 'counterparty' | 'text'>, overrides: Overrides = {}, key = merchantKey(tx)): string {
  if (overrides[key]) return overrides[key]
  const hay = `${tx.counterparty} ${tx.text}`.toLowerCase()
  return RULES.find(([, re]) => re.test(hay))?.[0] || (isPerson(tx.counterparty) ? 'transfers' : 'other')
}

// Outgoing transactions with their category. Moves between your own linked accounts are left out: they are not spending.
export function expenses(txs: (Tx & { account: string })[], overrides: Overrides, ownIbans: string[] = []): Expense[] {
  const own = ownIbans.map((i) => i.replace(/\s/g, '').toLowerCase()).filter(Boolean)
  return txs.filter((t) => t.amount < 0 && !own.some((i) => `${t.counterparty} ${t.text}`.replace(/\s/g, '').toLowerCase().includes(i)))
    .map((t) => { const key = merchantKey(t); return { ...t, key, cat: categorize(t, overrides, key) } })
}

export interface Month { month: string; total: number; byCat: Record<string, number>; items: Expense[] }

// Spending per calendar month (YYYY-MM), oldest first, empty months included.
export function byMonth(list: Expense[], from: string, to: string, cats: string[] = EXPENSE_CATS): Month[] {
  const out: Month[] = []
  for (let d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 7) <= to.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
    const month = d.toISOString().slice(0, 7), items = list.filter((t) => t.date.startsWith(month))
    const byCat = Object.fromEntries(cats.map((c) => [c, Math.round(items.filter((t) => t.cat === c).reduce((a, t) => a - t.amount, 0) * 100) / 100]))
    out.push({ month, items, byCat, total: Math.round(items.reduce((a, t) => a - t.amount, 0) * 100) / 100 })
  }
  return out
}
