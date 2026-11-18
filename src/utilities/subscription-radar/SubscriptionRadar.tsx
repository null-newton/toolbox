import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ChevronDown, Clapperboard, Cloud, Dumbbell, EyeOff, Home, Newspaper, Plug, Radar, RotateCcw, Shield, Smartphone, Tag, TrendingUp } from 'lucide-react'
import { useLang, useT } from '../../i18n/LanguageContext'
import { BankGate, Card, NoData, type Opened } from '../bank-viewer/BankGate'
import { accountList, chip, savePrefs } from '../bank-viewer/shared'
import { detect, forgottenFlags, type AccountTx, type Category, type Flag, type Mark, type Subscription } from './detect'
import { STR } from './strings'

const APP_ID = 'subscription-radar'
type Marks = Record<string, Mark>
type Prefs = { marks: Marks }
type T = (typeof STR)['en']
const CAT_ICON: Record<Category, ReactNode> = {
  streaming: <Clapperboard className="size-4" />, software: <Cloud className="size-4" />, fitness: <Dumbbell className="size-4" />, insurance: <Shield className="size-4" />,
  telecom: <Smartphone className="size-4" />, energy: <Plug className="size-4" />, news: <Newspaper className="size-4" />, housing: <Home className="size-4" />, other: <Tag className="size-4" />,
}

export function SubscriptionRadar() {
  const t = useT(STR)
  return <BankGate<Prefs> appId={APP_ID} title={t.title} intro={t.subtitle} fallback={{ marks: {} }}>{(o) => <Radarboard opened={o} />}</BankGate>
}

function Radarboard({ opened }: { opened: Opened<Prefs> }) {
  const t = useT(STR)
  const { locale } = useLang()
  const { book, dk, userId } = opened
  const [marks, setMarks] = useState(opened.prefs.marks)
  const [account, setAccount] = useState('')
  const [cat, setCat] = useState<Category | ''>('')
  const [saveErr, setSaveErr] = useState('')
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const accounts = accountList(book)
  const label = (uid: string) => accounts.find((a) => a.uid === uid)?.label || uid.slice(0, 8)
  const cached = Object.entries(book.cache).filter(([uid]) => !account || uid === account)
  const today = cached.map(([, d]) => d.fetchedAt.slice(0, 10)).sort().at(-1) || new Date().toISOString().slice(0, 10)
  const oldest = cached.map(([, d]) => d.oldest || '').filter(Boolean).sort()[0]
  const subs = useMemo(() => detect(cached.flatMap(([uid, d]) => d.transactions.map((x): AccountTx => ({ ...x, account: uid }))), today, accounts.map((a) => a.iban)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book, account, today])

  const money = (n: number, currency = 'EUR') => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n)
  const date = (d: string, year = true) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) })
  const setMark = (id: string, m: Mark | null) => {
    const next = { ...marks }; if (m) next[id] = m; else delete next[id]
    setMarks(next); setSaveErr('')
    queue.current = queue.current.then(() => savePrefs(userId, APP_ID, dk, { marks: next })).catch((e: Error) => setSaveErr(`${t.saveError}: ${e.message}`))
  }

  if (!cached.length) return <NoData />
  const visible = subs.filter((s) => marks[s.id] !== 'ignored')
  const sure = visible.filter((s) => s.active && s.confidence === 'high')
  const maybe = visible.filter((s) => s.active && s.confidence === 'medium')
  const stopped = visible.filter((s) => !s.active && s.confidence === 'high')
  const ignored = subs.filter((s) => marks[s.id] === 'ignored')
  const counted = [...sure, ...maybe.filter((s) => marks[s.id] === 'known')]
  const cur = counted[0]?.currency || 'EUR'
  const sum = (k: 'monthly' | 'yearly') => counted.filter((s) => s.currency === cur).reduce((a, s) => a + s[k], 0)
  const raised = counted.filter((s) => s.changes.some((c) => c.to > c.from))
  const extra = raised.reduce((a, s) => { const c = s.changes.filter((x) => x.to > x.from); return a + (s.amount - c[0].from) * (s.yearly / s.amount) }, 0)
  const forgotten = counted.map((s) => ({ s, flags: forgottenFlags(s, counted, marks[s.id]) })).filter((x) => x.flags.length)
  const soon = counted.filter((s) => s.next >= today && s.next <= addDays(today, 30)).sort((a, b) => a.next.localeCompare(b.next))
  const cats = [...new Set(counted.map((s) => s.category))]
  const listed = counted.filter((s) => !cat || s.category === cat)

  return (
    <div className="space-y-6">
      {saveErr && <p role="alert" className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{saveErr}</p>}
      {accounts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button className={chip(!account)} onClick={() => setAccount('')}>{t.allAccounts}</button>
          {accounts.map((a) => <button key={a.uid} className={chip(account === a.uid)} onClick={() => setAccount(a.uid)}>{a.label}</button>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t.perMonth} value={money(sum('monthly'), cur)} sub={`${counted.length} ${t.active}`} accent />
        <Stat label={t.perYear} value={money(sum('yearly'), cur)} />
        <Stat label={t.increases} value={String(raised.length)} sub={raised.length ? `+${money(extra, cur)} ${t.extraPerYear}` : ''} warn={raised.length > 0} />
        <Stat label={t.forgotten} value={String(forgotten.length)} warn={forgotten.length > 0} />
      </div>

      {!subs.length && <Card><p className="text-sm text-slate-400">{t.none}</p></Card>}

      {counted.length > 0 && (
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="size-5 text-amber-300" /> {t.forgotten}</h2>
          {forgotten.length ? <>
            <p className="text-sm text-slate-400">{t.forgottenHelp}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {forgotten.map(({ s, flags }) => (
                <div key={s.id} className="space-y-2 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">
                  <div className="flex items-center gap-2"><span className="text-slate-400">{CAT_ICON[s.category]}</span><span className="min-w-0 flex-1 truncate font-medium">{s.name}</span><span className="font-mono text-sm">{money(s.amount, s.currency)}</span></div>
                  <p className="text-xs text-slate-400">{t.cadence[s.cadence]} · {t.since} {date(s.first)} · {t.next} {date(s.next)}</p>
                  <ul className="space-y-0.5 text-xs text-amber-100">{flags.map((f) => <li key={f.kind}>• {flagText(t, f, (n) => money(n, s.currency))}</li>)}</ul>
                  <Actions t={t} mark={marks[s.id]} onMark={(m) => setMark(s.id, m)} />
                </div>
              ))}
            </div>
          </> : <p className="flex items-center gap-2 text-sm text-emerald-200"><Check className="size-4" /> {t.nothingForgotten}</p>}
        </Card>
      )}

      {raised.length > 0 && (
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><TrendingUp className="size-5 text-rose-300" /> {t.increases}</h2>
          <ul className="divide-y divide-white/5 text-sm">
            {raised.map((s) => s.changes.filter((c) => c.to > c.from).map((c) => (
              <li key={s.id + c.date} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-xs text-slate-500">{date(c.date)}</span>
                <span className="font-mono text-slate-400 line-through">{money(c.from, s.currency)}</span>
                <span className="font-mono">{money(c.to, s.currency)}</span>
                <span className="w-16 text-right text-xs font-semibold text-rose-300">+{Math.round(((c.to - c.from) / c.from) * 100)}%</span>
              </li>
            )))}
          </ul>
        </Card>
      )}

      {counted.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">{t.subscriptions}</h2>
            {cats.length > 1 && <div className="flex flex-wrap gap-2">
              <button className={chip(!cat)} onClick={() => setCat('')}>{t.all}</button>
              {cats.map((c) => <button key={c} className={chip(cat === c)} onClick={() => setCat(c)}>{t.cat[c]}</button>)}
            </div>}
            <SubList t={t} subs={listed} marks={marks} setMark={setMark} money={money} date={date} label={accounts.length > 1 && !account ? label : undefined} />
          </Card>
          <Card className="space-y-3 self-start">
            <h2 className="text-lg font-semibold">{t.upcoming}</h2>
            <ul className="space-y-2 text-sm">
              {soon.map((s) => <li key={s.id} className="flex items-center gap-2"><span className="w-14 shrink-0 text-xs text-slate-500">{date(s.next, false)}</span><span className="min-w-0 flex-1 truncate">{s.name}</span><span className="font-mono text-xs">{money(s.amount, s.currency)}</span></li>)}
              {!soon.length && <li className="text-slate-500">—</li>}
            </ul>
          </Card>
        </div>
      )}

      {maybe.filter((s) => marks[s.id] !== 'known').length > 0 && <Fold title={t.maybe} help={t.maybeHelp}><SubList t={t} subs={maybe.filter((s) => marks[s.id] !== 'known')} marks={marks} setMark={setMark} money={money} date={date} /></Fold>}
      {stopped.length > 0 && <Fold title={t.stopped} help={t.stoppedHelp}><SubList t={t} subs={stopped} marks={marks} setMark={setMark} money={money} date={date} dim /></Fold>}
      {ignored.length > 0 && <Fold title={t.hidden}><SubList t={t} subs={ignored} marks={marks} setMark={setMark} money={money} date={date} dim /></Fold>}
      <p className="text-xs text-slate-500">{oldest ? `${t.historyFrom} ${date(oldest)}. ` : ''}{t.refreshHint} <Link to="/tools/bank-viewer" className="underline hover:text-slate-300">{t.openBank}</Link></p>
    </div>
  )
}

const addDays = (d: string, n: number) => new Date(new Date(d).getTime() + n * 86_400_000).toISOString().slice(0, 10)
function flagText(t: T, f: Flag, money: (n: number) => string) {
  return f.kind === 'long' ? `${f.value} ${t.flag.long}` : f.kind === 'increase' ? `${t.flag.increase} ${money(f.value || 0)}` : t.flag[f.kind]
}

function Actions({ t, mark, onMark }: { t: T; mark?: Mark; onMark: (m: Mark | null) => void }) {
  const btn = 'flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:border-white/25 hover:text-white'
  if (mark === 'ignored') return <button className={btn} onClick={() => onMark(null)}><RotateCcw className="size-3.5" /> {t.restore}</button>
  return (
    <div className="flex flex-wrap gap-2">
      {mark === 'known' ? <button className={btn} onClick={() => onMark(null)}><RotateCcw className="size-3.5" /> {t.unknown}</button> : <button className={btn} onClick={() => onMark('known')}><Check className="size-3.5" /> {t.known}</button>}
      <button className={btn} onClick={() => onMark('ignored')}><EyeOff className="size-3.5" /> {t.ignore}</button>
    </div>
  )
}

function SubList({ t, subs, marks, setMark, money, date, label, dim }: {
  t: T; subs: Subscription[]; marks: Marks; setMark: (id: string, m: Mark | null) => void
  money: (n: number, c?: string) => string; date: (d: string, y?: boolean) => string; label?: (uid: string) => string; dim?: boolean
}) {
  const [open, setOpen] = useState('')
  return (
    <ul className="divide-y divide-white/5">
      {subs.map((s) => {
        const up = s.changes.filter((c) => c.to > c.from).at(-1)
        return (
          <li key={s.id} className={dim ? 'opacity-70' : ''}>
            <button className="no-glow flex w-full items-center gap-3 py-2.5 text-left text-sm" onClick={() => setOpen(open === s.id ? '' : s.id)} aria-expanded={open === s.id}>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 text-slate-300">{CAT_ICON[s.category]}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 truncate font-medium">{s.name}{marks[s.id] === 'known' && <Check className="size-3.5 shrink-0 text-emerald-300" />}</span>
                <span className="block truncate text-xs text-slate-500">{t.cadence[s.cadence]} · {s.active ? `${t.next} ${date(s.next)}` : `${t.last} ${date(s.last)}`}{label ? ` · ${s.accounts.map(label).join(', ')}` : ''}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono">{money(s.amount, s.currency)}</span>
                <span className="block text-xs text-slate-500">{up ? <span className="text-rose-300">{t.was} {money(up.from, s.currency)}</span> : s.cadence !== 'monthly' ? `${money(s.monthly, s.currency)} / ${t.perMonth.toLowerCase()}` : ''}</span>
              </span>
              <ChevronDown className={`size-4 shrink-0 text-slate-500 transition ${open === s.id ? 'rotate-180' : ''}`} />
            </button>
            {open === s.id && (
              <div className="space-y-3 pb-3 pl-11">
                <Spark charges={s.charges} />
                <p className="text-xs text-slate-500">{t.history} · {s.charges.length} {t.charges} · {money(s.yearly, s.currency)} / {t.perYear.toLowerCase()}</p>
                <div className="flex flex-wrap gap-1.5">{[...s.charges].reverse().slice(0, 24).map((c) => <span key={c.date} className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-slate-400">{date(c.date)} · {money(c.amount, s.currency)}</span>)}</div>
                <Actions t={t} mark={marks[s.id]} onMark={(m) => setMark(s.id, m)} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Spark({ charges }: { charges: { date: string; amount: number }[] }) {
  const xs = charges.slice(-24), max = Math.max(...xs.map((c) => c.amount)), min = Math.min(...xs.map((c) => c.amount))
  const w = 100 / xs.length
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-10 w-full max-w-md" aria-hidden>
      {xs.map((c, i) => { const h = max === min ? 16 : 6 + ((c.amount - min) / (max - min)) * 16; return <rect key={c.date} x={i * w + w * 0.2} y={24 - h} width={w * 0.6} height={h} rx={0.6} className={i && c.amount > xs[i - 1].amount ? 'fill-rose-400/70' : 'fill-emerald-400/60'} /> })}
    </svg>
  )
}

function Fold({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <details className="glass group rounded-2xl p-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-semibold"><Radar className="size-5 text-slate-500" /> {title}<ChevronDown className="ml-auto size-4 text-slate-500 transition group-open:rotate-180" /></summary>
      {help && <p className="mt-2 text-sm text-slate-400">{help}</p>}
      <div className="mt-2">{children}</div>
    </details>
  )
}

function Stat({ label, value, sub, accent, warn }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-emerald-300' : warn ? 'text-amber-300' : ''}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  )
}
