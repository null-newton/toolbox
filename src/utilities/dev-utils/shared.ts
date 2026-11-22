export const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500'
export const codeAreaClass =
  'form-input min-h-40 resize-y font-mono text-[13px] leading-relaxed [tab-size:2]'

/** UTF-8 safe Base64 helpers (btoa/atob only handle Latin-1). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
export function base64ToBytes(b64: string): Uint8Array {
  let s = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (/[^A-Za-z0-9+/=]/.test(s)) throw new Error('Invalid Base64 character')
  s = s.replace(/=+$/, '')
  if (s.length % 4 === 1) throw new Error('Invalid Base64 length')
  s += '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
export const toUrlSafe = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
