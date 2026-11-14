import 'leaflet/dist/leaflet.css'
import './route-planner.css'
import L from 'leaflet'
import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowUp, ArrowUpDown, ArrowUpLeft, ArrowUpRight, Bike, Car, CornerLeftDown, CornerRightDown,
  CornerUpLeft, CornerUpRight, Crosshair, Download, Flag, Footprints, Layers, LoaderCircle,
  LocateFixed, MapPin, Maximize, Motorbike, Navigation, Navigation2, Plus, RotateCcw, Share2, Ship,
  Square, Star, Timer, Trash2, Undo2, Volume2, VolumeX, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ToolHeader } from '../../components/ToolHeader'
import { useAuth } from '../../auth/auth-context'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { useLang, useT } from '../../i18n/LanguageContext'
import {
  fetchElevation, fetchRoute, fmtDistance, fmtDuration, isArrive, MODES, reverseGeocode,
  searchPlaces, toGpx, WAYPOINT, type BikeType, type Elevation, type Mode, type PlaceResult,
  type RouteOptions, type RouteResult,
} from './engine'
import { STR, type Strings } from './strings'
import { useNavigation } from './useNavigation'

/* ---------- Types & defaults ---------- */

interface Stop { id: string; lat: number | null; lon: number | null; label: string }
type FilledStop = Stop & { lat: number; lon: number }
interface SavedRoute {
  id: string
  name: string
  mode: Mode
  stops: { lat: number; lon: number; label: string }[]
  roundTrip: boolean
  km: number
}
type BaseLayer = 'dark' | 'osm' | 'cycle' | 'satellite'

interface Config extends Record<string, unknown>, RouteOptions {
  mode: Mode
  base: BaseLayer
  trails: boolean
  voice: boolean
  saved: SavedRoute[]
}

const DEFAULTS: Config = {
  mode: 'bike',
  walkSpeed: 5,
  runPace: 6,
  bikeType: 'Hybrid',
  bikeSpeed: 18,
  quietRoads: true,
  avoidHighways: false,
  avoidTolls: false,
  avoidFerries: false,
  base: 'dark',
  trails: false,
  voice: true,
  saved: [],
}

const MODE_ICON: Record<Mode, LucideIcon> = { walk: Footprints, run: Timer, bike: Bike, moto: Motorbike, car: Car }

const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const BASES: Record<BaseLayer, { url: string; attribution: string; maxZoom: number; subdomains?: string }> = {
  // Dark = standard OSM tiles with a CSS invert filter (see route-planner.css); no API key needed.
  dark: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: OSM_ATTR, maxZoom: 19 },
  osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: OSM_ATTR, maxZoom: 19 },
  cycle: { url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', attribution: `<a href="https://www.cyclosm.org">CyclOSM</a> ${OSM_ATTR}`, maxZoom: 20, subdomains: 'abc' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagery © Esri', maxZoom: 19 },
}
const TRAILS: Partial<Record<Mode, string>> = {
  walk: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
  run: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
  bike: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',
}

const NAV_ARROW = '<svg viewBox="0 0 24 24"><polygon points="12 2 19 21 12 17 5 21 12 2" fill="#c8ff3d" stroke="#071013" stroke-width="2" stroke-linejoin="round"/></svg>'

const uid = () => Math.random().toString(36).slice(2, 10)
const emptyStop = (): Stop => ({ id: uid(), lat: null, lon: null, label: '' })
const isFilled = (s: Stop): s is FilledStop => s.lat != null && s.lon != null

function maneuverIcon(type: number): LucideIcon {
  if (type === WAYPOINT) return MapPin
  if (isArrive(type)) return Flag
  if (type >= 1 && type <= 3) return Navigation
  switch (type) {
    case 9: case 18: case 20: case 23: return ArrowUpRight
    case 10: return CornerUpRight
    case 11: return CornerRightDown
    case 12: case 13: return Undo2
    case 14: return CornerLeftDown
    case 15: return CornerUpLeft
    case 16: case 19: case 21: case 24: return ArrowUpLeft
    case 26: case 27: return RotateCcw
    case 28: case 29: return Ship
    default: return ArrowUp
  }
}

/* ---------- URL state ---------- */

function parseUrl(params: URLSearchParams): { stops: Stop[]; mode: Mode | null; roundTrip: boolean } | null {
  const r = params.get('r')
  if (!r) return null
  const stops = r.split(';')
    .map((p) => p.split(',').map(Number))
    .filter((a) => a.length === 2 && a.every(Number.isFinite))
    .map(([lat, lon]) => ({ id: uid(), lat, lon, label: `${lat.toFixed(5)}, ${lon.toFixed(5)}` }))
  if (!stops.length) return null
  while (stops.length < 2) stops.push(emptyStop() as never)
  const m = params.get('m') as Mode | null
  return { stops, mode: m && MODES.includes(m) ? m : null, roundTrip: params.get('rt') === '1' }
}

/* ---------- Component ---------- */

export function RoutePlanner() {
  const t = useT(STR)
  const { lang, locale } = useLang()
  const { config, setConfig, loading: configLoading, saving, error: configError } = useUtilityConfig<Config>('route-planner', DEFAULTS)
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()

  const initial = useMemo(() => parseUrl(params), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [stops, setStops] = useState<Stop[]>(() => initial?.stops ?? [emptyStop(), emptyStop()])
  const [roundTrip, setRoundTrip] = useState(initial?.roundTrip ?? false)
  const [modeOverride, setModeOverride] = useState<Mode | null>(initial?.mode ?? null)
  const mode = modeOverride ?? config.mode
  const setMode = (m: Mode) => { setModeOverride(m); setConfig({ mode: m }) }

  const [route, setRoute] = useState<RouteResult | null>(null)
  const [routeAt, setRouteAt] = useState(0)
  const [elevation, setElevation] = useState<Elevation | null>(null)
  const [status, setStatus] = useState<{ kind: 'idle' | 'loading' | 'error'; msg: string }>({ kind: 'idle', msg: '' })
  const [hover, setHover] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  const [layersOpen, setLayersOpen] = useState(false)
  const [saveName, setSaveName] = useState<string | null>(null)

  const [navActive, setNavActive] = useState(false)
  const [simulate, setSimulate] = useState(false)
  const [follow, setFollow] = useState(true)
  const canSimulate = import.meta.env.DEV || params.has('sim')

  const filled = stops.filter(isFilled)
  // The stops actually routed through: a round trip returns to the start.
  const routeStops: FilledStop[] = roundTrip && filled.length >= 2 ? [...filled, { ...filled[0], id: filled[0].id + '-return' }] : filled
  const routeStopsRef = useRef(routeStops)
  routeStopsRef.current = routeStops

  const options: RouteOptions = {
    walkSpeed: config.walkSpeed, runPace: config.runPace, bikeType: config.bikeType, bikeSpeed: config.bikeSpeed,
    quietRoads: config.quietRoads, avoidHighways: config.avoidHighways, avoidTolls: config.avoidTolls, avoidFerries: config.avoidFerries,
  }
  const routeKey = JSON.stringify([routeStops.map((s) => [s.lat, s.lon]), mode, options, lang])

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((cur) => (cur === msg ? '' : cur)), 2200)
  }, [])

  /* ----- Map setup (host element is created outside React so it can move to <body> while navigating) ----- */
  const placeholderRef = useRef<HTMLDivElement>(null)
  const host = useMemo(() => {
    const el = document.createElement('div')
    el.className = 'rp-host'
    const mapEl = document.createElement('div')
    mapEl.className = 'rp-map'
    el.appendChild(mapEl)
    return el
  }, [])
  const mapRef = useRef<L.Map | null>(null)
  const baseRef = useRef<L.TileLayer | null>(null)
  const trailsRef = useRef<L.TileLayer | null>(null)
  const lineRef = useRef<{ casing: L.Polyline; line: L.Polyline } | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const hoverMarkerRef = useRef<L.Marker | null>(null)
  const navMarkerRef = useRef<L.Marker | null>(null)
  const accuracyRef = useRef<L.Circle | null>(null)
  const fitNextRef = useRef(!!initial)
  const handlers = useRef({ mapClick: (_ll: L.LatLng) => {}, routeClick: (_ll: L.LatLng) => {} })

  useEffect(() => {
    const mapEl = host.querySelector('.rp-map') as HTMLDivElement
    placeholderRef.current?.appendChild(host)
    const map = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([51.05, 4.4], 9)
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map)
    map.on('click', (e) => handlers.current.mapClick(e.latlng))
    map.on('dragstart', () => setFollow(false))
    mapRef.current = map
    const markers = markersRef.current
    hoverMarkerRef.current = L.marker([0, 0], {
      icon: L.divIcon({ className: '', html: '<div class="rp-hover"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
      interactive: false, keyboard: false,
    })
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(host)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      lineRef.current = null
      markers.clear()
      host.remove()
    }
  }, [host])

  // Base + trail layers follow the saved preference.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    baseRef.current?.remove()
    const b = BASES[config.base] ?? BASES.dark
    baseRef.current = L.tileLayer(b.url, {
      attribution: b.attribution, maxZoom: b.maxZoom, subdomains: b.subdomains ?? 'abc',
      className: config.base === 'dark' || !BASES[config.base] ? 'rp-dark-tiles' : '',
    }).addTo(map)
    baseRef.current.bringToBack()
  }, [config.base])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    trailsRef.current?.remove()
    trailsRef.current = null
    const url = TRAILS[mode]
    if (config.trails && url) {
      trailsRef.current = L.tileLayer(url, {
        maxZoom: 18, opacity: 0.8,
        attribution: '<a href="https://waymarkedtrails.org">Waymarked Trails</a>',
      }).addTo(map)
    }
  }, [config.trails, mode])

  // Start where the user is the first time (only if nothing was loaded from a link).
  useEffect(() => {
    if (initial || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => { if (!fitNextRef.current && !routeStopsRef.current.length) mapRef.current?.setView([p.coords.latitude, p.coords.longitude], 13) },
      () => {},
      { timeout: 5000, maximumAge: 600000 }
    )
  }, [initial])

  /* ----- Stops ----- */
  const labelStop = useCallback((id: string, lat: number, lon: number) => {
    void reverseGeocode({ lat, lon }, lang).then((label) => {
      if (label) setStops((prev) => prev.map((s) => (s.id === id && s.lat === lat && s.lon === lon ? { ...s, label } : s)))
    })
  }, [lang])

  // Resolve names for coordinates loaded from a link.
  useEffect(() => {
    initial?.stops.forEach((s) => isFilled(s) && labelStop(s.id, s.lat, s.lon))
  }, [initial, labelStop])

  const setStopAt = (id: string, lat: number, lon: number, label?: string) => {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, lat, lon, label: label ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}` } : s)))
    if (!label) labelStop(id, lat, lon)
  }

  const removeStop = (id: string) => {
    setStops((prev) => (prev.length > 2 ? prev.filter((s) => s.id !== id) : prev.map((s) => (s.id === id ? { ...emptyStop(), id } : s))))
  }

  handlers.current.mapClick = (ll) => {
    if (navActive) return
    setLayersOpen(false)
    const lat = +ll.lat.toFixed(6), lon = +ll.lng.toFixed(6)
    const target = stops.find((s) => !isFilled(s))
    const id = target?.id ?? uid()
    setStops((prev) => (target ? prev : [...prev, { id, lat: null, lon: null, label: '' }]).map((s) => (s.id === id ? { ...s, lat, lon, label: `${lat.toFixed(5)}, ${lon.toFixed(5)}` } : s)))
    labelStop(id, lat, lon)
  }

  handlers.current.routeClick = (ll) => {
    if (navActive || filled.length < 2) return
    // Insert where the detour is smallest.
    const pts = routeStops.map((s) => L.latLng(s.lat, s.lon))
    const map = mapRef.current!
    let best = 1, bestCost = Infinity
    for (let i = 1; i < pts.length; i++) {
      const cost = map.distance(pts[i - 1], ll) + map.distance(ll, pts[i]) - map.distance(pts[i - 1], pts[i])
      if (cost < bestCost) { bestCost = cost; best = i }
    }
    const lat = +ll.lat.toFixed(6), lon = +ll.lng.toFixed(6)
    const id = uid()
    // `best` indexes routeStops; map back to the position in `stops` (empty slots stay where they are).
    const after = routeStops[best - 1].id
    setStops((prev) => {
      const at = prev.findIndex((s) => s.id === after) + 1
      const next = [...prev]
      next.splice(at, 0, { id, lat, lon, label: `${lat.toFixed(5)}, ${lon.toFixed(5)}` })
      return next
    })
    labelStop(id, lat, lon)
  }

  // Markers mirror the filled stops.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const seen = new Set<string>()
    const list = stops.filter(isFilled)
    list.forEach((s, i) => {
      seen.add(s.id)
      const role = i === 0 ? 'start' : i === list.length - 1 && !roundTrip ? 'end' : 'via'
      const size = role === 'via' ? 20 : 22
      const icon = L.divIcon({ className: '', html: `<div class="rp-pin ${role}">${role === 'via' ? i : ''}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
      let m = markersRef.current.get(s.id)
      if (!m) {
        m = L.marker([s.lat, s.lon], { icon, draggable: true, autoPan: true }).addTo(map)
        m.on('dragend', () => {
          const p = m!.getLatLng()
          setStopAt(s.id, +p.lat.toFixed(6), +p.lng.toFixed(6))
        })
        m.on('contextmenu', () => removeStop(s.id))
        markersRef.current.set(s.id, m)
      } else {
        m.setLatLng([s.lat, s.lon]).setIcon(icon)
      }
      m.dragging?.[navActive ? 'disable' : 'enable']()
      m.unbindTooltip().bindTooltip(s.label, { direction: 'top', offset: [0, -12] })
    })
    markersRef.current.forEach((m, id) => {
      if (!seen.has(id)) { m.remove(); markersRef.current.delete(id) }
    })
    // setStopAt/removeStop only use setState + stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, roundTrip, navActive])

  /* ----- Routing ----- */
  useEffect(() => {
    if (routeStops.length < 2) {
      setRoute(null)
      setElevation(null)
      setStatus({ kind: 'idle', msg: filled.length === 1 ? t.pickDestination : '' })
      return
    }
    const ctrl = new AbortController()
    const timer = window.setTimeout(async () => {
      setStatus({ kind: 'loading', msg: t.calculating })
      try {
        const r = await fetchRoute(routeStops, mode, options, lang, ctrl.signal)
        setRoute(r)
        setRouteAt(Date.now())
        setStatus({ kind: 'idle', msg: '' })
        setElevation(null)
        fetchElevation(r, ctrl.signal).then(setElevation).catch(() => {})
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setStatus({ kind: 'error', msg: t.routeFailed((e as Error).message) })
      }
    }, 250)
    return () => { ctrl.abort(); window.clearTimeout(timer) }
    // routeKey captures every input that changes the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  // Draw the route.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!route) {
      lineRef.current?.casing.remove()
      lineRef.current?.line.remove()
      lineRef.current = null
      return
    }
    if (!lineRef.current) {
      const casing = L.polyline(route.coords, { color: '#071013', weight: 10, opacity: 0.85, interactive: false }).addTo(map)
      const line = L.polyline(route.coords, { color: '#4ee6e0', weight: 5, opacity: 1 }).addTo(map)
      line.on('click', (e) => { L.DomEvent.stop(e); handlers.current.routeClick(e.latlng) })
      lineRef.current = { casing, line }
    } else {
      lineRef.current.casing.setLatLngs(route.coords)
      lineRef.current.line.setLatLngs(route.coords)
    }
    if (fitNextRef.current && !navActive) {
      fitNextRef.current = false
      map.fitBounds(lineRef.current.line.getBounds(), { padding: [40, 40] })
    }
  }, [route, navActive])

  useEffect(() => {
    lineRef.current?.line.unbindTooltip()
    if (!navActive) lineRef.current?.line.bindTooltip(t.addStop, { sticky: true })
  }, [route, navActive, t.addStop])

  // Elevation hover → dot on the map.
  useEffect(() => {
    const map = mapRef.current, m = hoverMarkerRef.current
    if (!map || !m) return
    if (hover == null || !route) { m.remove(); return }
    m.setLatLng(route.coords[hover]).addTo(map)
  }, [hover, route])

  /* ----- URL sync ----- */
  const urlKey = JSON.stringify([filled.map((s) => [s.lat, s.lon]), mode, roundTrip])
  const firstUrlSync = useRef(true)
  useEffect(() => {
    if (firstUrlSync.current) { firstUrlSync.current = false; if (!initial) return }
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (filled.length) next.set('r', filled.map((s) => `${s.lat.toFixed(5)},${s.lon.toFixed(5)}`).join(';'))
      else next.delete('r')
      next.set('m', mode)
      if (roundTrip) next.set('rt', '1')
      else next.delete('rt')
      return next
    }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey])

  /* ----- Navigation ----- */
  const onReroute = useCallback((pos: [number, number], leg: number) => {
    const rest = routeStopsRef.current.slice(leg + 1)
    if (!rest.length) return
    setRoundTrip(false)
    setStops([{ id: uid(), lat: pos[0], lon: pos[1], label: STR[lang].myLocation }, ...rest.map((s) => ({ ...s, id: uid() }))])
  }, [lang])

  const nav = useNavigation({
    route, active: navActive, simulate, mode, voice: config.voice, lang, locale,
    noGpsText: t.navNoGps, inText: t.navIn, onReroute,
  })

  // Fullscreen while navigating: move the map host to <body>.
  useEffect(() => {
    const target = navActive ? document.body : placeholderRef.current
    target?.appendChild(host)
    host.classList.toggle('rp-fullscreen', navActive)
    mapRef.current?.invalidateSize()
    if (navActive) setFollow(true)
    else {
      navMarkerRef.current?.remove(); navMarkerRef.current = null
      accuracyRef.current?.remove(); accuracyRef.current = null
      if (lineRef.current) mapRef.current?.fitBounds(lineRef.current.line.getBounds(), { padding: [40, 40] })
    }
  }, [navActive, host])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !navActive || !nav.pos) return
    if (!navMarkerRef.current) {
      accuracyRef.current = L.circle(nav.pos, { radius: nav.accuracy ?? 10, color: '#4ee6e0', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map)
      navMarkerRef.current = L.marker(nav.pos, {
        icon: L.divIcon({ className: '', html: `<div class="rp-nav">${NAV_ARROW}</div>`, iconSize: [40, 40], iconAnchor: [20, 20] }),
        interactive: false, keyboard: false, zIndexOffset: 1000,
      }).addTo(map)
    }
    navMarkerRef.current.setLatLng(nav.pos)
    accuracyRef.current?.setLatLng(nav.pos).setRadius(nav.accuracy ?? 10)
    const arrow = navMarkerRef.current.getElement()?.querySelector('.rp-nav') as HTMLElement | null
    if (arrow && nav.heading != null) arrow.style.transform = `rotate(${nav.heading}deg)`
    if (follow) {
      const zoom = mode === 'car' || mode === 'moto' ? 16 : 17
      map.setView(nav.pos, Math.max(map.getZoom(), zoom), { animate: true })
    }
  }, [nav.pos, nav.heading, nav.accuracy, navActive, follow, mode])

  const startNav = (sim: boolean) => {
    if (!route) return
    setSimulate(sim)
    setNavActive(true)
  }
  const stopNav = () => { setNavActive(false); setSimulate(false) }

  /* ----- Actions ----- */
  const routeName = () => {
    const a = filled[0]?.label.split(',')[0] || t.start
    const b = roundTrip ? t.roundTrip.split(' ')[0] : filled[filled.length - 1]?.label.split(',')[0] || t.end
    return `${a} – ${b}`
  }

  const downloadGpx = () => {
    if (!route) return
    const name = routeName()
    const blob = new Blob([toGpx(name, filled, route, elevation)], { type: 'application/gpx+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '_') + '.gpx'
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: routeName(), url })
      else { await navigator.clipboard.writeText(url); flash(t.linkCopied) }
    } catch { /* cancelled */ }
  }

  const saveRoute = () => {
    if (!route || !saveName?.trim()) return
    const item: SavedRoute = {
      id: uid(), name: saveName.trim(), mode, roundTrip,
      stops: filled.map(({ lat, lon, label }) => ({ lat, lon, label })),
      km: Math.round(route.lengthM / 100) / 10,
    }
    setConfig((prev) => ({ ...prev, saved: [item, ...prev.saved].slice(0, 100) }))
    setSaveName(null)
  }

  const loadSaved = (r: SavedRoute) => {
    fitNextRef.current = true
    setModeOverride(r.mode)
    setRoundTrip(r.roundTrip)
    const list: Stop[] = r.stops.map((s) => ({ ...s, id: uid() }))
    while (list.length < 2) list.push(emptyStop())
    setStops(list)
  }

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const lat = +p.coords.latitude.toFixed(6), lon = +p.coords.longitude.toFixed(6)
        mapRef.current?.setView([lat, lon], 15)
        const first = stops[0]
        if (!isFilled(first)) setStopAt(first.id, lat, lon, t.myLocation)
      },
      () => flash(t.navNoGps),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const fit = () => {
    const map = mapRef.current
    if (!map) return
    if (lineRef.current) map.fitBounds(lineRef.current.line.getBounds(), { padding: [40, 40] })
    else if (filled.length) map.fitBounds(L.latLngBounds(filled.map((s) => [s.lat, s.lon] as [number, number])).pad(0.3))
  }

  const viewbox = (): [number, number, number, number] | null => {
    const b = mapRef.current?.getBounds().pad(1)
    return b ? [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()] : null
  }

  /* ----- Render helpers ----- */
  const eta = route ? new Date(routeAt + route.timeS * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : ''
  const hasTrails = !!TRAILS[mode]

  const toggle = (key: 'quietRoads' | 'avoidHighways' | 'avoidTolls' | 'avoidFerries', label: string) => (
    <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
      <input type="checkbox" className="size-4 accent-[#c8ff3d]" checked={config[key]} onChange={(e) => setConfig({ [key]: e.target.checked } as Partial<Config>)} />
      {label}
    </label>
  )

  const select = <V extends string | number>(label: string, value: V, opts: [V, string][], onChange: (v: V) => void) => (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {label}
      <select
        className="form-input"
        value={String(value)}
        onChange={(e) => onChange((typeof value === 'number' ? Number(e.target.value) : e.target.value) as V)}
      >
        {opts.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
      </select>
    </label>
  )

  const paceLabel = (p: number) => `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')} ${t.perKm}`

  return (
    <div className="space-y-6">
      <ToolHeader intro={t.intro} save={{ saving, error: configError }} />

      {/* Mode picker */}
      <div className="glass grid grid-cols-5 gap-1 rounded-2xl p-1" role="tablist">
        {MODES.map((m) => {
          const Icon = MODE_ICON[m]
          const active = m === mode
          return (
            <button
              key={m}
              role="tab"
              aria-selected={active}
              onClick={() => setMode(m)}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:flex-row sm:justify-center sm:gap-2 sm:text-sm ${active ? 'bg-[#c8ff3d] text-[#071013]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon className="size-5" />
              {t.modes[m]}
            </button>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* Side panel */}
        <aside className="glass space-y-5 rounded-2xl p-4">
          <div className="space-y-2">
            {stops.map((s, i) => {
              const role = i === 0 ? 'start' : i === stops.length - 1 ? 'end' : 'via'
              return (
                <StopInput
                  key={s.id}
                  stop={s}
                  role={role}
                  placeholder={role === 'start' ? t.start : role === 'end' ? t.end : t.via}
                  removable={stops.length > 2 || isFilled(s)}
                  removeLabel={t.removeStop}
                  lang={lang}
                  viewbox={viewbox}
                  searchFailed={t.searchFailed}
                  onPick={(p) => {
                    setStopAt(s.id, p.lat, p.lon, p.name)
                    mapRef.current?.setView([p.lat, p.lon], Math.max(mapRef.current.getZoom(), 14))
                  }}
                  onRemove={() => removeStop(s.id)}
                />
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <SmallButton onClick={() => setStops((prev) => [...prev.slice(0, -1), emptyStop(), prev[prev.length - 1]])}><Plus className="size-4" />{t.addStop}</SmallButton>
            <SmallButton onClick={() => setStops((prev) => [...prev].reverse())}><ArrowUpDown className="size-4" />{t.reverse}</SmallButton>
            <SmallButton onClick={() => { setStops([emptyStop(), emptyStop()]); setRoundTrip(false) }} danger><Trash2 className="size-4" />{t.clear}</SmallButton>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" className="size-4 accent-[#c8ff3d]" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
            {t.roundTrip}
          </label>

          {/* Mode-specific options */}
          <div className="space-y-3 border-t border-slate-700/80 pt-4">
            {mode === 'walk' && select(t.walkSpeed, config.walkSpeed, [3, 4, 5, 6, 7].map((v) => [v, `${v} km/h`]), (v) => setConfig({ walkSpeed: v }))}
            {mode === 'run' && select(t.runPace, config.runPace, [8, 7, 6.5, 6, 5.5, 5, 4.5, 4].map((v) => [v, `${paceLabel(v)} · ${(60 / v).toFixed(1)} km/h`]), (v) => setConfig({ runPace: v }))}
            {mode === 'bike' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {select(t.bikeType, config.bikeType, (['City', 'Hybrid', 'Road', 'Mountain'] as BikeType[]).map((v) => [v, t.bikeTypes[v]]), (v) => setConfig({ bikeType: v }))}
                  {select(t.bikeSpeed, config.bikeSpeed, [12, 15, 18, 20, 22, 25, 28, 30].map((v) => [v, `${v} km/h${v === 25 ? ` (${t.ebike})` : ''}`]), (v) => setConfig({ bikeSpeed: v }))}
                </div>
                {toggle('quietRoads', t.quietRoads)}
                {toggle('avoidFerries', t.avoidFerries)}
              </>
            )}
            {(mode === 'moto' || mode === 'car') && (
              <>
                {toggle('avoidHighways', t.avoidHighways)}
                {toggle('avoidTolls', t.avoidTolls)}
                {toggle('avoidFerries', t.avoidFerries)}
              </>
            )}
          </div>

          {(status.msg || (!route && !filled.length)) && (
            <p className={`flex items-center gap-2 text-sm ${status.kind === 'error' ? 'text-red-300' : 'text-slate-400'}`}>
              {status.kind === 'loading' && <LoaderCircle className="size-4 animate-spin" />}
              {status.msg || t.hint}
            </p>
          )}

          {/* Saved routes */}
          <div className="space-y-2 border-t border-slate-700/80 pt-4">
            <h2 className="text-sm font-semibold text-white">{t.saved}</h2>
            {!user && <p className="text-sm text-slate-500">{t.loginToSave}</p>}
            {user && config.saved.length === 0 && !configLoading && <p className="text-sm text-slate-500">{t.noSaved}</p>}
            <ul className="space-y-1.5">
              {config.saved.map((r) => {
                const Icon = MODE_ICON[r.mode] ?? Bike
                return (
                  <li key={r.id} className="group flex items-center gap-2 rounded-lg border border-slate-700/80 bg-white/[0.02] px-3 py-2 hover:border-cyan-400/60">
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => loadSaved(r)}>
                      <Icon className="size-4 shrink-0 text-cyan-300" />
                      <span className="truncate text-sm font-medium text-white">{r.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-slate-500">{fmtDistance(r.km * 1000, locale)}</span>
                    </button>
                    <button
                      aria-label={t.removeStop}
                      className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-red-300"
                      onClick={() => { if (confirm(t.deleteConfirm(r.name))) setConfig((prev) => ({ ...prev, saved: prev.saved.filter((x) => x.id !== r.id) })) }}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>

        {/* Map + results */}
        <div className="min-w-0 space-y-4">
          <div ref={placeholderRef} className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-2xl border border-slate-700/80" />

          {route && (
            <section className="glass space-y-5 rounded-2xl p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Stat value={fmtDistance(route.lengthM, locale)} label={t.distance} />
                <Stat value={fmtDuration(route.timeS, locale)} label={t.duration} />
                <Stat value={eta} label={t.arrival} />
                <Stat value={elevation ? `${elevation.up} m` : '–'} label={t.climb} />
                <Stat value={elevation ? `${elevation.down} m` : '–'} label={t.descent} />
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => startNav(false)} className="acid-button inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold">
                  <Navigation2 className="size-4" />{t.navigate}
                </button>
                {canSimulate && <SmallButton onClick={() => startNav(true)}><Navigation className="size-4" />{t.navSimulate}</SmallButton>}
                <SmallButton onClick={downloadGpx}><Download className="size-4" />{t.gpx}</SmallButton>
                <SmallButton onClick={share}><Share2 className="size-4" />{t.share}</SmallButton>
                {user && <SmallButton onClick={() => setSaveName(routeName())}><Star className="size-4" />{t.save}</SmallButton>}
              </div>

              {saveName !== null && (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); saveRoute() }}>
                  <input autoFocus className="form-input" value={saveName} onChange={(e) => setSaveName(e.target.value)} aria-label={t.saveName} />
                  <button className="acid-button rounded-lg px-4 text-sm font-bold" type="submit">{t.save}</button>
                  <SmallButton onClick={() => setSaveName(null)}><X className="size-4" /></SmallButton>
                </form>
              )}

              <ElevationChart route={route} elevation={elevation} t={t} locale={locale} onHover={setHover} />

              <details className="group">
                <summary className="cursor-pointer select-none text-sm font-semibold text-white">
                  {t.directions} <span className="font-normal text-slate-500">({route.maneuvers.length})</span>
                </summary>
                <ol className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-1">
                  {route.maneuvers.map((m, i) => {
                    return (
                      <li key={i}>
                        <button
                          className="flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                          onClick={() => mapRef.current?.setView(route.coords[m.idx], 17)}
                        >
                          {createElement(maneuverIcon(m.type), { className: 'mt-0.5 size-4 shrink-0 text-cyan-300' })}
                          <span className="flex-1 text-sm text-slate-200">{m.text}</span>
                          {m.lengthM > 0 && <span className="shrink-0 text-xs text-slate-500">{fmtDistance(m.lengthM, locale)}</span>}
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </details>
            </section>
          )}
        </div>
      </div>

      {/* Controls rendered into the map host (works inline and fullscreen) */}
      {createPortal(
        <>
          {!navActive && (
            <div className="absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
              <MapButton label={t.layers.dark} onClick={() => setLayersOpen((v) => !v)}><Layers className="size-5" /></MapButton>
              {layersOpen && (
                <div className="glass w-56 space-y-1 rounded-xl p-2 text-sm">
                  {(Object.keys(BASES) as BaseLayer[]).map((b) => (
                    <button key={b} onClick={() => setConfig({ base: b })} className={`block w-full rounded-lg px-3 py-1.5 text-left ${config.base === b ? 'bg-[#c8ff3d]/15 text-[#c8ff3d]' : 'text-slate-300 hover:bg-white/5'}`}>
                      {t.layers[b]}
                    </button>
                  ))}
                  {hasTrails && (
                    <label className="flex cursor-pointer items-center gap-2 border-t border-slate-700/80 px-3 pt-2 text-slate-300">
                      <input type="checkbox" className="accent-[#c8ff3d]" checked={config.trails} onChange={(e) => setConfig({ trails: e.target.checked })} />
                      {t.trailsOverlay[mode]}
                    </label>
                  )}
                </div>
              )}
              <MapButton label={t.locate} onClick={locate}><LocateFixed className="size-5" /></MapButton>
              <MapButton label={t.fit} onClick={fit}><Maximize className="size-5" /></MapButton>
            </div>
          )}

          {navActive && route && (
            <NavOverlay
              t={t}
              locale={locale}
              route={route}
              nav={nav}
              voice={config.voice}
              follow={follow}
              onVoice={() => setConfig({ voice: !config.voice })}
              onRecenter={() => setFollow(true)}
              onStop={stopNav}
              rerouting={status.kind === 'loading'}
            />
          )}

          {toast && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 z-[600] -translate-x-1/2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#071013] shadow-lg">
              {toast}
            </div>
          )}
        </>,
        host
      )}
    </div>
  )
}

/* ---------- Small components ---------- */

function SmallButton({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 px-3 py-1.5 text-sm font-medium hover:border-cyan-400/60 ${danger ? 'text-red-300' : 'text-slate-200'}`}
    >
      {children}
    </button>
  )
}

function MapButton({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="glass grid size-10 place-items-center rounded-xl text-slate-200 shadow-lg hover:text-[#c8ff3d]"
    >
      {children}
    </button>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-white/[0.02] px-3 py-2">
      <div className="text-lg font-bold tabular-nums text-white">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

function StopInput({
  stop, role, placeholder, removable, removeLabel, lang, viewbox, searchFailed, onPick, onRemove,
}: {
  stop: Stop
  role: 'start' | 'via' | 'end'
  placeholder: string
  removable: boolean
  removeLabel: string
  lang: 'en' | 'nl'
  viewbox: () => [number, number, number, number] | null
  searchFailed: string
  onPick: (p: PlaceResult) => void
  onRemove: () => void
}) {
  const [text, setText] = useState(stop.label)
  const [focused, setFocused] = useState(false)
  const [results, setResults] = useState<PlaceResult[]>([])
  const [active, setActive] = useState(-1)
  const [error, setError] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const ctrl = useRef<AbortController | null>(null)


  const search = (q: string) => {
    setText(q)
    window.clearTimeout(timer.current)
    if (q.trim().length < 3) { setResults([]); return }
    timer.current = window.setTimeout(async () => {
      ctrl.current?.abort()
      ctrl.current = new AbortController()
      try {
        setResults(await searchPlaces(q.trim(), lang, viewbox(), ctrl.current.signal))
        setActive(-1)
        setError('')
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError(searchFailed)
      }
    }, 400)
  }

  const pick = (p: PlaceResult) => {
    onPick(p)
    setText(p.name)
    setResults([])
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  const dot = role === 'start' ? 'rounded-full bg-[#c8ff3d]' : role === 'end' ? 'rounded-[3px] bg-[#ff6b6b]' : 'rounded-full border-2 border-slate-400'

  return (
    <div className="relative flex items-center gap-2">
      <span className={`size-3 shrink-0 ${dot}`} />
      <div className="relative min-w-0 flex-1">
        <input
          className="form-input !rounded-lg"
          value={focused ? text : stop.label}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => search(e.target.value)}
          onFocus={(e) => { setText(stop.label); setFocused(true); e.target.select() }}
          onBlur={() => window.setTimeout(() => { setFocused(false); setResults([]) }, 150)}
          onKeyDown={(e) => {
            if (!results.length) return
            if (e.key === 'ArrowDown') { setActive((a) => Math.min(a + 1, results.length - 1)); e.preventDefault() }
            else if (e.key === 'ArrowUp') { setActive((a) => Math.max(a - 1, 0)); e.preventDefault() }
            else if (e.key === 'Enter') { pick(results[Math.max(active, 0)]); e.preventDefault() }
            else if (e.key === 'Escape') setResults([])
          }}
        />
        {focused && (results.length > 0 || error) && (
          <ul className="glass absolute inset-x-0 top-full z-[800] mt-1 max-h-72 overflow-y-auto rounded-lg p-1 shadow-xl">
            {error && <li className="px-3 py-2 text-sm text-red-300">{error}</li>}
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lon},${i}`}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick(r) }}
                  className={`block w-full rounded-md px-3 py-2 text-left ${i === active ? 'bg-white/10' : 'hover:bg-white/5'}`}
                >
                  <span className="block text-sm text-white">{r.name}</span>
                  <span className="block truncate text-xs text-slate-500">{r.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className={`rounded p-1 text-slate-500 hover:bg-white/5 hover:text-white ${removable ? '' : 'invisible'}`}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

function ElevationChart({ route, elevation, t, locale, onHover }: {
  route: RouteResult
  elevation: Elevation | null
  t: Strings
  locale: string
  onHover: (idx: number | null) => void
}) {
  const [x, setX] = useState<number | null>(null)
  const pts = elevation?.points ?? []
  const total = route.cum[route.cum.length - 1] || 1
  if (!elevation) return null
  if (pts.length < 2) return <p className="text-sm text-slate-500">{t.noElevation}</p>

  let min = Math.min(...pts.map((p) => p.h)), max = Math.max(...pts.map((p) => p.h))
  if (max - min < 20) { const mid = (max + min) / 2; min = mid - 10; max = mid + 10 }
  const X = (d: number) => (d / total) * 1000
  const Y = (h: number) => 100 - ((h - min) / (max - min)) * 92 - 4
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.h).toFixed(1)}`).join('')
  const area = `${line}L${X(pts[pts.length - 1].d)},100L${X(pts[0].d)},100Z`

  const nearest = x == null ? null : pts.reduce((best, p) => (Math.abs(p.d - x * total) < Math.abs(best.d - x * total) ? p : best), pts[0])

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-slate-500">
        <span className="font-semibold text-slate-300">{t.elevation}</span>
        {nearest ? <span className="text-slate-200">{fmtDistance(nearest.d, locale)} · {Math.round(nearest.h)} m</span> : <span>{Math.round(min)}–{Math.round(max)} m</span>}
      </div>
      <div
        className="relative h-28 cursor-crosshair touch-none"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
          setX(f)
          const p = pts.reduce((best, q) => (Math.abs(q.d - f * total) < Math.abs(best.d - f * total) ? q : best), pts[0])
          onHover(p.idx)
        }}
        onPointerLeave={() => { setX(null); onHover(null) }}
      >
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
          <path d={area} fill="#4ee6e0" fillOpacity={0.15} />
          <path d={line} fill="none" stroke="#4ee6e0" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        {nearest && (
          <div className="pointer-events-none absolute inset-y-0 w-px bg-[#fbbf24]" style={{ left: `${(nearest.d / total) * 100}%` }} />
        )}
        <span className="absolute left-1 top-0 text-[10px] text-slate-500">{Math.round(max)} m</span>
        <span className="absolute bottom-0 left-1 text-[10px] text-slate-500">{Math.round(min)} m</span>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>0</span><span>{fmtDistance(total, locale)}</span></div>
    </div>
  )
}

function NavOverlay({ t, locale, route, nav, voice, follow, onVoice, onRecenter, onStop, rerouting }: {
  t: Strings
  locale: string
  route: RouteResult
  nav: ReturnType<typeof useNavigation>
  voice: boolean
  follow: boolean
  onVoice: () => void
  onRecenter: () => void
  onStop: () => void
  rerouting: boolean
}) {
  const m = route.maneuvers[nav.next] ?? route.maneuvers[0]
  const after = route.maneuvers[nav.next + 1]
  const eta = new Date(nav.at + nav.remainingS * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  return (
    <>
      {/* Next instruction */}
      <div className="absolute inset-x-3 top-3 z-[600] mx-auto max-w-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-4 rounded-2xl bg-[#c8ff3d] p-4 text-[#071013] shadow-2xl">
          {createElement(maneuverIcon(nav.arrived ? 4 : m.type), { className: 'size-12 shrink-0', strokeWidth: 2.5 })}
          <div className="min-w-0">
            {nav.arrived ? (
              <div className="text-2xl font-extrabold">{t.navArrived}</div>
            ) : (
              <>
                <div className="text-3xl font-extrabold tabular-nums">{nav.pos ? fmtDistance(nav.distToNext, locale) : '…'}</div>
                <div className="text-base font-semibold leading-snug">{m.text}</div>
              </>
            )}
          </div>
        </div>
        {after && !nav.arrived && (
          <div className="mx-3 flex items-center gap-2 rounded-b-xl bg-[#071013]/90 px-3 py-1.5 text-sm text-slate-200">
            <span className="text-slate-500">{t.navThen}</span>
            {createElement(maneuverIcon(after.type), { className: 'size-4 text-cyan-300' })}
            <span className="truncate">{after.text}</span>
          </div>
        )}
        {(nav.error || !nav.pos || nav.offRoute || rerouting) && (
          <div className={`mx-auto mt-2 w-fit rounded-full px-3 py-1 text-sm font-semibold ${nav.error ? 'bg-red-500 text-white' : 'bg-[#071013]/90 text-slate-200'}`}>
            {nav.error ?? (nav.offRoute || rerouting ? t.navOffRoute : t.navWaiting)}
          </div>
        )}
      </div>

      {!follow && (
        <button onClick={onRecenter} className="glass absolute bottom-28 right-3 z-[600] inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg">
          <Crosshair className="size-4" />{t.navRecenter}
        </button>
      )}

      {/* Bottom bar */}
      <div className="absolute inset-x-0 bottom-0 z-[600]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="glass-strong mx-auto flex max-w-xl items-center gap-3 rounded-t-2xl px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold tabular-nums text-white">{fmtDuration(nav.remainingS, locale)} · {eta}</div>
            <div className="text-sm text-slate-400">
              {fmtDistance(nav.remainingM, locale)} {t.navRemaining}
              {nav.accuracy != null && <span className="ml-2 text-slate-500">{t.navAccuracy(nav.accuracy)}</span>}
            </div>
          </div>
          <button onClick={onVoice} aria-label={voice ? t.navVoiceOff : t.navVoiceOn} title={voice ? t.navVoiceOff : t.navVoiceOn} className="grid size-11 place-items-center rounded-xl border border-slate-700/80 text-slate-200">
            {voice ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          </button>
          <button onClick={onStop} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 font-bold text-white">
            <Square className="size-4 fill-current" />{t.navStop}
          </button>
        </div>
      </div>
    </>
  )
}
