import { useEffect, useMemo, useState } from 'react'
import { ToolHeader } from '../../components/ToolHeader'
import { LOCALES, useLang, useT } from '../../i18n/LanguageContext'
import { CodeArea, CopyButton, ErrorNote, Output, Panel } from './ui'
import { base64ToBytes } from './shared'

const STR = {
  en: {
    intro: 'Decode a JSON Web Token to read its header and claims, check when it expires, and optionally verify an HMAC signature. The token never leaves your browser.',
    token: 'Token', tokenPh: 'Paste a JWT (eyJ…)', header: 'Header', payload: 'Payload', claims: 'Time claims',
    exp: 'Expires', iat: 'Issued', nbf: 'Not before', expired: 'Expired', valid: 'Not expired', notYet: 'Not valid yet',
    parts: 'A JWT has three dot-separated parts.', badPart: 'Could not decode the', verify: 'Verify signature',
    secret: 'Shared secret', secretPh: 'HMAC secret for HS256 / HS384 / HS512', sigOk: 'Signature is valid',
    sigBad: 'Signature does not match', sigUnsupported: 'Only HMAC (HS*) signatures can be checked here; this token uses',
    unverified: 'Decoding does not verify the signature — never trust these claims without checking it server-side.',
    ago: 'ago', in: 'in',
  },
  nl: {
    intro: 'Decodeer een JSON Web Token om de header en claims te lezen, te zien wanneer hij verloopt en eventueel een HMAC-handtekening te controleren. Het token verlaat je browser niet.',
    token: 'Token', tokenPh: 'Plak een JWT (eyJ…)', header: 'Header', payload: 'Payload', claims: 'Tijdsclaims',
    exp: 'Verloopt', iat: 'Uitgegeven', nbf: 'Niet vóór', expired: 'Verlopen', valid: 'Niet verlopen', notYet: 'Nog niet geldig',
    parts: 'Een JWT bestaat uit drie delen gescheiden door punten.', badPart: 'Kon dit deel niet decoderen:', verify: 'Handtekening controleren',
    secret: 'Gedeeld geheim', secretPh: 'HMAC-geheim voor HS256 / HS384 / HS512', sigOk: 'Handtekening is geldig',
    sigBad: 'Handtekening klopt niet', sigUnsupported: 'Alleen HMAC-handtekeningen (HS*) kunnen hier gecontroleerd worden; dit token gebruikt',
    unverified: 'Decoderen controleert de handtekening niet — vertrouw deze claims nooit zonder ze op de server te verifiëren.',
    ago: 'geleden', in: 'over',
  },
}

const decodeJson = (part: string) => JSON.parse(new TextDecoder().decode(base64ToBytes(part)))

function relative(seconds: number, now: number, lang: 'en' | 'nl') {
  const rtf = new Intl.RelativeTimeFormat(LOCALES[lang], { numeric: 'auto' })
  const diff = seconds - now
  const abs = Math.abs(diff)
  const [n, unit]: [number, Intl.RelativeTimeFormatUnit] =
    abs < 60 ? [diff, 'second'] : abs < 3600 ? [diff / 60, 'minute'] : abs < 86400 ? [diff / 3600, 'hour'] : abs < 86400 * 365 ? [diff / 86400, 'day'] : [diff / 86400 / 365, 'year']
  return rtf.format(Math.round(n), unit)
}

export function JwtTool() {
  const t = useT(STR)
  const { lang } = useLang()
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [sigResult, setSigResult] = useState<{ for: string; ok: boolean } | null>(null)
  const [now, setNow] = useState(() => Date.now() / 1000)

  type Decoded = { error: string } | { raw: string; parts: string[]; header: Record<string, unknown>; payload: Record<string, unknown> }
  const decoded = useMemo((): Decoded | null => {
    const raw = token.trim().replace(/^Bearer\s+/i, '')
    if (!raw) return null
    const parts = raw.split('.')
    if (parts.length !== 3) return { error: t.parts }
    let header: Record<string, unknown>, payload: Record<string, unknown>
    try { header = decodeJson(parts[0]) } catch { return { error: `${t.badPart} ${t.header.toLowerCase()}` } }
    try { payload = decodeJson(parts[1]) } catch { return { error: `${t.badPart} ${t.payload.toLowerCase()}` } }
    return { raw, parts, header, payload }
  }, [token, t])

  const alg = decoded && 'header' in decoded ? String(decoded.header.alg ?? '') : ''
  const hash = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }[alg]

  useEffect(() => {
    if (!decoded || !('parts' in decoded) || !secret || !hash) return
    let cancelled = false
    ;(async () => {
      const enc = new TextEncoder()
      const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash }, false, ['verify'])
      let signature: Uint8Array
      try { signature = base64ToBytes(decoded.parts[2]) } catch { if (!cancelled) setSigResult({ for: decoded.raw + secret, ok: false }); return }
      const ok = await crypto.subtle.verify('HMAC', key, signature as BufferSource, enc.encode(`${decoded.parts[0]}.${decoded.parts[1]}`))
      if (!cancelled) setSigResult({ for: decoded.raw + secret, ok })
    })()
    return () => { cancelled = true }
  }, [decoded, secret, hash])

  const sig = sigResult && decoded && 'raw' in decoded && hash && sigResult.for === decoded.raw + secret ? (sigResult.ok ? 'ok' : 'bad') : null
  const timeClaims = decoded && 'payload' in decoded
    ? (['exp', 'iat', 'nbf'] as const).filter((k) => typeof decoded.payload[k] === 'number').map((k) => ({ k, v: decoded.payload[k] as number }))
    : []
  const exp = timeClaims.find((c) => c.k === 'exp')?.v
  const nbf = timeClaims.find((c) => c.k === 'nbf')?.v
  const status = exp != null && exp < now ? 'expired' : nbf != null && nbf > now ? 'notYet' : exp != null ? 'valid' : null
  const fmt = new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'medium', timeStyle: 'medium' })

  const header = decoded && 'header' in decoded ? JSON.stringify(decoded.header, null, 2) : ''
  const payload = decoded && 'payload' in decoded ? JSON.stringify(decoded.payload, null, 2) : ''

  return (
    <div>
      <ToolHeader intro={t.intro} />
      <Panel title={t.token}>
        <CodeArea value={token} onChange={(e) => { setToken(e.target.value); setNow(Date.now() / 1000) }} rows={4} placeholder={t.tokenPh} className="min-h-24 break-all" />
        {decoded && 'error' in decoded && <ErrorNote>{decoded.error}</ErrorNote>}
        {decoded && 'parts' in decoded && (
          <p className="mt-3 break-all font-mono text-xs leading-relaxed">
            <span className="text-rose-300">{decoded.parts[0]}</span>.<span className="text-violet-300">{decoded.parts[1]}</span>.<span className="text-cyan-300">{decoded.parts[2]}</span>
          </p>
        )}
      </Panel>

      {decoded && 'header' in decoded && (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Panel title={<span className="text-rose-300">{t.header}</span>} actions={<CopyButton value={header} />}><Output value={header} /></Panel>
            <Panel title={<span className="text-violet-300">{t.payload}</span>} actions={<CopyButton value={payload} />}><Output value={payload} /></Panel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel
              title={t.claims}
              actions={status && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status === 'valid' ? 'bg-lime-300/15 text-lime-300' : 'bg-rose-400/15 text-rose-200'}`}>
                  {t[status]}
                </span>
              )}
            >
              {timeClaims.length ? (
                <dl className="space-y-2 text-sm">
                  {timeClaims.map(({ k, v }) => (
                    <div key={k} className="flex flex-wrap justify-between gap-x-4">
                      <dt className="text-slate-400">{t[k]} <span className="font-mono text-xs text-slate-600">{k}</span></dt>
                      <dd className="text-slate-100">{fmt.format(v * 1000)} <span className="text-slate-500">· {relative(v, now, lang)}</span></dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="text-sm text-slate-500">—</p>}
            </Panel>

            <Panel title={t.verify}>
              {hash ? (
                <>
                  <input type="text" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={t.secretPh} aria-label={t.secret} className="form-input font-mono" autoComplete="off" spellCheck={false} />
                  {sig && <p className={`mt-3 text-sm ${sig === 'ok' ? 'text-lime-300' : 'text-rose-300'}`}>{sig === 'ok' ? `✓ ${t.sigOk}` : `✗ ${t.sigBad}`}</p>}
                </>
              ) : (
                <p className="text-sm text-slate-400">{t.sigUnsupported} <span className="font-mono text-slate-200">{alg || '—'}</span>.</p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-slate-500">{t.unverified}</p>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
