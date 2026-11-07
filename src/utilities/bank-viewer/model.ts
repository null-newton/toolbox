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
export interface SalaryRule {
  match: string
  minAmount: number
}
export interface Vault {
  applicationId: string
  pem: string
  sessions: LinkedSession[]
  salary: Record<string, SalaryRule> // per account uid
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

export async function eb<T>(jwt: string, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await backendFetch(`${functionsBase}/enable-banking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-eb-jwt': jwt },
    body: JSON.stringify({ method, path, body }),
  })
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

async function fetchTransactions(jwt: string, uid: string, dateFrom: string): Promise<Tx[]> {
  const out: Tx[] = []
  let key: string | undefined
  for (let page = 0; page < 60; page++) {
    const q = new URLSearchParams({ date_from: dateFrom, transaction_status: 'BOOK' })
    if (key) q.set('continuation_key', key)
    const data = await eb<{ transactions?: RawTx[]; continuation_key?: string | null }>(jwt, 'GET', `/accounts/${encodeURIComponent(uid)}/transactions?${q}`)
    for (const raw of data.transactions || []) {
      const tx = normalizeTx(raw)
      if (tx) out.push(tx)
    }
    key = data.continuation_key || undefined
    if (!key) break
  }
  return out
}

/** Fetch balance + new transactions and merge them into the cached history. */
export async function refreshAccount(jwt: string, uid: string, previous?: AccountData): Promise<AccountData> {
  const bal = await eb<{ balances?: { balance_amount: { amount: string; currency: string }; balance_type?: string; reference_date?: string }[] }>(
    jwt, 'GET', `/accounts/${encodeURIComponent(uid)}/balances`
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
    fresh = await fetchTransactions(jwt, uid, from)
  } else {
    try {
      from = daysAgo(400)
      fresh = await fetchTransactions(jwt, uid, from)
    } catch (e) {
      if (!(e instanceof EbError) || e.status >= 500) throw e
      from = daysAgo(89)
      fresh = await fetchTransactions(jwt, uid, from)
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
  salaryDate: string
  salaryAmount: number
  surplus: number // balance at the end of the day before salary arrived
}

export function isSalary(tx: Tx, rule: SalaryRule): boolean {
  const needle = rule.match.trim().toLowerCase()
  if (!needle || tx.amount <= 0 || tx.amount < rule.minAmount) return false
  return `${tx.counterparty} ${tx.text}`.toLowerCase().includes(needle)
}

/**
 * For each month, take the first salary booking and work backwards from the
 * known balance: surplus = balance − Σ(all bookings from the salary day up to
 * the balance date). That is the balance at the end of the day before pay.
 */
export function surplusByMonth(data: AccountData, rule: SalaryRule): MonthSurplus[] {
  if (data.balance === null) return []
  const ref = data.balanceDate || isoDate(new Date())
  const txs = data.transactions.filter((t) => t.date <= ref)
  const firstPerMonth = new Map<string, Tx>()
  for (const t of txs) if (isSalary(t, rule) && !firstPerMonth.has(t.date.slice(0, 7))) firstPerMonth.set(t.date.slice(0, 7), t)
  return [...firstPerMonth.values()].map((salary) => {
    const after = txs.filter((t) => t.date >= salary.date).reduce((s, t) => s + t.amount, 0)
    return { salaryDate: salary.date, salaryAmount: salary.amount, surplus: round2(data.balance! - after) }
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

function round2(n: number) {
  return Math.round(n * 100) / 100
}
