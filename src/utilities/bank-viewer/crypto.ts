// Client-side crypto for the Bank Viewer.
//
// The Enable Banking private key never leaves the browser unencrypted:
//  - a vault key is derived from the user's password (PBKDF2-SHA256, random salt)
//  - the vault (application id + PEM + linked sessions) is sealed with AES-GCM
//  - only the ciphertext is stored in Supabase
//  - API JWTs are signed here with WebCrypto; the server only sees those 1-hour tokens

export const PBKDF2_ITERATIONS = 600_000

export interface SealedBox {
  v: 1
  salt: string
  iterations: number
  iv: string
  ct: string
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}
export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
const b64url = (bytes: ArrayBuffer | Uint8Array) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n))
}

/** Derive a non-extractable AES-GCM key from the password. */
export async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function seal(key: CryptoKey, salt: Uint8Array<ArrayBuffer>, iterations: number, value: unknown): Promise<SealedBox> {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)))
  return { v: 1, salt: toB64(salt), iterations, iv: toB64(iv), ct: toB64(ct) }
}

/** Throws if the key (password) is wrong or the data was tampered with. */
export async function open<T>(key: CryptoKey, box: SealedBox): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct))
  return JSON.parse(dec.decode(pt)) as T
}

// ---- PEM / RSA ----

function derLength(n: number): number[] {
  if (n < 0x80) return [n]
  const bytes: number[] = []
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8 }
  return [0x80 | bytes.length, ...bytes]
}
function der(tag: number, content: Uint8Array): Uint8Array {
  return new Uint8Array([tag, ...derLength(content.length), ...content])
}

/** Wrap a PKCS#1 "RSA PRIVATE KEY" into PKCS#8 so WebCrypto can import it. */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = new Uint8Array([0x02, 0x01, 0x00])
  const algorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00])
  const body = new Uint8Array([...version, ...algorithm, ...der(0x04, pkcs1)])
  return new Uint8Array(der(0x30, body))
}

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const match = pem.match(/-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END (RSA )?PRIVATE KEY-----/)
  if (!match) throw new Error('This file is not a PEM private key.')
  const raw = fromB64(match[2].replace(/\s+/g, ''))
  const pkcs8 = match[1] ? pkcs1ToPkcs8(raw) : raw
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

/** Enable Banking API token: RS256, kid = application id, valid for 1 hour. */
export async function signEnableBankingJwt(key: CryptoKey, applicationId: string, ttlSeconds = 3600): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: applicationId })))
  const body = b64url(enc.encode(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + ttlSeconds })))
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${body}`))
  return `${head}.${body}.${b64url(sig)}`
}

// ---- compressed boxes (bank data can be a few hundred KB of JSON) ----

export interface DataBox {
  v: 1
  z: 'gzip'
  iv: string
  ct: string
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())
}

export async function sealCompressed(key: CryptoKey, value: unknown): Promise<DataBox> {
  const iv = randomBytes(12)
  const zipped = await pipe(enc.encode(JSON.stringify(value)), new CompressionStream('gzip'))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, zipped)
  return { v: 1, z: 'gzip', iv: toB64(iv), ct: toB64(ct) }
}

export async function openCompressed<T>(key: CryptoKey, box: DataBox): Promise<T> {
  const zipped = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct)))
  return JSON.parse(dec.decode(await pipe(zipped, new DecompressionStream('gzip')))) as T
}
