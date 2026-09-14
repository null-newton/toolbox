import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth-context'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { useT } from '../../i18n/LanguageContext'
import { supabase } from '../../lib/supabase'
import { SaveStatus } from '../../components/SaveStatus'
import { draftPayload, parseCollections, parseItems, sortValues, visibleItems } from './model'
import type { Collection, Draft, Item, Sort } from './model'
import { buttonClass, Field, inputClass, ItemCard, primaryClass, ProductForm } from './components'
import { STR } from './strings'

export function Wishlist() {
  const { user } = useAuth()
  return user ? <OwnerWishlist key={user.id} /> : null
}
function OwnerWishlist() {
  const t = useT(STR)
  const { config, setConfig, saving, error: configError } = useUtilityConfig('wishlist', { sort: 'priority' as Sort })
  const [collections, setCollections] = useState<Collection[]>([])
  const [selected, setSelected] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState('')
  const [editor, setEditor] = useState<Item | 'new' | null>(null)
  const [loading, setLoading] = useState(true)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const collection = collections.find(c => c.id === selected)
  const sort = sortValues.includes(config.sort) ? config.sort : 'priority'
  const shareUrl = collection?.share_token ? `${window.location.origin}${window.location.pathname}#/wishlist/${collection.share_token}` : ''
  useEffect(() => {
    let cancelled = false
    supabase.from('wishlist_collections').select('id,name,share_token').order('created_at').then(({ data, error }) => {
      if (cancelled) return
      try {
        if (error) throw error
        const next = parseCollections(data)
        setCollections(next)
        setSelected(prev => next.some(c => c.id === prev) ? prev : next[0]?.id ?? '')
      } catch { setError(t.failed) }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [revision, t.failed])
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    supabase.from('wishlist_items').select('*').eq('collection_id', selected).order('created_at', { ascending: false }).then(({ data, error }) => {
      if (cancelled) return
      try { if (error) throw error; setItems(parseItems(data)) }
      catch { setError(t.failed) }
      setItemsLoading(false)
    })
    return () => { cancelled = true }
  }, [selected, revision, t.failed])
  function select(id: string) {
    setSelected(id); setItems([]); setItemsLoading(true); setEditor(null); setTag(''); setSearch(''); setError(''); setNotice('')
  }
  async function action(work: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await work(); setNotice(t.saved); setRevision(v => v + 1) }
    catch (e) { setError(e instanceof Error && ['invalid', 'duplicate'].includes(e.message) ? t[e.message as 'invalid' | 'duplicate'] : t.failed) }
    finally { setBusy(false) }
  }
  async function save(draft: Draft) {
    if (!collection) return
    await action(async () => {
      const payload = draftPayload(draft)
      const editId = editor && editor !== 'new' ? editor.id : null
      if (items.some(item => item.url === payload.url && item.id !== editId)) throw new Error('duplicate')
      const query = editId
        ? supabase.from('wishlist_items').update(payload).eq('id', editId).eq('collection_id', selected)
        : supabase.from('wishlist_items').insert({ ...payload, collection_id: selected })
      const { data, error } = await query.select('id').single()
      if (error?.code === '23505') throw new Error('duplicate')
      if (error || !data) throw error || new Error()
      setEditor(null)
    })
  }
  async function share(token: string | null) {
    await action(async () => {
      const { error, data } = await supabase.from('wishlist_collections').update({ share_token: token }).eq('id', selected).select('id').single()
      if (error || !data) throw error || new Error()
    })
  }
  const filtered = visibleItems(items, sort, search, tag)
  return <div className="animate-fade-up mx-auto max-w-6xl">
    <div className="flex items-center justify-between gap-3"><h1 className="text-3xl font-bold tracking-tight">{t.title}</h1><SaveStatus saving={saving} /></div>
    <p className="mt-2 max-w-2xl text-slate-400">{t.intro}</p>
    {configError && <p role="alert" className="mt-3 text-amber-200">{t.preferencesError}</p>}
    {error && <div role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-red-200">{error} <button className={buttonClass} onClick={() => { setError(''); setRevision(v => v + 1) }}>{t.retry}</button></div>}
    {notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
    <form className="glass mt-7 flex flex-wrap items-end gap-3 rounded-2xl p-4" onSubmit={e => {
      e.preventDefault()
      void action(async () => {
        const value = name.trim(); if (!value) throw new Error('invalid')
        const { data, error } = await supabase.from('wishlist_collections').insert({ name: value }).select('id,name,share_token').single()
        if (error) throw error
        const created = parseCollections([data])[0]
        setCollections(prev => [...prev, created]); select(created.id); setName('')
      })
    }}>
      <div className="min-w-48 flex-1"><Field label={t.collectionName}><input required maxLength={100} value={name} onChange={e => setName(e.target.value)} className={inputClass} /></Field></div>
      <button disabled={busy || loading} className={primaryClass}>{t.create}</button>
    </form>
    {loading ? <p className="mt-6 animate-pulse">{t.loading}</p> : !collections.length ? <p className="glass mt-6 rounded-2xl p-8 text-slate-300">{t.emptyCollections}</p> : <>
      <div className="my-5 flex flex-wrap gap-2" aria-label={t.collections}>{collections.map(c => <button disabled={busy} key={c.id} aria-pressed={selected === c.id} onClick={() => select(c.id)} className={selected === c.id ? primaryClass : buttonClass}>{c.name}</button>)}</div>
      {collection && <>
        <div className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="break-words text-xl font-semibold">{collection.name}</h2><p className="text-xs text-slate-400">{shareUrl ? t.shared : t.private}</p></div>
            <div className="flex flex-wrap gap-2"><button disabled={busy} className={buttonClass} onClick={() => {
              const value = window.prompt(t.collectionName, collection.name)?.trim()
              if (!value) return
              void action(async () => { if (value.length > 100) throw new Error('invalid'); const { error, data } = await supabase.from('wishlist_collections').update({ name: value }).eq('id', selected).select('id').single(); if (error || !data) throw error || new Error() })
            }}>{t.rename}</button><button disabled={busy} className={buttonClass} onClick={() => {
              if (!window.confirm(t.confirmCollection)) return
              void action(async () => { const { error, data } = await supabase.from('wishlist_collections').delete().eq('id', selected).select('id').single(); if (error || !data) throw error || new Error(); setItems([]); setEditor(null) })
            }}>{t.deleteCollection}</button></div></div>
          <div className="mt-4 flex flex-wrap gap-2">{shareUrl ? <>
            <button disabled={busy} className={buttonClass} onClick={async () => { try { await navigator.clipboard.writeText(shareUrl); setNotice(t.copied) } catch { setNotice(t.copyFailed) } }}>{t.copy}</button>
            <button disabled={busy} className={buttonClass} onClick={() => { if (window.confirm(t.confirmRotate)) void share(crypto.randomUUID()) }}>{t.rotate}</button>
            <button disabled={busy} className={buttonClass} onClick={() => void share(null)}>{t.stopShare}</button>
          </> : <button disabled={busy} className={buttonClass} onClick={() => void share(crypto.randomUUID())}>{t.share}</button>}</div>
          {shareUrl && <input aria-label={t.shared} readOnly value={shareUrl} onFocus={e => e.target.select()} className={`${inputClass} mt-3`} />}
          <p className="mt-3 text-xs text-slate-400">{t.shareHint}</p>
        </div>
        {editor ? <ProductForm key={editor === 'new' ? 'new' : editor.id} item={editor === 'new' ? undefined : editor} busy={busy} onSave={draft => void save(draft)} onCancel={() => setEditor(null)} /> : <button disabled={busy || itemsLoading} className={`${primaryClass} mt-5`} onClick={() => setEditor('new')}>+ {t.add}</button>}
        <div className="my-5 grid gap-3 sm:grid-cols-3">
          <Field label={t.search}><input type="search" value={search} onChange={e => setSearch(e.target.value)} className={inputClass} /></Field>
          <Field label={t.tagFilter}><select value={tag} onChange={e => setTag(e.target.value)} className={inputClass}><option value="">{t.allTags}</option>{[...new Set(items.flatMap(i => i.tags))].sort().map(tag => <option key={tag}>{tag}</option>)}</select></Field>
          <Field label={t.sort}><select value={sort} onChange={e => setConfig({ sort: e.target.value as Sort })} className={inputClass}>{sortValues.map(value => <option key={value} value={value}>{value === 'price' ? t.priceSort : t[value]}</option>)}</select></Field>
        </div>
        {itemsLoading ? <p className="animate-pulse">{t.loading}</p> : !filtered.length ? <p className="glass rounded-2xl p-8 text-slate-300">{items.length ? t.noMatch : t.empty}</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(item => <ItemCard key={item.id} item={item}>
          <button disabled={busy || editor !== null} className={buttonClass} onClick={() => setEditor(item)}>{t.edit}</button><button disabled={busy} className={buttonClass} onClick={() => {
            if (!window.confirm(t.confirmItem)) return
            void action(async () => { const { error, data } = await supabase.from('wishlist_items').delete().eq('id', item.id).eq('collection_id', selected).select('id').single(); if (error || !data) throw error || new Error(); if (editor !== 'new' && editor?.id === item.id) setEditor(null) })
          }}>{t.remove}</button>
        </ItemCard>)}</div>}
      </>}
    </>}
  </div>
}
