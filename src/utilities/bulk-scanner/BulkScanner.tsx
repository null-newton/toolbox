import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Calendar, ChevronLeft, ChevronRight, Clock, Copy, FileArchive, FileDown, FilePlus2, FolderOpen, Hash, Keyboard, Loader2, Pencil, Plus, Printer, RefreshCw, RotateCw, ScanLine, Square, TextCursorInput, Trash2, Type, Wifi, WifiOff, X } from 'lucide-react'
import { ToolHeader } from '../../components/ToolHeader'
import { useLang, useT } from '../../i18n/LanguageContext'
import { buildPdf, buildZip, download } from './pdf-zip'
import { bridgeOnline, capabilities, listScanners, runScan, uid, type Caps, type ColorMode, type Page, type Scanner, type Source } from './scanner'
import { deleteSession, getSession, listSessions, newSession, putSession, type Doc, type Session } from './store'

const STR = {
  en: {
    intro: 'Scan many documents in one session. Each scan is named by your own rules and everything stays on this device — download the whole batch as a ZIP of PDFs.',
    loading: 'Opening your scan session…', scanner: 'Scanner', refresh: 'Search network', addIp: 'Add by IP', ipPh: '192.168.1.42',
    demo: 'Demo mode — scanner bridge not running. Start it with', retry: 'Retry', online: (n: number) => `Scanner bridge connected · ${n} scanner${n === 1 ? '' : 's'} found`, none: 'No scanners found',
    source: 'Source', flatbed: 'Flatbed', feeder: 'Feeder', duplex: 'Duplex', color: 'Colour', mode: { color: 'Colour', gray: 'Grey', bw: 'B&W' }, dpi: 'Resolution', skipBlank: 'Skip blank pages',
    scan: 'Scan pages', scanning: (n: number) => n > 1 ? `Scanning… ${n - 1} received` : 'Scanning…', stop: 'Stop', newScan: 'Finish & new scan', current: 'Current scan', pages: (n: number) => `${n} page${n === 1 ? '' : 's'}`,
    skipped: (n: number) => `${n} blank page${n === 1 ? '' : 's'} skipped`, empty: 'No pages yet. Put a document on the scanner and press Scan.', namePreview: 'Will be saved as', dragHint: 'Drag to reorder · click to view',
    naming: 'Naming convention', preset: 'Preset', newPreset: 'New preset', dupPreset: 'Duplicate', delPreset: 'Delete preset', delPresetConfirm: 'Delete this naming preset?', presetName: 'Preset name', copyOf: (n: string) => `${n} copy`,
    addBlock: 'Add block', preview: 'Preview', kinds: { date: 'Date', time: 'Time', text: 'Text', sep: 'Separator', input: 'Input on save', counter: 'Counter' },
    whichDate: 'Which date', when: { today: 'Today', ask: 'Ask on save', fixed: 'Fixed' }, today: 'Today', yesterday: 'Yesterday', fmt: 'Format', textVal: 'Text', label: 'Question', start: 'Next number', pad: 'Digits', ask: 'Asked when you finish a scan',
    session: 'This session', started: (d: string) => `Started ${d}`, noDocs: 'Finished scans appear here. The session is saved on this device, so you can close the page and resume later.',
    saveAll: (n: number) => `Save all (${n})`, sessions: 'Sessions', newSession: 'New session', resume: 'Resume', active: 'Open', saved: 'Downloaded', delSessionConfirm: 'Delete this session and all its scans from this device?', noSessions: 'No other sessions.', docsCount: (n: number) => `${n} scan${n === 1 ? '' : 's'}`,
    dialogTitle: 'Name this scan', save: 'Save scan', cancel: 'Cancel', dup: 'A scan with this name already exists — a number will be added.',
    keep: 'Keep anyway', delete: 'Delete', ok: 'Continue', newSessionConfirm: 'Start a new session? The current one stays under Sessions, including the unfinished scan.', addPages: 'Add pages to this file', addPagesBusy: 'Finish the current scan first', addingTo: 'Adding pages to', doneAdding: 'Done adding pages', discardAdded: 'Discard the pages you added and put the file back as it was?', shortcuts: 'S scan · N finish & new · Enter save', rotate: 'Rotate (R)', remove: 'Remove (Del)', rename: 'Rename', pdf: 'Download PDF', lastValues: 'Recent', page: (a: number, b: number) => `Page ${a} of ${b}`,
  },
  nl: {
    intro: 'Scan veel documenten in één sessie. Elke scan krijgt een naam volgens je eigen regels en alles blijft op dit toestel — download alles als ZIP met PDF\'s.',
    loading: 'Je scansessie openen…', scanner: 'Scanner', refresh: 'Netwerk doorzoeken', addIp: 'Toevoegen via IP', ipPh: '192.168.1.42',
    demo: 'Demomodus — scannerbrug draait niet. Start ze met', retry: 'Opnieuw', online: (n: number) => `Scannerbrug verbonden · ${n} scanner${n === 1 ? '' : 's'} gevonden`, none: 'Geen scanners gevonden',
    source: 'Bron', flatbed: 'Glasplaat', feeder: 'Invoer', duplex: 'Dubbelzijdig', color: 'Kleur', mode: { color: 'Kleur', gray: 'Grijs', bw: 'Z/W' }, dpi: 'Resolutie', skipBlank: 'Lege pagina\'s overslaan',
    scan: 'Pagina\'s scannen', scanning: (n: number) => n > 1 ? `Scannen… ${n - 1} ontvangen` : 'Scannen…', stop: 'Stoppen', newScan: 'Afronden & nieuwe scan', current: 'Huidige scan', pages: (n: number) => `${n} pagina${n === 1 ? '' : '\'s'}`,
    skipped: (n: number) => `${n} lege pagina${n === 1 ? '' : '\'s'} overgeslagen`, empty: 'Nog geen pagina\'s. Leg een document op de scanner en druk op Scannen.', namePreview: 'Wordt opgeslagen als', dragHint: 'Sleep om te ordenen · klik om te bekijken',
    naming: 'Naamconventie', preset: 'Voorinstelling', newPreset: 'Nieuwe voorinstelling', dupPreset: 'Dupliceren', delPreset: 'Voorinstelling verwijderen', delPresetConfirm: 'Deze naamvoorinstelling verwijderen?', presetName: 'Naam voorinstelling', copyOf: (n: string) => `${n} kopie`,
    addBlock: 'Blok toevoegen', preview: 'Voorbeeld', kinds: { date: 'Datum', time: 'Tijd', text: 'Tekst', sep: 'Scheiding', input: 'Invoer bij opslaan', counter: 'Teller' },
    whichDate: 'Welke datum', when: { today: 'Vandaag', ask: 'Vragen bij opslaan', fixed: 'Vast' }, today: 'Vandaag', yesterday: 'Gisteren', fmt: 'Formaat', textVal: 'Tekst', label: 'Vraag', start: 'Volgend nummer', pad: 'Cijfers', ask: 'Gevraagd wanneer je een scan afrondt',
    session: 'Deze sessie', started: (d: string) => `Gestart ${d}`, noDocs: 'Afgeronde scans verschijnen hier. De sessie wordt op dit toestel bewaard, dus je kunt de pagina sluiten en later verdergaan.',
    saveAll: (n: number) => `Alles opslaan (${n})`, sessions: 'Sessies', newSession: 'Nieuwe sessie', resume: 'Hervatten', active: 'Open', saved: 'Gedownload', delSessionConfirm: 'Deze sessie en alle scans van dit toestel verwijderen?', noSessions: 'Geen andere sessies.', docsCount: (n: number) => `${n} scan${n === 1 ? '' : 's'}`,
    dialogTitle: 'Geef deze scan een naam', save: 'Scan opslaan', cancel: 'Annuleren', dup: 'Er bestaat al een scan met deze naam — er wordt een nummer toegevoegd.',
    keep: 'Toch behouden', delete: 'Verwijderen', ok: 'Doorgaan', newSessionConfirm: 'Een nieuwe sessie starten? De huidige blijft bewaard onder Sessies, ook de onafgeronde scan.', addPages: "Pagina's toevoegen aan dit bestand", addPagesBusy: 'Rond eerst de huidige scan af', addingTo: "Pagina's toevoegen aan", doneAdding: 'Klaar met toevoegen', discardAdded: "De toegevoegde pagina's weggooien en het bestand terugzetten zoals het was?", shortcuts: 'S scannen · N afronden & nieuw · Enter opslaan', rotate: 'Draaien (R)', remove: 'Verwijderen (Del)', rename: 'Hernoemen', pdf: 'PDF downloaden', lastValues: 'Recent', page: (a: number, b: number) => `Pagina ${a} van ${b}`,
  },
}
type T = (typeof STR)['en']

type Kind = 'date' | 'time' | 'text' | 'sep' | 'input' | 'counter'
interface Block { id: string; kind: Kind; value?: string; fmt?: string; label?: string; pad?: number; when?: 'today' | 'ask' | 'fixed'; date?: string }
interface Preset { id: string; name: string; blocks: Block[]; counter: number }
interface Settings { scannerId: string; source: Source; mode: ColorMode; dpi: number; skipBlank: boolean; presets: Preset[]; presetId: string; recent: Record<string, string[]> }

const KEY = 'bulk-scanner:v1', SESSION_KEY = 'bulk-scanner:session'
const DEF_PRESET: Preset = { id: 'default', name: 'Default', counter: 1, blocks: [{ id: uid(), kind: 'date', fmt: 'dmonth' }, { id: uid(), kind: 'sep', value: '_' }, { id: uid(), kind: 'input', label: 'Description' }] }
const DEFAULTS: Settings = { scannerId: '', source: 'feeder', mode: 'color', dpi: 300, skipBlank: true, presets: [DEF_PRESET], presetId: DEF_PRESET.id, recent: {} }
const DATE_FMTS = ['dmonth', 'iso', 'dmy', 'compact', 'ym'] as const
const ICONS: Record<Kind, typeof Calendar> = { date: Calendar, time: Clock, text: Type, sep: Hash, input: TextCursorInput, counter: Hash }

// Loads settings from localStorage, migrating the single-convention format into presets
function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (raw.blocks && !raw.presets) raw.presets = [{ ...DEF_PRESET, blocks: raw.blocks, counter: raw.counter ?? 1 }]
    const s = { ...DEFAULTS, ...raw }; delete (s as Record<string, unknown>).blocks; delete (s as Record<string, unknown>).counter
    return s.presets.length ? s : { ...s, presets: [DEF_PRESET] }
  } catch { return DEFAULTS }
}
const clean = (s: string) => s.replace(/[\\/:*?"<>|\n\r\t]+/g, '-').replace(/\s+/g, ' ').trim()
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseIso = (v?: string) => { const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null }
const asked = (b: Block) => b.kind === 'input' || (b.kind === 'date' && b.when === 'ask')
const move = <X,>(a: X[], from: number, to: number) => { const b = [...a], [x] = b.splice(from, 1); b.splice(to, 0, x); return b }

function fmtDate(d: Date, fmt: string, lang: string) {
  const p = (n: number) => String(n).padStart(2, '0'), y = d.getFullYear(), m = p(d.getMonth() + 1), day = p(d.getDate())
  return fmt === 'dmonth' ? `${d.getDate()}${d.toLocaleString(lang === 'nl' ? 'nl-BE' : 'en-GB', { month: 'long' }).toLowerCase()}` : fmt === 'iso' ? `${y}-${m}-${day}` : fmt === 'dmy' ? `${day}-${m}-${y}` : fmt === 'ym' ? `${y}-${m}` : `${y}${m}${day}`
}

// Resolves the block list into a filename (without extension); missing inputs render as their label
function buildName(blocks: Block[], values: Record<string, string>, counter: number, lang: string, at = new Date()) {
  return clean(blocks.map((b) => b.kind === 'date' ? fmtDate((b.when === 'fixed' ? parseIso(b.date) : b.when === 'ask' ? parseIso(values[b.id]) : null) ?? at, b.fmt ?? 'iso', lang) : b.kind === 'time' ? `${String(at.getHours()).padStart(2, '0')}${String(at.getMinutes()).padStart(2, '0')}` : b.kind === 'counter' ? String(counter).padStart(b.pad ?? 3, '0') : b.kind === 'input' ? (values[b.id] ?? `[${b.label || 'Input'}]`) : b.value ?? '').join(''))
}

// Object URLs per blob, revoked together when the session changes
const urls = new Map<Blob, string>()
const urlOf = (b: Blob) => { let u = urls.get(b); if (!u) urls.set(b, u = URL.createObjectURL(b)); return u }
const revokeAll = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear() }

const docPdf = async (d: Doc) => buildPdf(await Promise.all(d.pages.map(async (p) => ({ jpeg: new Uint8Array(await p.blob.arrayBuffer()), w: p.w, h: p.h, dpi: p.dpi, rot: p.rot }))))
const uniqueNames = (docs: Doc[]) => { const seen = new Map<string, number>(); return docs.map((d) => { const base = d.name || 'scan', n = (seen.get(base) ?? 0) + 1; seen.set(base, n); return n > 1 ? `${base} (${n})` : base }) }

const btn = 'inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40'
const icoBtn = btn + ' px-2'
const field = 'w-full rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-sm text-white outline-none focus:border-indigo-300/60'
const acid = 'acid-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40'

export function BulkScanner() {
  const t = useT(STR), { lang } = useLang()
  const [s, setS] = useState<Settings>(loadSettings)
  const [online, setOnline] = useState<boolean | null>(null), [scanners, setScanners] = useState<Scanner[]>([]), [searching, setSearching] = useState(true), [caps, setCaps] = useState<Caps | null>(null), [ip, setIp] = useState('')
  const [session, setSession] = useState<Session | null>(null), [history, setHistory] = useState<{ list: Session[]; x: number; y: number } | null>(null)
  const [scanning, setScanning] = useState(0), [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string; keep?: Page[] } | null>(null), abort = useRef<AbortController | null>(null)
  const [asking, setAsking] = useState<null | 'new' | 'saveAll'>(null), [values, setValues] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null), [selBlock, setSelBlock] = useState<string | null>(null), [renamingPreset, setRenamingPreset] = useState(false)
  const [view, setView] = useState<{ target: string; i: number } | null>(null)
  // In-app confirm: native confirm() is blocked in embedded browsers and silently returns false
  const [ask, setAsk] = useState<{ text: string; ok: () => void; danger?: boolean } | null>(null)
  const confirmThen = (text: string, ok: () => void, danger = true) => setAsk({ text, ok, danger })
  const update = useCallback((p: Partial<Settings>) => setS((prev) => ({ ...prev, ...p })), [])
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ } }, [s])

  // ---- session persistence (IndexedDB) ----
  const openSession = useCallback(async (id?: string) => {
    revokeAll()
    const x = (id && await getSession(id).catch(() => undefined)) || newSession()
    try { localStorage.setItem(SESSION_KEY, x.id) } catch { /* private mode */ }
    setSession(x); setView(null); setNotice(null)
  }, [])
  useEffect(() => { let id: string | null = null; try { id = localStorage.getItem(SESSION_KEY) } catch { /* private mode */ } const h = setTimeout(() => void openSession(id ?? undefined), 0); void navigator.storage?.persist?.(); return () => clearTimeout(h) }, [openSession])
  useEffect(() => { if (!session || (!session.docs.length && !session.current.length)) return; const h = setTimeout(() => void putSession({ ...session, updated: Date.now() }), 300); return () => clearTimeout(h) }, [session])
  const patch = useCallback((fn: (x: Session) => Partial<Session>) => setSession((x) => x && { ...x, ...fn(x) }), [])
  const setCurrent = (fn: (p: Page[]) => Page[]) => patch((x) => ({ current: fn(x.current) }))
  const setDocs = (fn: (d: Doc[]) => Doc[]) => patch((x) => ({ docs: fn(x.docs) }))
  const editPages = (target: string, fn: (p: Page[]) => Page[]) => target === 'current' ? setCurrent(fn) : setDocs((ds) => ds.map((d) => d.id === target ? { ...d, pages: fn(d.pages) } : d).filter((d) => d.pages.length))

  // ---- scanner discovery ----
  const search = useCallback(async (host?: string) => {
    setSearching(true)
    const on = await bridgeOnline(); setOnline(on)
    try {
      const list = await listScanners(on, host)
      setScanners((prev) => host ? [...prev.filter((p) => !list.some((l) => l.id === p.id)), ...list] : list)
      setS((p) => list.some((m) => m.id === p.scannerId) || (!host && !list.length) ? p : { ...p, scannerId: list[0]?.id ?? p.scannerId })
      if (host) setIp('')
    } catch (e) { setNotice({ kind: 'error', text: (e as Error).message }) }
    setSearching(false)
  }, [])
  useEffect(() => { const h = setTimeout(() => void search(), 0); return () => clearTimeout(h) }, [search])
  useEffect(() => { if (online !== false) return; const h = setInterval(() => void bridgeOnline().then((on) => { if (on) void search() }), 4000); return () => clearInterval(h) }, [online, search])
  const scanner = scanners.find((x) => x.id === s.scannerId)
  useEffect(() => { if (!scanner) return; let live = true; capabilities(scanner.id).then((c) => live && setCaps(c), () => live && setCaps(null)); return () => { live = false } }, [scanner])
  const source = caps?.sources.length && !caps.sources.includes(s.source) ? caps.sources[0] : s.source
  const dpis = caps?.resolutions.filter((r) => r >= 100 && r <= 600).length ? caps.resolutions.filter((r) => r >= 100 && r <= 600) : [150, 300, 600]

  // ---- naming ----
  const preset = s.presets.find((p) => p.id === s.presetId) ?? s.presets[0]
  const setPreset = (p: Partial<Preset>) => update({ presets: s.presets.map((x) => x.id === preset.id ? { ...x, ...p } : x) })
  const inputs = preset.blocks.filter(asked)
  const preview = buildName(preset.blocks, values, preset.counter, lang)
  const existing = useMemo(() => new Set(session?.docs.map((d) => d.name)), [session?.docs])

  async function scan() {
    if (scanning || !scanner || !session) return
    const ac = new AbortController(); abort.current = ac; setNotice(null); setScanning(1)
    try {
      const skipped = await runScan(scanner, { source, mode: s.mode, dpi: s.dpi, skipBlank: s.skipBlank }, (p) => setCurrent((c) => [...c, p]), (n) => setScanning(n), ac.signal)
      if (skipped.length) setNotice({ kind: 'info', text: t.skipped(skipped.length), keep: skipped })
    } catch (e) { if (!ac.signal.aborted) setNotice({ kind: 'error', text: (e as Error).message }) }
    setScanning(0); abort.current = null
  }

  // Finishing a scan asks for the input blocks, then files the pages under the resolved name
  function finish(then: 'new' | 'saveAll') {
    if (!session) return
    if (!session.current.length) return then === 'saveAll' ? void saveAll(session.docs) : undefined
    if (session.reopened) return commit(then, {})
    if (!inputs.length) return commit(then, {})
    setValues(Object.fromEntries(inputs.map((b) => [b.id, b.kind === 'date' ? iso(new Date()) : '']))); setAsking(then)
  }
  function commit(then: 'new' | 'saveAll', vals: Record<string, string>) {
    if (!session) return
    const ro = session.reopened
    if (ro) { const docs = [...session.docs]; docs.splice(Math.min(ro.index, docs.length), 0, { ...ro.doc, pages: session.current }); patch(() => ({ docs, current: [], reopened: undefined })); setNotice(null); if (then === 'saveAll') void saveAll(docs); return }
    const doc: Doc = { id: uid(), name: buildName(preset.blocks, vals, preset.counter, lang), pages: session.current, at: Date.now() }, docs = [...session.docs, doc]
    const recent = { ...s.recent }; inputs.forEach((b) => { if (b.kind !== 'input') return; const v = vals[b.id]?.trim(); if (v) recent[b.id] = [v, ...(recent[b.id] ?? []).filter((x) => x !== v)].slice(0, 6) })
    patch(() => ({ docs, current: [] })); setAsking(null); setNotice(null)
    update({ recent, presets: s.presets.map((x) => x.id === preset.id && x.blocks.some((b) => b.kind === 'counter') ? { ...x, counter: x.counter + 1 } : x) })
    if (then === 'saveAll') void saveAll(docs)
  }
  // Moves a finished file back into the current scan so more pages can be added; finishing puts it back under the same name
  const reopen = (d: Doc, index: number) => patch((x) => ({ current: d.pages, docs: x.docs.filter((y) => y.id !== d.id), reopened: { doc: d, index } }))
  const cancelReopen = () => { const ro = session?.reopened; if (!ro) return; const undo = () => patch((x) => { const docs = [...x.docs]; docs.splice(Math.min(ro.index, docs.length), 0, ro.doc); return { docs, current: [], reopened: undefined } }); if (session.current.length !== ro.doc.pages.length) confirmThen(t.discardAdded, undo); else undo() }
  async function saveAll(docs: Doc[]) {
    if (!docs.length) return
    const names = uniqueNames(docs)
    download(buildZip(await Promise.all(docs.map(async (d, i) => ({ name: `${names[i]}.pdf`, data: new Uint8Array(await (await docPdf(d)).arrayBuffer()) })))), `scans_${fmtDate(new Date(), 'iso', lang)}.zip`)
    patch(() => ({ finished: Date.now() }))
  }
  const startNew = () => session?.current.length ? confirmThen(t.newSessionConfirm, () => void openSession(), false) : void openSession()
  const showHistory = async (el: HTMLElement) => { if (history) return setHistory(null); const b = el.getBoundingClientRect(); setHistory({ list: await listSessions(), x: Math.max(8, Math.min(b.left, innerWidth - 328)) + scrollX, y: b.bottom + 8 + scrollY }) }

  const keys = useRef({ scan, finish }); keys.current = { scan, finish }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (asking || view || (e.target as HTMLElement).closest('input,select,textarea') || e.ctrlKey || e.metaKey || e.altKey) return; const k = e.key.toLowerCase(); if (k === 's') { e.preventDefault(); void keys.current.scan() } else if (k === 'n') { e.preventDefault(); keys.current.finish('new') } }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  }, [asking, view])

  const setBlock = (id: string, p: Partial<Block>) => setPreset({ blocks: preset.blocks.map((b) => b.id === id ? { ...b, ...p } : b) })
  const addBlock = (kind: Kind) => { const b: Block = { id: uid(), kind, ...(kind === 'date' ? { fmt: 'dmonth' } : kind === 'sep' ? { value: '_' } : kind === 'text' ? { value: '' } : kind === 'input' ? { label: '' } : kind === 'counter' ? { pad: 3 } : {}) }; setPreset({ blocks: [...preset.blocks, b] }); setSelBlock(b.id) }
  const addPreset = (copy: boolean) => { const p: Preset = copy ? { ...preset, id: uid(), name: t.copyOf(preset.name), blocks: preset.blocks.map((b) => ({ ...b, id: uid() })) } : { id: uid(), name: t.newPreset, counter: 1, blocks: [{ id: uid(), kind: 'date', fmt: 'iso' }, { id: uid(), kind: 'sep', value: '_' }, { id: uid(), kind: 'input', label: '' }] }; update({ presets: [...s.presets, p], presetId: p.id }); setRenamingPreset(true) }
  const sel = preset.blocks.find((b) => b.id === selBlock)
  const blockText = (b: Block) => b.kind === 'input' ? `[${b.label || t.kinds.input}]` : b.kind === 'date' && b.when === 'ask' ? `[${t.kinds.date}]` : b.kind === 'sep' ? (b.value === ' ' ? '␣' : b.value || '∅') : b.kind === 'text' ? (b.value || '…') : buildName([b], {}, preset.counter, lang)
  const viewPages = view ? (view.target === 'current' ? session?.current : session?.docs.find((d) => d.id === view.target)?.pages) ?? [] : []

  if (!session) return <p className="animate-pulse text-slate-400">{t.loading}</p>
  const total = session.docs.length + (session.current.length ? 1 : 0)

  return (
    <div>
      <ToolHeader intro={t.intro} actions={<>
        <div>
          <button className={btn} disabled={!!scanning} onClick={(e) => void showHistory(e.currentTarget)}><FolderOpen className="size-4" />{t.sessions}</button>
          {history && <SessionList t={t} lang={lang} list={history.list} at={history} activeId={session.id} onClose={() => setHistory(null)} onOpen={(id) => { setHistory(null); void openSession(id) }} onDelete={(id) => confirmThen(t.delSessionConfirm, async () => { await deleteSession(id); if (id === session.id) await openSession(); const list = await listSessions(); setHistory((h) => h && { ...h, list }) })} />}
        </div>
        <button className={btn} disabled={!total || !!scanning} onClick={startNew}><Plus className="size-4" />{t.newSession}</button>
        <button className={acid} disabled={!total} onClick={() => finish('saveAll')}><FileArchive className="size-4" />{t.saveAll(total)}</button>
      </>} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {/* Scanner + settings */}
          <section className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <label className="min-w-64 flex-1"><span className="tech-label mb-2">{t.scanner}</span>
                <div className="flex gap-2">
                  <select className={field} value={s.scannerId} onChange={(e) => update({ scannerId: e.target.value })}>
                    {!scanner && <option value={s.scannerId}>{searching ? '…' : t.none}</option>}
                    {scanners.map((x) => <option key={x.id} value={x.id}>{x.model && !x.demo ? x.model : x.name}{x.demo ? ` · ${x.model}` : ` (${x.host})`}</option>)}
                  </select>
                  <button className={icoBtn} title={t.refresh} onClick={() => void search()} disabled={searching}><RefreshCw className={`size-4 ${searching ? 'animate-spin' : ''}`} /></button>
                </div>
              </label>
              <Seg label={t.source} value={source} onChange={(v) => update({ source: v })} opts={(['flatbed', 'feeder', 'duplex'] as Source[]).map((v) => [v, t[v], !!caps && !caps.sources.includes(v)])} />
              <Seg label={t.color} value={s.mode} onChange={(v) => update({ mode: v })} opts={[['color', t.mode.color], ['gray', t.mode.gray], ['bw', t.mode.bw]]} />
              <Seg label={t.dpi} value={String(dpis.includes(s.dpi) ? s.dpi : dpis.reduce((b, r) => Math.abs(r - s.dpi) < Math.abs(b - s.dpi) ? r : b))} onChange={(v) => update({ dpi: +v })} opts={dpis.map((d) => [String(d), String(d)])} />
              <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-sm text-slate-300"><input type="checkbox" className="size-4 accent-indigo-300" checked={s.skipBlank} onChange={(e) => update({ skipBlank: e.target.checked })} />{t.skipBlank}</label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/5 pt-3 text-xs">
              {online === false && <span className="flex flex-wrap items-center gap-1.5 text-amber-300/90"><WifiOff className="size-3.5" />{t.demo} <code className="rounded bg-slate-950/70 px-1.5 py-0.5 text-amber-100">node scanner-bridge/scanner-bridge.mjs</code><button className="underline hover:text-amber-100" onClick={() => void search()}>{t.retry}</button></span>}
              {online && <span className="flex items-center gap-1.5 text-emerald-300/90"><Wifi className="size-3.5" />{t.online(scanners.length)}</span>}
              {online && <form className="ml-auto flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (ip.trim()) void search(ip.trim()) }}><input className={field + ' w-36 py-1 text-xs'} placeholder={t.ipPh} value={ip} onChange={(e) => setIp(e.target.value)} /><button className={btn + ' whitespace-nowrap py-1 text-xs'} disabled={!ip.trim() || searching}>{t.addIp}</button></form>}
            </div>
          </section>

          {/* Current scan */}
          <section className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><span className="tech-label">{t.current}</span><p className="mt-1 text-sm text-slate-400">{t.pages(session.current.length)}{scanner && <> · {scanner.model || scanner.name}</>}</p></div>
              <div className="flex flex-wrap gap-2">
                {scanning ? <button className={acid} onClick={() => abort.current?.abort()}><Loader2 className="size-4 animate-spin" />{t.scanning(scanning)}<Square className="ml-1 size-3.5 fill-current" /></button>
                  : <button className={acid} disabled={!scanner} onClick={() => void scan()}><ScanLine className="size-4" />{t.scan}</button>}
                <button className={btn + ' py-2'} disabled={!session.current.length || !!scanning} onClick={() => finish('new')}>{session.reopened ? <FilePlus2 className="size-4" /> : <Plus className="size-4" />}{session.reopened ? t.doneAdding : t.newScan}</button>
              </div>
            </div>
            {session.reopened && <p className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-300/30 bg-indigo-300/10 px-3 py-2 text-sm text-indigo-100"><FilePlus2 className="size-4 shrink-0" /><span className="min-w-0 flex-1">{t.addingTo} <code className="break-all font-semibold">{session.reopened.doc.name}.pdf</code></span><button className="underline hover:text-white" onClick={cancelReopen}>{t.cancel}</button></p>}
            {notice && <p className={`mt-4 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${notice.kind === 'error' ? 'bg-red-500/10 text-red-300' : 'bg-white/5 text-slate-300'}`}><span className="flex-1">{notice.text}</span>{notice.keep && <button className="text-indigo-300 underline hover:text-indigo-200" onClick={() => { const k = notice.keep!; setCurrent((c) => [...c, ...k]); setNotice(null) }}>{t.keep}</button>}<button onClick={() => setNotice(null)}><X className="size-4" /></button></p>}
            {session.current.length ? (
              <Sortable className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3" items={session.current} onMove={(a, b) => setCurrent((c) => move(c, a, b))}
                render={(p, i) => <Thumb page={p} n={i + 1} t={t} onOpen={() => setView({ target: 'current', i })} onRotate={() => editPages('current', (c) => c.map((x) => x.id === p.id ? { ...x, rot: (x.rot + 90) % 360 } : x))} onRemove={() => editPages('current', (c) => c.filter((x) => x.id !== p.id))} />}
                tail={!!scanning && <div className="flex aspect-[1/1.414] items-center justify-center rounded-lg border border-dashed border-indigo-300/40 text-indigo-300"><Loader2 className="size-6 animate-spin" /></div>} />
            ) : <div className="mt-5 flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-sm text-slate-500">{scanning ? <Loader2 className="size-6 animate-spin text-indigo-300" /> : <Printer className="size-8 text-slate-600" />}{scanning ? t.scanning(scanning) : t.empty}</div>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3 text-xs text-slate-500">
              <span>{t.namePreview} <code className="text-slate-300">{session.reopened ? session.reopened.doc.name : buildName(preset.blocks, {}, preset.counter, lang)}.pdf</code></span>
              <span className="inline-flex items-center gap-1.5"><Keyboard className="size-3.5" />{session.current.length > 1 ? t.dragHint : t.shortcuts}</span>
            </div>
          </section>

          {/* Session */}
          <section className="glass rounded-2xl p-5">
            <div className="flex items-baseline justify-between gap-3"><span className="tech-label">{t.session}</span><span className="text-xs text-slate-500">{t.started(new Date(session.created).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }))}{session.finished && <> · {t.saved}</>}</span></div>
            {!session.docs.length ? <p className="mt-3 text-sm text-slate-500">{t.noDocs}</p> : (
              <Sortable className="mt-4 divide-y divide-white/5" items={session.docs} onMove={(a, b) => setDocs((d) => move(d, a, b))} render={(d, i) => (
                <div className="flex items-center gap-3 py-2.5">
                  <button className="shrink-0" onClick={() => setView({ target: d.id, i: 0 })}><img src={urlOf(d.pages[0].thumb)} alt="" draggable={false} className="h-12 w-9 rounded border border-white/10 object-cover transition hover:border-indigo-300" style={{ transform: `rotate(${d.pages[0].rot}deg)` }} /></button>
                  <div className="min-w-0 flex-1">
                    {editing === d.id ? <input autoFocus className={field} defaultValue={d.name} onBlur={(e) => { const v = clean(e.target.value); setDocs((x) => x.map((y) => y.id === d.id ? { ...y, name: v || y.name } : y)); setEditing(null) }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                      : <p className="truncate font-mono text-sm text-white">{uniqueNames(session.docs)[i]}.pdf</p>}
                    <p className="text-xs text-slate-500">{t.pages(d.pages.length)} · {new Date(d.at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <button className={icoBtn} title={session.current.length ? t.addPagesBusy : t.addPages} disabled={!!session.current.length || !!scanning} onClick={() => reopen(d, i)}><FilePlus2 className="size-4" /></button>
                  <button className={icoBtn} title={t.rename} onClick={() => setEditing(d.id)}><Pencil className="size-4" /></button>
                  <button className={icoBtn} title={t.pdf} onClick={async () => download(await docPdf(d), `${uniqueNames(session.docs)[i]}.pdf`)}><FileDown className="size-4" /></button>
                  <button className={icoBtn + ' hover:text-red-300'} title={t.remove} onClick={() => setDocs((x) => x.filter((y) => y.id !== d.id))}><Trash2 className="size-4" /></button>
                </div>)} />
            )}
          </section>
        </div>

        {/* Naming convention builder */}
        <aside className="glass h-fit rounded-2xl p-5 lg:sticky lg:top-6">
          <span className="tech-label">{t.naming}</span>
          <div className="mt-4 flex gap-1.5">
            {renamingPreset ? <input autoFocus className={field} aria-label={t.presetName} defaultValue={preset.name} onFocus={(e) => e.target.select()} onBlur={(e) => { setPreset({ name: e.target.value.trim() || preset.name }); setRenamingPreset(false) }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
              : <select className={field} aria-label={t.preset} value={preset.id} onChange={(e) => { update({ presetId: e.target.value }); setSelBlock(null) }}>{s.presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
            <button className={icoBtn} title={t.rename} onClick={() => setRenamingPreset(true)}><Pencil className="size-3.5" /></button>
            <button className={icoBtn} title={t.dupPreset} onClick={() => addPreset(true)}><Copy className="size-3.5" /></button>
            <button className={icoBtn} title={t.newPreset} onClick={() => addPreset(false)}><Plus className="size-3.5" /></button>
            <button className={icoBtn + ' hover:text-red-300'} title={t.delPreset} disabled={s.presets.length < 2} onClick={() => confirmThen(t.delPresetConfirm, () => update({ presets: s.presets.filter((p) => p.id !== preset.id), presetId: s.presets.find((p) => p.id !== preset.id)!.id }))}><Trash2 className="size-3.5" /></button>
          </div>
          <Sortable className="mt-3 flex min-h-12 flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/50 p-2" items={preset.blocks} onMove={(a, b) => setPreset({ blocks: move(preset.blocks, a, b) })} render={(b) => { const I = ICONS[b.kind]; return (
            <button onClick={() => setSelBlock(b.id === selBlock ? null : b.id)} className={`inline-flex cursor-grab items-center gap-1 rounded-lg border px-2 py-1 font-mono text-xs transition active:cursor-grabbing ${b.id === selBlock ? 'border-indigo-300 bg-indigo-300/15 text-indigo-200' : asked(b) ? 'border-amber-300/40 bg-amber-300/10 text-amber-200' : b.kind === 'sep' ? 'border-white/10 bg-white/5 text-slate-400' : 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'}`}>
              {b.kind !== 'sep' && <I className="size-3" />}{blockText(b)}
            </button>) }} />
          <p className="mt-2 text-xs text-slate-500">{t.preview}: <code className="break-all text-slate-300">{buildName(preset.blocks, {}, preset.counter, lang)}.pdf</code></p>

          {sel && (
            <div className="mt-4 space-y-3 rounded-xl border border-indigo-300/30 bg-indigo-300/5 p-3">
              <div className="flex items-center justify-between text-sm font-semibold text-white">{t.kinds[sel.kind]}
                <div className="flex gap-1">
                  {[-1, 1].map((d) => <button key={d} className={btn + ' px-1.5 py-1'} onClick={() => { const i = preset.blocks.indexOf(sel), j = i + d; if (j >= 0 && j < preset.blocks.length) setPreset({ blocks: move(preset.blocks, i, j) }) }}>{d < 0 ? <ArrowLeft className="size-3.5" /> : <ArrowRight className="size-3.5" />}</button>)}
                  <button className={btn + ' px-1.5 py-1 hover:text-red-300'} onClick={() => { setPreset({ blocks: preset.blocks.filter((b) => b.id !== sel.id) }); setSelBlock(null) }}><Trash2 className="size-3.5" /></button>
                </div>
              </div>
              {sel.kind === 'date' && <>
                <label className="block text-xs text-slate-400">{t.fmt}<select className={field + ' mt-1'} value={sel.fmt} onChange={(e) => setBlock(sel.id, { fmt: e.target.value })}>{DATE_FMTS.map((f) => <option key={f} value={f}>{fmtDate(new Date(), f, lang)}</option>)}</select></label>
                <div className="text-xs text-slate-400">{t.whichDate}<div className="mt-1 flex rounded-lg border border-white/10 bg-slate-950/50 p-0.5">{(['today', 'ask', 'fixed'] as const).map((w) => <button key={w} onClick={() => setBlock(sel.id, { when: w, date: w === 'fixed' ? sel.date ?? iso(new Date(Date.now() - 864e5)) : sel.date })} className={`flex-1 rounded-md px-2 py-1 text-xs transition ${(sel.when ?? 'today') === w ? 'bg-indigo-300 font-semibold text-slate-950' : 'text-slate-400 hover:text-white'}`}>{t.when[w]}</button>)}</div></div>
                {sel.when === 'fixed' && <input type="date" className={field + ' [color-scheme:dark]'} value={sel.date ?? ''} onChange={(e) => setBlock(sel.id, { date: e.target.value })} />}
                {sel.when === 'ask' && <span className="block text-xs text-slate-500">{t.ask}</span>}
              </>}
              {sel.kind === 'sep' && <div className="flex gap-1.5">{['_', '-', ' ', '.', ''].map((v) => <button key={v} onClick={() => setBlock(sel.id, { value: v })} className={`${btn} px-3 font-mono ${sel.value === v ? '!border-indigo-300 bg-indigo-300/15 text-indigo-200' : ''}`}>{v === ' ' ? '␣' : v || '∅'}</button>)}</div>}
              {sel.kind === 'text' && <label className="block text-xs text-slate-400">{t.textVal}<input autoFocus className={field + ' mt-1'} value={sel.value ?? ''} onChange={(e) => setBlock(sel.id, { value: e.target.value })} /></label>}
              {sel.kind === 'input' && <label className="block text-xs text-slate-400">{t.label}<input autoFocus className={field + ' mt-1'} value={sel.label ?? ''} placeholder="Description, Client, Invoice nr…" onChange={(e) => setBlock(sel.id, { label: e.target.value })} /><span className="mt-1 block text-slate-500">{t.ask}</span></label>}
              {sel.kind === 'counter' && <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-400">{t.start}<input type="number" min={0} className={field + ' mt-1'} value={preset.counter} onChange={(e) => setPreset({ counter: Math.max(0, +e.target.value) })} /></label>
                <label className="text-xs text-slate-400">{t.pad}<input type="number" min={1} max={6} className={field + ' mt-1'} value={sel.pad ?? 3} onChange={(e) => setBlock(sel.id, { pad: Math.min(6, Math.max(1, +e.target.value)) })} /></label>
              </div>}
            </div>
          )}

          <p className="mt-5 text-xs font-medium uppercase tracking-wider text-slate-500">{t.addBlock}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(Object.keys(ICONS) as Kind[]).map((k) => { const I = ICONS[k]; return <button key={k} className={btn + ' justify-start'} onClick={() => addBlock(k)}><I className="size-3.5" />{t.kinds[k]}</button> })}
          </div>
        </aside>
      </div>

      {ask && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setAsk(null)}>
          <form className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && setAsk(null)} onSubmit={(e) => { e.preventDefault(); ask.ok(); setAsk(null) }}>
            <p className="text-sm leading-6 text-slate-200">{ask.text}</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setAsk(null)}>{t.cancel}</button><button autoFocus className={ask.danger ? 'inline-flex items-center gap-1.5 rounded-xl bg-red-500/90 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-500' : 'acid-button rounded-xl px-4 py-1.5 text-sm font-semibold'}>{ask.danger ? t.delete : t.ok}</button></div>
          </form>
        </div>, document.body
      )}

      {view && viewPages.length > 0 && <QuickView t={t} pages={viewPages} i={Math.min(view.i, viewPages.length - 1)} onIndex={(i) => setView({ ...view, i })} onClose={() => setView(null)}
        onRotate={(id) => editPages(view.target, (ps) => ps.map((x) => x.id === id ? { ...x, rot: (x.rot + 90) % 360 } : x))}
        onRemove={(id) => { if (viewPages.length === 1) setView(null); editPages(view.target, (ps) => ps.filter((x) => x.id !== id)) }} />}

      {/* Input-on-save dialog */}
      {asking && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setAsking(null)}>
          <form className="glass w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && setAsking(null)} onSubmit={(e) => { e.preventDefault(); commit(asking, Object.fromEntries(inputs.map((b) => [b.id, b.kind === 'date' ? values[b.id] ?? '' : clean(values[b.id] ?? '')]))) }}>
            <div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-white">{t.dialogTitle}</h2><p className="text-sm text-slate-400">{t.pages(session.current.length)} · {preset.name}</p></div><button type="button" className="text-slate-500 hover:text-white" onClick={() => setAsking(null)}><X className="size-5" /></button></div>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-1">{session.current.slice(0, 5).map((p) => <img key={p.id} src={urlOf(p.thumb)} alt="" className="h-24 rounded border border-white/10" style={{ transform: `rotate(${p.rot}deg)` }} />)}</div>
            <div className="mt-4 space-y-3">
              {inputs.map((b, i) => b.kind === 'date' ? (
                <div key={b.id} className="block text-sm text-slate-300">{t.kinds.date}
                  <div className="mt-1 flex gap-2"><input type="date" autoFocus={i === 0} className={field + ' py-2 text-base [color-scheme:dark]'} value={values[b.id] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [b.id]: e.target.value }))} />
                    {[[0, t.today], [1, t.yesterday]].map(([d, l]) => <button type="button" key={d} className={`${btn} shrink-0 ${values[b.id] === iso(new Date(Date.now() - +d * 864e5)) ? '!border-indigo-300 bg-indigo-300/15 text-indigo-200' : ''}`} onClick={() => setValues((v) => ({ ...v, [b.id]: iso(new Date(Date.now() - +d * 864e5)) }))}>{l}</button>)}</div>
                </div>
              ) : (
                <label key={b.id} className="block text-sm text-slate-300">{b.label || t.kinds.input}
                  <input autoFocus={i === 0} className={field + ' mt-1 py-2 text-base'} value={values[b.id] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [b.id]: e.target.value }))} />
                  {!!s.recent[b.id]?.length && <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">{t.lastValues}:{s.recent[b.id].map((r) => <button type="button" key={r} className="rounded-md bg-white/5 px-1.5 py-0.5 text-slate-300 hover:bg-white/10" onClick={() => setValues((v) => ({ ...v, [b.id]: r }))}>{r}</button>)}</div>}
                </label>
              ))}
            </div>
            <p className="mt-4 rounded-lg bg-slate-950/60 px-3 py-2 font-mono text-sm break-all text-indigo-200">{preview}.pdf</p>
            {existing.has(preview) && <p className="mt-2 text-xs text-amber-300">{t.dup}</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setAsking(null)}>{t.cancel}</button><button className="acid-button rounded-xl px-4 py-2 text-sm font-semibold">{t.save}</button></div>
          </form>
        </div>, document.body
      )}
    </div>
  )
}

function Seg<V extends string>({ label, value, opts, onChange }: { label: string; value: V; opts: [V, string, boolean?][]; onChange: (v: V) => void }) {
  return <div><span className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span><div className="flex rounded-lg border border-white/10 bg-slate-950/50 p-0.5">{opts.map(([v, l, off]) => <button key={v} disabled={off} onClick={() => onChange(v)} className={`rounded-md px-2.5 py-1 text-sm transition disabled:cursor-not-allowed disabled:opacity-30 ${v === value ? 'bg-indigo-300 font-semibold text-slate-950' : 'text-slate-400 hover:text-white'}`}>{l}</button>)}</div></div>
}

// Generic HTML5 drag-and-drop list: drag any item onto another to move it there
function Sortable<X extends { id: string }>({ items, render, onMove, className, tail }: { items: X[]; render: (x: X, i: number) => React.ReactNode; onMove: (from: number, to: number) => void; className?: string; tail?: React.ReactNode }) {
  const [drag, setDrag] = useState<number | null>(null), [over, setOver] = useState<number | null>(null)
  return (
    <div className={className}>
      {items.map((x, i) => (
        <div key={x.id} draggable onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.id) }} onDragEnd={() => { setDrag(null); setOver(null) }}
          onDragOver={(e) => { if (drag === null) return; e.preventDefault(); setOver(i) }} onDrop={(e) => { e.preventDefault(); if (drag !== null && drag !== i) onMove(drag, i); setDrag(null); setOver(null) }}
          className={`rounded-lg transition ${drag === i ? 'opacity-40' : ''} ${over === i && drag !== i ? 'outline-2 outline-offset-2 outline-indigo-300' : ''}`}>
          {render(x, i)}
        </div>
      ))}
      {tail}
    </div>
  )
}

function Thumb({ page, n, t, onOpen, onRotate, onRemove }: { page: Page; n: number; t: T; onOpen: () => void; onRotate: () => void; onRemove: () => void }) {
  const b = 'rounded-md bg-slate-950/80 p-1 text-slate-200 hover:text-indigo-300'
  return (
    <div className="group relative flex aspect-[1/1.414] cursor-grab items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-slate-950/40 active:cursor-grabbing" onClick={onOpen}>
      <img src={urlOf(page.thumb)} alt="" draggable={false} className="max-h-full max-w-full transition-transform" style={{ transform: `rotate(${page.rot}deg) scale(${page.rot % 180 ? 0.707 : 1})` }} />
      <span className="absolute left-1.5 top-1.5 rounded bg-slate-950/80 px-1.5 font-mono text-[10px] text-slate-300">{n}</span>
      <div className="absolute right-1.5 bottom-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        <button className={b} title={t.rotate} onClick={onRotate}><RotateCw className="size-3.5" /></button>
        <button className={b + ' hover:!text-red-300'} title={t.remove} onClick={onRemove}><Trash2 className="size-3.5" /></button>
      </div>
    </div>
  )
}

// Full-size page viewer: ←/→ browse, R rotates, Delete removes, Esc closes
function QuickView({ t, pages, i, onIndex, onClose, onRotate, onRemove }: { t: T; pages: Page[]; i: number; onIndex: (i: number) => void; onClose: () => void; onRotate: (id: string) => void; onRemove: (id: string) => void }) {
  const p = pages[i], go = useCallback((d: number) => onIndex(Math.max(0, Math.min(pages.length - 1, i + d))), [i, pages.length, onIndex])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const m: Record<string, () => void> = { Escape: onClose, ArrowLeft: () => go(-1), ArrowRight: () => go(1), r: () => onRotate(p.id), R: () => onRotate(p.id), Delete: () => onRemove(p.id) }; if (m[e.key]) { e.preventDefault(); m[e.key]() } }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [go, onClose, onRotate, onRemove, p.id])
  const side = p.rot % 180 !== 0
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-slate-300" onClick={(e) => e.stopPropagation()}>
        <span>{t.page(i + 1, pages.length)} · {p.w}×{p.h} · {p.dpi} dpi</span>
        <div className="flex gap-2">
          <button className={icoBtn} title={t.rotate} onClick={() => onRotate(p.id)}><RotateCw className="size-4" /></button>
          <button className={icoBtn + ' hover:text-red-300'} title={t.remove} onClick={() => onRemove(p.id)}><Trash2 className="size-4" /></button>
          <button className={icoBtn} onClick={onClose}><X className="size-4" /></button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        <img src={urlOf(p.blob)} alt="" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full bg-white object-contain shadow-2xl transition-transform" style={{ transform: `rotate(${p.rot}deg)`, maxHeight: side ? '80vw' : undefined, maxWidth: side ? 'calc(100vh - 7rem)' : undefined }} />
        {i > 0 && <button className="absolute left-4 rounded-full bg-slate-900/80 p-2 text-white hover:bg-slate-800" onClick={(e) => { e.stopPropagation(); go(-1) }}><ChevronLeft className="size-6" /></button>}
        {i < pages.length - 1 && <button className="absolute right-4 rounded-full bg-slate-900/80 p-2 text-white hover:bg-slate-800" onClick={(e) => { e.stopPropagation(); go(1) }}><ChevronRight className="size-6" /></button>}
      </div>
      <div className="flex justify-center gap-2 overflow-x-auto px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        {pages.map((x, j) => <button key={x.id} onClick={() => onIndex(j)} className={`h-16 shrink-0 overflow-hidden rounded border-2 ${j === i ? 'border-indigo-300' : 'border-transparent opacity-60 hover:opacity-100'}`}><img src={urlOf(x.thumb)} alt="" className="h-full" style={{ transform: `rotate(${x.rot}deg)` }} /></button>)}
      </div>
    </div>, document.body
  )
}

function SessionList({ t, lang, list, at, activeId, onOpen, onDelete, onClose }: { t: T; lang: string; list: Session[]; at: { x: number; y: number }; activeId: string; onOpen: (id: string) => void; onDelete: (id: string) => void; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div style={{ left: at.x, top: at.y }} className="absolute z-50 max-h-96 w-80 overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-2 shadow-2xl">
        {!list.length && <p className="p-3 text-sm text-slate-500">{t.noSessions}</p>}
        {list.map((x) => {
          const pages = x.docs.reduce((n, d) => n + d.pages.length, 0) + x.current.length, thumb = x.docs[0]?.pages[0]?.thumb ?? x.current[0]?.thumb
          return (
            <div key={x.id} className={`flex items-center gap-3 rounded-lg p-2 ${x.id === activeId ? 'bg-indigo-300/10' : 'hover:bg-white/5'}`}>
              {thumb ? <img src={urlOf(thumb)} alt="" className="h-10 w-7 rounded border border-white/10 object-cover" /> : <div className="h-10 w-7 rounded border border-dashed border-white/10" />}
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate text-white">{new Date(x.created).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                <p className="text-xs text-slate-500">{t.docsCount(x.docs.length)} · {t.pages(pages)}{x.finished ? ` · ${t.saved}` : ''}</p>
              </div>
              {x.id === activeId ? <span className="text-xs text-indigo-300">{t.active}</span> : <button className={btn + ' py-1 text-xs'} onClick={() => onOpen(x.id)}>{t.resume}</button>}
              <button className="text-slate-500 hover:text-red-300" title={t.remove} onClick={() => onDelete(x.id)}><Trash2 className="size-4" /></button>
            </div>
          )
        })}
      </div>
    </>, document.body
  )
}
