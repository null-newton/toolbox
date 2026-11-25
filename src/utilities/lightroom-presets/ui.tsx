// Small shared building blocks for the VSCO-style studio and editor.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import type { Dev } from './develop'
import { useRendered } from './image'

export function RenderedCanvas({ source, dev, delay = 60, className }: { source: ImageData; dev: Dev | null; delay?: number; className?: string }) {
  const ref = useRendered(source, dev, delay)
  return <canvas ref={ref} className={className} />
}

/** VSCO-style slider: thin white track, value above, double-click/tap the value to reset. */
export function MonoSlider({ label, value, min, max, step = 1, def = 0, onChange, format, big = false }: {
  label?: string; value: number; min: number; max: number; step?: number; def?: number
  onChange: (v: number) => void; format?: (v: number) => string; big?: boolean
}) {
  const shown = format ? format(value) : step < 1 ? `${value > 0 ? '+' : ''}${value.toFixed(2)}` : `${value > 0 && min < 0 ? '+' : ''}${Math.round(value)}`
  return (
    <label className="block select-none" onDoubleClick={() => onChange(def)}>
      <span className={`flex items-baseline justify-between ${big ? 'text-sm' : 'text-xs'}`}>
        {label && <span className="text-neutral-400">{label}</span>}
        <span className={`font-mono tabular-nums ${value !== def ? 'text-white' : 'text-neutral-500'} ${label ? '' : 'mx-auto'}`}>{shown}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="vsco-range mt-2 w-full" />
    </label>
  )
}

export function MonoToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="no-glow flex w-full items-center justify-between gap-3 text-sm text-neutral-200">
      <span className="flex items-center gap-2">{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-white' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 size-4 rounded-full transition-all ${checked ? 'left-[18px] bg-black' : 'left-0.5 bg-neutral-300'}`} />
      </span>
    </button>
  )
}

/** ✕  TITLE  ✓ bar used by every adjustment sheet. */
export function SheetBar({ title, onCancel, onConfirm }: { title: ReactNode; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <button onClick={onCancel} aria-label="Cancel" className="no-glow grid size-10 place-items-center text-neutral-400 hover:text-white"><X className="size-5" /></button>
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-300">{title}</span>
      <button onClick={onConfirm} aria-label="Confirm" className="no-glow grid size-10 place-items-center text-white"><Check className="size-5" /></button>
    </div>
  )
}

/**
 * Tool pages sit inside an animated (transformed) wrapper, which would turn
 * `position: fixed` into "fixed to the wrapper". Overlays render into <body>.
 */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}

/** Bottom sheet over the studio (mobile) / centered panel (desktop). */
export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <Portal>
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-neutral-950 p-5 text-white shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-300">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="no-glow grid size-8 place-items-center text-neutral-500 hover:text-white"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
    </Portal>
  )
}
