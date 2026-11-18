import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useLang, useT } from '../../i18n/LanguageContext'
import { BankGate, Card, NoData, type Opened } from '../bank-viewer/BankGate'
import { accountList, chip, savePrefs } from '../bank-viewer/shared'
import { CAT_COLORS, CUSTOM_COLORS, EXPENSE_CATS, byMonth, expenses, type CustomCat, type Expense, type Overrides } from './categories'
import { STR } from './strings'

const APP_ID = 'expenses'
type Prefs = { overrides: Overrides; custom: CustomCat[] }
type T = (typeof STR)['en']
interface CatInfo { id: string; label: string; color: string }

export function Expenses() {
  const t = useT(STR)
  return <BankGate<Prefs> appId={APP_ID} title={t.title} intro={t.subtitle} fallback={{ overrides: {}, custom: [] }}>{(o) => <Board opened={o} />}</BankGate>
}

function Board({ opened }: { opened: Opened<Prefs> }) {
  const t = useT(STR)
  const { locale } = useLang()
  const { book, dk, userId } = opened
  const [prefs, setPrefs] = useState<Prefs>({ overrides: opened.prefs.overrides || {}, custom: opened.prefs.custom || [] })
  const [account, setAccount] = useState('')
  const [pick, setPick] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState('')
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  // Built-ins in their fixed order with your own categories before "other".
  const cats: CatInfo[] = useMemo(() => [
    ...EXPENSE_CATS.filter((c) => c !== 'other').map((c) => ({ id: c, label: t.cat[c], color: CAT_COLORS[c] })),
    ...prefs.custom.map((c) => ({ id: c.id, label: c.name, color: c.color })), { id: 'other', label: t.cat.other, color: CAT_COLORS.other },
  ], [prefs.custom, t])
  const info = (id: string) => cats.find((c) => c.id === id) || cats[cats.length - 1]
  const accounts = accountList(book)
  const cached = Object.entries(book.cache).filter(([uid]) => !account || uid === account)
  const today = cached.map(([, d]) => d.fetchedAt.slice(0, 10)).sort().at(-1) || new Date().toISOString().slice(0, 10)
  const oldest = cached.map(([, d]) => d.oldest || '').filter(Boolean).sort()[0] || today
  const months = useMemo(() => {
    const ids = new Set(cats.map((c) => c.id)), valid = Object.fromEntries(Object.entries(prefs.overrides).filter(([, c]) => ids.has(c))) // overrides to a deleted category fall back
    const list = expenses(cached.flatMap(([uid, d]) => d.transactions.map((x) => ({ ...x, account: uid }))), valid, accounts.map((a) => a.iban))
    const from = oldest.slice(8) === '01' ? oldest : new Date(Date.UTC(+oldest.slice(0, 4), +oldest.slice(5, 7), 1)).toISOString().slice(0, 10) // skip a half-loaded first month
    return byMonth(list, from, today, cats.map((c) => c.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, account, prefs.overrides, cats, today, oldest])

  const save = (next: Prefs) => {
    setPrefs(next); setSaveErr('')
    queue.current = queue.current.then(() => savePrefs(userId, APP_ID, dk, next)).catch((e: Error) => setSaveErr(`${t.saveError}: ${e.message}`))
  }
  if (!cached.length || !months.length) return <NoData />
  const current = today.slice(0, 7)
  const sel = months.find((m) => m.month === pick) || months[months.length - 1]
  const prev = months.filter((m) => m.month < sel.month && m.month !== current).slice(-6)
  const avg = prev.length ? prev.reduce((a, m) => a + m.total, 0) / prev.length : null
  const money = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(n)
  const monthName = (m: string, long = true) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(locale, long ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { month: 'short', timeZone: 'UTC' })
  const slices = cats.map((c) => ({ ...c, value: sel.byCat[c.id] || 0 })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value)

  return (
    <div className="space-y-6">
      {saveErr && <p role="alert" className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{saveErr}</p>}
      {accounts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button className={chip(!account)} onClick={() => setAccount('')}>{t.allAccounts}</button>
          {accounts.map((a) => <button key={a.uid} className={chip(account === a.uid)} onClick={() => setAccount(a.uid)}>{a.label}</button>)}
        </div>
      )}

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t.months}</h2>
        <MonthStrip months={months.slice(-13)} selected={sel.month} current={current} onPick={(m) => { setPick(m); setCat(null) }} money={money} label={(m) => monthName(m, false)} t={t} />
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label={`${t.thisMonth} · ${monthName(sel.month)}`} value={money(sel.total)} sub={sel.month === current ? t.soFar : avg === null ? '' : `${sel.total >= avg ? '+' : '−'}${money(Math.abs(sel.total - avg))} ${t.vsAvg}`} accent />
        <Stat label={t.avg} value={avg === null ? '—' : money(avg)} />
        <Stat label={t.biggest} value={slices[0]?.label || '—'} sub={slices[0] ? `${money(slices[0].value)} · ${Math.round((slices[0].value / sel.total) * 100)}%` : ''} />
      </div>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">{t.breakdown} · {monthName(sel.month)}</h2>
        {slices.length ? <Donut slices={slices} total={sel.total} money={money} selected={cat} onSelect={(id) => setCat(id === cat ? null : id)} t={t} /> : <p className="text-sm text-slate-400">{t.none}</p>}
      </Card>

      {slices.length > 0 && <Merchants t={t} cats={cats} info={info} items={sel.items.filter((x) => !cat || x.cat === cat)} cat={cat ? info(cat).label : null} clear={() => setCat(null)} money={money}
        onCat={(key, c) => save({ ...prefs, overrides: { ...prefs.overrides, [key]: c } })} date={(d) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short' })} />}

      <CategoryManager t={t} custom={prefs.custom} onChange={(custom) => {
        const ids = new Set(custom.map((c) => c.id)), overrides = Object.fromEntries(Object.entries(prefs.overrides).filter(([, c]) => !c.startsWith('c_') || ids.has(c)))
        if (cat && cat.startsWith('c_') && !ids.has(cat)) setCat(null)
        save({ overrides, custom })
      }} />
      <p className="text-xs text-slate-500">{t.ownNote} {t.historyFrom} {new Date(oldest).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}. {t.refreshHint} <Link to="/tools/bank-viewer" className="underline hover:text-slate-300">{t.openBank}</Link></p>
    </div>
  )
}

function CategoryManager({ t, custom, onChange }: { t: T; custom: CustomCat[]; onChange: (c: CustomCat[]) => void }) {
  const unused = CUSTOM_COLORS.find((c) => !custom.some((x) => x.color === c)) || CUSTOM_COLORS[custom.length % CUSTOM_COLORS.length]
  const [name, setName] = useState(''), [color, setColor] = useState('')
  const field = 'rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50'
  function add(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    onChange([...custom, { id: `c_${crypto.randomUUID().slice(0, 8)}`, name: n.slice(0, 40), color: color || unused }]); setName(''); setColor('')
  }
  const update = (id: string, patch: Partial<CustomCat>) => onChange(custom.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">{t.myCats}</h2>
      <p className="text-sm text-slate-400">{t.myCatsHelp}</p>
      {custom.length ? (
        <ul className="space-y-2">
          {custom.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <Swatches value={c.color} onPick={(color) => update(c.id, { color })} t={t} />
              <input className={`${field} min-w-0 flex-1`} defaultValue={c.name} maxLength={40} aria-label={t.newCat}
                onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== c.name) update(c.id, { name: n }); else e.target.value = c.name }} />
              <button className="no-glow rounded-lg p-2 text-slate-500 hover:text-rose-300" aria-label={`${t.remove} ${c.name}`} onClick={() => window.confirm(t.removeConfirm) && onChange(custom.filter((x) => x.id !== c.id))}><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500">{t.noCats}</p>}
      <form onSubmit={add} className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
        <Swatches value={color || unused} onPick={setColor} t={t} />
        <input className={`${field} min-w-0 flex-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.newCat} maxLength={40} />
        <button className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!name.trim()}><Plus className="size-4" /> {t.add}</button>
      </form>
    </Card>
  )
}

// Colour picker: a swatch button that opens the fixed set of colours.
function Swatches({ value, onPick, t }: { value: string; onPick: (c: string) => void; t: T }) {
  return (
    <details className="relative">
      <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-xl border border-white/10" aria-label={t.colour}><span className="size-4 rounded-sm" style={{ background: value }} /></summary>
      <div className="absolute left-0 top-11 z-10 grid w-40 grid-cols-4 gap-2 rounded-xl border border-white/10 bg-slate-900 p-2 shadow-xl">
        {CUSTOM_COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={(e) => { onPick(c); e.currentTarget.closest('details')?.removeAttribute('open') }}
          className={`no-glow size-7 rounded-md ${c === value ? 'ring-2 ring-white' : ''}`} style={{ background: c }} />)}
      </div>
    </details>
  )
}

function MonthStrip({ months, selected, current, onPick, money, label, t }: { months: { month: string; total: number }[]; selected: string; current: string; onPick: (m: string) => void; money: (n: number) => string; label: (m: string) => string; t: T }) {
  const max = Math.max(1, ...months.map((m) => m.total))
  return (
    <div className="flex h-36 items-end gap-1.5">
      {months.map((m) => (
        <button key={m.month} onClick={() => onPick(m.month)} title={`${label(m.month)} ${m.month.slice(0, 4)}: ${money(m.total)}${m.month === current ? ` (${t.soFar})` : ''}`} aria-pressed={m.month === selected}
          className="no-glow group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className={`hidden text-[10px] font-mono sm:block ${m.month === selected ? 'text-white' : 'text-transparent group-hover:text-slate-400'}`}>{Math.round(m.total)}</span>
          <span className={`w-full max-w-10 rounded-t-[4px] transition-colors ${m.month === selected ? 'bg-emerald-400' : 'bg-slate-600 group-hover:bg-slate-500'} ${m.month === current ? 'opacity-70' : ''}`} style={{ height: `${Math.max(2, (m.total / max) * 100)}px` }} />
          <span className={`text-[10px] ${m.month === selected ? 'text-white' : 'text-slate-500'}`}>{label(m.month)}</span>
        </button>
      ))}
    </div>
  )
}

function Donut({ slices, total, money, selected, onSelect, t }: { slices: (CatInfo & { value: number })[]; total: number; money: (n: number) => string; selected: string | null; onSelect: (id: string) => void; t: T }) {
  const [hover, setHover] = useState<string | null>(null)
  const focus = hover || selected, R = 80, r = 54, gap = slices.length > 1 ? 2 / R : 0 // 2px surface gap between slices
  const p = (ang: number, rad: number) => `${100 + rad * Math.cos(ang)} ${100 + rad * Math.sin(ang)}`
  const arcs = slices.map((x, i) => {
    const a0 = -Math.PI / 2 + (slices.slice(0, i).reduce((a, y) => a + y.value, 0) / total) * Math.PI * 2, sweep = (x.value / total) * Math.PI * 2
    const s0 = a0 + gap / 2, s1 = a0 + sweep - gap / 2, big = s1 - s0 > Math.PI ? 1 : 0, e = Math.PI * 1.5 - 1e-4
    const d = sweep >= Math.PI * 2 - 1e-6 ? `M ${p(-Math.PI / 2, R)} A ${R} ${R} 0 1 1 ${p(e, R)} L ${p(e, r)} A ${r} ${r} 0 1 0 ${p(-Math.PI / 2, r)} Z`
      : `M ${p(s0, R)} A ${R} ${R} 0 ${big} 1 ${p(s1, R)} L ${p(s1, r)} A ${r} ${r} 0 ${big} 0 ${p(s0, r)} Z`
    return { ...x, d }
  })
  const f = slices.find((x) => x.id === focus), pct = (v: number) => `${Math.round((v / total) * 100)}%`
  return (
    <div className="grid items-center gap-6 sm:grid-cols-[13rem_1fr]">
      <svg viewBox="0 0 200 200" className="mx-auto size-52" role="img" aria-label={`${money(total)} ${t.perMonth}`} onMouseLeave={() => setHover(null)}>
        {arcs.map((x) => <path key={x.id} d={x.d} fill={x.color} opacity={focus && focus !== x.id ? 0.35 : 1} className="cursor-pointer transition-opacity" onMouseEnter={() => setHover(x.id)} onClick={() => onSelect(x.id)}><title>{`${x.label}: ${money(x.value)}`}</title></path>)}
        <text x={100} y={f ? 92 : 98} textAnchor="middle" className="fill-white font-bold" style={{ fontSize: 19 }}>{money(f ? f.value : total)}</text>
        <text x={100} y={f ? 110 : 116} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 10 }}>{f ? (f.label.length > 22 ? `${f.label.slice(0, 21)}…` : f.label) : t.perMonth}</text>
        {f && <text x={100} y={125} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 9 }}>{pct(f.value)} {t.share}</text>}
      </svg>
      <ul className="space-y-1 text-sm" onMouseLeave={() => setHover(null)}>
        {slices.map((x) => (
          <li key={x.id}>
            <button onMouseEnter={() => setHover(x.id)} onClick={() => onSelect(x.id)} aria-pressed={selected === x.id}
              className={`no-glow grid w-full grid-cols-[0.75rem_1fr_auto_2.75rem] items-center gap-3 rounded-lg px-2 py-1 text-left transition ${focus === x.id ? 'bg-white/5' : ''} ${focus && focus !== x.id ? 'opacity-50' : ''}`}>
              <span className="size-3 rounded-sm" style={{ background: x.color }} />
              <span className="min-w-0 truncate">{x.label}</span>
              <span className="font-mono text-slate-300">{money(x.value)}</span>
              <span className="text-right text-xs text-slate-500">{pct(x.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Merchants({ t, cats, info, items, cat, clear, money, onCat, date }: {
  t: T; cats: CatInfo[]; info: (id: string) => CatInfo; items: Expense[]; cat: string | null; clear: () => void; money: (n: number) => string; onCat: (key: string, c: string) => void; date: (d: string) => string
}) {
  const [all, setAll] = useState(false), [open, setOpen] = useState('')
  const builtIn = cats.filter((c) => !c.id.startsWith('c_')), mine = cats.filter((c) => c.id.startsWith('c_'))
  const groups = [...items.reduce((m, x) => m.set(x.key, [...(m.get(x.key) || []), x]), new Map<string, Expense[]>())]
    .map(([key, xs]) => ({ key, xs, name: (xs[xs.length - 1].counterparty || xs[xs.length - 1].text || key).slice(0, 60), total: xs.reduce((a, x) => a - x.amount, 0), cat: xs[0].cat }))
    .sort((a, b) => b.total - a.total)
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">{t.merchants}{cat && <span className="text-slate-400"> · {cat}</span>}</h2>
        {cat && <button className={chip(false)} onClick={clear}>{t.all}</button>}
      </div>
      <ul className="divide-y divide-white/5 text-sm">
        {(all ? groups : groups.slice(0, 15)).map((g) => (
          <li key={g.key} className="py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: info(g.cat).color }} />
              <button className="no-glow min-w-0 flex-1 truncate text-left" onClick={() => setOpen(open === g.key ? '' : g.key)} aria-expanded={open === g.key}>
                {g.name}<span className="text-xs text-slate-500"> · {g.xs.length} {g.xs.length === 1 ? t.payment : t.payments}</span>
              </button>
              <select value={g.cat} onChange={(e) => onCat(g.key, e.target.value)} aria-label={`${t.changeCat} ${g.name}`}
                className="max-w-48 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-slate-300 outline-none focus:border-emerald-400/50">
                {mine.length ? <><optgroup label={t.builtIn}>{builtIn.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup><optgroup label={t.mine}>{mine.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup></>
                  : builtIn.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <span className="w-24 shrink-0 text-right font-mono">{money(g.total)}</span>
            </div>
            {open === g.key && <ul className="mt-2 space-y-1 pl-6 text-xs text-slate-400">{g.xs.map((x, i) => <li key={i} className="flex gap-3"><span className="w-14 shrink-0">{date(x.date)}</span><span className="min-w-0 flex-1 truncate">{x.text || x.counterparty}</span><span className="font-mono">{money(-x.amount)}</span></li>)}</ul>}
          </li>
        ))}
      </ul>
      {groups.length > 15 && <button className={chip(false)} onClick={() => setAll(!all)}>{all ? t.showLess : `${t.showAll} (${groups.length})`}</button>}
    </Card>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card>
      <p className="truncate text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-2xl font-bold ${accent ? 'text-emerald-300' : ''}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  )
}

