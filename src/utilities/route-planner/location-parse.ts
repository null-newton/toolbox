/**
 * Turn typed or pasted locations into coordinates without a geocoder:
 *  - decimal coordinates: "52.0907, 5.1214", "52,0907 5,1214", "N52.09 E5.12"
 *  - degrees/minutes/seconds as Google Maps shows them: 52°05'26.5"N 5°07'17.0"E
 *  - Google Maps links containing coordinates (…/@52.09,5.12,15z, !3d…!4d…, ?q=lat,lon)
 *  - Plus Codes (Google's Open Location Code): "9F469CVC+XQ", or the short
 *    form "9CVC+XQ Utrecht", which needs a reference location to resolve.
 */

export interface LatLonValue { lat: number; lon: number }

export type ParsedLocation =
  | { kind: 'coordinates'; lat: number; lon: number }
  | { kind: 'pluscode'; lat: number; lon: number; code: string }
  /** Short Plus Code: resolve near `locality` (geocode it) or near the map. */
  | { kind: 'shortcode'; code: string; locality: string }

const valid = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

/* ---------- Plus Codes (Open Location Code) ---------- */

const ALPHABET = '23456789CFGHJMPQRVWX'
const PAIR_RES = [20, 1, 0.05, 0.0025, 0.000125]
const CODE_RE = /(?:^|\s)([23456789CFGHJMPQRVWX0]{2,8}\+[23456789CFGHJMPQRVWX]{0,7})(?=\s|,|$)/i

/** Decode a full Plus Code to the centre of its cell. */
export function decodePlusCode(code: string): LatLonValue | null {
  const clean = code.toUpperCase().replace('+', '').replace(/0+$/, '')
  if (code.indexOf('+') !== 8 || clean.length < 2 || clean.length % 2 === 1 && clean.length < 10) return null
  let lat = -90, lon = -180, latRes = 20, lonRes = 20
  for (let i = 0; i < Math.min(clean.length, 10); i += 2) {
    const a = ALPHABET.indexOf(clean[i]), b = ALPHABET.indexOf(clean[i + 1])
    if (a < 0 || b < 0) return null
    latRes = lonRes = PAIR_RES[i / 2]
    lat += a * latRes
    lon += b * lonRes
  }
  // Grid refinement after the first 10 digits: 5 rows × 4 columns per digit.
  for (let i = 10; i < clean.length; i++) {
    const d = ALPHABET.indexOf(clean[i])
    if (d < 0) return null
    latRes /= 5
    lonRes /= 4
    lat += Math.floor(d / 4) * latRes
    lon += (d % 4) * lonRes
  }
  return { lat: Math.min(90, lat + latRes / 2), lon: lon + lonRes / 2 }
}

/** The first `digits` characters (≤ 8, even) of the Plus Code for a point. */
function encodePrefix(lat: number, lon: number, digits: number): string {
  let la = Math.min(Math.max(lat, -90), 89.9999999) + 90
  let lo = ((((lon + 180) % 360) + 360) % 360)
  let out = ''
  for (let i = 0; i < digits / 2; i++) {
    const res = PAIR_RES[i]
    const a = Math.floor(la / res), b = Math.floor(lo / res)
    la -= a * res
    lo -= b * res
    out += ALPHABET[a] + ALPHABET[b]
  }
  return out
}

/** Resolve a short Plus Code ("9CVC+XQ") to the matching cell nearest `ref`. */
export function recoverShortCode(short: string, ref: LatLonValue): LatLonValue | null {
  const code = short.toUpperCase()
  const sep = code.indexOf('+')
  if (sep >= 8) return decodePlusCode(code)
  const padding = 8 - sep
  if (sep < 2 || padding % 2) return null
  const full = encodePrefix(ref.lat, ref.lon, padding) + code
  const p = decodePlusCode(full)
  if (!p) return null
  // The prefix came from the reference point; shift by one cell if that's closer.
  const res = Math.pow(20, 2 - padding / 2)
  let { lat, lon } = p
  if (ref.lat + res / 2 < lat && lat - res >= -90) lat -= res
  else if (ref.lat - res / 2 > lat && lat + res <= 90) lat += res
  if (ref.lon + res / 2 < lon) lon -= res
  else if (ref.lon - res / 2 > lon) lon += res
  return { lat, lon }
}

/* ---------- Coordinates ---------- */

function num(s: string | undefined): number {
  return s == null ? 0 : Number(s.replace(',', '.'))
}

function fromGoogleUrl(s: string): LatLonValue | null {
  const m =
    s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i) || // exact place pin
    s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) || // map view centre
    s.match(/[?&](?:q|ll|query|destination|daddr|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i)
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null
}

function fromDecimal(s: string): LatLonValue | null {
  // "52.09, 5.12" / "52.09 5.12" / "52.09;5.12"
  let m = s.match(/^\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/)
  // Dutch decimal commas: "52,0907 5,1214" or "52,0907; 5,1214"
  if (!m) m = s.match(/^(-?\d{1,3},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)$/)
  return m ? { lat: num(m[1]), lon: num(m[2]) } : null
}

/** 52°05'26.5"N 5°07'17.0"E, N 52.0907 E 5.1214, 52 05.44N 5 07.28E … */
function fromDms(input: string): LatLonValue | null {
  const s = input.toUpperCase()
    .replace(/[″“”]/g, '"').replace(/[′‘’]/g, "'").replace(/''/g, '"').replace(/º/g, '°')
  if (!/[°'"NSEW]/.test(s)) return null
  const part = /([NSEW])?\s*(-?\d+(?:[.,]\d+)?)\s*°?\s*(?:(\d+(?:[.,]\d+)?)\s*'?\s*)?(?:(\d+(?:[.,]\d+)?)\s*"\s*)?([NSEW])?/g
  const parts = [...s.matchAll(part)].filter((m) => m[2] != null)
  if (parts.length !== 2) return null
  const values = parts.map((m) => {
    const hemi = m[1] || m[5] || ''
    const deg = num(m[2])
    const value = Math.abs(deg) + num(m[3]) / 60 + num(m[4]) / 3600
    const negative = deg < 0 || hemi === 'S' || hemi === 'W'
    return { value: negative ? -value : value, hemi }
  })
  // Hemisphere letters decide the order ("E5 N52" works too); otherwise lat comes first.
  const [a, b] = values
  if ('EW'.includes(a.hemi) && a.hemi && (!b.hemi || 'NS'.includes(b.hemi))) return { lat: b.value, lon: a.value }
  return { lat: a.value, lon: b.value }
}

export function parseLocation(input: string): ParsedLocation | null {
  const s = input.trim()
  if (!s) return null

  const code = s.match(CODE_RE)
  if (code) {
    const c = code[1].toUpperCase()
    if (c.indexOf('+') === 8) {
      const p = decodePlusCode(c)
      if (p) return { kind: 'pluscode', code: c, ...p }
    } else {
      const locality = s.replace(code[0], ' ').replace(/^[\s,]+|[\s,]+$/g, '')
      return { kind: 'shortcode', code: c, locality }
    }
  }

  const p = fromGoogleUrl(s) ?? fromDecimal(s) ?? fromDms(s)
  return p && valid(p.lat, p.lon) ? { kind: 'coordinates', lat: p.lat, lon: p.lon } : null
}

/** Full Plus Code (10 digits ≈ 14 m) for showing/copying a point. */
export function encodePlusCode(lat: number, lon: number): string {
  const c = encodePrefix(lat, lon, 10)
  return c.slice(0, 8) + '+' + c.slice(8)
}
