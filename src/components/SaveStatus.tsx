import { Link } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { useT } from '../i18n/LanguageContext'

const STR = {
  en: { signInToSave: 'Sign in to save settings →', saving: 'Saving…', saved: 'Settings saved' },
  nl: { signInToSave: 'Meld je aan om instellingen te bewaren →', saving: 'Bewaren…', saved: 'Instellingen bewaard' },
}

/**
 * Save indicator shown in a utility's header. Signed in it reflects the
 * debounced config save; signed out it becomes a sign-in nudge, since
 * utilities still work without an account — settings just aren't persisted.
 */
export function SaveStatus({ saving, error }: { saving: boolean; error?: string | null }) {
  const { user } = useAuth()
  const t = useT(STR)

  if (!user) {
    return (
      <Link
        to="/login"
        className="text-xs text-slate-500 transition-colors hover:text-indigo-300"
      >
        {t.signInToSave}
      </Link>
    )
  }

  if (error) return <span role="alert" className="text-xs text-rose-400">{error}</span>

  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500">
      <span
        className={`size-1.5 rounded-full ${saving ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`}
      />
      {saving ? t.saving : t.saved}
    </span>
  )
}
