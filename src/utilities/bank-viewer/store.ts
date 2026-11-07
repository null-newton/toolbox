// Storage for the Bank Viewer. Everything saved on the account is encrypted in the browser.
//
//   account row (utility_configs, utility_id 'bank-viewer'):
//     vault  — sealed with the user's PASSWORD: Enable Banking app id, .pem key, data key
//     data   — sealed with the random DATA KEY (gzip): linked banks, salary rules, transactions
//
//   this device (IndexedDB): the data key as a non-extractable CryptoKey, so saved data
//   can be shown without the password. The .pem (needed to refresh) still needs the password.

import { supabase } from '../../lib/supabase'
import {
  PBKDF2_ITERATIONS, deriveKey, fromB64, importPrivateKey, open, openCompressed, randomBytes, seal, sealCompressed, toB64,
  type DataBox, type SealedBox,
} from './crypto'
import type { Cache, LinkedSession, SalaryRule } from './model'

const APP_ID = 'bank-viewer'

/** Password-sealed part. */
export interface SecretData {
  applicationId: string
  pem: string
  dataKey: string // base64, 32 random bytes
}
/** Older vault format (everything password-sealed). Migrated on unlock. */
interface LegacyVault {
  applicationId: string
  pem: string
  sessions?: LinkedSession[]
  salary?: Record<string, SalaryRule>
  dataKey?: string
}
/** Data-key-sealed part: what is shown while locked. */
export interface Book {
  sessions: LinkedSession[]
  salary: Record<string, unknown> // per account uid; read with normalizeRule
  cache: Cache
}
export interface Row {
  vault: SealedBox
  data?: DataBox
}
/** In memory only, while unlocked. */
export interface Secret {
  data: SecretData
  rsaKey: CryptoKey
}

export const emptyBook = (): Book => ({ sessions: [], salary: {}, cache: {} })

// ---- account row ----

export async function loadRow(): Promise<Row | null> {
  const { data, error } = await supabase.from('utility_configs').select('config').eq('utility_id', APP_ID).maybeSingle()
  if (error) throw new Error(error.message)
  const config = data?.config as Partial<Row> | undefined
  return config?.vault ? (config as Row) : null
}

export async function saveRow(userId: string, row: Row) {
  const { error } = await supabase.from('utility_configs').upsert(
    { user_id: userId, utility_id: APP_ID, config: row },
    { onConflict: 'user_id,utility_id' }
  )
  if (error) throw new Error(error.message)
}

export async function deleteRow() {
  const { error } = await supabase.from('utility_configs').delete().eq('utility_id', APP_ID)
  if (error) throw new Error(error.message)
}

// ---- keys ----

export function importDataKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromB64(b64), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function sealVault(password: string, data: SecretData): Promise<SealedBox> {
  const salt = randomBytes(16)
  return seal(await deriveKey(password, salt), salt, PBKDF2_ITERATIONS, data)
}

export const sealBook = (dk: CryptoKey, book: Book) => sealCompressed(dk, book)
export const openBook = async (dk: CryptoKey, box: DataBox) => {
  const book = await openCompressed<Book>(dk, box)
  return { sessions: book.sessions || [], salary: book.salary || {}, cache: book.cache || {} }
}

export class WrongPassword extends Error {}

/**
 * Unlock with the password. Older rows (no data key yet) are migrated: a data
 * key is created and banks/rules/cache move into the data box.
 */
export async function unlock(userId: string, password: string, row: Row): Promise<{ secret: Secret; dk: CryptoKey; book: Book; row: Row }> {
  const pwKey = await deriveKey(password, fromB64(row.vault.salt), row.vault.iterations)
  let raw: LegacyVault
  try { raw = await open<LegacyVault>(pwKey, row.vault) } catch (cause) { throw new WrongPassword('wrong password', { cause }) }
  const rsaKey = await importPrivateKey(raw.pem)

  if (raw.dataKey && row.data) {
    const dk = await importDataKey(raw.dataKey)
    const secret = { data: { applicationId: raw.applicationId, pem: raw.pem, dataKey: raw.dataKey }, rsaKey }
    return { secret, dk, book: await openBook(dk, row.data), row }
  }

  // Migrate: new data key, move everything except the key into the data box.
  const dataKey = toB64(randomBytes(32))
  const dk = await importDataKey(dataKey)
  const book: Book = { sessions: raw.sessions || [], salary: raw.salary || {}, cache: await legacyLocalCache(userId, pwKey) }
  const data: SecretData = { applicationId: raw.applicationId, pem: raw.pem, dataKey }
  const next: Row = { vault: await seal(pwKey, fromB64(row.vault.salt), row.vault.iterations, data), data: await sealBook(dk, book) }
  await saveRow(userId, next)
  try { localStorage.removeItem(`bank-viewer:cache:${userId}`) } catch { /* ignore */ }
  return { secret: { data, rsaKey }, dk, book, row: next }
}

async function legacyLocalCache(userId: string, pwKey: CryptoKey): Promise<Cache> {
  try {
    const raw = localStorage.getItem(`bank-viewer:cache:${userId}`)
    return raw ? await open<Cache>(pwKey, JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

// ---- device key (IndexedDB) ----

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('bank-viewer', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('keys')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function idbOp<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  try {
    const db = await idb()
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction('keys', mode).objectStore('keys'))
      req.onsuccess = () => resolve(req.result as T)
      req.onerror = () => reject(req.error)
    }).finally(() => db.close())
  } catch {
    return null // private mode / blocked storage: fall back to asking the password
  }
}
export const getDeviceKey = (userId: string) => idbOp<CryptoKey>('readonly', (s) => s.get(userId))
export const setDeviceKey = (userId: string, key: CryptoKey) => idbOp('readwrite', (s) => s.put(key, userId))
export const forgetDeviceKey = (userId: string) => idbOp('readwrite', (s) => s.delete(userId))
