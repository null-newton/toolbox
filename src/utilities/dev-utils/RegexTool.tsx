import { useMemo, useState, type ReactNode } from 'react'
import { ToolHeader } from '../../components/ToolHeader'
import { useLang, useT } from '../../i18n/LanguageContext'
import { CodeArea, CopyButton, ErrorNote, Output, Panel } from './ui'

const FLAGS = [
  { f: 'g', en: 'global', nl: 'globaal' },
  { f: 'i', en: 'ignore case', nl: 'hoofdletterongevoelig' },
  { f: 'm', en: 'multiline', nl: 'meerdere regels' },
  { f: 's', en: 'dot matches newline', nl: 'punt matcht nieuwe regel' },
  { f: 'u', en: 'unicode', nl: 'unicode' },
  { f: 'y', en: 'sticky', nl: 'sticky' },
] as const

const STR = {
  en: {
    intro: 'Write a JavaScript regular expression and see every match, capture group and replacement live against your own test text.',
    pattern: 'Pattern', test: 'Test text', testPh: 'Text to match against…', matches: 'Matches', noMatch: 'No matches',
    replace: 'Replace', replacePh: 'Replacement, e.g. $1 or $<name>', result: 'Result', group: 'Group', at: 'at',
    cheat: 'Quick reference', limit: 'Showing the first 500 matches.',
  },
  nl: {
    intro: 'Schrijf een reguliere JavaScript-expressie en zie live elke match, capture-groep en vervanging op je eigen testtekst.',
    pattern: 'Patroon', test: 'Testtekst', testPh: 'Tekst om op te matchen…', matches: 'Matches', noMatch: 'Geen matches',
    replace: 'Vervangen', replacePh: 'Vervanging, bv. $1 of $<naam>', result: 'Resultaat', group: 'Groep', at: 'op',
    cheat: 'Snelle referentie', limit: 'De eerste 500 matches worden getoond.',
  },
}

const CHEATSHEET: [string, string][] = [
  ['.', 'any char'], ['\\d \\w \\s', 'digit / word / space'], ['[abc] [^abc]', 'set / not in set'],
  ['^ $', 'start / end'], ['\\b', 'word boundary'], ['* + ?', '0+, 1+, 0–1'], ['{2,5}', '2 to 5 times'],
  ['(…) (?:…)', 'group / non-capturing'], ['(?<name>…)', 'named group'], ['(?=…) (?!…)', 'lookahead'], ['a|b', 'either'],
]

const MAX = 500

export function RegexTool() {
  const t = useT(STR)
  const { lang } = useLang()
  const [pattern, setPattern] = useState('(?<word>\\w+)@(\\w+)\\.com')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('Contact alice@example.com or bob@test.com for details.')
  const [replacement, setReplacement] = useState('')

  const { re, error } = useMemo(() => {
    try { return { re: pattern ? new RegExp(pattern, flags) : null, error: null } }
    catch (e) { return { re: null, error: (e as Error).message } }
  }, [pattern, flags])

  const matches = useMemo(() => {
    if (!re) return []
    const out: RegExpExecArray[] = []
    if (!re.global && !re.sticky) {
      const m = re.exec(text)
      return m ? [m] : []
    }
    const r = new RegExp(re.source, re.flags)
    let m: RegExpExecArray | null
    while ((m = r.exec(text)) && out.length < MAX) {
      out.push(m)
      if (m[0] === '') r.lastIndex += 1 // avoid infinite loop on empty matches
    }
    return out
  }, [re, text])

  const highlighted = useMemo(() => {
    const nodes: ReactNode[] = []
    let last = 0
    matches.forEach((m, i) => {
      if (m.index > last) nodes.push(text.slice(last, m.index))
      nodes.push(<mark key={i} className={`rounded-sm px-px text-white ${i % 2 ? 'bg-cyan-400/35' : 'bg-lime-300/35'}`}>{m[0] || '​'}</mark>)
      last = m.index + m[0].length
    })
    nodes.push(text.slice(last))
    return nodes
  }, [matches, text])

  const replaced = useMemo(() => (re && replacement !== '' ? text.replace(re, replacement) : ''), [re, text, replacement])

  const toggle = (f: string) => setFlags((cur) => (cur.includes(f) ? cur.replace(f, '') : FLAGS.map((x) => x.f).filter((x) => cur.includes(x) || x === f).join('')))

  return (
    <div>
      <ToolHeader intro={t.intro} />
      <Panel title={t.pattern}>
        <div className="flex items-center rounded-sm border border-white/10 bg-panel font-mono text-sm focus-within:border-lime-300/70">
          <span className="pl-3 text-slate-500">/</span>
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} spellCheck={false} autoCapitalize="off" aria-label={t.pattern} className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-white outline-none" />
          <span className="pr-3 text-slate-500">/{flags}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FLAGS.map((x) => (
            <button key={x.f} type="button" onClick={() => toggle(x.f)} aria-pressed={flags.includes(x.f)}
              className={`rounded-lg px-2.5 py-1 text-xs ${flags.includes(x.f) ? 'acid-button' : 'border border-white/10 bg-white/5 text-slate-300 hover:text-white'}`}>
              <span className="font-mono font-semibold">{x.f}</span> {x[lang]}
            </button>
          ))}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={t.test}>
          <CodeArea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={t.testPh} />
          <div className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-sm border border-white/5 bg-black/20 p-3 font-mono text-[13px] leading-relaxed text-slate-300">
            {highlighted}
          </div>
        </Panel>
        <Panel title={`${t.matches} · ${matches.length}`}>
          {matches.length === 0 ? <p className="text-sm text-slate-500">{t.noMatch}</p> : (
            <ol className="max-h-[26rem] space-y-2 overflow-auto">
              {matches.map((m, i) => (
                <li key={i} className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 font-mono text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="break-all text-lime-200">{JSON.stringify(m[0])}</span>
                    <span className="shrink-0 text-slate-500">{t.at} {m.index}</span>
                  </div>
                  {m.length > 1 && (
                    <ul className="mt-1.5 space-y-0.5 text-slate-400">
                      {m.slice(1).map((g, gi) => (
                        <li key={gi}>{t.group} {gi + 1}: <span className="text-cyan-200">{g === undefined ? 'undefined' : JSON.stringify(g)}</span></li>
                      ))}
                      {m.groups && Object.entries(m.groups).map(([name, g]) => (
                        <li key={name}>&lt;{name}&gt;: <span className="text-cyan-200">{g === undefined ? 'undefined' : JSON.stringify(g)}</span></li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              {matches.length >= MAX && <li className="text-xs text-slate-500">{t.limit}</li>}
            </ol>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title={t.replace} actions={<CopyButton value={replaced} />}>
          <input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder={t.replacePh} spellCheck={false} className="form-input font-mono" />
          {replacement !== '' && <div className="mt-3"><p className="mb-1.5 text-xs text-slate-500">{t.result}</p><Output value={replaced} /></div>}
        </Panel>
        <Panel title={t.cheat}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {CHEATSHEET.map(([k, v]) => <div key={k} className="contents"><dt className="font-mono text-lime-200">{k}</dt><dd className="text-slate-400">{v}</dd></div>)}
          </dl>
        </Panel>
      </div>
    </div>
  )
}

