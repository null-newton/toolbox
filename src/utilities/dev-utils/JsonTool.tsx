import { useMemo, useState } from 'react'
import { ToolHeader } from '../../components/ToolHeader'
import { useT } from '../../i18n/LanguageContext'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { CodeArea, CopyButton, ErrorNote, Output, Panel, Segmented, Toggle } from './ui'

type Mode = 'format' | 'diff'
type Indent = '2' | '4' | 'tab' | 'min'

const STR = {
  en: {
    intro: 'Pretty-print, minify and validate JSON, or compare two documents and see exactly which paths changed. Nothing leaves your browser.',
    format: 'Format', diff: 'Diff', input: 'Input', output: 'Output', left: 'Original', right: 'Changed',
    indent: 'Indent', tab: 'Tab', minify: 'Minify', sortKeys: 'Sort keys',
    placeholder: 'Paste JSON here…', valid: 'Valid JSON', at: 'line', col: 'column',
    sample: 'Load sample', identical: 'The two documents are identical.',
    added: 'added', removed: 'removed', changed: 'changed', changes: 'differences',
    bothNeeded: 'Paste JSON on both sides to compare.',
  },
  nl: {
    intro: 'JSON netjes opmaken, verkleinen en valideren, of twee documenten vergelijken en precies zien welke paden veranderd zijn. Niets verlaat je browser.',
    format: 'Opmaken', diff: 'Vergelijken', input: 'Invoer', output: 'Uitvoer', left: 'Origineel', right: 'Gewijzigd',
    indent: 'Inspringen', tab: 'Tab', minify: 'Verkleinen', sortKeys: 'Sleutels sorteren',
    placeholder: 'Plak hier JSON…', valid: 'Geldige JSON', at: 'regel', col: 'kolom',
    sample: 'Voorbeeld laden', identical: 'De twee documenten zijn identiek.',
    added: 'toegevoegd', removed: 'verwijderd', changed: 'gewijzigd', changes: 'verschillen',
    bothNeeded: 'Plak aan beide kanten JSON om te vergelijken.',
  },
}

const SAMPLE = '{"name":"toolbox","version":2,"tags":["dev","json"],"owner":{"id":7,"active":true},"notes":null}'

type Parsed = { ok: true; value: unknown } | { ok: false; message: string; line?: number; column?: number }

function parse(text: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (e) {
    const message = (e as Error).message
    const lc = /line (\d+) column (\d+)/.exec(message)
    if (lc) return { ok: false, message, line: +lc[1], column: +lc[2] }
    const pos = /position (\d+)/.exec(message)
    if (pos) {
      const before = text.slice(0, +pos[1]).split('\n')
      return { ok: false, message, line: before.length, column: before[before.length - 1].length + 1 }
    }
    return { ok: false, message }
  }
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]))
  }
  return v
}

type Diff = { path: string; kind: 'added' | 'removed' | 'changed'; a?: unknown; b?: unknown }

const keyPath = (base: string, key: string | number) =>
  typeof key === 'number' ? `${base}[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`

function diff(a: unknown, b: unknown, path = '$', out: Diff[] = []): Diff[] {
  const isObj = (x: unknown) => x !== null && typeof x === 'object'
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length) out.push({ path: keyPath(path, i), kind: 'added', b: b[i] })
      else if (i >= b.length) out.push({ path: keyPath(path, i), kind: 'removed', a: a[i] })
      else diff(a[i], b[i], keyPath(path, i), out)
    }
  } else if (isObj(a) && isObj(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const ao = a as Record<string, unknown>, bo = b as Record<string, unknown>
    for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
      if (!(k in bo)) out.push({ path: keyPath(path, k), kind: 'removed', a: ao[k] })
      else if (!(k in ao)) out.push({ path: keyPath(path, k), kind: 'added', b: bo[k] })
      else diff(ao[k], bo[k], keyPath(path, k), out)
    }
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push({ path, kind: 'changed', a, b })
  }
  return out
}

const short = (v: unknown) => {
  const s = JSON.stringify(v)
  return s.length > 80 ? s.slice(0, 77) + '…' : s
}

export function JsonTool() {
  const t = useT(STR)
  const { config, setConfig, saving, error } = useUtilityConfig('json-tools', { indent: '2' as Indent, sortKeys: false })
  const [mode, setMode] = useState<Mode>('format')
  const [input, setInput] = useState('')
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')

  const parsed = useMemo(() => (input.trim() ? parse(input) : null), [input])
  const output = useMemo(() => {
    if (!parsed?.ok) return ''
    const v = config.sortKeys ? sortDeep(parsed.value) : parsed.value
    const space = config.indent === 'min' ? undefined : config.indent === 'tab' ? '\t' : Number(config.indent)
    return JSON.stringify(v, null, space)
  }, [parsed, config.indent, config.sortKeys])

  const pl = useMemo(() => (left.trim() ? parse(left) : null), [left])
  const pr = useMemo(() => (right.trim() ? parse(right) : null), [right])
  const diffs = useMemo(() => (pl?.ok && pr?.ok ? diff(pl.value, pr.value) : null), [pl, pr])

  const errorText = (p: Parsed | null) =>
    p && !p.ok ? (p.line ? `${t.at} ${p.line}, ${t.col} ${p.column}: ${p.message}` : p.message) : null

  const kindStyle = { added: 'text-lime-300', removed: 'text-rose-300', changed: 'text-amber-200' } as const

  return (
    <div>
      <ToolHeader intro={t.intro} save={{ saving, error }} />
      <Segmented value={mode} onChange={setMode} options={[{ id: 'format', label: t.format }, { id: 'diff', label: t.diff }]} />

      {mode === 'format' ? (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Segmented
              mono
              value={config.indent}
              onChange={(indent) => setConfig({ indent })}
              options={[{ id: '2', label: '2' }, { id: '4', label: '4' }, { id: 'tab', label: t.tab }, { id: 'min', label: t.minify }]}
            />
            <Toggle checked={config.sortKeys} onChange={(sortKeys) => setConfig({ sortKeys })}>{t.sortKeys}</Toggle>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Panel title={t.input} actions={<button type="button" onClick={() => setInput(SAMPLE)} className="text-xs text-slate-400 hover:text-white">{t.sample}</button>}>
              <CodeArea value={input} onChange={(e) => setInput(e.target.value)} rows={18} placeholder={t.placeholder} />
              {errorText(parsed) && <ErrorNote>{errorText(parsed)}</ErrorNote>}
              {parsed?.ok && <p className="mt-3 text-xs text-lime-300">✓ {t.valid}</p>}
            </Panel>
            <Panel title={t.output} actions={<CopyButton value={output} />}>
              <Output value={output} />
            </Panel>
          </div>
        </>
      ) : (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Panel title={t.left}>
              <CodeArea value={left} onChange={(e) => setLeft(e.target.value)} rows={14} placeholder={t.placeholder} />
              {errorText(pl) && <ErrorNote>{errorText(pl)}</ErrorNote>}
            </Panel>
            <Panel title={t.right}>
              <CodeArea value={right} onChange={(e) => setRight(e.target.value)} rows={14} placeholder={t.placeholder} />
              {errorText(pr) && <ErrorNote>{errorText(pr)}</ErrorNote>}
            </Panel>
          </div>
          <Panel className="mt-4" title={diffs ? `${diffs.length} ${t.changes}` : t.diff}>
            {!diffs ? (
              <p className="text-sm text-slate-500">{t.bothNeeded}</p>
            ) : diffs.length === 0 ? (
              <p className="text-sm text-lime-300">{t.identical}</p>
            ) : (
              <ul className="divide-y divide-white/5 font-mono text-[13px]">
                {diffs.map((d) => (
                  <li key={d.kind + d.path} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                    <span className={`w-20 shrink-0 text-xs uppercase tracking-wider ${kindStyle[d.kind]}`}>{t[d.kind]}</span>
                    <span className="break-all text-cyan-200">{d.path}</span>
                    <span className="break-all text-slate-400">
                      {d.kind === 'added' ? short(d.b) : d.kind === 'removed' ? short(d.a) : `${short(d.a)} → ${short(d.b)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}
