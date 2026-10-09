import { AccountPrivacy } from '../legal/AccountPrivacy'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/auth-context'
import { supabase } from '../lib/supabase'
import { getUtility } from '../utilities/registry'

interface ManagedAccount { user_id: string; email: string; role: 'free' | 'pro' | 'master'; suspended: boolean }
interface Rule { app_id: string; uses_backend: boolean; free_access: boolean; max_bytes: number | null; pro_access: boolean; pro_max_bytes: number | null }
interface Override { user_id: string; app_id: string; allowed: boolean; max_bytes: number | null }
interface Usage { user_id: string; app_id: string; bytes: number }
interface Dashboard { accounts: ManagedAccount[]; apps: Rule[]; overrides: Override[]; usage: Usage[] }
const mib = 1024 * 1024
const name = (id: string) => id === '__favorites__' ? 'Favourites' : getUtility(id)?.name ?? id
const size = (bytes: number) => `${(bytes / mib).toFixed(3)} MiB`
const inputClass = 'rounded-lg border border-slate-600 bg-slate-900 px-3 py-2'

function RuleEditor({ rule, override, used, busy, plan = 'free', onSave, onReset }: {
  rule: Rule; override?: Override; used?: number; busy: boolean; plan?: 'free' | 'pro'
  onSave: (allowed: boolean, bytes: number | null) => Promise<void>; onReset?: () => Promise<void>
}) {
  const defaultAllowed = plan === 'pro' ? rule.pro_access : rule.free_access
  const defaultLimit = plan === 'pro' ? rule.pro_max_bytes : rule.max_bytes
  const initialLimit = override ? override.max_bytes : defaultLimit
  const [allowed, setAllowed] = useState(override?.allowed ?? defaultAllowed)
  const [unlimited, setUnlimited] = useState(initialLimit === null)
  const [limit, setLimit] = useState(String((initialLimit ?? mib) / mib))
  return <form onSubmit={event => { event.preventDefault(); void onSave(allowed, unlimited ? null : Math.round(Number(limit) * mib)) }} className="flex flex-wrap items-center gap-3 border-b border-slate-700 py-3">
    <span className="min-w-48 flex-1">{name(rule.app_id)}{used !== undefined && <small className="block text-slate-400">{size(used)} saved{override ? ' · Custom settings' : ' · Default settings'}</small>}</span>
    <label className="flex items-center gap-2"><input type="checkbox" checked={allowed} onChange={e => setAllowed(e.target.checked)} /> App access</label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={unlimited} onChange={e => setUnlimited(e.target.checked)} /> Unlimited saves</label>
    <label className="flex items-center gap-2">Limit (MiB)<input disabled={unlimited} aria-label={`${name(rule.app_id)} limit in MiB`} type="number" required min="0" max="1048576" step="any" value={limit} onChange={e => setLimit(e.target.value)} className={`${inputClass} w-28`} /></label>
    <button disabled={busy} className="acid-button rounded-lg px-3 py-2 disabled:opacity-50">Save</button>
    {override && onReset && <button disabled={busy} type="button" onClick={() => void onReset()} className="text-indigo-300">Use defaults</button>}
  </form>
}

export function AccountPage() {
  const { access, refreshAccess } = useAuth()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [selected, setSelected] = useState('')
  const [search, setSearch] = useState('')
  const [plan, setPlan] = useState<'free' | 'pro'>('free')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const isMaster = access?.role === 'master'
  const load = useCallback(async () => {
    if (!isMaster) return
    const { data, error } = await supabase.rpc('admin_accounts')
    if (error) setError(error.message)
    else setDashboard(data as Dashboard)
  }, [isMaster])
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer) }, [load])
  useEffect(() => { void refreshAccess() }, [refreshAccess])

  async function mutate(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true); setError(''); setNotice('')
    try {
      const { error } = await action()
      if (error) throw new Error(error.message)
      await Promise.all([load(), refreshAccess()]); setNotice('Settings saved.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Settings could not be saved.') }
    finally { setBusy(false) }
  }
  const account = dashboard?.accounts.find(a => a.user_id === selected)
  return <div className="mx-auto max-w-6xl space-y-8 py-6">
    <header><h1 className="text-3xl font-bold">{isMaster ? 'Manage accounts' : 'Your account'}</h1><p className="mt-2 text-slate-400">{access?.role === 'master' ? 'Master account: all apps, unlimited saves, and account management.' : `${access?.role === 'pro' ? 'Pro' : 'Free'} account: app access and saved-data limits are shown below.`}</p></header>
    {error && <p role="alert" className="text-red-300">{error}</p>}{notice && <p role="status" className="text-green-300">{notice}</p>}
    {!isMaster && <div className="space-y-3">{access?.apps.filter(a => a.app_id === '__favorites__' || getUtility(a.app_id)).map(a => <div key={a.app_id} className="flex flex-wrap justify-between gap-3 border-b border-slate-700 py-3"><span>{name(a.app_id)} · {a.allowed ? 'Enabled' : 'Restricted'}</span><span>{size(a.used_bytes)} / {a.max_bytes === null ? 'Unlimited' : size(a.max_bytes)}</span></div>)}</div>}
    {isMaster && !dashboard && <p>Loading accounts…</p>}
    <AccountPrivacy />
    {dashboard && <>
      <section><h2 className="mb-3 text-xl font-bold">Accounts</h2><input aria-label="Search accounts by email" placeholder="Search by email" value={search} onChange={e => setSearch(e.target.value)} className={`${inputClass} mb-3 w-full`} />
        <div className="max-h-80 overflow-auto">{dashboard.accounts.filter(a => a.email?.toLowerCase().includes(search.toLowerCase())).map(a => <button key={a.user_id} onClick={() => setSelected(a.user_id)} className={`flex w-full justify-between gap-3 rounded-lg px-3 py-3 text-left ${selected === a.user_id ? 'bg-indigo-500/20' : 'hover:bg-white/5'}`}><span>{a.email || a.user_id}</span><span>{a.role}{a.suspended ? ' · Suspended' : ''}</span></button>)}</div>
      </section>
      {account && <section><h2 className="text-xl font-bold">{account.email}</h2>
        {account.role !== 'master' && <div className="my-4 flex flex-wrap gap-4"><label>Plan <select disabled={busy} value={account.role} onChange={e => void mutate(() => supabase.rpc('admin_set_account', { p_user: selected, p_role: e.target.value, p_suspended: account.suspended }))} className={inputClass}><option value="free">Free</option><option value="pro">Pro</option></select></label><label className="flex items-center gap-2"><input disabled={busy} type="checkbox" checked={account.suspended} onChange={e => void mutate(() => supabase.rpc('admin_set_account', { p_user: selected, p_role: account.role, p_suspended: e.target.checked }))} /> Suspend account</label></div>}
        <p className="my-3 text-sm text-slate-400">Per-account settings override the account type defaults. Pro starts with full access and unlimited saves. The master account always has full access and unlimited saves. Suspending an account blocks access and saves.</p>
        {account.role !== 'master' && dashboard.apps.map(rule => { const override = dashboard.overrides.find(o => o.user_id === selected && o.app_id === rule.app_id); return <RuleEditor key={`${selected}:${account.role}:${rule.app_id}:${override?.allowed}:${override?.max_bytes}:${rule.free_access}:${rule.max_bytes}:${rule.pro_access}:${rule.pro_max_bytes}`} plan={account.role === 'pro' ? 'pro' : 'free'} rule={rule} override={override} used={dashboard.usage.find(u => u.user_id === selected && u.app_id === rule.app_id)?.bytes ?? 0} busy={busy} onSave={(allowed, bytes) => mutate(() => supabase.rpc('admin_set_account_app', { p_user: selected, p_app: rule.app_id, p_allowed: allowed, p_max_bytes: bytes }))} onReset={() => mutate(() => supabase.rpc('admin_set_account_app', { p_user: selected, p_app: rule.app_id, p_allowed: null, p_max_bytes: null }))} /> })}
      </section>}
      <section><h2 className="text-xl font-bold">Default app access and limits</h2><p className="my-3 text-sm text-slate-400">Defaults apply to the selected account type unless you set a per-account override. Limits count saved settings and records for each app, including QR codes and wishlist items. Lowering a limit keeps existing data and blocks further growth.</p>
        <label>Account type <select value={plan} onChange={e => setPlan(e.target.value as 'free' | 'pro')} className={`${inputClass} my-3`}><option value="free">Free</option><option value="pro">Pro</option></select></label>
        {dashboard.apps.map(rule => <RuleEditor key={`${plan}:${rule.app_id}:${rule.free_access}:${rule.max_bytes}:${rule.pro_access}:${rule.pro_max_bytes}`} plan={plan} rule={rule} busy={busy} onSave={(allowed, bytes) => mutate(() => supabase.rpc('admin_set_app', { p_app: rule.app_id, p_allowed: allowed, p_max_bytes: bytes, p_role: plan }))} />)}
      </section>
    </>}
  </div>
}
