import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { useT } from '../../i18n/LanguageContext'
import { supabase } from '../../lib/supabase'
import { object, parseItems, uuid } from './model'
import type { Item } from './model'
import { buttonClass, ItemCard, primaryClass } from './components'
import { STR } from './strings'

export function SharedWishlist() {
  const { token = '' } = useParams()
  const { user } = useAuth()
  return <SharedCollection key={`${token}:${user?.id ?? 'guest'}`} token={token} />
}
function SharedCollection({ token }: { token: string }) {
  const t = useT(STR)
  const [list, setList] = useState<{ name: string; items: Item[] } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const storageKey = (id: string) => `toolbox:wishlist:reservation:${id}`
  function stored(id: string) {
    try { const value = localStorage.getItem(storageKey(id)); return uuid(value) ? value : null } catch { return null }
  }
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (!uuid(token)) throw new Error('wishlist_unavailable')
        const { data, error } = await supabase.rpc('wishlist_shared', { p_token: token })
        if (error) throw new Error(error.message)
        const value = object(data)
        if (typeof value.name !== 'string') throw new Error()
        const next = { name: value.name, items: parseItems(value.items) }
        if (next.items.some(item => typeof item.reserved !== 'boolean')) throw new Error()
        if (!cancelled) { setList(next); setError('') }
      } catch (e) {
        if (!cancelled) {
          setList(null)
          setError(e instanceof Error && e.message.includes('wishlist_owner') ? t.owner : t.unavailable)
        }
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [token, revision, t.owner, t.unavailable])
  async function reserve(item: Item, cancel: boolean) {
    if (busy) return
    setBusy(true); setNotice('')
    try {
      let capability = stored(item.id)
      if (!cancel) {
        capability ||= crypto.randomUUID()
        try { localStorage.setItem(storageKey(item.id), capability) } catch { setNotice(t.storageFailed); return }
      }
      if (!capability) { setNotice(t.storageFailed); return }
      const { data, error } = await supabase.rpc(cancel ? 'wishlist_cancel' : 'wishlist_reserve', {
        p_token: token, p_item: item.id, p_cancel: capability,
      })
      if (error || typeof data !== 'boolean') throw new Error()
      if (cancel || !data) { try { localStorage.removeItem(storageKey(item.id)) } catch { /* the capability no longer works */ } }
      setNotice(data ? cancel ? t.cancelled : t.reservedDone : t.conflict)
    } catch { setNotice(t.failed) }
    finally { setBusy(false); setRevision(v => v + 1) }
  }
  return <div className="animate-fade-up mx-auto max-w-5xl">
    <p className="text-sm font-medium text-indigo-300">{t.sharedTitle}</p>
    <h1 className="mt-2 break-words text-3xl font-bold">{list?.name || t.title}</h1>
    <p className="mt-3 text-slate-400">{t.sharedIntro}</p>
    <p className="mt-2 max-w-2xl text-sm text-slate-400">{t.reservationHint}</p>
    <div className="my-5 flex flex-wrap gap-2"><button className={buttonClass} disabled={busy || loading} onClick={() => { setLoading(true); setRevision(v => v + 1) }}>{t.refresh}</button><Link to="/tools/wishlist" className={buttonClass}>{t.manage}</Link></div>
    {error && <p role="alert" className="my-4 rounded-xl bg-amber-500/10 p-4 text-amber-200">{error}</p>}
    {notice && <p role="status" className="my-4 rounded-xl bg-indigo-500/10 p-4 text-indigo-100">{notice}</p>}
    {loading ? <p className="animate-pulse">{t.loading}</p> : list && (list.items.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.items.map(item => <ItemCard key={item.id} item={item}>
      {item.reserved ? <span className="text-sm text-amber-200">{t.reserved}</span> : <button disabled={busy} className={primaryClass} onClick={() => void reserve(item, false)}>{t.reserve}</button>}
      {stored(item.id) && <button disabled={busy} className={buttonClass} onClick={() => void reserve(item, true)}>{t.cancelReservation}</button>}
    </ItemCard>)}</div> : <p className="glass rounded-2xl p-8 text-slate-300">{t.empty}</p>)}
  </div>
}
