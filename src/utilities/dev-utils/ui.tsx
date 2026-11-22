import { useState, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Check, Copy } from 'lucide-react'
import { useT } from '../../i18n/LanguageContext'
import { codeAreaClass, labelClass } from './shared'

/** Shared building blocks for the Developer tools (JSON, Base64, JWT, …). */

const STR = { en: { copy: 'Copy', copied: 'Copied' }, nl: { copy: 'Kopiëren', copied: 'Gekopieerd' } }


export function CopyButton({ value, className = '' }: { value: string; className?: string }) {
  const t = useT(STR)
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      disabled={!value}
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setDone(true)
        setTimeout(() => setDone(false), 1400)
      }}
      className={`no-glow inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 ${className}`}
    >
      {done ? <Check className="size-3.5 text-lime-300" /> : <Copy className="size-3.5" />}
      {done ? t.copied : t.copy}
    </button>
  )
}

export function Panel({ title, actions, children, className = '' }: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`glass min-w-0 rounded-2xl p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <p className={labelClass}>{title}</p>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function CodeArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea spellCheck={false} autoCapitalize="off" autoCorrect="off" {...props} className={`${codeAreaClass} ${props.className ?? ''}`} />
}

export function Segmented<T extends string>({ value, options, onChange, mono }: {
  value: T
  options: { id: T; label: ReactNode }[]
  onChange: (id: T) => void
  mono?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${mono ? 'font-mono' : ''} ${
            value === o.id
              ? 'acid-button'
              : 'border border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-lime-300" />
      {children}
    </label>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-xl bg-rose-400/10 px-3.5 py-2.5 font-mono text-xs leading-relaxed text-rose-200">{children}</p>
}

export function Output({ value, empty = '—' }: { value: string; empty?: string }) {
  return (
    <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-all font-mono text-[13px] leading-relaxed text-slate-100">
      {value || <span className="text-slate-600">{empty}</span>}
    </pre>
  )
}
