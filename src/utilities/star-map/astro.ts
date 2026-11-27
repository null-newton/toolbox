// Low-precision positional astronomy for sky posters (accurate to well under
// a degree for 1800–2050, which is far below what a printed map can show).

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const OBLIQUITY = 23.4393 * RAD

export const julianDay = (ms: number) => ms / 86400000 + 2440587.5
const norm360 = (d: number) => ((d % 360) + 360) % 360

/** Local sidereal time in degrees for a UTC instant and east longitude. */
export function localSiderealTime(ms: number, lonDeg: number): number {
  const d = julianDay(ms) - 2451545
  const t = d / 36525
  return norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * t * t + lonDeg)
}

export interface Observer {
  /** sin/cos of latitude, local sidereal time (degrees) */
  sinLat: number
  cosLat: number
  lat: number
  lst: number
}

export function observer(ms: number, latDeg: number, lonDeg: number): Observer {
  return { lat: latDeg, sinLat: Math.sin(latDeg * RAD), cosLat: Math.cos(latDeg * RAD), lst: localSiderealTime(ms, lonDeg) }
}

/** Equatorial (degrees) → horizontal. alt in degrees, az in degrees from north through east. */
export function toHorizontal(o: Observer, raDeg: number, decDeg: number): { alt: number; az: number } {
  const h = (o.lst - raDeg) * RAD
  const dec = decDeg * RAD
  const sd = Math.sin(dec), cd = Math.cos(dec), ch = Math.cos(h)
  const sinAlt = sd * o.sinLat + cd * o.cosLat * ch
  const x = -cd * Math.sin(h)
  const y = sd * o.cosLat - cd * o.sinLat * ch
  return { alt: Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG, az: Math.atan2(x, y) * DEG }
}

/** Horizontal → equatorial (degrees). */
export function toEquatorial(o: Observer, altDeg: number, azDeg: number): { ra: number; dec: number } {
  const alt = altDeg * RAD, az = azDeg * RAD
  const sa = Math.sin(alt), ca = Math.cos(alt)
  const sinDec = sa * o.sinLat + ca * o.cosLat * Math.cos(az)
  const h = Math.atan2(-Math.sin(az) * ca, sa * o.cosLat - ca * o.sinLat * Math.cos(az))
  return { ra: norm360(o.lst - h * DEG), dec: Math.asin(Math.max(-1, Math.min(1, sinDec))) * DEG }
}

// Galactic pole (J2000)
const GP_RA = 192.85948 * RAD
const GP_DEC = 27.12825 * RAD
const L_NCP = 122.93192

export function toGalactic(raDeg: number, decDeg: number): { l: number; b: number } {
  const ra = raDeg * RAD, dec = decDeg * RAD
  const sb = Math.sin(dec) * Math.sin(GP_DEC) + Math.cos(dec) * Math.cos(GP_DEC) * Math.cos(ra - GP_RA)
  const y = Math.cos(dec) * Math.sin(ra - GP_RA)
  const x = Math.sin(dec) * Math.cos(GP_DEC) - Math.cos(dec) * Math.sin(GP_DEC) * Math.cos(ra - GP_RA)
  return { l: norm360(L_NCP - Math.atan2(y, x) * DEG), b: Math.asin(sb) * DEG }
}

/** Smooth, hand-tuned brightness of the Milky Way (0–1) at galactic l/b. */
export function milkyWayIntensity(l: number, b: number): number {
  const dl = l > 180 ? l - 360 : l // −180..180, 0 = galactic centre (Sagittarius)
  const core = Math.exp(-((dl / 55) ** 2))
  const width = 5.5 + 7 * core
  let v = Math.exp(-((b / width) ** 2)) * (0.38 + 0.62 * core)
  // central bulge
  v += 0.35 * Math.exp(-((dl / 18) ** 2) - ((b / 9) ** 2))
  // Great Rift (Cygnus → Sagittarius) and a few dark lanes
  const rift = Math.exp(-(((dl - 35) / 32) ** 2)) * Math.exp(-(((b - 1.2) / 2.6) ** 2))
  v *= 1 - 0.55 * rift
  // gentle cloudy texture
  const n = Math.sin(l * 0.21 * RAD * 20 + b * 0.4) * Math.sin(l * 0.09 * RAD * 25 - b * 0.7) * Math.cos(b * 0.55 + l * 0.05)
  v *= 0.82 + 0.18 * n
  return Math.max(0, Math.min(1, v))
}

// ---------- planets (JPL "Keplerian elements for approximate positions") ----------
type Elements = [number, number, number, number, number, number]
const PLANETS: Record<string, { el: Elements; rate: Elements }> = {
  Mercury: { el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081] },
  Venus: { el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418] },
  Earth: { el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0] },
  Mars: { el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343] },
  Jupiter: { el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106] },
  Saturn: { el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794] },
}

function heliocentric(name: string, t: number): [number, number, number] {
  const { el, rate } = PLANETS[name]
  const [a, e, I, L, wBar, node] = el.map((v, i) => v + rate[i] * t)
  const w = (wBar - node) * RAD, O = node * RAD, i = I * RAD
  const M = norm360(L - wBar) * RAD
  let E = M + e * Math.sin(M)
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i)
  return [
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    sw * si * xp + cw * si * yp,
  ]
}

function eclipticToEquatorial(x: number, y: number, z: number) {
  const ye = y * Math.cos(OBLIQUITY) - z * Math.sin(OBLIQUITY)
  const ze = y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY)
  return { ra: norm360(Math.atan2(ye, x) * DEG), dec: Math.atan2(ze, Math.hypot(x, ye)) * DEG }
}

export interface Body { name: string; ra: number; dec: number; mag: number }

const PLANET_MAG: Record<string, number> = { Mercury: 0, Venus: -4.2, Mars: 0.5, Jupiter: -2.3, Saturn: 0.6 }

export function planetPositions(ms: number): Body[] {
  const t = (julianDay(ms) - 2451545) / 36525
  const earth = heliocentric('Earth', t)
  return Object.keys(PLANET_MAG).map((name) => {
    const p = heliocentric(name, t)
    return { name, mag: PLANET_MAG[name], ...eclipticToEquatorial(p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]) }
  })
}

export function sunPosition(ms: number) {
  const t = (julianDay(ms) - 2451545) / 36525
  const e = heliocentric('Earth', t)
  return eclipticToEquatorial(-e[0], -e[1], -e[2])
}

/** Geocentric Moon (≈0.3° precision) plus illuminated fraction 0–1. */
export function moonPosition(ms: number): { ra: number; dec: number; illumination: number } {
  const t = (julianDay(ms) - 2451545) / 36525
  const s = (a: number, b: number) => Math.sin((a + b * t) * RAD)
  const lon = 218.32 + 481267.881 * t + 6.29 * s(135, 477198.87) - 1.27 * s(259.3, -413335.36) + 0.66 * s(235.7, 890534.22)
    + 0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03)
  const lat = 5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89) - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21)
  const lo = lon * RAD, la = lat * RAD
  const pos = eclipticToEquatorial(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la))
  const sun = sunPosition(ms)
  const cosElong = Math.sin(pos.dec * RAD) * Math.sin(sun.dec * RAD) + Math.cos(pos.dec * RAD) * Math.cos(sun.dec * RAD) * Math.cos((pos.ra - sun.ra) * RAD)
  return { ...pos, illumination: (1 - cosElong) / 2 }
}
