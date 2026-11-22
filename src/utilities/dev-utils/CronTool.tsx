import { useMemo, useState } from 'react'
import { ToolHeader } from '../../components/ToolHeader'
import { LOCALES, useLang, useT } from '../../i18n/LanguageContext'
import { ErrorNote, Panel } from './ui'
import { describeCron, nextRuns, parseCron } from './cron'

const STR = {
  en: {
    intro: 'Paste a cron expression to read it in plain language, see what each field means and when it will run next.',
    expression: 'Expression', meaning: 'Meaning', next: 'Next runs', local: 'in your local time zone', presets: 'Examples',
    fields: ['Minute', 'Hour', 'Day of month', 'Month', 'Day of week'], ranges: ['0–59', '0–23', '1–31', '1–12 or JAN–DEC', '0–6 or SUN–SAT'],
    none: 'No run in the next five years.',
  },
  nl: {
    intro: 'Plak een cron-expressie om ze in gewone taal te lezen, te zien wat elk veld betekent en wanneer ze de volgende keer draait.',
    expression: 'Expressie', meaning: 'Betekenis', next: 'Volgende uitvoeringen', local: 'in je lokale tijdzone', presets: 'Voorbeelden',
    fields: ['Minuut', 'Uur', 'Dag van de maand', 'Maand', 'Weekdag'], ranges: ['0–59', '0–23', '1–31', '1–12 of JAN–DEC', '0–6 of SUN–SAT'],
    none: 'Geen uitvoering in de komende vijf jaar.',
  },
}

const PRESETS = ['*/15 * * * *', '0 9 * * 1-5', '30 2 1 * *', '0 0 * * 0', '0 */6 * * *', '0 8,12,18 * * *', '@daily']

export function CronTool() {
  const t = useT(STR)
  const { lang } = useLang()
  const [expr, setExpr] = useState('0 9 * * 1-5')

  const result = useMemo(() => {
    try {
      const c = parseCron(expr)
      return { c, text: describeCron(c, lang), runs: nextRuns(c, new Date(), 8) }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, [expr, lang])

  const fmt = new Intl.DateTimeFormat(LOCALES[lang], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const fieldsRaw = 'c' in result && result.c ? [result.c.minute, result.c.hour, result.c.dom, result.c.month, result.c.dow].map((f) => f.raw) : expr.trim().split(/\s+/)

  return (
    <div>
      <ToolHeader intro={t.intro} />
      <Panel title={t.expression}>
        <input value={expr} onChange={(e) => setExpr(e.target.value)} spellCheck={false} autoCapitalize="off" aria-label={t.expression}
          className="form-input py-3 text-center font-mono text-xl tracking-[0.2em] sm:text-2xl" />
        <div className="mt-4 grid grid-cols-5 gap-2 text-center">
          {t.fields.map((name, i) => (
            <div key={name} className="min-w-0 rounded-xl border border-white/5 bg-white/[0.03] px-1 py-2">
              <p className="truncate font-mono text-sm text-lime-200">{fieldsRaw[i] ?? '—'}</p>
              <p className="mt-1 text-[11px] leading-tight text-slate-400">{name}</p>
              <p className="text-[10px] text-slate-600">{t.ranges[i]}</p>
            </div>
          ))}
        </div>
        {'error' in result && <ErrorNote>{result.error}</ErrorNote>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">{t.presets}:</span>
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => setExpr(p)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-xs text-slate-300 hover:text-white">{p}</button>
          ))}
        </div>
      </Panel>

      {'text' in result && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title={t.meaning}>
            <p className="text-lg font-semibold leading-snug text-white">{result.text}</p>
          </Panel>
          <Panel title={`${t.next} · ${t.local}`}>
            {result.runs!.length ? (
              <ol className="space-y-1.5 font-mono text-sm tabular-nums text-slate-200">
                {result.runs!.map((d) => <li key={d.getTime()}>{fmt.format(d)}</li>)}
              </ol>
            ) : <p className="text-sm text-slate-500">{t.none}</p>}
          </Panel>
        </div>
      )}
    </div>
  )
}
