import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { functionsBase, supabase } from '../lib/supabase'
import { PRIVACY_CONTACT } from './content'
import { LegalLinks } from './LegalPages'

export function AccountPrivacy() {
  const { user, access } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inputClass = 'w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2'

  async function downloadData() {
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error } = await supabase.rpc('export_own_data')
      if (error) throw new Error(error.message)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = 'toolbox-account-data.json'; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('Data export downloaded. It may contain saved credentials and other private content; keep it secure.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.') }
    finally { setBusy(false) }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault()
    if (!user?.email || !understood || confirmation !== 'DELETE') return
    setBusy(true); setError(''); setNotice('')
    try {
      // Reauthenticate with the same account. The database independently checks
      // the signed password AMR time, so a refresh token cannot bypass this step.
      const { data, error } = await supabase.auth.signInWithPassword({ email: user.email, password })
      setPassword('')
      if (error) throw new Error(error.message)
      if (!data.session || data.user?.id !== user.id) throw new Error('Account verification failed.')
      const response = await fetch(`${functionsBase}/account?action=delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ confirmation }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.deleted !== true) throw new Error(result.error || 'Deletion failed. Please retry or contact support.')
      // Move to the public confirmation page before auth state changes can
      // unmount the protected privacy page and redirect it elsewhere.
      navigate('/account-deleted', { replace: true })
      await supabase.auth.signOut({ scope: 'local' })
    } catch (e) { setError(e instanceof Error ? e.message : 'Deletion failed.') }
    finally { setBusy(false) }
  }

  function clearPreferences() {
    if (!window.confirm('Clear Toolbox preferences and guest reservation cancellation tokens in this browser? You may lose the ability to cancel those reservations. Your account and saved data will stay.')) return
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith('toolbox:') || key === 'sidebar-collapsed') localStorage.removeItem(key)
      sessionStorage.removeItem('meal-planner:skip-remove-confirm')
      setNotice('Browser preferences cleared. Reload to reset the displayed language and sidebar. Other devices are unaffected.')
    } catch { setError('Your browser could not clear site preferences. Use its site-data settings.') }
  }

  return <section className="space-y-5 border-t border-slate-700 pt-8" aria-labelledby="privacy-controls">
    <h2 id="privacy-controls" className="text-xl font-bold">Your data and account</h2>
    <p className="text-slate-400">Export or delete your account regardless of your plan or app restrictions. For corrections, other privacy requests, or a login problem, email <a className="text-indigo-300" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {notice && <p role="status" className="text-green-300">{notice}</p>}
    <div className="flex flex-wrap gap-4"><button disabled={busy} onClick={() => void downloadData()} className="acid-button rounded-lg px-4 py-2 disabled:opacity-50">Download my data</button><button disabled={busy} onClick={clearPreferences} className="rounded-lg border border-slate-600 px-4 py-2">Clear browser preferences</button></div>
    <details className="rounded-lg border border-red-400/30 p-5">
      <summary className="cursor-pointer font-semibold text-red-300">Delete my account</summary>
      <p className="mt-4 text-sm leading-relaxed text-slate-300">Deletion permanently removes your login, saved settings and creations, QR codes, wishlists, and account-associated backend uploads and jobs. Your shared wishlist links stop working. Download an export first if you want to keep your records. Provider backups/logs, legacy unlinked files, and copies already downloaded by recipients are covered by the <Link to="/privacy" className="text-indigo-300">Privacy Policy</Link>.</p>
      {access?.role === 'master' && <p className="mt-3 text-sm text-amber-300">Deleting the master account removes your account-management access. Other users’ accounts remain.</p>}
      <form onSubmit={event => void deleteAccount(event)} className="mt-5 max-w-lg space-y-4">
        <label className="block text-sm">Confirm your password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className={`${inputClass} mt-2`} /></label>
        <label className="block text-sm">Type DELETE<input required pattern="DELETE" autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} className={`${inputClass} mt-2`} /></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={understood} onChange={e => setUnderstood(e.target.checked)} className="mt-1" /> I understand that account deletion is permanent.</label>
        <button disabled={busy || !understood || confirmation !== 'DELETE'} className="rounded-lg border border-red-400/50 bg-red-500/10 px-4 py-2 font-semibold text-red-300 disabled:opacity-40">{busy ? 'Please wait…' : 'Permanently delete my account'}</button>
      </form>
    </details>
    <LegalLinks />
  </section>
}

export function PrivacyAccountPage() {
  return <div className="ambient min-h-screen bg-surface px-5 py-10 text-white"><div className="relative z-10 mx-auto max-w-3xl"><Link to="/" className="text-indigo-300">← Toolbox</Link><h1 className="mt-6 text-3xl font-bold">Account privacy</h1><AccountPrivacy /></div></div>
}

export function AccountDeletedPage() {
  return <div className="ambient min-h-screen bg-surface px-5 py-10 text-white"><div className="relative z-10 mx-auto max-w-2xl space-y-6"><h1 className="text-3xl font-bold">Your account has been deleted</h1><p className="text-slate-300">Your active account data and account-associated backend files were removed. Recipient copies, legacy unlinked uploads, and provider backups/logs have the limitations explained in the Privacy Policy. Guest reservation capabilities in this browser were kept so you can still cancel those reservations.</p><Link to="/" className="block text-indigo-300">Return to Toolbox</Link><LegalLinks /></div></div>
}
