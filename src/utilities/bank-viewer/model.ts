import { backendFetch } from '../../lib/backend-fetch'
import { functionsBase } from '../../lib/supabase'

export const REDIRECT_URL =
  (import.meta.env.VITE_EB_REDIRECT_URL as string | undefined) || 'https://api.zacsvae.com/eb-callback'

// ---- Stored (encrypted) vault ----

export interface LinkedAccount {
  uid: string
  iban?: string
  name?: string
  currency?: string
}
export interface LinkedSession {
  sessionId: string
  aspsp: { name: string; country: string }
  validUntil: string
  accounts: LinkedAccount[]
}
export interface SalaryPayer {
  match: string
  minAmount: number
}
export interface SalaryRule {
  payers: SalaryPayer[]
  /** Salary payments within this many days of the first one count as one payday. */
  windowDays: number
}
export const DEFAULT_WINDOW_DAYS = 10

/** Accepts the current shape and the older single-payer `{ match, minAmount }`. */
export function normalizeRule(raw: unknown): SalaryRule {
  const r = (raw || {}) as { payers?: SalaryPayer[]; match?: string; minAmount?: number; windowDays?: number }
  const windowDays = Number.isFinite(r.windowDays) ? Math.max(0, Math.min(25, r.windowDays!)) : DEFAULT_WINDOW_DAYS
  if (Array.isArray(r.payers)) return { payers: r.payers, windowDays }
  return { payers: r.match ? [{ match: r.match, minAmount: r.minAmount ?? 0 }] : [], windowDays }
}

// ---- Locally cached (encrypted) bank data ----

export interface Tx {
  date: string // YYYY-MM-DD
  amount: number // signed: + incoming, - outgoing
  currency: string
  counterparty: string
  text: string
}
export interface AccountData {
  balance: number | null
  balanceDate: string | null
  balanceType: string | null
  currency: string
  transactions: Tx[] // booked only, oldest first
  oldest: string | null
  fetchedAt: string
}
export type Cache = Record<string, AccountData>

// ---- Enable Banking calls (through the read-only backend pass-through) ----

export class EbError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Banks can be slow, but the Cloudflare tunnel gives up after 100 s.
const REQUEST_TIMEOUT_MS = 95_000

export async function eb<T>(jwt: string, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await backendFetch(`${functionsBase}/enable-banking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-eb-jwt': jwt },
      body: JSON.stringify({ method, path, body }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (err) {
    if (signal?.aborted) throw new EbError('Cancelled.', 0)
    if (timeout.aborted) throw new EbError('The bank did not answer in time.', 504)
    throw err
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new EbError(data.message || data.error || `Enable Banking error ${res.status}`, res.status)
  return data as T
}

export interface Aspsp { name: string; country: string; maximum_consent_validity?: number; logo?: string }

interface RawTx {
  transaction_amount?: { amount: string; currency: string }
  credit_debit_indicator?: 'CRDT' | 'DBIT'
  booking_date?: string
  value_date?: string
  transaction_date?: string
  status?: string
  creditor?: { name?: string }
  debtor?: { name?: string }
  remittance_information?: string[]
}

export function normalizeTx(raw: RawTx): Tx | null {
  if (raw.status && raw.status !== 'BOOK') return null
  const date = raw.booking_date || raw.value_date || raw.transaction_date
  const value = Number(raw.transaction_amount?.amount)
  if (!date || !Number.isFinite(value)) return null
  const incoming = raw.credit_debit_indicator === 'CRDT'
  const amount = raw.credit_debit_indicator ? (incoming ? Math.abs(value) : -Math.abs(value)) : value
  const counterparty = (amount >= 0 ? raw.debtor?.name : raw.creditor?.name) || ''
  return {
    date: date.slice(0, 10),
    amount,
    currency: raw.transaction_amount?.currency || 'EUR',
    counterparty,
    text: (raw.remittance_information || []).join(' ').trim(),
  }
}

const BALANCE_PRIORITY = ['CLBD', 'ITBD', 'XPCD', 'ITAV', 'CLAV', 'OPBD']

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function daysAgo(n: number): string {
  return isoDate(new Date(Date.now() - n * 86_400_000))
}

export type Progress = (info: { step: 'balance' | 'transactions'; page: number; count: number }) => void

const MAX_PAGES = 100

async function fetchTransactions(jwt: string, uid: string, dateFrom: string, onProgress?: Progress, signal?: AbortSignal): Promise<Tx[]> {
  const out: Tx[] = []
  const seenKeys = new Set<string>()
  let key: string | undefined
  for (let page = 1; page <= MAX_PAGES; page++) {
    onProgress?.({ step: 'transactions', page, count: out.length })
    const q = new URLSearchParams({ date_from: dateFrom, transaction_status: 'BOOK' })
    if (key) q.set('continuation_key', key)
    const data = await eb<{ transactions?: RawTx[]; continuation_key?: string | null }>(jwt, 'GET', `/accounts/${encodeURIComponent(uid)}/transactions?${q}`, undefined, signal)
    for (const raw of data.transactions || []) {
      const tx = normalizeTx(raw)
      if (tx) out.push(tx)
    }
    key = data.continuation_key || undefined
    // Some banks hand back the same continuation key forever; stop instead of looping.
    if (!key || seenKeys.has(key)) break
    seenKeys.add(key)
  }
  return out
}

/** Fetch balance + new transactions and merge them into the cached history. */
export async function refreshAccount(jwt: string, uid: string, previous?: AccountData, onProgress?: Progress, signal?: AbortSignal): Promise<AccountData> {
  onProgress?.({ step: 'balance', page: 0, count: 0 })
  const bal = await eb<{ balances?: { balance_amount: { amount: string; currency: string }; balance_type?: string; reference_date?: string }[] }>(
    jwt, 'GET', `/accounts/${encodeURIComponent(uid)}/balances`, undefined, signal
  )
  const balances = bal.balances || []
  const chosen = [...balances].sort((a, b) => {
    const ra = BALANCE_PRIORITY.indexOf(a.balance_type || ''), rb = BALANCE_PRIORITY.indexOf(b.balance_type || '')
    return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb)
  })[0]

  // Re-fetch a week of overlap so late bookings are picked up; first run asks
  // for ~13 months and falls back to 89 days if the bank refuses.
  let from: string
  let fresh: Tx[]
  if (previous?.transactions.length) {
    const last = previous.transactions[previous.transactions.length - 1].date
    from = isoDate(new Date(new Date(last).getTime() - 7 * 86_400_000))
    fresh = await fetchTransactions(jwt, uid, from, onProgress, signal)
  } else {
    try {
      from = daysAgo(400)
      fresh = await fetchTransactions(jwt, uid, from, onProgress, signal)
    } catch (e) {
      // Many banks refuse (or time out on) more than 90 days of history.
      if (!(e instanceof EbError) || e.status === 0 || (e.status >= 500 && e.status !== 504)) throw e
      from = daysAgo(89)
      fresh = await fetchTransactions(jwt, uid, from, onProgress, signal)
    }
  }
  const kept = (previous?.transactions || []).filter((t) => t.date < from)
  const transactions = [...kept, ...fresh.sort((a, b) => a.date.localeCompare(b.date))]
  return {
    balance: chosen ? Number(chosen.balance_amount.amount) : null,
    balanceDate: chosen?.reference_date?.slice(0, 10) || null,
    balanceType: chosen?.balance_type || null,
    currency: chosen?.balance_amount.currency || previous?.currency || 'EUR',
    transactions,
    oldest: previous?.oldest && previous.oldest < from ? previous.oldest : from,
    fetchedAt: new Date().toISOString(),
  }
}

// ---- Surplus before salary ----

export interface MonthSurplus {
  salaryDate: string // first salary payment of this payday
  lastDate: string // last salary payment of this payday
  salaryAmount: number // all salary payments of this payday together
  payments: number
  surplus: number // balance at the end of the day before the first payment arrived
}

export function isSalary(tx: Tx, rule: SalaryRule): boolean {
  if (tx.amount <= 0) return false
  const haystack = `${tx.counterparty} ${tx.text}`.toLowerCase()
  return rule.payers.some((p) => {
    const needle = p.match.trim().toLowerCase()
    return !!needle && tx.amount >= p.minAmount && haystack.includes(needle)
  })
}

/**
 * For each payday, take its first salary booking and work backwards from the
 * known balance: surplus = balance − Σ(all bookings from the salary day up to
 * the balance date). That is the balance at the end of the day before pay.
 */
export function surplusByMonth(data: AccountData, rule: SalaryRule): MonthSurplus[] {
  if (data.balance === null) return []
  const ref = data.balanceDate || isoDate(new Date())
  const txs = data.transactions.filter((t) => t.date <= ref)
  // Group salary payments into paydays instead of calendar months, so a salary
  // paid at the end of one month and another (or an early one) at the start of
  // the next count together.
  const paydays: Tx[][] = []
  for (const t of txs) {
    if (!isSalary(t, rule)) continue
    const current = paydays[paydays.length - 1]
    if (current && daysBetween(current[0].date, t.date) <= rule.windowDays) current.push(t)
    else paydays.push([t])
  }
  return paydays.map((group) => {
    const first = group[0].date
    const after = txs.filter((t) => t.date >= first).reduce((s, t) => s + t.amount, 0)
    return {
      salaryDate: first,
      lastDate: group[group.length - 1].date,
      salaryAmount: round2(group.reduce((s, t) => s + t.amount, 0)),
      payments: group.length,
      surplus: round2(data.balance! - after),
    }
  })
}

export interface SalaryGuess { name: string; months: number; average: number }

/** Incoming payers that show up in at least two different months, biggest first. */
export function guessSalary(txs: Tx[]): SalaryGuess[] {
  const groups = new Map<string, { months: Set<string>; total: number; count: number }>()
  for (const t of txs) {
    const name = t.counterparty.trim()
    if (t.amount <= 0 || !name) continue
    const g = groups.get(name) || { months: new Set(), total: 0, count: 0 }
    g.months.add(t.date.slice(0, 7)); g.total += t.amount; g.count++
    groups.set(name, g)
  }
  return [...groups.entries()]
    .filter(([, g]) => g.months.size >= 2)
    .map(([name, g]) => ({ name, months: g.months.size, average: round2(g.total / g.count) }))
    .sort((a, b) => b.average - a.average)
    .slice(0, 5)
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
