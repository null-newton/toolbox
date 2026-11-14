import { useEffect, useRef, useState } from 'react'
import { distanceM, fmtDistance, isArrive, snapToRoute, type Mode, type RouteResult } from './engine'

export interface NavState {
  pos: [number, number] | null
  heading: number | null
  accuracy: number | null
  /** Coord index of the route segment we're on. */
  idx: number
  along: number
  offRoute: boolean
  /** Index into route.maneuvers of the next instruction. */
  next: number
  distToNext: number
  remainingM: number
  remainingS: number
  /** Leg (stop-to-stop) currently being travelled. */
  leg: number
  arrived: boolean
  error: string | null
  /** When this fix was processed (ms epoch), for ETA. */
  at: number
}

const INITIAL: NavState = {
  pos: null, heading: null, accuracy: null, idx: 0, along: 0, offRoute: false, next: 0,
  distToNext: 0, remainingM: 0, remainingS: 0, leg: 0, arrived: false, error: null, at: 0,
}

// Per mode: how far off the line counts as "off route", and when to announce turns.
const TUNING: Record<Mode, { off: number; far: number; near: number; arrive: number; simKmh: number }> = {
  walk: { off: 30, far: 80, near: 20, arrive: 20, simKmh: 20 },
  run: { off: 30, far: 100, near: 25, arrive: 20, simKmh: 30 },
  bike: { off: 40, far: 200, near: 40, arrive: 25, simKmh: 60 },
  moto: { off: 60, far: 800, near: 120, arrive: 40, simKmh: 150 },
  car: { off: 60, far: 800, near: 120, arrive: 40, simKmh: 150 },
}

function bearing(a: [number, number], b: [number, number]) {
  const toRad = Math.PI / 180
  const y = Math.sin((b[1] - a[1]) * toRad) * Math.cos(b[0] * toRad)
  const x = Math.cos(a[0] * toRad) * Math.sin(b[0] * toRad) -
    Math.sin(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.cos((b[1] - a[1]) * toRad)
  return (Math.atan2(y, x) / toRad + 360) % 360
}

/** Point at `d` metres along the route. */
function pointAt(route: RouteResult, d: number): { pos: [number, number]; heading: number } {
  const { cum, coords } = route
  let i = cum.findIndex((c) => c >= d)
  if (i <= 0) i = i === 0 ? 1 : coords.length - 1
  const a = coords[i - 1], b = coords[i]
  const seg = cum[i] - cum[i - 1] || 1
  const t = Math.min(1, Math.max(0, (d - cum[i - 1]) / seg))
  return { pos: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: bearing(a, b) }
}

export function useNavigation(opts: {
  route: RouteResult | null
  active: boolean
  simulate: boolean
  mode: Mode
  voice: boolean
  lang: 'en' | 'nl'
  locale: string
  noGpsText: string
  inText: (d: string) => string
  onReroute: (pos: [number, number], leg: number) => void
}): NavState {
  const [state, setState] = useState<NavState>(INITIAL)
  const o = useRef(opts)
  useEffect(() => { o.current = opts })

  const lastIdx = useRef(0)
  const offCount = useRef(0)
  const lastReroute = useRef(0)
  const announced = useRef(new Map<number, Set<'far' | 'near'>>())
  const lastPos = useRef<[number, number] | null>(null)

  // New route (start or reroute): forget progress-related memory.
  useEffect(() => {
    lastIdx.current = 0
    offCount.current = 0
    announced.current = new Map()
  }, [opts.route])

  useEffect(() => {
    if (!opts.active) return

    const speak = (text: string) => {
      if (!o.current.voice || !('speechSynthesis' in window) || !text) return
      const u = new SpeechSynthesisUtterance(text)
      u.lang = o.current.lang === 'nl' ? 'nl-NL' : 'en-US'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    }

    const onFix = (pos: [number, number], accuracy: number | null, heading: number | null) => {
      const { route, mode } = o.current
      if (!route) return
      const tune = TUNING[mode]
      const snap = snapToRoute(route, pos, lastIdx.current)
      lastIdx.current = snap.idx

      // Off-route: require a few consecutive bad fixes, padded by GPS accuracy.
      const limit = tune.off + Math.min(accuracy ?? 0, 50)
      offCount.current = snap.offRoute > limit ? offCount.current + 1 : 0
      const offRoute = offCount.current >= 3
      if (offRoute && Date.now() - lastReroute.current > 10000) {
        lastReroute.current = Date.now()
        const leg = route.legEnds.findIndex((e) => e >= snap.idx)
        o.current.onReroute(pos, Math.max(0, leg))
      }

      const total = route.cum[route.cum.length - 1]
      const along = snap.along
      let next = route.maneuvers.findIndex((m) => route.cum[m.idx] > along + 3)
      if (next < 0) next = route.maneuvers.length - 1
      const m = route.maneuvers[next]
      const distToNext = Math.max(0, route.cum[m.idx] - along)
      const remainingM = Math.max(0, total - along)
      const arrived = remainingM < tune.arrive

      if (lastPos.current && heading == null && distanceM(lastPos.current, pos) > 3) heading = bearing(lastPos.current, pos)
      lastPos.current = pos

      // Voice prompts: once "far" ahead and once just before the turn.
      if (!offRoute && !arrived) {
        const done = announced.current.get(next) ?? new Set()
        if (distToNext <= tune.near && !done.has('near')) {
          done.add('near').add('far')
          speak(m.verbal)
        } else if (distToNext <= tune.far && distToNext > tune.near * 1.5 && !done.has('far')) {
          done.add('far')
          const verbal = m.verbal.charAt(0).toLowerCase() + m.verbal.slice(1)
          speak(`${o.current.inText(fmtDistance(distToNext, o.current.locale))}, ${verbal}`)
        }
        announced.current.set(next, done)
      }
      if (arrived && !announced.current.has(-1)) {
        announced.current.set(-1, new Set())
        speak(route.maneuvers.find((x) => isArrive(x.type))?.verbal ?? '')
      }

      setState({
        pos, heading, accuracy, idx: snap.idx, along, offRoute, next, distToNext, remainingM,
        remainingS: total ? route.timeS * (remainingM / total) : 0,
        leg: Math.max(0, route.legEnds.findIndex((e) => e >= snap.idx)),
        arrived, error: null, at: Date.now(),
      })
    }

    // Keep the screen awake while navigating.
    let wakeLock: { release: () => Promise<void> } | null = null
    const requestWake = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
        wakeLock = (await nav.wakeLock?.request('screen')) ?? null
      } catch { /* not supported or denied */ }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void requestWake() }
    void requestWake()
    document.addEventListener('visibilitychange', onVisible)

    let stop: () => void
    if (opts.simulate) {
      // Drive along the route at an accelerated speed — for testing at a desk.
      let d = 0
      const step = (TUNING[opts.mode].simKmh / 3.6) * 0.5
      const timer = setInterval(() => {
        const route = o.current.route
        if (!route) return
        d = Math.min(d + step, route.cum[route.cum.length - 1])
        const p = pointAt(route, d)
        onFix(p.pos, 5, p.heading)
      }, 500)
      stop = () => clearInterval(timer)
    } else if ('geolocation' in navigator) {
      const id = navigator.geolocation.watchPosition(
        (p) => onFix(
          [p.coords.latitude, p.coords.longitude],
          Math.round(p.coords.accuracy),
          p.coords.heading != null && !Number.isNaN(p.coords.heading) && (p.coords.speed ?? 0) > 0.7 ? p.coords.heading : null
        ),
        () => setState((s) => ({ ...s, error: o.current.noGpsText })),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
      )
      stop = () => navigator.geolocation.clearWatch(id)
    } else {
      // No geolocation at all: report it asynchronously (not during the effect body).
      const timer = setTimeout(() => setState((s) => ({ ...s, error: o.current.noGpsText })))
      stop = () => clearTimeout(timer)
    }

    // Announce the first instruction right away.
    const first = opts.route?.maneuvers[0]
    if (first) speak(first.verbal)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisible)
      void wakeLock?.release().catch(() => {})
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      lastPos.current = null
      setState(INITIAL)
    }
    // Restart only when navigation is toggled or the position source changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.active, opts.simulate])

  return opts.active ? state : INITIAL
}
