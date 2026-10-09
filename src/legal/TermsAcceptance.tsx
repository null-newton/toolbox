import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/auth-context'
import { useLang } from '../i18n/LanguageContext'
import { TERMS_VERSION, PRIVACY_VERSION } from './content'
import { LegalLinks } from './LegalPages'

export function TermsAcceptance() {
  const { refreshAccess, signOut } = useAuth()
  const { lang } = useLang()
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    if (!accepted) return
    setBusy(true); setError('')
    const { error } = await supabase.rpc('accept_current_terms', { p_adult: true, p_terms_version: TERMS_VERSION, p_privacy_version: PRIVACY_VERSION })
    if (error) setError(error.message)
    else await refreshAccess()
    setBusy(false)
  }
  return <div className="ambient flex min-h-screen items-center justify-center bg-surface px-5 text-white"><div className="relative z-10 max-w-xl space-y-6 py-10">
    <h1 className="text-3xl font-bold">{lang === 'nl' ? 'Controleer de voorwaarden' : 'Review the account terms'}</h1>
    <p className="text-slate-300">{lang === 'nl' ? 'Accounts zijn alleen beschikbaar voor personen van 18 jaar en ouder. Lees de Engelstalige documenten voordat je verdergaat.' : 'Accounts are available to adults aged 18 and over. Please read the documents before continuing.'}</p>
    <LegalLinks />
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-1" /><span>{lang === 'nl' ? 'Ik ben 18 jaar of ouder, ga akkoord met de gebruiksvoorwaarden en bevestig dat ik het privacybeleid heb gelezen.' : 'I am 18 or older, agree to the Terms of Service, and acknowledge the Privacy Policy.'}</span></label>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <button disabled={!accepted || busy} onClick={() => void submit()} className="acid-button rounded-lg px-4 py-2 disabled:opacity-50">{lang === 'nl' ? 'Akkoord en doorgaan' : 'Agree and continue'}</button>
    <p><Link to="/account/privacy" className="text-indigo-300">{lang === 'nl' ? 'Gegevens exporteren of account verwijderen' : 'Export data or delete account'}</Link></p>
    <button onClick={() => void signOut()} className="text-slate-400">{lang === 'nl' ? 'Afmelden' : 'Log out'}</button>
  </div></div>
}
