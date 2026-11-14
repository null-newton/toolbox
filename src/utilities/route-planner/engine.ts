/**
 * Routing helpers for the Route Planner.
 *
 * - Routing + turn-by-turn text: the public FOSSGIS Valhalla server
 *   (valhalla1.openstreetmap.de) — one engine for walking, running, cycling,
 *   motorcycle and car, with localized instructions and CORS enabled.
 * - Elevation: the same server's /height endpoint.
 * - Place search: Nominatim (max ~1 request/second, so search is debounced).
 */

export type Mode = 'walk' | 'run' | 'bike' | 'moto' | 'car'
export type BikeType = 'City' | 'Hybrid' | 'Road' | 'Mountain'

export interface RouteOptions {
  walkSpeed: number // km/h
  runPace: number // min/km
  bikeType: BikeType
  bikeSpeed: number // km/h
  quietRoads: boolean
  avoidHighways: boolean
  avoidTolls: boolean
  avoidFerries: boolean
}

export interface LatLon { lat: number; lon: number }

export interface Maneuver {
  text: string
  /** Spoken phrasing for before the turn, when Valhalla provides one. */
  verbal: string
  type: number
  lengthM: number
  timeS: number
  /** Index into RouteResult.coords where this maneuver starts. */
  idx: number
}

export interface RouteResult {
  coords: [number, number][] // [lat, lon]
  cum: number[] // cumulative metres along coords
  lengthM: number
  timeS: number
  maneuvers: Maneuver[]
  /** Coord index where each leg ends (one entry per leg). */
  legEnds: number[]
}

export interface Elevation {
  points: { d: number; h: number; idx: number }[]
  up: number
  down: number
}

const VALHALLA = 'https://valhalla1.openstreetmap.de'
const NOMINATIM = 'https://nominatim.openstreetmap.org'

export const MODES: Mode[] = ['walk', 'run', 'bike', 'moto', 'car']

/** Valhalla maneuver types: 4/5/6 = arrive. */
export const isArrive = (type: number) => type === 4 || type === 5 || type === 6
/** Our own marker for "reached a via stop". */
export const WAYPOINT = 99

function costing(mode: Mode, o: RouteOptions) {
  const avoid = {
    use_highways: o.avoidHighways ? 0 : 1,
    use_tolls: o.avoidTolls ? 0 : 0.5,
    use_ferry: o.avoidFerries ? 0 : 0.5,
  }
  switch (mode) {
    case 'walk':
      return { costing: 'pedestrian', costing_options: { pedestrian: { walking_speed: o.walkSpeed } } }
    case 'run':
      return {
        costing: 'pedestrian',
        costing_options: { pedestrian: { walking_speed: Math.min(25, 60 / o.runPace) } },
      }
    case 'bike':
      return {
        costing: 'bicycle',
        costing_options: {
          bicycle: {
            bicycle_type: o.bikeType,
            cycling_speed: o.bikeSpeed,
            use_roads: o.quietRoads ? 0.1 : 0.5,
            use_hills: 0.5,
            use_ferry: avoid.use_ferry,
          },
        },
      }
    case 'moto':
      return { costing: 'motorcycle', costing_options: { motorcycle: avoid } }
    case 'car':
      return { costing: 'auto', costing_options: { auto: avoid } }
  }
}

/** Decode a Valhalla polyline (precision 6). */
export function decodePolyline6(str: string): [number, number][] {
  const out: [number, number][] = []
  let index = 0, lat = 0, lon = 0
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, b: number
      do {
        b = str.charCodeAt(index++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (which === 0) lat += delta
      else lon += delta
    }
    out.push([lat / 1e6, lon / 1e6])
  }
  return out
}

export function distanceM(a: [number, number], b: [number, number]): number {
  const R = 6371008.8
  const toRad = Math.PI / 180
  const dLat = (b[0] - a[0]) * toRad
  const dLon = (b[1] - a[1]) * toRad
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export async function fetchRoute(
  points: LatLon[],
  mode: Mode,
  opts: RouteOptions,
  lang: 'en' | 'nl',
  signal?: AbortSignal
): Promise<RouteResult> {
  const body = {
    // Every stop is a 'break' so each one becomes its own leg.
    locations: points.map((p) => ({ lat: p.lat, lon: p.lon, type: 'break' })),
    ...costing(mode, opts),
    units: 'kilometers',
    language: lang === 'nl' ? 'nl-NL' : 'en-US',
    directions_type: 'instructions',
  }
  const res = await fetch(`${VALHALLA}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.trip) {
    throw new Error(data?.error || `HTTP ${res.status}`)
  }

  const coords: [number, number][] = []
  const maneuvers: Maneuver[] = []
  const legEnds: number[] = []
  const legs = data.trip.legs as { shape: string; maneuvers: Record<string, unknown>[] }[]
  legs.forEach((leg, legIndex) => {
    const shape = decodePolyline6(leg.shape)
    // Legs share their boundary point; drop the duplicate.
    const offset = coords.length === 0 ? 0 : coords.length - 1
    coords.push(...(coords.length ? shape.slice(1) : shape))
    const lastLeg = legIndex === legs.length - 1
    leg.maneuvers.forEach((m, i, all) => {
      if (legIndex > 0 && i === 0) return // "depart" again from a waypoint
      const arriveAtVia = !lastLeg && i === all.length - 1
      maneuvers.push({
        text: String(m.instruction ?? ''),
        verbal: String(m.verbal_pre_transition_instruction ?? m.instruction ?? ''),
        type: arriveAtVia ? WAYPOINT : Number(m.type),
        lengthM: Number(m.length ?? 0) * 1000,
        timeS: Number(m.time ?? 0),
        idx: offset + Number(m.begin_shape_index),
      })
    })
    legEnds.push(coords.length - 1)
  })

  const cum = [0]
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distanceM(coords[i - 1], coords[i]))

  return {
    coords,
    cum,
    lengthM: Number(data.trip.summary.length) * 1000,
    timeS: Number(data.trip.summary.time),
    maneuvers,
    legEnds,
  }
}

/** Sample the route evenly (≤ maxPoints) and fetch heights. */
export async function fetchElevation(route: RouteResult, signal?: AbortSignal, maxPoints = 300): Promise<Elevation> {
  const total = route.cum[route.cum.length - 1]
  const step = Math.max(total / maxPoints, 25)
  const idxs: number[] = [0]
  let next = step
  for (let i = 1; i < route.coords.length; i++) {
    if (route.cum[i] >= next) {
      idxs.push(i)
      next = route.cum[i] + step
    }
  }
  if (idxs[idxs.length - 1] !== route.coords.length - 1) idxs.push(route.coords.length - 1)

  const res = await fetch(`${VALHALLA}/height`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shape: idxs.map((i) => ({ lat: route.coords[i][0], lon: route.coords[i][1] })) }),
    signal,
  })
  const data = await res.json()
  const heights: (number | null)[] = data.height ?? []
  const points = idxs
    .map((idx, k) => ({ idx, d: route.cum[idx], h: heights[k] as number }))
    .filter((p) => typeof p.h === 'number' && p.h > -1000)

  // Climb/descent: smooth the terrain model (it includes bridges, dikes and
  // noise), then only count changes of 5 m or more so jitter doesn't add up.
  const smooth = points.map((_, i) => {
    const w = points.slice(Math.max(0, i - 3), i + 4)
    return w.reduce((s, p) => s + p.h, 0) / w.length
  })
  let up = 0, down = 0, ref: number | null = null
  for (const h of smooth) {
    if (ref === null) { ref = h; continue }
    const d = h - ref
    if (d >= 5) { up += d; ref = h } else if (d <= -5) { down -= d; ref = h }
  }
  return { points, up: Math.round(up), down: Math.round(down) }
}

/* ---------- Search ---------- */

export interface PlaceResult {
  lat: number
  lon: number
  name: string
  detail: string
  /** Typed coordinates / Plus Code: look up a readable name after picking. */
  resolveName?: boolean
}

interface NominatimItem {
  lat: string
  lon: string
  name?: string
  display_name: string
  address?: Record<string, string>
}

export function shortName(r: NominatimItem): string {
  const a = r.address ?? {}
  const road = a.road || a.cycleway || a.path || a.pedestrian || a.footway
  const place = a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality
  const first = r.name || (road ? road + (a.house_number ? ' ' + a.house_number : '') : '')
  return [first, place].filter(Boolean).join(', ') || r.display_name
}

export async function searchPlaces(
  q: string,
  lang: 'en' | 'nl',
  viewbox: [number, number, number, number] | null,
  signal?: AbortSignal
): Promise<PlaceResult[]> {
  const url = new URL(`${NOMINATIM}/search`)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '6')
  url.searchParams.set('accept-language', lang)
  url.searchParams.set('q', q)
  if (viewbox) url.searchParams.set('viewbox', viewbox.join(','))
  const items: NominatimItem[] = await fetch(url, { signal }).then((r) => r.json())
  return items.map((r) => ({ lat: +r.lat, lon: +r.lon, name: shortName(r), detail: r.display_name }))
}

let reverseQueue: Promise<unknown> = Promise.resolve()
/** Reverse geocode, serialized to respect Nominatim's 1 req/s policy. */
export function reverseGeocode(p: LatLon, lang: 'en' | 'nl'): Promise<string | null> {
  const job = reverseQueue.then(async () => {
    try {
      const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=17&accept-language=${lang}&lat=${p.lat}&lon=${p.lon}`
      const r = await fetch(url).then((res) => res.json())
      return r && !r.error ? shortName(r) : null
    } catch {
      return null
    }
  })
  reverseQueue = job.then(() => new Promise((r) => setTimeout(r, 1000)))
  return job
}

/* ---------- Geometry for navigation ---------- */

/**
 * Snap a position onto the route. Searches near `hint` first (cheap and avoids
 * jumping to a parallel part of a loop), then falls back to the whole line.
 */
export function snapToRoute(route: RouteResult, pos: [number, number], hint = 0) {
  const n = route.coords.length
  const search = (from: number, to: number) => {
    let best = { idx: 0, t: 0, dist: Infinity }
    const cosLat = Math.cos((pos[0] * Math.PI) / 180)
    for (let i = Math.max(0, from); i < Math.min(n - 1, to); i++) {
      const a = route.coords[i], b = route.coords[i + 1]
      // Local equirectangular projection — fine at segment scale.
      const ax = a[1] * cosLat, ay = a[0], bx = b[1] * cosLat, by = b[0]
      const px = pos[1] * cosLat, py = pos[0]
      const dx = bx - ax, dy = by - ay
      const len2 = dx * dx + dy * dy
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
      const proj: [number, number] = [ay + t * dy, (ax + t * dx) / cosLat]
      const d = distanceM(pos, proj)
      if (d < best.dist) best = { idx: i, t, dist: d }
    }
    return best
  }
  let best = search(hint - 20, hint + 400)
  if (best.dist > 60) {
    const global = search(0, n)
    if (global.dist < best.dist) best = global
  }
  const segLen = best.idx < n - 1 ? route.cum[best.idx + 1] - route.cum[best.idx] : 0
  return { idx: best.idx, along: route.cum[best.idx] + best.t * segLen, offRoute: best.dist }
}

/* ---------- Formatting ---------- */

export function fmtDistance(m: number, locale: string): string {
  if (m < 1000) return `${Math.round(m / (m < 100 ? 5 : 10)) * (m < 100 ? 5 : 10)} m`
  const km = m / 1000
  return `${km.toLocaleString(locale, { maximumFractionDigits: km < 10 ? 1 : 0 })} km`
}

export function fmtDuration(s: number, locale: string): string {
  const mins = Math.max(1, Math.round(s / 60))
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} ${locale.startsWith('nl') ? 'u' : 'h'} ${String(mins % 60).padStart(2, '0')}`
}

/* ---------- GPX ---------- */

const esc = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)

export function toGpx(name: string, stops: { lat: number; lon: number; label: string }[], route: RouteResult, elevation: Elevation | null): string {
  const heightAt = new Map(elevation?.points.map((p) => [p.idx, p.h]) ?? [])
  const wpts = stops
    .map((s) => `  <wpt lat="${s.lat.toFixed(6)}" lon="${s.lon.toFixed(6)}"><name>${esc(s.label)}</name></wpt>`)
    .join('\n')
  const trkpts = route.coords
    .map((c, i) => {
      const h = heightAt.get(i)
      return `      <trkpt lat="${c[0].toFixed(6)}" lon="${c[1].toFixed(6)}">${h != null ? `<ele>${h}</ele>` : ''}</trkpt>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Toolbox Route Planner" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name></metadata>
${wpts}
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`
}
