import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './auth-context'
import { useT } from '../i18n/LanguageContext'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

type Mode = 'login' | 'register'

const STR = {
  en: {
    loginSubtitle: 'Log in to your account',
    registerSubtitle: 'Create a new account',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm password',
    passwordsNoMatch: 'Passwords do not match.',
    accountCreated:
      'Account created. If email confirmation is enabled, check your inbox before logging in.',
    pleaseWait: 'Please wait…',
    logIn: 'Log in',
    register: 'Register',
    noAccount: 'No account yet?',
    haveAccount: 'Already have an account?',
    continueWithout: 'Continue without an account →',
  },
  nl: {
    loginSubtitle: 'Meld je aan bij je account',
    registerSubtitle: 'Maak een nieuw account',
    email: 'E-mail',
    password: 'Wachtwoord',
    confirmPassword: 'Bevestig wachtwoord',
    passwordsNoMatch: 'Wachtwoorden komen niet overeen.',
    accountCreated:
      'Account aangemaakt. Als e-mailbevestiging aanstaat, controleer dan je inbox voor je aanmeldt.',
    pleaseWait: 'Even geduld…',
    logIn: 'Aanmelden',
    register: 'Registreren',
    noAccount: 'Nog geen account?',
    haveAccount: 'Heb je al een account?',
    continueWithout: 'Verdergaan zonder account →',
  },
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-white placeholder-slate-500 transition-all duration-200 focus:border-indigo-400/60 focus:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-indigo-500/20'

export function AuthPage() {
  const { signIn, signUp } = useAuth()
  const t = useT(STR)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (mode === 'register' && password !== confirmPassword) {
      setError(t.passwordsNoMatch)
      return
    }

    setSubmitting(true)
    const { error: authError } =
      mode === 'login' ? await signIn(email, password) : await signUp(email, password)
    setSubmitting(false)

    if (authError) {
      setError(authError)
    } else if (mode === 'register') {
      setNotice(t.accountCreated)
      setMode('login')
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  return (
    <div className="ambient flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="absolute right-4 top-4 z-10">
        <LanguageSwitcher />
      </div>
      <div className="relative z-10 w-full max-w-sm animate-fade-up">
        <div className="mb-8 text-center">
          <svg className="mx-auto size-16" viewBox="0 0 24 24" fill="none" stroke="url(#toolbox-grad)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <defs>
              <linearGradient id="toolbox-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#c8ff3d" />
                <stop offset="100%" stopColor="#4ee6e0" />
              </linearGradient>
            </defs>
            <path d="M3 9h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z" />
            <path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" />
            <path d="M3 13h6m6 0h6" />
            <path d="M9 11v4m6-4v4" />
          </svg>
          <h1 className="brand-mark mt-4 text-2xl text-white">
            TOOL<span className="text-indigo-300">_</span>BOX
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            {mode === 'login' ? t.loginSubtitle : t.registerSubtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass space-y-4 rounded-2xl p-6 shadow-2xl">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
              {t.email}
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">
              {t.password}
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label
                htmlFor="confirm-password"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                {t.confirmPassword}
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-300">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="acid-button w-full rounded-xl px-4 py-2.5 font-bold transition-all duration-200 disabled:opacity-50"
          >
            {submitting ? t.pleaseWait : mode === 'login' ? t.logIn : t.register}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-400">
          {mode === 'login' ? (
            <>
              {t.noAccount}{' '}
              <button
                onClick={() => switchMode('register')}
                className="no-glow font-medium text-indigo-300 transition-colors hover:text-indigo-200"
              >
                {t.register}
              </button>
            </>
          ) : (
            <>
              {t.haveAccount}{' '}
              <button
                onClick={() => switchMode('login')}
                className="no-glow font-medium text-indigo-300 transition-colors hover:text-indigo-200"
              >
                {t.logIn}
              </button>
            </>
          )}
        </p>

        <p className="mt-3 text-center text-sm">
          <Link
            to="/"
            className="text-slate-500 transition-colors hover:text-slate-300"
          >
            {t.continueWithout}
          </Link>
        </p>
      </div>
    </div>
  )
}
