// HashRouter so deep links survive refresh on GitHub Pages (no rewrite rules there).
import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/auth-context'
import { FavoritesProvider } from './favorites/FavoritesProvider'
import { AuthPage } from './auth/AuthPage'
import { Layout } from './components/Layout'
import { SetupScreen } from './components/SetupScreen'
import { Home } from './pages/Home'
import { isSupabaseConfigured } from './lib/supabase'
import { getUtility } from './utilities/registry'
import { useT } from './i18n/LanguageContext'
import { LanguageProvider } from './i18n/LanguageProvider'
import './utilities' // registers all utilities

const FileTransfer = lazy(() =>
  import('./utilities/file-transfer/FileTransfer').then((module) => ({ default: module.FileTransfer }))
)

function UtilityPage() {
  const { user } = useAuth()
  const { utilityId } = useParams()
  const t = useT({ en: { loading: 'Loading tool…' }, nl: { loading: 'Tool laden…' } })
  const utility = utilityId ? getUtility(utilityId) : undefined
  if (!utility) return <Navigate to="/" replace />
  if (!user && !utility.availableWithoutAccount) return <Navigate to="/login" replace />
  const Component = utility.component
  return (
    <Suspense fallback={<p className="animate-pulse text-slate-400">{t.loading}</p>}>
      <Component />
    </Suspense>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()
  const t = useT({ en: { loading: 'Loading…' }, nl: { loading: 'Laden…' } })

  if (loading) {
    return (
      <div className="ambient flex min-h-screen items-center justify-center bg-surface text-slate-400">
        <span className="relative z-10 animate-pulse">{t.loading}</span>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route
          path="/transfer/:transferId"
          element={
            <Suspense fallback={<p className="animate-pulse text-slate-400">{t.loading}</p>}>
              <FileTransfer />
            </Suspense>
          }
        />
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
