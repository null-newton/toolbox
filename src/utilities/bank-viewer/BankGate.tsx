// Shared entry for tools that read Bank Viewer's saved data (Subscription Radar, Expenses).
import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../auth/auth-context'
import { useT } from '../../i18n/LanguageContext'
import { ToolHeader } from '../../components/ToolHeader'
import { loadPrefs } from './shared'
import { WrongPassword, forgetDeviceKey, getDeviceKey, loadRow, openBook, setDeviceKey, unlock, type Book, type Row } from './store'

export interface Opened<P> { userId: string; dk: CryptoKey; book: Book; prefs: P }

const STR = {
  en: {
    loading: 'Loading…', working: 'Working…', openBank: 'Open Bank Viewer',
    noBank: 'This tool reads the transactions you load in Bank Viewer. Set up Bank Viewer and link a bank first.',
    noData: 'No transactions yet. Open Bank Viewer and press Refresh to load them.',
    unlockTitle: 'Unlock your bank data', unlockNote: 'This device has not opened your Bank Viewer data yet. Enter your Bank Viewer password once.',
    password: 'Password', unlock: 'Unlock', wrongPassword: 'Wrong password.',
  },
  nl: {
    loading: 'Laden…', working: 'Bezig…', openBank: 'Bank Viewer openen',
    noBank: 'Deze tool leest de verrichtingen die je in Bank Viewer laadt. Stel eerst Bank Viewer in en koppel een bank.',
    noData: 'Nog geen verrichtingen. Open Bank Viewer en druk op Vernieuwen om ze te laden.',
    unlockTitle: 'Je bankgegevens ontgrendelen', unlockNote: 'Dit toestel heeft je Bank Viewer-gegevens nog niet geopend. Geef één keer je Bank Viewer-wachtwoord in.',
    password: 'Wachtwoord', unlock: 'Ontgrendelen', wrongPassword: 'Verkeerd wachtwoord.',
  },
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => <section className={`glass rounded-2xl p-5 ${className}`}>{children}</section>
const input = 'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50'
export function BankLink() {
  const t = useT(STR)
  return <Link to="/tools/bank-viewer" className="inline-block rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white">{t.openBank}</Link>
}
export function NoData() {
  const t = useT(STR)
  return <Card className="max-w-lg space-y-3 text-sm text-slate-300"><p>{t.noData}</p><BankLink /></Card>
}

// Opens Bank Viewer's data with this device's key (or the password once) and the tool's own sealed prefs.
export function BankGate<P>({ appId, title, intro, fallback, children }: { appId: string; title: string; intro: string; fallback: P; children: (o: Opened<P>) => ReactNode }) {
  const { user } = useAuth()
  const t = useT(STR)
  const [row, setRow] = useState<Row | null | undefined>(undefined)
  const [opened, setOpened] = useState<Opened<P> | null>(null)
  const [error, setError] = useState('')
  const [fb] = useState(fallback)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const loaded = await loadRow()
      const dk = loaded?.data ? await getDeviceKey(user.id) : null
      if (loaded?.data && dk) {
        try {
          const [book, prefs] = await Promise.all([openBook(dk, loaded.data), loadPrefs(appId, dk, fb)])
          if (!cancelled) { setRow(loaded); setOpened({ userId: user.id, dk, book, prefs }) }
          return
        } catch { await forgetDeviceKey(user.id) }
      }
      if (!cancelled) setRow(loaded)
    })().catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [user, appId, fb])

  if (!user) return null
  let body: ReactNode
  if (error) body = <p className="text-rose-300">{error}</p>
  else if (row === undefined) body = <p className="animate-pulse text-slate-400">{t.loading}</p>
  else if (opened) body = children(opened)
  else if (!row) body = <Card className="max-w-lg space-y-3 text-sm text-slate-300"><p>{t.noBank}</p><BankLink /></Card>
  else body = <Card className="mx-auto max-w-md"><Unlock onPassword={async (pw) => {
    const r = await unlock(user.id, pw, row)
    await setDeviceKey(user.id, r.dk)
    setOpened({ userId: user.id, dk: r.dk, book: r.book, prefs: await loadPrefs(appId, r.dk, fb) })
  }} /></Card>
  return <div className="space-y-6"><ToolHeader title={title} intro={intro} />{body}</div>
}

function Unlock({ onPassword }: { onPassword: (pw: string) => Promise<void> }) {
  const t = useT(STR)
  const [pw, setPw] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try { await onPassword(pw) } catch (x) { setErr(x instanceof WrongPassword ? t.wrongPassword : x instanceof Error ? x.message : String(x)); setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="size-5 text-emerald-300" /> {t.unlockTitle}</h2>
      <p className="rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-100">{t.unlockNote}</p>
      <input type="password" className={input} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t.password} autoFocus autoComplete="current-password" />
      {err && <p role="alert" className="text-sm text-rose-300">{err}</p>}
      <button className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !pw}>{busy ? t.working : t.unlock}</button>
    </form>
  )
}
