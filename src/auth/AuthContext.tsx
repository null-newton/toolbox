import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { TERMS_VERSION, PRIVACY_VERSION } from '../legal/content'
import { supabase } from '../lib/supabase'
import type { AccountAccess } from './access'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const [accessState, setAccessState] = useState<{ userId: string; access: AccountAccess | null; error: string | null } | null>(null)
  const currentUser = useRef(session?.user.id)
  useEffect(() => { currentUser.current = session?.user.id }, [session?.user.id])
  const refreshAccess = useCallback(async () => {
    const userId = currentUser.current
    if (!userId) return
    const { data, error } = await supabase.rpc('account_access')
    if (currentUser.current !== userId) return
    setAccessState({ userId, access: data as AccountAccess | null, error: error?.message ?? (!data ? 'Account settings unavailable.' : null) })
  }, [])

  useEffect(() => {
    if (!session?.user.id) return
    void refreshAccess()
    const timer = setInterval(() => void refreshAccess(), 60000)
    const onFocus = () => void refreshAccess()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [session?.user.id, refreshAccess])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION, adult_attested: true } } })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const resolved = accessState?.userId === session?.user.id ? accessState : null
  const access = resolved?.access ?? null
  const canUseApp = (appId: string) => Boolean(access && !access.suspended && access.apps.some(app => app.app_id === appId && app.allowed))

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, session, loading: loading || Boolean(session && !resolved), access, accessError: resolved?.error ?? null, refreshAccess, canUseApp, signIn, signOut, signUp }}
    >
      {children}
    </AuthContext.Provider>
  )
}
