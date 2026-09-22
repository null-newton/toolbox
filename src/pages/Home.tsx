import { Link } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { useFavorites } from '../favorites/favorites-context'
import { getUtilities } from '../utilities/registry'
import { useLang, useT } from '../i18n/LanguageContext'
import { localizedUtility } from '../i18n/utilities'
import { StarButton } from '../components/StarButton'

const STR = {
  en: {
    welcome: 'Welcome to your',
    pickSaved: 'Pick a utility below. Your settings are saved to your account automatically.',
    pickPrefix: 'Pick a utility below. ',
    signIn: 'Sign in',
    pickSuffix: ' to save your settings and creations.',
    openTool: 'Open tool',
    addFavourite: 'Add to favourites',
    removeFavourite: 'Remove from favourites',
  },
  nl: {
    welcome: 'Welkom in je',
    pickSaved: 'Kies hieronder een hulpmiddel. Je instellingen worden automatisch in je account bewaard.',
    pickPrefix: 'Kies hieronder een hulpmiddel. ',
    signIn: 'Meld je aan',
    pickSuffix: ' om je instellingen en creaties te bewaren.',
    openTool: 'Tool openen',
    addFavourite: 'Toevoegen aan favorieten',
    removeFavourite: 'Verwijderen uit favorieten',
  },
}

export function Home() {
  const { user } = useAuth()
  const { isFavorite, toggleFavorite } = useFavorites()
  const t = useT(STR)
  const { lang } = useLang()
  const utilities = getUtilities().filter((u) => user || u.availableWithoutAccount)

  return (
    <div className="mx-auto w-full max-w-[1180px] animate-fade-up py-4 lg:py-10">
      <div className="tech-label">Everyday utilities · one place</div>
      <h1 className="mt-6 max-w-4xl text-[clamp(3.2rem,8vw,7rem)] font-extrabold leading-[0.86] tracking-[-0.07em]">
        {t.welcome}<br /> <span className="text-gradient">Toolbox</span>
      </h1>
      <p className="mt-7 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
        {user ? (
          t.pickSaved
        ) : (
          <>
            {t.pickPrefix}
            <Link to="/login" className="font-semibold text-indigo-300 transition-colors hover:text-indigo-200">
              {t.signIn}
            </Link>
            {t.pickSuffix}
          </>
        )}
      </p>

      <div className="mt-12 grid grid-cols-1 gap-px border border-slate-700 bg-slate-700 sm:grid-cols-2 lg:grid-cols-3">
        {utilities.map((u, i) => {
          const local = localizedUtility(u.id, lang, u)
          const fav = isFavorite(u.id)
          return (
          <Link
            key={u.id}
            to={`/tools/${u.id}`}
            style={{ animationDelay: `${i * 60}ms` }}
            className="card-spotlight group relative flex min-h-56 animate-fade-up flex-col overflow-hidden bg-panel p-6 transition-all duration-300 hover:z-10 hover:-translate-y-1 hover:bg-slate-800"
          >
            <div className="relative z-10 flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-slate-700 bg-surface text-xl text-cyan-300 transition-colors duration-300 group-hover:border-cyan-300/40">
                  {u.icon}
                </span>
                <small className="font-mono text-[0.68rem] tracking-[0.14em] text-indigo-300">
                  {String(i + 1).padStart(2, '0')} / TOOL
                </small>
              </div>
              {user && (
                <StarButton
                  active={fav}
                  onClick={() => toggleFavorite(u.id)}
                  title={fav ? t.removeFavourite : t.addFavourite}
                  className={fav ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}
                />
              )}
            </div>
            <h2 className="relative z-10 mt-6 text-xl font-bold tracking-tight text-white">{local.name}</h2>
            <p className="relative z-10 mt-2 text-sm leading-relaxed text-slate-400">{local.description}</p>

            <span className="relative z-10 mt-auto inline-flex items-center gap-1 pt-6 text-xs font-bold text-cyan-300 transition-all duration-300">
              {t.openTool}
              <svg className="size-3 transition-transform duration-300 group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10m0 0L9 4m4 4l-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </Link>
          )
        })}
      </div>
    </div>
  )
}
