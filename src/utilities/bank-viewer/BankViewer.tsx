import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Copy, KeyRound, Landmark, Link2, Lock, LockOpen, RefreshCw, Settings, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../../auth/auth-context'
import { useLang, useT } from '../../i18n/LanguageContext'
import { importPrivateKey, randomBytes, signEnableBankingJwt, toB64 } from './crypto'
import {
  EbError, REDIRECT_URL, eb, guessSalary, normalizeRule, refreshAccount, surplusByMonth,
  type Aspsp, type LinkedAccount, type LinkedSession, type SalaryPayer, type SalaryRule,
} from './model'
import {
  WrongPassword, deleteRow, emptyBook, forgetDeviceKey, getDeviceKey, importDataKey, loadRow, openBook, saveRow,
  sealBook, sealVault, setDeviceKey, unlock, type Book, type Row, type Secret,
} from './store'
import { STR } from './strings'

const PENDING_KEY = 'bank-viewer:pending'
const COUNTRIES = ['BE', 'NL', 'LU', 'FR', 'DE', 'AT', 'ES', 'IT', 'FI', 'SE', 'DK', 'NO', 'PL', 'PT', 'IE']

type Callback = { code: string | null; state: string | null; error: string | null; description: string | null } | null

interface Opened {
  row: Row
  dk: CryptoKey
  book: Book
  secret: Secret | null
}

export function BankViewer() {
  const { user } = useAuth()
  const t = useT(STR)
  const location = useLocation()
  const navigate = useNavigate()
  const [row, setRow] = useState<Row | null | undefined>(undefined)
  const [opened, setOpened] = useState<Opened | null>(null)
  const [loadError, setLoadError] = useState('')
  const [callback] = useState<Callback>(() => {
    const q = new URLSearchParams(location.search)
    return q.has('code') || q.has('error') ? { code: q.get('code'), state: q.get('state'), error: q.get('error'), description: q.get('error_description') } : null
  })

  useEffect(() => {
    if (callback) navigate('/tools/bank-viewer', { replace: true })
  }, [callback, navigate])

  // Load the account row, then try to open the saved data with this device's key.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const loaded = await loadRow()
      if (cancelled) return
      if (loaded?.data) {
        const dk = await getDeviceKey(user.id)
        if (dk) {
          try {
            const book = await openBook(dk, loaded.data)
            if (!cancelled) { setRow(loaded); setOpened({ row: loaded, dk, book, secret: null }) }
            return
          } catch { await forgetDeviceKey(user.id) } // stale key (data was reset elsewhere)
        }
      }
      if (!cancelled) setRow(loaded)
    })().catch((e: Error) => { if (!cancelled) setLoadError(e.message) })
    return () => { cancelled = true }
  }, [user])

  if (!user) return null
  const reset = async () => {
    await deleteRow()
    await forgetDeviceKey(user.id)
    try { localStorage.removeItem(`bank-viewer:cache:${user.id}`) } catch { /* ignore */ }
    setOpened(null)
    setRow(null)
  }
  let body: ReactNode
  if (loadError) body = <p className="text-rose-300">{loadError}</p>
  else if (row === undefined) body = <p className="animate-pulse text-slate-400">{t.loading}</p>
  else if (opened) body = <Dashboard userId={user.id} opened={opened} setOpened={setOpened} callback={callback} onReset={reset} onForget={async () => { await forgetDeviceKey(user.id); setOpened(null) }} />
  else if (!row) body = <Setup userId={user.id} onDone={setOpened} />
  else body = (
    <Card className="mx-auto max-w-md">
      <PasswordForm title={t.unlockTitle} note={callback?.code ? t.unlockToFinish : t.unlockOnce} onPassword={async (password) => {
        const r = await unlock(user.id, password, row)
        await setDeviceKey(user.id, r.dk)
        setOpened({ row: r.row, dk: r.dk, book: r.book, secret: r.secret })
      }} onReset={reset} />
    </Card>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400/25 to-teal-500/20 text-emerald-300 ring-1 ring-emerald-300/20">
            <Landmark className="size-6" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-slate-400">{t.subtitle}</p>
      </header>
      {body}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`glass rounded-2xl p-5 ${className}`}>{children}</section>
}
const input = 'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50'
const primary = 'rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
const secondary = 'glass rounded-xl px-3 py-2 text-sm text-slate-300 hover:text-white disabled:opacity-50'

function CopyRedirect() {
  const t = useT(STR)
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 font-mono text-xs text-emerald-200">
      <span className="min-w-0 flex-1 truncate">{REDIRECT_URL}</span>
      <button type="button" className="no-glow text-slate-400 hover:text-white" aria-label={t.copy}
        onClick={() => { void navigator.clipboard?.writeText(REDIRECT_URL); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
        {copied ? '✓' : <Copy className="size-4" />}
      </button>
    </div>
  )
}

function Setup({ userId, onDone }: { userId: string; onDone: (o: Opened) => void }) {
  const t = useT(STR)
  const [applicationId, setApplicationId] = useState('')
  const [pem, setPem] = useState('')
  const [fileName, setFileName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > 20_000) { setError(t.pemInvalid); return }
    setPem(await file.text()); setFileName(file.name); setError('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError(t.passwordShort)
    if (password !== confirm) return setError(t.passwordMismatch)
    const appId = applicationId.trim()
    if (!/^[A-Za-z0-9-]{8,64}$/.test(appId)) return setError(t.appIdInvalid)
    setBusy(true)
    try {
      let rsaKey: CryptoKey
      try { rsaKey = await importPrivateKey(pem) } catch (cause) { throw new Error(t.pemInvalid, { cause }) }
      // Prove the key + application id work before saving anything.
      try {
        await eb(await signEnableBankingJwt(rsaKey, appId), 'GET', '/application')
      } catch (err) {
        if (err instanceof EbError && (err.status === 401 || err.status === 403 || err.status === 422)) throw new Error(`${t.keyRejected} (${err.message})`, { cause: err })
        if (!(err instanceof EbError) || err.status !== 404) throw err
      }
      const dataKey = toB64(randomBytes(32))
      const dk = await importDataKey(dataKey)
      const data = { applicationId: appId, pem, dataKey }
      const book = emptyBook()
      const row: Row = { vault: await sealVault(password, data), data: await sealBook(dk, book) }
      await saveRow(userId, row)
      await setDeviceKey(userId, dk)
      setPem(''); setPassword(''); setConfirm('')
      onDone({ row, dk, book, secret: { data, rsaKey } })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Card className="space-y-3 text-sm leading-6 text-slate-300">
        <h2 className="text-lg font-semibold text-white">{t.setupStepsTitle}</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>{t.step1} <a className="text-emerald-300 underline" href="https://enablebanking.com/cp/applications" target="_blank" rel="noreferrer">enablebanking.com</a></li>
          <li>{t.step2}<div className="mt-2"><CopyRedirect /></div></li>
          <li>{t.step3}</li>
          <li>{t.step4}</li>
        </ol>
        <p className="flex gap-2 rounded-xl bg-emerald-400/10 p-3 text-emerald-100"><ShieldCheck className="mt-0.5 size-4 shrink-0" /> {t.privacyNote}</p>
      </Card>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <h2 className="text-lg font-semibold">{t.setupTitle}</h2>
          <label className="block space-y-1 text-sm"><span className="text-slate-400">{t.appId}</span>
            <input className={input} value={applicationId} onChange={(e) => setApplicationId(e.target.value)} placeholder="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" autoComplete="off" />
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 px-4 py-4 text-sm text-slate-300 hover:border-emerald-400/40">
            <Upload className="size-5 text-emerald-300" />
            <span className="min-w-0 flex-1 truncate">{fileName || t.pemPick}</span>
            <input type="file" accept=".pem,application/x-pem-file,text/plain" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <label className="block space-y-1 text-sm"><span className="text-slate-400">{t.password}</span>
            <input type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="block space-y-1 text-sm"><span className="text-slate-400">{t.passwordConfirm}</span>
            <input type="password" className={input} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="current-password" />
          </label>
          <p className="text-xs text-slate-500">{t.passwordHint}</p>
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          <button className={primary} disabled={busy || !pem || !applicationId || !password}>{busy ? t.working : t.saveEncrypted}</button>
        </form>
      </Card>
    </div>
  )
}

/** Password entry, used for the first unlock on a device and before refresh/link. */
function PasswordForm({ title, note, onPassword, onCancel, onReset }: {
  title: string; note?: string; onPassword: (password: string) => Promise<void>; onCancel?: () => void; onReset?: () => Promise<void>
}) {
  const t = useT(STR)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await onPassword(password)
    } catch (err) {
      setError(err instanceof WrongPassword ? t.wrongPassword : err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="size-5 text-emerald-300" /> {title}</h2>
      {note && <p className="rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-100">{note}</p>}
      <input type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.password} autoFocus autoComplete="current-password" />
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <div className="flex gap-2">
        <button className={primary} disabled={busy || !password}>{busy ? t.working : t.unlock}</button>
        {onCancel && <button type="button" className={secondary} onClick={onCancel}>{t.cancel}</button>}
      </div>
      {onReset && (
        <div className="border-t border-white/8 pt-3 text-xs text-slate-500">
          {confirmReset ? (
            <span>{t.resetConfirm} <button type="button" className="text-rose-300 underline" onClick={() => void onReset()}>{t.resetYes}</button> · <button type="button" className="underline" onClick={() => setConfirmReset(false)}>{t.cancel}</button></span>
          ) : (
            <button type="button" className="underline hover:text-slate-300" onClick={() => setConfirmReset(true)}>{t.forgot}</button>
          )}
        </div>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------

function Dashboard({ userId, opened, setOpened, callback, onReset, onForget }: {
  userId: string; opened: Opened; setOpened: (o: Opened) => void; callback: Callback; onReset: () => Promise<void>; onForget: () => Promise<void>
}) {
  const t = useT(STR)
  const { locale } = useLang()
  const { book, secret } = opened
  const cache = book.cache
  const [selected, setSelected] = useState<string>(book.sessions[0]?.accounts[0]?.uid || '')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [linking, setLinking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [askFor, setAskFor] = useState<{ note: string; run: (s: Secret) => void } | null>(null)
  const [now] = useState(() => Date.now())
  const jwtRef = useRef<{ token: string; exp: number } | null>(null)
  const handledCallback = useRef(false)

  // Latest state for async work, and a queue so saves land in order.
  const openedRef = useRef(opened)
  useEffect(() => { openedRef.current = opened }, [opened])
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())

  const saveBook = useCallback((next: Book) => {
    const current = openedRef.current
    const updated = { ...current, book: next }
    openedRef.current = updated
    setOpened(updated)
    const job = saveQueue.current.then(async () => {
      const data = await sealBook(current.dk, next)
      await saveRow(userId, { ...openedRef.current.row, data })
      openedRef.current = { ...openedRef.current, row: { ...openedRef.current.row, data } }
    })
    saveQueue.current = job.catch(() => {})
    return job
  }, [setOpened, userId])

  /** Run `fn` with the unlocked key, asking for the password first if needed. */
  const withSecret = useCallback((note: string, fn: (s: Secret) => void) => {
    const s = openedRef.current.secret
    if (s) fn(s)
    else setAskFor({ note, run: fn })
  }, [])

  const jwtFor = useCallback(async (s: Secret) => {
    if (jwtRef.current && jwtRef.current.exp > Date.now() + 60_000) return jwtRef.current.token
    const token = await signEnableBankingJwt(s.rsaKey, s.data.applicationId)
    jwtRef.current = { token, exp: Date.now() + 3_500_000 }
    return token
  }, [])

  function lock() {
    jwtRef.current = null
    setLinking(false)
    setOpened({ ...openedRef.current, secret: null })
  }

  const [progress, setProgress] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const refresh = useCallback(async (s: Secret, accounts: LinkedAccount[]) => {
    const controller = new AbortController()
    abortRef.current = controller
    setBusy('refresh'); setError('')
    const failures: string[] = []
    try {
      const token = await jwtFor(s)
      for (const [i, acc] of accounts.entries()) {
        if (controller.signal.aborted) break
        const label = `${acc.name || acc.iban || acc.uid.slice(0, 8)} (${i + 1}/${accounts.length})`
        try {
          const data = await refreshAccount(token, acc.uid, openedRef.current.book.cache[acc.uid], ({ step, page, count }) => {
            setProgress(step === 'balance' ? `${label}: ${t.progressBalance}` : `${label}: ${t.progressTx} ${page} · ${count} ${t.progressSoFar}`)
          }, controller.signal)
          // Save each account as soon as it is done, so a later failure keeps it.
          const b = openedRef.current.book
          await saveBook({ ...b, cache: { ...b.cache, [acc.uid]: data } })
        } catch (err) {
          if (controller.signal.aborted) break
          failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err))
    } finally {
      if (failures.length) setError(failures.join('\n'))
      abortRef.current = null
      setProgress('')
      setBusy('')
    }
  }, [jwtFor, saveBook, t])

  // Finish a bank login that came back through /eb-callback.
  useEffect(() => {
    if (!callback || handledCallback.current) return
    handledCallback.current = true
    void (async () => {
      let pending: { state: string; aspsp: { name: string; country: string } } | null = null
      try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null') } catch { /* ignore */ }
      try { sessionStorage.removeItem(PENDING_KEY) } catch { /* ignore */ }
      if (callback.error) { setError(`${t.bankError}: ${callback.description || callback.error}`); return }
      if (!callback.code || !pending || pending.state !== callback.state) { setError(t.stateMismatch); return }
      const code = callback.code
      const aspsp = pending.aspsp
      withSecret(t.unlockToFinish, (s) => void (async () => {
        setBusy('link')
        try {
          const res = await eb<{
            session_id: string
            access?: { valid_until?: string }
            aspsp?: { name: string; country: string }
            accounts?: ({ uid?: string; account_id?: { iban?: string }; name?: string; currency?: string } | string)[]
          }>(await jwtFor(s), 'POST', '/sessions', { code })
          const accounts: LinkedAccount[] = (res.accounts || []).flatMap((a) => {
            if (typeof a === 'string') return [{ uid: a }]
            return a.uid ? [{ uid: a.uid, iban: a.account_id?.iban, name: a.name, currency: a.currency }] : []
          })
          const linked: LinkedSession = { sessionId: res.session_id, aspsp: res.aspsp || aspsp, validUntil: res.access?.valid_until || '', accounts }
          const b = openedRef.current.book
          await saveBook({ ...b, sessions: [...b.sessions, linked] })
          if (accounts[0]) setSelected(accounts[0].uid)
          setBusy('')
          await refresh(s, accounts)
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
          setBusy('')
        }
      })())
    })()
  }, [callback, jwtFor, refresh, saveBook, t, withSecret])

  function unlink(s: LinkedSession) {
    if (!confirm(t.unlinkConfirm)) return
    withSecret(t.unlockToChange, (secretNow) => void (async () => {
      try { await eb(await jwtFor(secretNow), 'DELETE', `/sessions/${encodeURIComponent(s.sessionId)}`) } catch { /* already gone */ }
      const b = openedRef.current.book
      const nextCache = { ...b.cache }
      for (const a of s.accounts) delete nextCache[a.uid]
      await saveBook({ ...b, sessions: b.sessions.filter((x) => x.sessionId !== s.sessionId), cache: nextCache }).catch((e: Error) => setError(e.message))
    })())
  }

  const linkJwt = useCallback(() => (secret ? jwtFor(secret) : Promise.reject(new Error('locked'))), [jwtFor, secret])

  const allAccounts = book.sessions.flatMap((s) => s.accounts.map((a) => ({ ...a, session: s })))
  const current = allAccounts.find((a) => a.uid === selected) || allAccounts[0]
  const data = current ? cache[current.uid] : undefined
  const rule = useMemo(() => normalizeRule(current && book.salary[current.uid]), [current, book.salary])
  const money = (n: number | null | undefined, currency = data?.currency || 'EUR') =>
    n === null || n === undefined ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n)
  const date = (d: string) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  const months = useMemo(() => (data ? surplusByMonth(data, rule) : []), [data, rule])
  const guesses = useMemo(() => (data ? guessSalary(data.transactions) : []), [data])
  const recent = months.filter((m) => !m.partial).slice(-6)
  const average = recent.length ? recent.reduce((s, m) => s + m.surplus, 0) / recent.length : null

  // Salary rules are part of the data box: editable while locked, saved debounced.
  const salaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function setPayers(payers: SalaryPayer[]) {
    saveRule({ ...rule, payers })
  }
  function saveRule(nextRule: SalaryRule) {
    if (!current) return
    const b = openedRef.current.book
    const next = { ...b, salary: { ...b.salary, [current.uid]: nextRule } }
    const updated = { ...openedRef.current, book: next }
    openedRef.current = updated
    setOpened(updated)
    if (salaryTimer.current) clearTimeout(salaryTimer.current)
    salaryTimer.current = setTimeout(() => { void saveBook(openedRef.current.book).catch((e: Error) => setError(e.message)) }, 800)
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="whitespace-pre-line rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">{t.accounts}</h2>
          {secret ? (
            <button className={secondary} onClick={lock} title={t.lockHelp}><LockOpen className="inline size-4" /> {t.lock}</button>
          ) : (
            <span className="flex items-center gap-1 text-xs text-slate-500" title={t.lockedHelp}><Lock className="size-3.5" /> {t.locked}</span>
          )}
          <button className={secondary} onClick={() => setShowSettings((v) => !v)}><Settings className="inline size-4" /> {t.settings}</button>
          <button className={secondary} disabled={!!busy || !allAccounts.length} onClick={() => withSecret(t.unlockToRefresh, (s) => void refresh(s, allAccounts))}>
            <RefreshCw className={`inline size-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> {t.refresh}
          </button>
          <button className={primary} disabled={!!busy} onClick={() => (linking ? setLinking(false) : withSecret(t.unlockToLink, () => setLinking(true)))}><Link2 className="inline size-4" /> {t.linkBank}</button>
        </div>
        {askFor && (
          <div className="max-w-md rounded-xl border border-emerald-400/20 p-4">
            <PasswordForm title={t.unlockTitle} note={askFor.note} onCancel={() => setAskFor(null)} onPassword={async (password) => {
              const r = await unlock(userId, password, openedRef.current.row)
              const updated = { ...openedRef.current, secret: r.secret }
              openedRef.current = updated
              setOpened(updated)
              const run = askFor.run
              setAskFor(null)
              run(r.secret)
            }} />
          </div>
        )}
        {busy === 'link' && <p className="animate-pulse text-sm text-slate-400">{t.linking}</p>}
        {busy === 'refresh' && (
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="animate-pulse">{progress || t.working}</span>
            <button className="no-glow text-xs underline hover:text-white" onClick={() => abortRef.current?.abort()}>{t.cancel}</button>
          </div>
        )}
        {linking && secret && <LinkBank jwt={linkJwt} onError={setError} />}
        {showSettings && <SettingsPanel userId={userId} opened={opened} withSecret={withSecret} setOpened={(o) => { openedRef.current = o; setOpened(o) }} onReset={onReset} onForget={onForget} />}
        {!allAccounts.length && !linking && <p className="text-sm text-slate-400">{t.noAccounts}</p>}
        <div className="space-y-3">
          {book.sessions.map((s) => {
            const expired = s.validUntil && new Date(s.validUntil).getTime() < now
            return (
              <div key={s.sessionId} className="rounded-xl border border-white/8 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{s.aspsp.name}</span>
                  <span className={`text-xs ${expired ? 'text-amber-300' : 'text-slate-500'}`}>
                    {s.validUntil ? (expired ? t.expired : `${t.validUntil} ${date(s.validUntil)}`) : ''}
                  </span>
                  <button className="no-glow ml-auto text-slate-500 hover:text-rose-300" onClick={() => void unlink(s)} aria-label={t.unlink}><Trash2 className="size-4" /></button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.accounts.map((a) => (
                    <button key={a.uid} onClick={() => setSelected(a.uid)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs ${current?.uid === a.uid ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 hover:border-white/25'}`}>
                      <span className="block font-medium text-white">{a.name || a.iban || a.uid.slice(0, 8)}</span>
                      <span className="block text-slate-400">{a.iban || ''} {cache[a.uid] ? `· ${money(cache[a.uid].balance, cache[a.uid].currency)}` : ''}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {current && data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={t.balance} value={money(data.balance)} sub={data.balanceDate ? `${t.on} ${date(data.balanceDate)}` : `${t.fetched} ${date(data.fetchedAt)}`} />
            <Stat label={t.lastSurplus} value={months.length ? money(months[months.length - 1].surplus) : '—'} sub={!rule.payers.length ? t.setSalary : months.length ? `${new Date(months[months.length - 1].monthStart).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}${months[months.length - 1].partial ? `, ${t.soFar}` : ''}` : ''} accent />
            <Stat label={t.avgSurplus} value={average === null ? '—' : money(average)} sub={recent.length ? `${recent.length} ${t.months}` : ''} />
          </div>

          <Card className="space-y-4">
            <h2 className="text-lg font-semibold">{t.salaryTitle}</h2>
            <p className="text-sm text-slate-400">{t.salaryHelp}</p>
            <div className="space-y-2">
              {rule.payers.length > 0 && (
                <div className="hidden grid-cols-[2fr_1fr_2rem] gap-3 text-xs text-slate-500 sm:grid">
                  <span>{t.salaryMatch}</span><span>{t.minAmount}</span><span />
                </div>
              )}
              {rule.payers.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_7rem_2rem] items-center gap-2 sm:grid-cols-[2fr_1fr_2rem] sm:gap-3">
                  <input className={input} value={p.match} placeholder={t.salaryMatchPh} aria-label={t.salaryMatch}
                    onChange={(e) => setPayers(rule.payers.map((x, j) => (j === i ? { ...x, match: e.target.value } : x)))} />
                  <input type="number" min={0} className={input} value={p.minAmount} aria-label={t.minAmount}
                    onChange={(e) => setPayers(rule.payers.map((x, j) => (j === i ? { ...x, minAmount: Number(e.target.value) || 0 } : x)))} />
                  <button className="no-glow text-slate-500 hover:text-rose-300" aria-label={t.removePayer}
                    onClick={() => setPayers(rule.payers.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <button className={secondary} onClick={() => setPayers([...rule.payers, { match: '', minAmount: 500 }])}>+ {t.addPayer}</button>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  {t.windowBefore}
                  <input type="number" min={0} max={25} className={`${input} w-16`} value={rule.windowDays}
                    onChange={(e) => saveRule({ ...rule, windowDays: Math.max(0, Math.min(25, Number(e.target.value) || 0)) })} />
                  {t.windowAfter}
                </label>
              </div>
            </div>
            {guesses.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">{t.suggestions}</span>
                {guesses.filter((g) => !rule.payers.some((p) => p.match.trim().toLowerCase() === g.name.toLowerCase())).map((g) => (
                  <button key={g.name} onClick={() => setPayers([...rule.payers.filter((p) => p.match.trim()), { match: g.name, minAmount: Math.floor(g.average * 0.5) }])}
                    className="rounded-full border border-white/10 px-3 py-1 hover:border-emerald-400/50">
                    {g.name} · ~{money(g.average)} · {g.months}×
                  </button>
                ))}
              </div>
            )}
          </Card>

          {months.length > 0 && (
            <Card className="space-y-4">
              <h2 className="text-lg font-semibold">{t.perMonth}</h2>
              <SurplusChart months={months} money={money} locale={locale} />
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">{t.salaryDate}</th><th>{t.endBalance}</th><th>{t.salary}</th><th className="text-right">{t.surplus}</th></tr></thead>
                <tbody>
                  {[...months].reverse().map((m) => (
                    <tr key={m.monthStart} className="border-t border-white/5">
                      <td className="py-2">{new Date(m.monthStart).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}{m.partial && <span className="text-xs text-slate-500"> ({t.soFar})</span>}</td>
                      <td className="text-slate-400">{money(m.endBalance)}</td>
                      <td className="text-slate-400">{m.salary ? `− ${money(m.salary)}` : '—'}{m.payments > 1 && <span className="text-xs text-slate-500"> ({m.payments}×)</span>}</td>
                      <td className={`text-right font-semibold ${m.surplus < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{money(m.surplus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-500">{t.historyNote} {data.oldest ? date(data.oldest) : ''}.</p>
            </Card>
          )}

          <Card>
            <h2 className="mb-3 text-lg font-semibold">{t.recent}</h2>
            <ul className="divide-y divide-white/5 text-sm">
              {[...data.transactions].reverse().slice(0, 40).map((tx, i) => (
                <li key={i} className="flex items-center gap-3 py-2">
                  <span className="w-24 shrink-0 text-xs text-slate-500">{date(tx.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{tx.counterparty || tx.text || '—'}<span className="block truncate text-xs text-slate-500">{tx.counterparty ? tx.text : ''}</span></span>
                  <span className={`shrink-0 font-mono ${tx.amount < 0 ? 'text-slate-300' : 'text-emerald-300'}`}>{money(tx.amount, tx.currency)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
      {current && !data && <p className="text-sm text-slate-400">{t.pressRefresh}</p>}
    </div>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-emerald-300' : ''}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  )
}

function SurplusChart({ months, money, locale }: { months: { monthStart: string; surplus: number }[]; money: (n: number) => string; locale: string }) {
  const shown = months.slice(-12)
  const max = Math.max(1, ...shown.map((m) => Math.abs(m.surplus)))
  const hasNeg = shown.some((m) => m.surplus < 0)
  const h = 160, zero = hasNeg ? h / 2 : h
  const scale = (hasNeg ? h / 2 : h) - 8
  const w = 100 / shown.length
  return (
    <svg viewBox={`0 0 100 ${h + 18}`} preserveAspectRatio="none" className="h-56 w-full" role="img" aria-label="Surplus per month">
      {shown.map((m, i) => {
        const bh = (Math.abs(m.surplus) / max) * scale
        const y = m.surplus >= 0 ? zero - bh : zero
        return (
          <g key={m.monthStart}>
            <title>{`${m.monthStart.slice(0, 7)}: ${money(m.surplus)}`}</title>
            <rect x={i * w + w * 0.18} y={y} width={w * 0.64} height={Math.max(bh, 0.5)} rx={0.8} className={m.surplus >= 0 ? 'fill-emerald-400/70' : 'fill-rose-400/70'} />
            <text x={i * w + w / 2} y={h + 14} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 4 }}>
              {new Date(m.monthStart).toLocaleDateString(locale, { month: 'short' })}
            </text>
          </g>
        )
      })}
      <line x1={0} x2={100} y1={zero} y2={zero} className="stroke-white/15" strokeWidth={0.3} />
    </svg>
  )
}

/** Ask Enable Banking for a read-only (AIS) bank login and go there. */
async function startBankLogin(token: string, bank: Aspsp) {
  const maxSeconds = Math.min(bank.maximum_consent_validity || 180 * 86400, 180 * 86400)
  const validUntil = new Date(Date.now() + (maxSeconds - 3600) * 1000).toISOString()
  const state = crypto.randomUUID()
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ state, aspsp: { name: bank.name, country: bank.country } })) } catch { /* ignore */ }
  const r = await eb<{ url: string }>(token, 'POST', '/auth', {
    access: { valid_until: validUntil },
    aspsp: { name: bank.name, country: bank.country },
    state,
    redirect_url: REDIRECT_URL,
    psu_type: 'personal',
  })
  window.location.assign(r.url)
}

function LinkBank({ jwt, onError }: { jwt: () => Promise<string>; onError: (m: string) => void }) {
  const t = useT(STR)
  const [country, setCountry] = useState('BE')
  const [loaded, setLoaded] = useState<{ country: string; list: Aspsp[] } | null>(null)
  const banks = loaded?.country === country ? loaded.list : null
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    jwt()
      .then((token) => eb<{ aspsps: Aspsp[] }>(token, 'GET', `/aspsps?country=${country}&psu_type=personal`))
      .then((r) => { if (!cancelled) setLoaded({ country, list: r.aspsps || [] }) }, (e: Error) => { if (!cancelled) { setLoaded({ country, list: [] }); onError(e.message) } })
    return () => { cancelled = true }
  }, [country, jwt, onError])

  async function start(bank: Aspsp) {
    setBusy(true)
    try {
      await startBankLogin(await jwt(), bank)
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const list = (banks || []).filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="space-y-3 rounded-xl border border-white/8 p-3">
      <p className="text-xs text-slate-400">{t.linkHelp}</p>
      <div className="flex gap-2">
        <select className={`${input} w-24`} value={country} onChange={(e) => setCountry(e.target.value)}>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className={input} placeholder={t.searchBank} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {banks === null ? <p className="animate-pulse text-sm text-slate-400">{t.loading}</p> : (
        <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
          {list.map((b) => (
            <button key={`${b.country}-${b.name}`} disabled={busy} onClick={() => void start(b)} className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2 text-left text-sm hover:border-emerald-400/50 disabled:opacity-50">
              {b.logo ? <img src={b.logo} alt="" className="size-6 rounded bg-white object-contain" /> : <Landmark className="size-5 text-slate-500" />}
              <span className="truncate">{b.name}</span>
            </button>
          ))}
          {!list.length && <p className="text-sm text-slate-500">{t.noBanks}</p>}
        </div>
      )}
    </div>
  )
}

function SettingsPanel({ userId, opened, setOpened, withSecret, onReset, onForget }: {
  userId: string; opened: Opened; setOpened: (o: Opened) => void; withSecret: (note: string, fn: (s: Secret) => void) => void
  onReset: () => Promise<void>; onForget: () => Promise<void>
}) {
  const t = useT(STR)
  const [password, setPassword] = useState('')
  const [confirm2, setConfirm2] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  function changePassword(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setMsg(t.passwordShort)
    if (password !== confirm2) return setMsg(t.passwordMismatch)
    withSecret(t.unlockToChange, (s) => void (async () => {
      setBusy(true)
      try {
        // Only the password-sealed part changes; saved data keeps its data key.
        const row = { ...opened.row, vault: await sealVault(password, s.data) }
        await saveRow(userId, row)
        setOpened({ ...opened, row, secret: s })
        setPassword(''); setConfirm2(''); setMsg(t.passwordChanged)
      } catch (err) {
        setMsg(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    })())
  }

  async function deleteAll() {
    if (!window.confirm(t.deleteConfirm)) return
    try { await onReset() } catch (err) { setMsg(err instanceof Error ? err.message : String(err)) }
  }

  return (
    <div className="grid gap-4 rounded-xl border border-white/8 p-4 sm:grid-cols-3">
      <form onSubmit={changePassword} className="space-y-2">
        <h3 className="text-sm font-semibold">{t.changePassword}</h3>
        <p className="text-xs text-slate-500">{t.changePasswordHelp}</p>
        <input type="password" className={input} placeholder={t.newPassword} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <input type="password" className={input} placeholder={t.passwordConfirm} value={confirm2} onChange={(e) => setConfirm2(e.target.value)} autoComplete="new-password" />
        <button className={secondary} disabled={busy || !password}>{busy ? t.working : t.save}</button>
        {msg && <p className="text-xs text-slate-300">{msg}</p>}
      </form>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t.forgetDevice}</h3>
        <p className="text-xs text-slate-500">{t.forgetDeviceHelp}</p>
        <button className={secondary} onClick={() => void onForget()}>{t.forgetDevice}</button>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t.dangerZone}</h3>
        <p className="text-xs text-slate-500">{t.deleteHelp}</p>
        <button className="rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/25" onClick={() => void deleteAll()}>
          <Trash2 className="inline size-4" /> {t.deleteVault}
        </button>
      </div>
    </div>
  )
}
