// IndexedDB persistence for scan sessions — page images stay on this device only.
import type { Page } from './scanner'

export interface Doc { id: string; name: string; pages: Page[]; at: number }
export interface Session { id: string; created: number; updated: number; finished?: number; docs: Doc[]; current: Page[]; reopened?: { doc: Doc; index: number } }

const DB = 'bulk-scanner', STORE = 'sessions'
let db: Promise<IDBDatabase> | null = null
const open = () => db ??= new Promise((ok, fail) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error) })
const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => { const s = (await open()).transaction(STORE, mode).objectStore(STORE); return new Promise<T>((ok, fail) => { const r = fn(s); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error) }) }

export const getSession = (id: string) => run<Session | undefined>('readonly', (s) => s.get(id))
export const putSession = (x: Session) => run('readwrite', (s) => s.put(x))
export const deleteSession = (id: string) => run('readwrite', (s) => s.delete(id))
export const listSessions = async () => (await run<Session[]>('readonly', (s) => s.getAll())).sort((a, b) => b.updated - a.updated)
export const newSession = (): Session => ({ id: Math.random().toString(36).slice(2, 10), created: Date.now(), updated: Date.now(), docs: [], current: [] })
