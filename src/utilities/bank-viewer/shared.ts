import { supabase } from '../../lib/supabase'
import { openCompressed, sealCompressed, type DataBox } from './crypto'
import type { Book } from './store'

// Per-tool settings, sealed with the Bank Viewer data key so merchant names never reach the server in clear text.
export async function loadPrefs<P>(appId: string, dk: CryptoKey, fallback: P): Promise<P> {
  const { data, error } = await supabase.from('utility_configs').select('config').eq('utility_id', appId).maybeSingle()
  if (error) throw new Error(error.message)
  const box = (data?.config as { data?: DataBox } | undefined)?.data
  try { return box ? { ...fallback, ...(await openCompressed<P>(dk, box)) } : fallback } catch { return fallback }
}
export async function savePrefs(userId: string, appId: string, dk: CryptoKey, prefs: unknown) {
  const { error } = await supabase.from('utility_configs').upsert({ user_id: userId, utility_id: appId, config: { data: await sealCompressed(dk, prefs) } }, { onConflict: 'user_id,utility_id' })
  if (error) throw new Error(error.message)
}

export const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${on ? 'border-emerald-400/50 bg-emerald-400/10 text-white' : 'border-white/10 text-slate-400 hover:border-white/25'}`
// Linked accounts with a display label and IBAN.
export const accountList = (book: Book) => book.sessions.flatMap((s) => s.accounts.map((a) => ({ uid: a.uid, label: a.name || a.iban || a.uid.slice(0, 8), iban: a.iban || '' })))
