import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { PanelLeft } from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { useFavorites } from '../favorites/favorites-context'
import { getUtilities } from '../utilities/registry'
import { useLang, useT } from '../i18n/LanguageContext'
import { localizedUtility } from '../i18n/utilities'
import { LanguageSwitcher } from './LanguageSwitcher'
import { StarButton } from './StarButton'

const COLLAPSE_KEY = 'sidebar-collapsed'

const STR = {
  en: {
    utilities: 'Utilities',
    favourites: 'Favourites',
    addFavourite: 'Add to favourites',
    removeFavourite: 'Remove from favourites',
    expandSidebar: 'Expand sidebar',
    collapseSidebar: 'Collapse sidebar',
    closeMenu: 'Close menu',
    openMenu: 'Open menu',
    logOut: 'Log out',
    logIn: 'Log in',
    signInPrompt: 'Sign in to save your settings.',
  },
  nl: {
    utilities: 'Hulpmiddelen',
    favourites: 'Favorieten',
    addFavourite: 'Toevoegen aan favorieten',
    removeFavourite: 'Verwijderen uit favorieten',
    expandSidebar: 'Zijbalk uitklappen',
    collapseSidebar: 'Zijbalk inklappen',
    closeMenu: 'Menu sluiten',
    openMenu: 'Menu openen',
    logOut: 'Afmelden',
    logIn: 'Aanmelden',
    signInPrompt: 'Meld je aan om je instellingen te bewaren.',
  },
}

export function Layout() {
  const { user, signOut } = useAuth()
  const { isFavorite, toggleFavorite } = useFavorites()
  const t = useT(STR)
  const { lang } = useLang()
  const utilities = getUtilities().filter((u) => user || u.availableWithoutAccount)
  const favourites = utilities.filter((u) => isFavorite(u.id))
  const nonFavourites = utilities.filter((u) => !isFavorite(u.id))
  const [navOpen, setNavOpen] = useState(false)
  // Desktop-only rail collapse, remembered across sessions.
  const [collapsed, setCollapsed] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(COLLAPSE_KEY) === '1'
  )
  const closeNav = () => setNavOpen(false)

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    if (!navOpen) return

    const mobileQuery = window.matchMedia('(max-width: 1023px)')
    let unlockScroll: (() => void) | undefined

    const syncScrollLock = () => {
      if (!mobileQuery.matches) {
        unlockScroll?.()
        unlockScroll = undefined
        return
      }

      if (unlockScroll) return

      const scrollY = window.scrollY
      const bodyStyles = {
        overflow: document.body.style.overflow,
        position: document.body.style.position,
        top: document.body.style.top,
        width: document.body.style.width,
      }
      const rootOverflow = document.documentElement.style.overflow

      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'

      unlockScroll = () => {
        document.documentElement.style.overflow = rootOverflow
        document.body.style.overflow = bodyStyles.overflow
        document.body.style.position = bodyStyles.position
        document.body.style.top = bodyStyles.top
        document.body.style.width = bodyStyles.width
        window.scrollTo({ top: scrollY, behavior: 'auto' })
      }
    }

    syncScrollLock()
    mobileQuery.addEventListener('change', syncScrollLock)

    return () => {
      mobileQuery.removeEventListener('change', syncScrollLock)
      unlockScroll?.()
    }
  }, [navOpen])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-xl py-2 text-sm font-medium transition-all duration-200 ${
      collapsed ? 'lg:justify-center lg:px-2 px-3' : 'px-3'
    } ${
      isActive
        ? 'bg-indigo-500/15 text-indigo-200 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] ring-1 ring-indigo-400/30'
        : 'text-slate-400 hover:bg-white/5 hover:text-white'
    }`

  const renderItem = (u: (typeof utilities)[number], keyPrefix = '') => {
    const name = localizedUtility(u.id, lang, u).name
    const fav = isFavorite(u.id)
    return (
      <div key={`${keyPrefix}${u.id}`} className="group/row flex items-center gap-1">
        <NavLink
          to={`/tools/${u.id}`}
          onClick={closeNav}
          className={(state) => `${linkClass(state)} min-w-0 flex-1`}
          title={collapsed ? name : undefined}
        >
          <span className="transition-transform duration-200 group-hover:scale-110">{u.icon}</span>
          <span className={`flex-1 truncate ${collapsed ? 'lg:hidden' : ''}`}>{name}</span>
        </NavLink>
        {user && (
          <StarButton
            active={fav}
            onClick={() => toggleFavorite(u.id)}
            title={fav ? t.removeFavourite : t.addFavourite}
            className={`shrink-0 ${collapsed ? 'lg:hidden' : ''} ${
              fav ? '' : 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100'
            }`}
          />
        )}
      </div>
    )
  }

  return (
    <div className="ambient flex min-h-dvh bg-surface text-white lg:h-dvh lg:overflow-hidden">
      {/* Sidebar: a full-screen drawer on mobile, a static rail from lg up. */}
      <aside
        className={`glass-strong fixed inset-0 z-30 flex w-full shrink-0 flex-col transition-all duration-300 lg:static lg:z-10 lg:m-3 lg:translate-x-0 lg:rounded-2xl ${
          collapsed ? 'lg:w-20' : 'lg:w-64'
        } ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div
          className={`flex items-center justify-between pr-3 lg:pr-0 ${
            collapsed ? 'lg:flex-col lg:items-center lg:gap-1 lg:px-2 lg:py-2' : ''
          }`}
        >
          <NavLink
            to="/"
            onClick={closeNav}
            className={`group flex items-center gap-3 px-5 py-5 ${collapsed ? 'lg:px-0 lg:py-1' : ''}`}
          >
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 shadow-lg shadow-indigo-500/30 transition-transform duration-200 group-hover:scale-105">
              <svg className="size-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z" />
                <path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" />
                <path d="M3 13h6m6 0h6" />
                <path d="M9 11v4m6-4v4" />
              </svg>
            </span>
            <span className={`text-lg font-bold tracking-tight ${collapsed ? 'lg:hidden' : ''}`}>
              Toolbox
            </span>
          </NavLink>
          {/* Desktop rail collapse/expand toggle. */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? t.expandSidebar : t.collapseSidebar}
            title={collapsed ? t.expandSidebar : t.collapseSidebar}
            className={`hidden size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white lg:grid ${
              collapsed ? '' : 'mr-3'
            }`}
          >
            <PanelLeft className="size-5" />
          </button>
          {/* Close affordance — the drawer covers the whole screen on mobile. */}
          <button
            onClick={closeNav}
            aria-label={t.closeMenu}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {/* Pinned favourites, surfaced at the top and omitted from the list
              below so each tool appears only once. */}
          {favourites.length > 0 && (
            <div className="mb-2 space-y-1 border-b border-white/5 pb-2">
              <p
                className={`px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500 ${
                  collapsed ? 'lg:hidden' : ''
                }`}
              >
                {t.favourites}
              </p>
              {favourites.map((u) => renderItem(u, 'fav-'))}
            </div>
          )}
          {nonFavourites.length > 0 && (
            <>
              <p
                className={`px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500 ${
                  collapsed ? 'lg:hidden' : ''
                }`}
              >
                {t.utilities}
              </p>
              {nonFavourites.map((u) => renderItem(u))}
            </>
          )}
        </nav>

        <div className={`border-t border-white/5 p-4 ${collapsed ? 'lg:px-2' : ''}`}>
          <div className={`mb-3 flex justify-center ${collapsed ? 'lg:hidden' : ''}`}>
            <LanguageSwitcher />
          </div>
          {user ? (
            <>
              <p
                className={`truncate text-xs text-slate-500 ${collapsed ? 'lg:hidden' : ''}`}
                title={user.email ?? ''}
              >
                {user.email}
              </p>
              <button
                onClick={signOut}
                title={t.logOut}
                className={`mt-3 w-full rounded-xl border border-white/10 bg-white/5 py-1.5 text-sm font-medium text-slate-300 transition-all duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white ${
                  collapsed ? 'lg:px-0' : 'px-3'
                }`}
              >
                <span className={collapsed ? 'lg:hidden' : ''}>{t.logOut}</span>
                <span className={collapsed ? 'hidden lg:inline' : 'hidden'}>⏻</span>
              </button>
            </>
          ) : (
            <>
              <p className={`text-xs text-slate-500 ${collapsed ? 'lg:hidden' : ''}`}>
                {t.signInPrompt}
              </p>
              <Link
                to="/login"
                onClick={closeNav}
                title={t.logIn}
                className={`mt-3 block w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-1.5 text-center text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all duration-200 hover:brightness-110 ${
                  collapsed ? 'lg:px-0' : 'px-3'
                }`}
              >
                <span className={collapsed ? 'lg:hidden' : ''}>{t.logIn}</span>
                <span className={collapsed ? 'hidden lg:inline' : 'hidden'}>→</span>
              </Link>
            </>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar with the menu toggle — hidden from lg up. */}
        <header className="glass-strong z-10 m-3 mb-0 flex items-center gap-3 rounded-2xl px-4 py-3 lg:hidden">
          <button
            onClick={() => setNavOpen(true)}
            aria-label={t.openMenu}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 shadow-lg shadow-indigo-500/30">
              <svg className="size-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z" />
                <path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" />
                <path d="M3 13h6m6 0h6" />
                <path d="M9 11v4m6-4v4" />
              </svg>
            </span>
            <span className="font-bold tracking-tight">Toolbox</span>
          </Link>
        </header>

        <main className="relative z-10 flex-1 p-5 sm:p-8 lg:overflow-y-auto lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
