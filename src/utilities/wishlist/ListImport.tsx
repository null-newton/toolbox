import { useEffect, useRef, useState } from 'react'
import { functionsBase, supabase } from '../../lib/supabase'
import { useT } from '../../i18n/LanguageContext'
import { buttonClass, Field, inputClass, ItemCard, primaryClass } from './components'
import { draftPayload, isWishlistUrl, metadataError, object, parseImport } from './model'
import type { Draft, Item } from './model'
import { STR } from './strings'

export function ListImport({ items, busy, onSave, onCancel }: {
  items: Item[]; busy: boolean; onSave: (drafts: Draft[]) => Promise<boolean>; onCancel: () => void
}) {
  const t = useT(STR)
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof parseImport> | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const existing = new Set(items.map(item => item.url))
  const selected = preview?.drafts.filter(draft => chosen.has(draft.url) && !existing.has(draft.url)) ?? []
  async function load() {
    if (fetching || busy) return
    setNotice(''); setPreview(null); setFetching(true)
    controller.current = new AbortController()
    try {
      if (!isWishlistUrl(url)) { setNotice(t.importInvalid); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setNotice(t.metadataAuth); return }
      const response = await fetch(`${functionsBase}/wishlist-import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ url: url.trim() }), signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(55000)]),
      })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const code = data ? object(data).error : undefined
        setNotice(code === 'list_unavailable' ? t.importUnavailable : code === 'invalid_list_url' ? t.importInvalid : t[metadataError(response.status, code)])
        return
      }
      const result = parseImport(data)
      setPreview(result)
      setChosen(new Set(result.drafts.filter(draft => !existing.has(draft.url)).map(draft => draft.url)))
    } catch { if (!controller.current.signal.aborted) setNotice(t.metadataFailed) }
    finally { setFetching(false) }
  }
  return <section className="glass mt-5 rounded-2xl p-5">
    <h2 className="text-lg font-semibold">{t.importList}</h2>
    <p className="mt-2 text-sm text-slate-400">{t.importHint}</p>
    <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); void load() }}>
      <Field label={t.importUrl}><input required type="url" maxLength={2048} disabled={fetching || busy} value={url} onChange={e => { setUrl(e.target.value); setPreview(null); setNotice('') }} className={inputClass} placeholder="https://…" /></Field>
      <div className="flex gap-2"><button disabled={fetching || busy} className={primaryClass}>{fetching ? t.working : t.importPreview}</button><button type="button" disabled={busy} onClick={onCancel} className={buttonClass}>{t.cancel}</button></div>
    </form>
    {notice && <p role="alert" className="mt-3 text-sm text-amber-200">{notice}</p>}
    {preview && <>
      <h3 className="mt-5 break-words font-semibold">{preview.name || t.importList} · {preview.drafts.length} {t.importProducts}</h3>
      {preview.partial && <p role="alert" className="mt-3 text-amber-200">{t.importPartial}</p>}
      {!preview.drafts.length && <p className="mt-3 text-slate-400">{t.importEmpty}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{preview.drafts.map(draft => {
        const duplicate = existing.has(draft.url)
        return <ItemCard key={draft.url} item={{ ...draftPayload(draft), id: draft.url, created_at: new Date(0).toISOString() }}>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy || duplicate} checked={!duplicate && chosen.has(draft.url)} onChange={e => setChosen(prev => {
            const next = new Set(prev); if (e.target.checked) next.add(draft.url); else next.delete(draft.url); return next
          })} />{duplicate ? t.importDuplicate : t.importSelect}</label>
        </ItemCard>
      })}</div>
      {!!preview.drafts.length && <div className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={busy || !selected.length} className={primaryClass} onClick={async () => { if (await onSave(selected)) onCancel() }}>{busy ? t.working : `${t.importSave} (${selected.length})`}</button>
        <span className="text-xs text-slate-400">{t.importDuplicatesHint}</span>
      </div>}
    </>}
  </section>
}
