import { useState } from 'react'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { useT } from '../../i18n/LanguageContext'
import { ToolHeader } from '../../components/ToolHeader'
import { CodeArea, CopyButton, Panel, Toggle } from '../dev-utils/ui'

/**
 * Example utility demonstrating the groundwork pattern:
 * - useUtilityConfig persists the user's preferences (selected case, auto-trim)
 *   to their account, so they're restored on the next visit / another device.
 * - Ephemeral state (the text being converted) stays in plain useState.
 */

type CaseMode = 'upper' | 'lower' | 'title' | 'sentence' | 'camel' | 'pascal' | 'snake' | 'constant' | 'kebab' | 'dot'

const CASE_MODES: { id: CaseMode; label: string }[] = [
  { id: 'upper', label: 'UPPERCASE' },
  { id: 'lower', label: 'lowercase' },
  { id: 'title', label: 'Title Case' },
  { id: 'sentence', label: 'Sentence case' },
  { id: 'camel', label: 'camelCase' },
  { id: 'pascal', label: 'PascalCase' },
  { id: 'snake', label: 'snake_case' },
  { id: 'constant', label: 'CONSTANT_CASE' },
  { id: 'kebab', label: 'kebab-case' },
  { id: 'dot', label: 'dot.case' },
]

const STR = {
  en: {
    loading: 'Loading your settings…',
    intro: 'Convert text between case styles, including the ones used for variable names. With an account, your selected case and options are remembered.',
    autoTrim: 'Trim whitespace automatically',
    perLine: 'Convert each line separately',
    placeholder: 'Type or paste text here…',
    input: 'Input',
    result: 'Result',
    all: 'All cases',
  },
  nl: {
    loading: 'Je instellingen laden…',
    intro: 'Zet tekst om tussen hoofdletterstijlen, ook die voor variabelenamen. Met een account worden je gekozen stijl en opties onthouden.',
    autoTrim: 'Spaties automatisch bijsnijden',
    perLine: 'Elke regel apart omzetten',
    placeholder: 'Typ of plak hier tekst…',
    input: 'Invoer',
    result: 'Resultaat',
    all: 'Alle stijlen',
  },
}

/** Split into words on spaces, punctuation and camelCase / PascalCase boundaries. */
function words(text: string): string[] {
  return text
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean)
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

function convertLine(input: string, mode: CaseMode): string {
  const ws = words(input)
  switch (mode) {
    case 'upper': return input.toUpperCase()
    case 'lower': return input.toLowerCase()
    case 'title': return input.toLowerCase().replace(/(^|[\s\-_/("'])(\p{L})/gu, (_, p, c) => p + c.toUpperCase())
    case 'sentence': return input.toLowerCase().replace(/(^\s*\p{L})|([.!?]\s+\p{L})/gu, (m) => m.toUpperCase())
    case 'camel': return ws.map((w, i) => (i ? cap(w) : w.toLowerCase())).join('')
    case 'pascal': return ws.map(cap).join('')
    case 'snake': return ws.map((w) => w.toLowerCase()).join('_')
    case 'constant': return ws.map((w) => w.toUpperCase()).join('_')
    case 'kebab': return ws.map((w) => w.toLowerCase()).join('-')
    case 'dot': return ws.map((w) => w.toLowerCase()).join('.')
  }
}

function convert(text: string, mode: CaseMode, trim: boolean, perLine: boolean): string {
  const input = trim ? text.trim() : text
  return perLine ? input.split('\n').map((l) => convertLine(trim ? l.trim() : l, mode)).join('\n') : convertLine(input, mode)
}

export function TextCaseConverter() {
  const { config, setConfig, loading, saving, error: configError } = useUtilityConfig('text-case', {
    mode: 'upper' as CaseMode,
    autoTrim: true,
    perLine: true,
  })
  const [text, setText] = useState('')
  const t = useT(STR)

  if (loading) {
    return <p className="animate-pulse text-slate-400">{t.loading}</p>
  }

  const mode = CASE_MODES.some((m) => m.id === config.mode) ? config.mode : 'upper'
  const result = text ? convert(text, mode, config.autoTrim, config.perLine) : ''

  return (
    <div>
      <ToolHeader intro={t.intro} save={{ saving, error: configError }} />

      <div className="flex flex-wrap gap-2" role="radiogroup">
        {CASE_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => setConfig({ mode: m.id })}
            className={`rounded-lg px-3 py-1.5 font-mono text-xs ${
              mode === m.id
                ? 'acid-button'
                : 'border border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <Toggle checked={config.autoTrim} onChange={(autoTrim) => setConfig({ autoTrim })}>{t.autoTrim}</Toggle>
        <Toggle checked={config.perLine} onChange={(perLine) => setConfig({ perLine })}>{t.perLine}</Toggle>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel title={t.input}>
          <CodeArea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={t.placeholder} />
        </Panel>
        <Panel title={t.result} actions={<CopyButton value={result} />}>
          <p className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-white">{result || '—'}</p>
        </Panel>
      </div>

      {text.trim() && (
        <Panel className="mt-4" title={t.all}>
          <ul className="divide-y divide-white/5">
            {CASE_MODES.map((m) => {
              const v = convert(text, m.id, config.autoTrim, config.perLine)
              return (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <button type="button" onClick={() => setConfig({ mode: m.id })} className="w-32 shrink-0 text-left font-mono text-xs text-slate-500 hover:text-white">{m.label}</button>
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-100">{v}</span>
                  <CopyButton value={v} />
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
    </div>
  )
}
