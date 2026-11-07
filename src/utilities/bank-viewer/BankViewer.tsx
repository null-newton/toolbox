import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Copy, KeyRound, Landmark, Link2, Lock, RefreshCw, Settings, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../../auth/auth-context'
import { useLang, useT } from '../../i18n/LanguageContext'
import { supabase } from '../../lib/supabase'
import {
  PBKDF2_ITERATIONS, deriveKey, fromB64, importPrivateKey, open, randomBytes, seal, signEnableBankingJwt,
  type SealedBox,
} from './crypto'
import {
  EbError, REDIRECT_URL, eb, guessSalary, refreshAccount, surplusByMonth,
  type Aspsp, type Cache, type LinkedAccount, type LinkedSession, type SalaryRule, type Vault,
} from './model'
import { STR } from './strings'

const APP_ID = 'bank-viewer'
const PENDING_KEY = 'bank-viewer:pending'
const COUNTRIES = ['BE', 'NL', 'LU', 'FR', 'DE', 'AT', 'ES', 'IT', 'FI', 'SE', 'DK', 'NO', 'PL', 'PT', 'IE']
const DEFAULT_RULE: SalaryRule = { match: '', minAmount: 500 }

interface Unlocked {
  aesKey: CryptoKey
  salt: Uint8Array<ArrayBuffer>
  iterations: number
  vault: Vault
  rsaKey: CryptoKey
}

const cacheKey = (userId: string) => `bank-viewer:cache:${userId}`
function readLocal(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeLocal(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

async function loadBox(): Promise<SealedBox | null> {
  const { data, error } = await supabase.from('utility_configs').select('config').eq('utility_id', APP_ID).maybeSingle()
  if (error) throw new Error(error.message)
  return ((data?.config as { vault?: SealedBox } | undefined)?.vault) ?? null
}
async function saveBox(userId: string, box: SealedBox) {
  const { error } = await supabase.from('utility_configs').upsert(
    { user_id: userId, utility_id: APP_ID, config: { vault: box } },
    { onConflict: 'user_id,utility_id' }
  )
  if (error) throw new Error(error.message)
}

export function BankViewer() {
  const { user } = useAuth()
  const t = useT(STR)
  const location = useLocation()
  const navigate = useNavigate()
  const [box, setBox] = useState<SealedBox | null | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  const [session, setSession] = useState<Unlocked | null>(null)
  const [callback] = useState(() => {
    const q = new URLSearchParams(location.search)
    return q.has('code') || q.has('error') ? { code: q.get('code'), state: q.get('state'), error: q.get('error'), description: q.get('error_description') } : null
  })

  useEffect(() => {
    if (callback) navigate('/tools/bank-viewer', { replace: true })
  }, [callback, navigate])

  useEffect(() => {
    if (!user) return
    loadBox().then(setBox, (e: Error) => setLoadError(e.message))
  }, [user])

  if (!user) return null
  let body: ReactNode
  if (loadError) body = <p className="text-rose-300">{loadError}</p>
  else if (box === undefined) body = <p className="animate-pulse text-slate-400">{t.loading}</p>
  else if (!session && !box) body = <Setup userId={user.id} onDone={(s, b) => { setBox(b); setSession(s) }} />
  else if (!session && box) body = <Unlock box={box} pendingCallback={!!callback?.code} onUnlocked={setSession} onReset={async () => {
    await supabase.from('utility_configs').delete().eq('utility_id', APP_ID)
    writeLocal(cacheKey(user.id), null)
    setBox(null)
  }} />
  else body = <Dashboard userId={user.id} session={session!} setSession={setSession} callback={callback} onDeleted={() => { setSession(null); setBox(null) }} />

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400/25 to-teal-500/20 text-emerald-300 ring-1 ring-emerald-300/20">
              <Landmark className="size-6" />
            </span>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-400">{t.subtitle}</p>
        </div>
        {session && (
          <button onClick={() => setSession(null)} className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 hover:text-white">
            <Lock className="size-4" /> {t.lock}
          </button>
        )}
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

function Setup({ userId, onDone }: { userId: string; onDone: (s: Unlocked, b: SealedBox) => void }) {
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
      const salt = randomBytes(16)
      const aesKey = await deriveKey(password, salt)
      const vault: Vault = { applicationId: appId, pem, sessions: [], salary: {} }
      const sealed = await seal(aesKey, salt, PBKDF2_ITERATIONS, vault)
      await saveBox(userId, sealed)
      setPem(''); setPassword(''); setConfirm('')
      onDone({ aesKey, salt, iterations: PBKDF2_ITERATIONS, vault, rsaKey }, sealed)
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

function Unlock({ box, pendingCallback, onUnlocked, onReset }: { box: SealedBox; pendingCallback: boolean; onUnlocked: (s: Unlocked) => void; onReset: () => Promise<void> }) {
  const t = useT(STR)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const salt = fromB64(box.salt)
      const aesKey = await deriveKey(password, salt, box.iterations)
      let vault: Vault
      try { vault = await open<Vault>(aesKey, box) } catch (cause) { throw new Error(t.wrongPassword, { cause }) }
      vault.salary ||= {}
      const rsaKey = await importPrivateKey(vault.pem)
      setPassword('')
      onUnlocked({ aesKey, salt, iterations: box.iterations, vault, rsaKey })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <form onSubmit={submit} className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="size-5 text-emerald-300" /> {t.unlockTitle}</h2>
        {pendingCallback && <p className="rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-100">{t.unlockToFinish}</p>}
        <input type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.password} autoFocus autoComplete="current-password" />
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <button className={primary} disabled={busy || !password}>{busy ? t.working : t.unlock}</button>
        <div className="border-t border-white/8 pt-3 text-xs text-slate-500">
          {confirmReset ? (
            <span>{t.resetConfirm} <button type="button" className="text-rose-300 underline" onClick={() => void onReset()}>{t.resetYes}</button> · <button type="button" className="underline" onClick={() => setConfirmReset(false)}>{t.cancel}</button></span>
          ) : (
            <button type="button" className="underline hover:text-slate-300" onClick={() => setConfirmReset(true)}>{t.forgot}</button>
          )}
        </div>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------

type Callback = { code: string | null; state: string | null; error: string | null; description: string | null } | null

function Dashboard({ userId, session, setSession, callback, onDeleted }: {
  userId: string; session: Unlocked; setSession: (s: Unlocked) => void; callback: Callback; onDeleted: () => void
}) {
  const t = useT(STR)
  const { locale } = useLang()
  const { vault } = session
  const [cache, setCache] = useState<Cache>({})
  const [selected, setSelected] = useState<string>(vault.sessions[0]?.accounts[0]?.uid || '')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [linking, setLinking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [now] = useState(() => Date.now())
  const jwtRef = useRef<{ token: string; exp: number } | null>(null)
  const handledCallback = useRef(false)

  const jwt = useCallback(async () => {
    if (jwtRef.current && jwtRef.current.exp > Date.now() + 60_000) return jwtRef.current.token
    const token = await signEnableBankingJwt(session.rsaKey, vault.applicationId)
    jwtRef.current = { token, exp: Date.now() + 3_500_000 }
    return token
  }, [session.rsaKey, vault.applicationId])

  const saveVault = useCallback(async (next: Vault) => {
    await saveBox(userId, await seal(session.aesKey, session.salt, session.iterations, next))
    setSession({ ...session, vault: next })
  }, [session, setSession, userId])

  const cacheRef = useRef<Cache>({})
  const saveCache = useCallback(async (next: Cache) => {
    cacheRef.current = next
    setCache(next)
    writeLocal(cacheKey(userId), JSON.stringify(await seal(session.aesKey, session.salt, session.iterations, next)))
  }, [session, userId])

  // Load the encrypted local cache.
  useEffect(() => {
    const raw = readLocal(cacheKey(userId))
    if (!raw) return
    open<Cache>(session.aesKey, JSON.parse(raw)).then((c) => { cacheRef.current = c; setCache(c) }, () => writeLocal(cacheKey(userId), null))
  }, [session.aesKey, userId])

  const refresh = useCallback(async (accounts: LinkedAccount[]) => {
    setBusy('refresh'); setError('')
    let next = { ...cacheRef.current }
    try {
      const token = await jwt()
      for (const acc of accounts) {
        next = { ...next, [acc.uid]: await refreshAccount(token, acc.uid, next[acc.uid]) }
      }
      await saveCache(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      if (Object.keys(next).length) await saveCache(next)
    } finally {
      setBusy('')
    }
  }, [jwt, saveCache])

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
      setBusy('link')
      try {
        const res = await eb<{
          session_id: string
          access?: { valid_until?: string }
          aspsp?: { name: string; country: string }
          accounts?: ({ uid?: string; account_id?: { iban?: string }; name?: string; currency?: string } | string)[]
        }>(await jwt(), 'POST', '/sessions', { code })
        const accounts: LinkedAccount[] = (res.accounts || []).flatMap((a) => {
          if (typeof a === 'string') return [{ uid: a }]
          return a.uid ? [{ uid: a.uid, iban: a.account_id?.iban, name: a.name, currency: a.currency }] : []
        })
        const linked: LinkedSession = {
          sessionId: res.session_id,
          aspsp: res.aspsp || pending!.aspsp,
          validUntil: res.access?.valid_until || '',
          accounts,
        }
        const next = { ...vault, sessions: [...vault.sessions, linked] }
        await saveVault(next)
        if (accounts[0]) setSelected(accounts[0].uid)
        setBusy('')
        await refresh(accounts)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setBusy('')
      }
    })()
  }, [callback, jwt, refresh, saveVault, t, vault])

  async function unlink(s: LinkedSession) {
    if (!confirm(t.unlinkConfirm)) return
    try { await eb(await jwt(), 'DELETE', `/sessions/${encodeURIComponent(s.sessionId)}`) } catch { /* already gone */ }
    const next = { ...vault, sessions: vault.sessions.filter((x) => x.sessionId !== s.sessionId) }
    const nextCache = { ...cacheRef.current }
    for (const a of s.accounts) delete nextCache[a.uid]
    await saveVault(next)
    await saveCache(nextCache)
  }

  const allAccounts = vault.sessions.flatMap((s) => s.accounts.map((a) => ({ ...a, session: s })))
  const current = allAccounts.find((a) => a.uid === selected) || allAccounts[0]
  const data = current ? cache[current.uid] : undefined
  const rule = (current && vault.salary[current.uid]) || DEFAULT_RULE
  const money = (n: number | null | undefined, currency = data?.currency || 'EUR') =>
    n === null || n === undefined ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n)
  const date = (d: string) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  const months = useMemo(() => (data ? surplusByMonth(data, rule) : []), [data, rule])
  const guesses = useMemo(() => (data ? guessSalary(data.transactions) : []), [data])
  const recent = months.slice(-6)
  const average = recent.length ? recent.reduce((s, m) => s + m.surplus, 0) / recent.length : null

  const salaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function setRule(patch: Partial<SalaryRule>) {
    if (!current) return
    const next = { ...vault, salary: { ...vault.salary, [current.uid]: { ...rule, ...patch } } }
    setSession({ ...session, vault: next })
    if (salaryTimer.current) clearTimeout(salaryTimer.current)
    salaryTimer.current = setTimeout(() => { void saveVault(next).catch((e: Error) => setError(e.message)) }, 800)
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">{t.accounts}</h2>
          <button className={secondary} onClick={() => setShowSettings((v) => !v)}><Settings className="inline size-4" /> {t.settings}</button>
          <button className={secondary} disabled={!!busy || !allAccounts.length} onClick={() => void refresh(allAccounts)}>
            <RefreshCw className={`inline size-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> {t.refresh}
          </button>
          <button className={primary} disabled={!!busy} onClick={() => setLinking((v) => !v)}><Link2 className="inline size-4" /> {t.linkBank}</button>
        </div>
        {busy === 'link' && <p className="animate-pulse text-sm text-slate-400">{t.linking}</p>}
        {linking && <LinkBank jwt={jwt} onError={setError} />}
        {showSettings && <SettingsPanel userId={userId} session={session} setSession={setSession} cache={cache} onDeleted={onDeleted} />}
        {!allAccounts.length && !linking && <p className="text-sm text-slate-400">{t.noAccounts}</p>}
        <div className="space-y-3">
          {vault.sessions.map((s) => {
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
            <Stat label={t.lastSurplus} value={months.length ? money(months[months.length - 1].surplus) : '—'} sub={months.length ? `${t.before} ${date(months[months.length - 1].salaryDate)}` : t.setSalary} accent />
            <Stat label={t.avgSurplus} value={average === null ? '—' : money(average)} sub={recent.length ? `${recent.length} ${t.months}` : ''} />
          </div>

          <Card className="space-y-4">
            <h2 className="text-lg font-semibold">{t.salaryTitle}</h2>
            <p className="text-sm text-slate-400">{t.salaryHelp}</p>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <label className="space-y-1 text-sm"><span className="text-slate-400">{t.salaryMatch}</span>
                <input className={input} value={rule.match} onChange={(e) => setRule({ match: e.target.value })} placeholder={t.salaryMatchPh} />
              </label>
              <label className="space-y-1 text-sm"><span className="text-slate-400">{t.minAmount}</span>
                <input type="number" min={0} className={input} value={rule.minAmount} onChange={(e) => setRule({ minAmount: Number(e.target.value) || 0 })} />
              </label>
            </div>
            {guesses.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">{t.suggestions}</span>
                {guesses.map((g) => (
                  <button key={g.name} onClick={() => setRule({ match: g.name, minAmount: Math.floor(g.average * 0.5) })}
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
                <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">{t.salaryDate}</th><th>{t.salary}</th><th className="text-right">{t.surplus}</th></tr></thead>
                <tbody>
                  {[...months].reverse().map((m) => (
                    <tr key={m.salaryDate} className="border-t border-white/5">
                      <td className="py-2">{date(m.salaryDate)}</td>
                      <td className="text-slate-400">{money(m.salaryAmount)}</td>
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

function SurplusChart({ months, money, locale }: { months: { salaryDate: string; surplus: number }[]; money: (n: number) => string; locale: string }) {
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
          <g key={m.salaryDate}>
            <title>{`${m.salaryDate}: ${money(m.surplus)}`}</title>
            <rect x={i * w + w * 0.18} y={y} width={w * 0.64} height={Math.max(bh, 0.5)} rx={0.8} className={m.surplus >= 0 ? 'fill-emerald-400/70' : 'fill-rose-400/70'} />
            <text x={i * w + w / 2} y={h + 14} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 4 }}>
              {new Date(m.salaryDate).toLocaleDateString(locale, { month: 'short' })}
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

function SettingsPanel({ userId, session, setSession, cache, onDeleted }: {
  userId: string; session: Unlocked; setSession: (s: Unlocked) => void; cache: Cache; onDeleted: () => void
}) {
  const t = useT(STR)
  const [password, setPassword] = useState('')
  const [confirm2, setConfirm2] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setMsg(t.passwordShort)
    if (password !== confirm2) return setMsg(t.passwordMismatch)
    setBusy(true)
    try {
      const salt = randomBytes(16)
      const aesKey = await deriveKey(password, salt)
      await saveBox(userId, await seal(aesKey, salt, PBKDF2_ITERATIONS, session.vault))
      writeLocal(cacheKey(userId), JSON.stringify(await seal(aesKey, salt, PBKDF2_ITERATIONS, cache)))
      setSession({ ...session, aesKey, salt, iterations: PBKDF2_ITERATIONS })
      setPassword(''); setConfirm2(''); setMsg(t.passwordChanged)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function deleteAll() {
    if (!window.confirm(t.deleteConfirm)) return
    const { error } = await supabase.from('utility_configs').delete().eq('utility_id', APP_ID)
    if (error) return setMsg(error.message)
    writeLocal(cacheKey(userId), null)
    onDeleted()
  }

  return (
    <div className="grid gap-4 rounded-xl border border-white/8 p-4 sm:grid-cols-2">
      <form onSubmit={changePassword} className="space-y-2">
        <h3 className="text-sm font-semibold">{t.changePassword}</h3>
        <p className="text-xs text-slate-500">{t.changePasswordHelp}</p>
        <input type="password" className={input} placeholder={t.newPassword} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <input type="password" className={input} placeholder={t.passwordConfirm} value={confirm2} onChange={(e) => setConfirm2(e.target.value)} autoComplete="new-password" />
        <button className={secondary} disabled={busy || !password}>{busy ? t.working : t.save}</button>
        {msg && <p className="text-xs text-slate-300">{msg}</p>}
      </form>
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
