import { useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import { LayoutGrid, Grid3x3, List } from 'lucide-react'
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
    viewLarge: 'Large tiles', viewSmall: 'Small tiles', viewList: 'List',
    favourites: 'Favourites', allTools: 'All tools',
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
    viewLarge: 'Grote tegels', viewSmall: 'Kleine tegels', viewList: 'Lijst',
    favourites: 'Favorieten', allTools: 'Alle tools',
  },
}

type View = 'large' | 'small' | 'list'
const VIEW_KEY = 'toolbox:home-view'
const vt = (part: string, id: string) => ({ 'data-vt': part, 'data-vt-id': id })
// Name only on-screen tools (plus ones visible before the switch) so the morph stays cheap
const tagVisible = (keep: Set<string>) => {
  const h = innerHeight
  document.querySelectorAll<HTMLElement>('[data-vt="tool-card"]').forEach((c) => { const r = c.getBoundingClientRect(); if (r.bottom > 0 && r.top < h) keep.add(c.dataset.vtId!) })
  document.querySelectorAll<HTMLElement>('[data-vt]').forEach((el) => {
    const on = keep.has(el.dataset.vtId!)
    el.style.setProperty('view-transition-name', on ? `${el.dataset.vt}-${el.dataset.vtId}` : 'none')
    el.style.setProperty('view-transition-class', on ? el.dataset.vt! : 'none')
  })
  return keep
}
const readView = (): View => { try { const v = localStorage.getItem(VIEW_KEY); return v === 'small' || v === 'list' ? v : 'large' } catch { return 'large' } }

export function Home() {
  const { user, canUseApp } = useAuth()
  const { favorites, isFavorite, toggleFavorite } = useFavorites()
  const [view, setViewState] = useState<View>(readView)
  const [entering, setEntering] = useState(true)
  const setView = (v: View) => {
    if (v === view) return
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ }
    const apply = () => flushSync(() => { setEntering(false); setViewState(v) })
    if (view === 'large' || v === 'large' || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply()
    const ids = tagVisible(new Set())
    document.startViewTransition(() => { apply(); tagVisible(ids) })
  }
  const fade = entering ? 'animate-fade-up' : ''
  const t = useT(STR)
  const { lang } = useLang()
  const utilities = getUtilities().filter((u) => user ? canUseApp(u.id) : u.availableWithoutAccount)
  const favUtils = view !== 'large' ? favorites.map((id) => utilities.find((u) => u.id === id)).filter((u) => !!u) : []
  const star = (id: string, cls = '') => {
    const fav = isFavorite(id)
    return user && <StarButton active={fav} onClick={() => toggleFavorite(id)} title={fav ? t.removeFavourite : t.addFavourite} className={fav ? cls : `opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${cls}`} />
  }
  const iconBox = (icon: React.ReactNode, size = 'size-10 text-xl') => (
    <span className={`grid shrink-0 place-items-center text-cyan-300 transition-colors duration-300 group-hover:text-cyan-200 ${size}`}>{icon}</span>
  )
  const smallGrid = (list: typeof utilities) => (
    <div className="grid grid-cols-2 pl-px pt-px sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {list.map((u, i) => (
        <Link key={u.id} to={`/tools/${u.id}`} {...vt('tool-card', u.id)} style={{ animationDelay: `${i * 30}ms` }} className={`card-spotlight group relative -ml-px -mt-px flex ${fade} flex-col items-center gap-3 overflow-hidden border border-slate-700 bg-panel px-3 py-5 text-center transition-all duration-300 hover:z-10 hover:-translate-y-0.5 hover:bg-slate-800`}>
          {user && <span className="absolute right-1 top-1 z-20" {...vt('tool-star', u.id)}>{star(u.id)}</span>}
          <span className="relative z-10" {...vt('tool-icon', u.id)}>{iconBox(u.icon, 'size-12 [&_svg]:size-8')}</span>
          <h2 className="relative z-10 text-sm font-bold leading-tight tracking-tight text-white" {...vt('tool-name', u.id)}>{localizedUtility(u.id, lang, u).name}</h2>
        </Link>
      ))}
    </div>
  )
  const listRows = (list: typeof utilities) => (
    <div className="flex flex-col pt-px">
      {list.map((u, i) => {
        const local = localizedUtility(u.id, lang, u)
        return (
          <Link key={u.id} to={`/tools/${u.id}`} {...vt('tool-card', u.id)} style={{ animationDelay: `${i * 30}ms` }} className={`card-spotlight group relative -mt-px flex ${fade} items-center gap-4 overflow-hidden border border-slate-700 bg-panel px-4 py-3 transition-all duration-300 hover:z-10 hover:bg-slate-800`}>
            <span className="relative z-10" {...vt('tool-icon', u.id)}>{iconBox(u.icon, 'size-9 text-lg')}</span>
            <div className="relative z-10 min-w-0 flex-1">
              <h2 className="w-fit font-bold tracking-tight text-white" {...vt('tool-name', u.id)}>{local.name}</h2>
              <p className="truncate text-sm text-slate-400">{local.description}</p>
            </div>
            {user && <span className="relative z-10" {...vt('tool-star', u.id)}>{star(u.id)}</span>}
          </Link>
        )
      })}
    </div>
  )
  const views: [View, string, React.ReactNode][] = [['large', t.viewLarge, <LayoutGrid className="size-4" />], ['small', t.viewSmall, <Grid3x3 className="size-4" />], ['list', t.viewList, <List className="size-4" />]]

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

      <div className="mt-12 flex justify-end">
        <div role="group" className="inline-flex rounded-xl border border-slate-700 bg-panel p-1">
          {views.map(([v, label, icon]) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} aria-label={label} title={label} className={`grid size-8 place-items-center rounded-lg transition-colors ${view === v ? 'bg-slate-700 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>{icon}</button>
          ))}
        </div>
      </div>

      {view !== 'large' && (() => {
        const render = view === 'small' ? smallGrid : listRows
        return favUtils.length ? (
          <>
            <h3 className="tech-label mb-4 mt-4" style={{ viewTransitionName: 'label-favourites' }}>{t.favourites}</h3>
            {render(favUtils)}
            <h3 className="tech-label mb-4 mt-10" style={{ viewTransitionName: 'label-all' }}>{t.allTools}</h3>
            {render(utilities.filter((u) => !isFavorite(u.id)))}
          </>
        ) : <div className="mt-4">{render(utilities)}</div>
      })()}

      {view === 'large' && <div className="mt-4 grid grid-cols-1 pl-px pt-px sm:grid-cols-2 lg:grid-cols-3">
        {utilities.map((u, i) => {
          const local = localizedUtility(u.id, lang, u)
          const fav = isFavorite(u.id)
          return (
          <Link
            key={u.id}
            to={`/tools/${u.id}`}
            style={{ animationDelay: `${i * 60}ms` }}
            className={`card-spotlight group relative -ml-px -mt-px flex min-h-56 ${fade} flex-col overflow-hidden border border-slate-700 bg-panel p-6 transition-all duration-300 hover:z-10 hover:-translate-y-1 hover:bg-slate-800`}
          >
            <div className="relative z-10 flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                {iconBox(u.icon)}
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
      </div>}
    </div>
  )
}
