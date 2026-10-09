// HashRouter so deep links survive refresh on GitHub Pages (no rewrite rules there).
import { LegalPage, LegalLinks } from './legal/LegalPages'
import { AccountDeletedPage, PrivacyAccountPage } from './legal/AccountPrivacy'
import { TermsAcceptance } from './legal/TermsAcceptance'
import { lazy, Suspense } from 'react'
import { HashRouter, Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/auth-context'
import { FavoritesProvider } from './favorites/FavoritesProvider'
import { AuthPage } from './auth/AuthPage'
import { Layout } from './components/Layout'
import { SetupScreen } from './components/SetupScreen'
import { AccountPage } from './pages/AccountPage'
import { Home } from './pages/Home'
import { isSupabaseConfigured } from './lib/supabase'
import { loginDestination, loginUrl } from './lib/navigation'
import { getUtility } from './utilities/registry'
import { useT } from './i18n/LanguageContext'
import { LanguageProvider } from './i18n/LanguageProvider'
import './utilities' // registers all utilities

const FileTransfer = lazy(() =>
  import('./utilities/file-transfer/FileTransfer').then((module) => ({ default: module.FileTransfer }))
)

const SharedWishlist = lazy(() => import('./utilities/wishlist/SharedWishlist').then(m => ({ default: m.SharedWishlist })))

function UtilityPage() {
  const { user, canUseApp } = useAuth()
  const location = useLocation()
  const { utilityId } = useParams()
  const t = useT({ en: { loading: 'Loading tool…' }, nl: { loading: 'Tool laden…' } })
  const utility = utilityId ? getUtility(utilityId) : undefined
  if (!utility) return <Navigate to="/" replace />
  if (!user && !utility.availableWithoutAccount) return <Navigate to={loginUrl(location)} replace />
  if (user && !canUseApp(utility.id)) return <div className="space-y-3"><h1 className="text-2xl font-bold">App access unavailable</h1><p>Contact the account administrator to enable this app.</p></div>
  const Component = utility.component
  return (
    <Suspense fallback={<p className="animate-pulse text-slate-400">{t.loading}</p>}>
      <Component />
    </Suspense>
  )
}

function AppRoutes() {
  const { user, loading, accessError, access, refreshAccess, signOut } = useAuth()
  const location = useLocation()
  const t = useT({ en: { loading: 'Loading…' }, nl: { loading: 'Laden…' } })

  if (location.pathname === '/privacy' || location.pathname === '/terms') return <LegalPage kind={location.pathname === '/privacy' ? 'privacy' : 'terms'} />
  if (location.pathname === '/account-deleted') return <AccountDeletedPage />

  if (loading) {
    return (
      <div className="ambient flex min-h-screen items-center justify-center bg-surface text-slate-400">
        <span className="relative z-10 animate-pulse">{t.loading}</span>
      </div>
    )
  }

  if (user && location.pathname === '/account/privacy') return <PrivacyAccountPage />
  if (user && access && !access.terms_accepted) return <TermsAcceptance />

  if (user && (accessError || access?.suspended)) return <div className="ambient flex min-h-screen items-center justify-center bg-surface text-white"><div className="relative z-10 space-y-4 p-8"><h1 className="text-2xl font-bold">{access?.suspended ? 'Account suspended' : 'Account settings unavailable'}</h1><p>{access?.suspended ? 'Contact the account administrator.' : accessError}</p><Link to="/account/privacy" className="block text-indigo-300">Export data or delete account</Link><LegalLinks /><button onClick={() => void refreshAccess()} className="acid-button rounded px-4 py-2">Retry</button> <button onClick={() => void signOut()}>Log out</button></div></div>

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={loginDestination(location.search)} replace /> : <AuthPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/account" element={user ? <AccountPage /> : <Navigate to="/login" replace />} />
        <Route
          path="/transfer/:transferId"
          element={
            <Suspense fallback={<p className="animate-pulse text-slate-400">{t.loading}</p>}>
              <FileTransfer />
            </Suspense>
          }
        />
        <Route path="/wishlist/:token" element={
          <Suspense fallback={<p className="animate-pulse text-slate-400">{t.loading}</p>}>
            <SharedWishlist />
          </Suspense>
        } />
        <Route path="/tools/:utilityId" element={<UtilityPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <LanguageProvider>
        <SetupScreen />
      </LanguageProvider>
    )
  }

  return (
    <LanguageProvider>
      <AuthProvider>
        <FavoritesProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </FavoritesProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}
