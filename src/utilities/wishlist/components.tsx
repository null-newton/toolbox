import { useState } from 'react'
import type { ReactNode } from 'react'
import { ExternalLink, Gift } from 'lucide-react'
import { useLang, useT } from '../../i18n/LanguageContext'
import { functionsBase, supabase } from '../../lib/supabase'
import { availabilityValues, emptyDraft, isWishlistUrl, metadataError, normalizeUrl, object } from './model'
import type { Draft, Item } from './model'
import { STR } from './strings'

export const inputClass = 'w-full rounded-xl border border-white/15 bg-slate-900 p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-400'
export const buttonClass = 'rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed'
export const primaryClass = `${buttonClass} bg-indigo-500/30 text-indigo-100`
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-2 text-sm text-slate-300">{label}{children}</label>
}
export function ItemCard({ item, children }: { item: Item; children?: ReactNode }) {
  const t = useT(STR)
  const { locale } = useLang()
  return <article className="glass flex min-w-0 flex-col rounded-2xl p-5">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-indigo-500/15 p-3 text-indigo-300"><Gift size={22} aria-hidden="true" /></span>
      <div className="min-w-0"><p className="truncate text-xs text-slate-400">{new URL(item.url).hostname}</p><h3 className="mt-1 break-words text-lg font-semibold">{item.title}</h3></div></div>
    <p className="mt-5 text-xl font-semibold">{item.price === null ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency: item.currency }).format(item.price)}</p>
    <p className="mt-1 text-sm text-slate-400">{t[item.availability]} · {t.priority}: {[t.high, t.normal, t.low][item.priority - 1]}</p>
    <div className="my-4 flex flex-wrap gap-2">{item.tags.map(tag => <span key={tag} className="break-all rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-300">#{tag}</span>)}</div>
    <div className="mt-auto flex flex-wrap items-center gap-2"><a href={item.url} target="_blank" rel="noopener noreferrer" className={buttonClass}>{t.open} <ExternalLink size={13} className="inline" aria-hidden="true" /></a>{children}</div>
  </article>
}
export function ProductForm({ item, busy, onSave, onCancel }: { item?: Item; busy: boolean; onSave: (draft: Draft) => void; onCancel: () => void }) {
  const t = useT(STR)
  const [draft, setDraft] = useState<Draft>(item ? { ...item, price: item.price === null ? '' : String(item.price), tags: item.tags.join(', ') } : { ...emptyDraft })
  const [fetching, setFetching] = useState(false)
  const [notice, setNotice] = useState('')
  const disabled = busy || fetching
  const wishlistLink = isWishlistUrl(draft.url)
  const change = (patch: Partial<Draft>) => setDraft(prev => ({ ...prev, ...patch }))
  async function metadata() {
    setFetching(true); setNotice('')
    try {
      if (wishlistLink) { setNotice(t.metadataWishlist); return }
      normalizeUrl(draft.url) // Validate without removing the shop's language path for fetching.
      const url = draft.url.trim()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setNotice(t.metadataAuth); return }
      const response = await fetch(`${functionsBase}/wishlist-metadata`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ url }), signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null)
        const code = body && typeof body === 'object' && 'error' in body ? body.error : undefined
        setNotice(t[metadataError(response.status, code)])
        return
      }
      const data = object(await response.json())
      if (typeof data.title !== 'string' || typeof data.currency !== 'string' || !/^[A-Z]{3}$/.test(data.currency) ||
        typeof data.availability !== 'string' || !availabilityValues.includes(data.availability as Draft['availability']) ||
        (data.price !== null && (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price < 0 || data.price >= 1e10))) throw new Error()
      change({
        ...(data.title ? { title: data.title } : {}),
        ...(data.price !== null ? { price: String(data.price), currency: data.currency } : {}),
        ...(data.availability !== 'unknown' ? { availability: data.availability as Draft['availability'] } : {}),
      })
      setNotice(data.title ? t.metadataDone : t.metadataFailed)
    } catch { setNotice(t.metadataFailed) }
    finally { setFetching(false) }
  }
  return <form className="glass mt-5 rounded-2xl p-5" onSubmit={e => { e.preventDefault(); if (wishlistLink) { setNotice(t.metadataWishlist); return } onSave(draft) }}>
    <h2 className="mb-4 text-lg font-semibold">{item ? t.edit : t.add}</h2>
    <fieldset disabled={disabled} className="space-y-4">
      <Field label={t.url}><input autoFocus required type="url" maxLength={2048} value={draft.url} onChange={e => change({ url: e.target.value })} className={inputClass} placeholder="https://…" /></Field>
      <button type="button" disabled={wishlistLink} onClick={() => void metadata()} className={buttonClass}>{fetching ? t.working : t.fetch}</button>
      <p className="text-xs text-slate-400">{t.metadataHint}</p>
      {wishlistLink && <p role="status" className="text-sm text-amber-200">{t.metadataWishlist}</p>}
      {notice && !wishlistLink && <p role="status" className="text-sm text-amber-200">{notice}</p>}
      <Field label={t.productTitle}><input required maxLength={300} value={draft.title} onChange={e => change({ title: e.target.value })} className={inputClass} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.price}><input inputMode="decimal" value={draft.price} onChange={e => change({ price: e.target.value })} className={inputClass} /></Field>
        <Field label={t.currency}><input required pattern="[A-Z]{3}" maxLength={3} value={draft.currency} onChange={e => change({ currency: e.target.value.toUpperCase() })} className={inputClass} /></Field>
        <Field label={t.priority}><select value={draft.priority} onChange={e => change({ priority: Number(e.target.value) })} className={inputClass}>{[t.high, t.normal, t.low].map((label, i) => <option key={label} value={i + 1}>{label}</option>)}</select></Field>
        <Field label={t.availability}><select value={draft.availability} onChange={e => change({ availability: e.target.value as Draft['availability'] })} className={inputClass}>{availabilityValues.map(value => <option key={value} value={value}>{t[value]}</option>)}</select></Field>
      </div>
      <Field label={t.tags}><input maxLength={620} value={draft.tags} onChange={e => change({ tags: e.target.value })} className={inputClass} /></Field>
      <div className="flex gap-2"><button disabled={wishlistLink} className={primaryClass}>{busy ? t.working : t.save}</button><button type="button" className={buttonClass} onClick={onCancel}>{t.cancel}</button></div>
    </fieldset>
  </form>
}
