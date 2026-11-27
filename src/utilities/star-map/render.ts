import { milkyWayIntensity, moonPosition, observer, planetPositions, sunPosition, toEquatorial, toGalactic, toHorizontal, type Observer } from './astro'

export interface SkyData {
  stars: [number, number, number, number][]
  names: [number, number, number, string][]
  lines: Record<string, [number, number][][]>
  labels: [number, number, number, string, string][]
}

export interface Palette { bg: string; sky: string; star: string; line: string; grid: string; label: string; text: string; ring: string; milky: string }

export const THEMES: Record<string, { name: { en: string; nl: string }; palette: Palette; font: string; glow: boolean }> = {
  midnight: { name: { en: 'Midnight', nl: 'Middernacht' }, font: 'playfair', glow: true,
    palette: { bg: '#0b1026', sky: '#0e1533', star: '#ffffff', line: '#c9d3ff', grid: '#8796d6', label: '#c9d3ff', text: '#f4f6ff', ring: '#e8ecff', milky: '#9fb0ff' } },
  noir: { name: { en: 'Noir', nl: 'Noir' }, font: 'montserrat', glow: false,
    palette: { bg: '#050505', sky: '#050505', star: '#ffffff', line: '#ffffff', grid: '#ffffff', label: '#d4d4d4', text: '#ffffff', ring: '#ffffff', milky: '#ffffff' } },
  paper: { name: { en: 'Paper', nl: 'Papier' }, font: 'cormorant', glow: false,
    palette: { bg: '#f5f0e6', sky: '#f5f0e6', star: '#1c2333', line: '#1c2333', grid: '#1c2333', label: '#3b4256', text: '#1c2333', ring: '#1c2333', milky: '#5a6480' } },
  gold: { name: { en: 'Navy & gold', nl: 'Navy & goud' }, font: 'cormorant', glow: true,
    palette: { bg: '#0f1b2d', sky: '#12213a', star: '#f6e3b4', line: '#d9b56f', grid: '#d9b56f', label: '#e7c98a', text: '#ecd29a', ring: '#d9b56f', milky: '#e7c98a' } },
  blush: { name: { en: 'Blush', nl: 'Poederroze' }, font: 'josefin', glow: true,
    palette: { bg: '#f2ddd5', sky: '#252a3d', star: '#ffffff', line: '#f2c9bc', grid: '#f2c9bc', label: '#f7ddd5', text: '#3b2b30', ring: '#3b2b30', milky: '#f7d7cd' } },
  forest: { name: { en: 'Forest', nl: 'Woud' }, font: 'playfair', glow: true,
    palette: { bg: '#11231c', sky: '#142a21', star: '#f5ecd6', line: '#cdbf96', grid: '#cdbf96', label: '#d9ceac', text: '#efe4c6', ring: '#cdbf96', milky: '#e4d9b4' } },
  aurora: { name: { en: 'Aurora', nl: 'Aurora' }, font: 'montserrat', glow: true,
    palette: { bg: '#061a1f', sky: '#082a30', star: '#e9fffb', line: '#6ee7d2', grid: '#6ee7d2', label: '#a7f3e4', text: '#e9fffb', ring: '#6ee7d2', milky: '#8ff5df' } },
}

export const FONTS: Record<string, { label: string; title: string; body: string; titleWeight: number; upper: boolean }> = {
  playfair: { label: 'Playfair Display', title: '"Playfair Display", Georgia, serif', body: '"Montserrat", Helvetica, sans-serif', titleWeight: 600, upper: false },
  cormorant: { label: 'Cormorant Garamond', title: '"Cormorant Garamond", Georgia, serif', body: '"Cormorant Garamond", Georgia, serif', titleWeight: 600, upper: false },
  montserrat: { label: 'Montserrat', title: '"Montserrat", Helvetica, sans-serif', body: '"Montserrat", Helvetica, sans-serif', titleWeight: 600, upper: true },
  josefin: { label: 'Josefin Sans', title: '"Josefin Sans", Helvetica, sans-serif', body: '"Josefin Sans", Helvetica, sans-serif', titleWeight: 600, upper: true },
  script: { label: 'Great Vibes', title: '"Great Vibes", cursive', body: '"Cormorant Garamond", Georgia, serif', titleWeight: 400, upper: false },
  mono: { label: 'Space Mono', title: '"Space Mono", monospace', body: '"Space Mono", monospace', titleWeight: 700, upper: true },
}

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Great+Vibes&family=Josefin+Sans:wght@400;600&family=Montserrat:wght@400;600&family=Playfair+Display:wght@400;600&family=Space+Mono:wght@400;700&display=swap'

/** Inject the poster fonts once and wait until they can be drawn on canvas. */
export async function loadPosterFonts(): Promise<void> {
  if (!document.querySelector('link[data-star-map-fonts]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_HREF
    link.dataset.starMapFonts = ''
    document.head.appendChild(link)
    await new Promise((r) => { link.onload = r; link.onerror = r })
  }
  const faces = ['600 20px "Playfair Display"', '400 20px "Montserrat"', '600 20px "Montserrat"', '600 20px "Cormorant Garamond"', '400 20px "Cormorant Garamond"',
    '400 20px "Great Vibes"', '600 20px "Josefin Sans"', '400 20px "Josefin Sans"', '700 20px "Space Mono"', '400 20px "Space Mono"']
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)))
}

export interface MapOptions {
  lat: number
  lon: number
  /** UTC instant */
  time: number
  projection: 'equidistant' | 'stereographic'
  palette: Palette
  font: string
  glow: boolean
  constellations: boolean
  constellationNames: boolean
  starNames: boolean
  planets: boolean
  moon: boolean
  milkyWay: boolean
  grid: boolean
  compass: boolean
  starColors: boolean
  magLimit: number
  starScale: number
  lineWidth: number
  ring: 'none' | 'thin' | 'double' | 'ticks'
  layout: 'poster' | 'map'
  frame: boolean
  title: string
  subtitle: string
  lines: string[]
  lang: 'en' | 'nl'
}

const RAD = Math.PI / 180

function rgba(hex: string, a: number) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

const BV_STOPS: [number, [number, number, number]][] = [
  [-0.4, [155, 178, 255]], [0, [202, 215, 255]], [0.4, [248, 247, 255]], [0.8, [255, 241, 223]], [1.2, [255, 210, 161]], [1.6, [255, 181, 108]], [2.0, [255, 155, 74]],
]
function bvColor(bv: number): string {
  const v = Math.max(-0.4, Math.min(2, bv))
  for (let i = 1; i < BV_STOPS.length; i++) {
    const [b1, c1] = BV_STOPS[i]
    const [b0, c0] = BV_STOPS[i - 1]
    if (v <= b1) {
      const f = (v - b0) / (b1 - b0)
      return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * f)).join(',')})`
    }
  }
  return 'rgb(255,155,74)'
}

/** Projection of the visible hemisphere onto a disc of radius R centred at (cx, cy). North up, east left (as seen looking up). */
class Projector {
  o: Observer; cx: number; cy: number; R: number; kind: MapOptions['projection']
  constructor(o: Observer, cx: number, cy: number, R: number, kind: MapOptions['projection']) {
    this.o = o; this.cx = cx; this.cy = cy; this.R = R; this.kind = kind
  }
  radius(alt: number) {
    const z = 90 - alt
    return this.kind === 'stereographic' ? this.R * Math.tan((z / 2) * RAD) : (this.R * z) / 90
  }
  fromHorizontal(alt: number, az: number): [number, number] {
    const r = this.radius(Math.max(alt, -60))
    return [this.cx - r * Math.sin(az * RAD), this.cy - r * Math.cos(az * RAD)]
  }
  project(ra: number, dec: number): { x: number; y: number; alt: number } {
    const { alt, az } = toHorizontal(this.o, ra, dec)
    const [x, y] = this.fromHorizontal(alt, az)
    return { x, y, alt }
  }
  /** Screen point inside the disc → alt/az. */
  inverse(x: number, y: number): { alt: number; az: number } {
    const dx = this.cx - x, dy = this.cy - y
    const r = Math.hypot(dx, dy) / this.R
    const z = this.kind === 'stereographic' ? 2 * Math.atan(r) / RAD : r * 90
    return { alt: 90 - z, az: Math.atan2(dx, dy) / RAD }
  }
}

function vec(ra: number, dec: number): [number, number, number] {
  const a = ra * RAD, d = dec * RAD
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]
}
function unvec([x, y, z]: number[]): [number, number] {
  return [((Math.atan2(y, x) / RAD) + 360) % 360, Math.asin(Math.max(-1, Math.min(1, z / Math.hypot(x, y, z)))) / RAD]
}

/** Stroke a polyline on the sky, resampled along great circles and skipping parts well below the horizon. */
function skyPolyline(ctx: CanvasRenderingContext2D, p: Projector, pts: [number, number][], stepDeg = 2) {
  let pen = false
  for (let i = 0; i < pts.length; i++) {
    const seg: [number, number][] = [pts[i]]
    if (i < pts.length - 1) {
      const a = vec(...pts[i]), b = vec(...pts[i + 1])
      const ang = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / RAD
      const n = Math.ceil(ang / stepDeg)
      for (let k = 1; k < n; k++) {
        const f = k / n
        seg.push(unvec([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]))
      }
    }
    for (const [ra, dec] of seg) {
      const q = p.project(ra, dec)
      if (q.alt < -8) { pen = false; continue }
      if (pen) ctx.lineTo(q.x, q.y)
      else { ctx.moveTo(q.x, q.y); pen = true }
    }
  }
}

function spacedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  if (!spacing) { ctx.textAlign = 'center'; ctx.fillText(text, x, y); return }
  const chars = [...text]
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1)
  let cx = x - total / 2
  ctx.textAlign = 'left'
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing })
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, family: string, weight: number, size: number, maxWidth: number, spacingEm = 0) {
  let s = size
  for (let i = 0; i < 30; i++) {
    ctx.font = `${weight} ${s}px ${family}`
    const w = ctx.measureText(text).width + spacingEm * s * Math.max(0, [...text].length - 1)
    if (w <= maxWidth) break
    s *= 0.94
  }
  return s
}

const PLANET_NAMES: Record<string, { en: string; nl: string }> = {
  Mercury: { en: 'Mercury', nl: 'Mercurius' }, Venus: { en: 'Venus', nl: 'Venus' }, Mars: { en: 'Mars', nl: 'Mars' },
  Jupiter: { en: 'Jupiter', nl: 'Jupiter' }, Saturn: { en: 'Saturn', nl: 'Saturnus' }, Moon: { en: 'Moon', nl: 'Maan' },
}

/** Draw the whole poster into a canvas of the given pixel size. */
export function renderPoster(canvas: HTMLCanvasElement, width: number, height: number, data: SkyData, opt: MapOptions) {
  canvas.width = Math.round(width)
  canvas.height = Math.round(height)
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  const pal = opt.palette
  const font = FONTS[opt.font] ?? FONTS.playfair

  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)

  const margin = Math.min(W, H) * 0.09
  const poster = opt.layout === 'poster'
  const textH = poster ? Math.min(H * 0.24, W * 0.36) : 0
  const ringPad = opt.ring === 'none' ? 0 : opt.compass ? 0.075 : 0.035
  const D = Math.min(W - 2 * margin, H - 2 * margin - textH) / (1 + 2 * ringPad)
  const R = D / 2
  const cx = W / 2
  const cy = poster ? margin + (H - 2 * margin - textH) / 2 : H / 2
  const unit = D / 1000

  if (opt.frame) {
    ctx.strokeStyle = rgba(pal.ring, 0.75)
    ctx.lineWidth = Math.max(1, Math.min(W, H) * 0.0016)
    const inset = margin * 0.42
    ctx.strokeRect(inset, inset, W - 2 * inset, H - 2 * inset)
  }

  const o = observer(opt.time, opt.lat, opt.lon)
  const p = new Projector(o, cx, cy, R, opt.projection)

  // ---- sky disc
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = pal.sky
  ctx.fillRect(cx - R, cy - R, D, D)
  if (opt.glow) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
    g.addColorStop(0, rgba(pal.milky, 0.1))
    g.addColorStop(1, rgba(pal.milky, 0))
    ctx.fillStyle = g
    ctx.fillRect(cx - R, cy - R, D, D)
  }

  // ---- Milky Way (computed per pixel at low resolution, then scaled up smoothly)
  if (opt.milkyWay) {
    const N = Math.min(520, Math.max(220, Math.round(D / 6)))
    const off = document.createElement('canvas')
    off.width = off.height = N
    const octx = off.getContext('2d')!
    const img = octx.createImageData(N, N)
    const hex = parseInt(pal.milky.slice(1, 7), 16)
    const mr = (hex >> 16) & 255, mg = (hex >> 8) & 255, mb = hex & 255
    const local = new Projector(o, N / 2, N / 2, N / 2, opt.projection)
    const strength = 0.42
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x + 0.5 - N / 2, dy = y + 0.5 - N / 2
        if (dx * dx + dy * dy > (N / 2 + 1) ** 2) continue
        const { alt, az } = local.inverse(x + 0.5, y + 0.5)
        const eq = toEquatorial(o, alt, az)
        const gal = toGalactic(eq.ra, eq.dec)
        const v = milkyWayIntensity(gal.l, gal.b)
        const i = (y * N + x) * 4
        img.data[i] = mr; img.data[i + 1] = mg; img.data[i + 2] = mb
        img.data[i + 3] = Math.round(255 * strength * v ** 1.15)
      }
    }
    octx.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(off, cx - R, cy - R, D, D)
  }

  // ---- RA/Dec grid
  if (opt.grid) {
    ctx.strokeStyle = rgba(pal.grid, 0.22)
    ctx.lineWidth = Math.max(0.6, unit * 0.9 * opt.lineWidth)
    ctx.setLineDash([unit * 4, unit * 5])
    ctx.beginPath()
    for (let dec = -60; dec <= 60; dec += 30) {
      const pts: [number, number][] = []
      for (let ra = 0; ra <= 360; ra += 5) pts.push([ra, dec])
      skyPolyline(ctx, p, pts, 5)
    }
    for (let ra = 0; ra < 360; ra += 30) {
      const pts: [number, number][] = []
      for (let dec = -80; dec <= 80; dec += 5) pts.push([ra, dec])
      skyPolyline(ctx, p, pts, 5)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  // ---- constellation figures
  if (opt.constellations) {
    ctx.strokeStyle = rgba(pal.line, 0.55)
    ctx.lineWidth = Math.max(0.7, unit * 1.3 * opt.lineWidth)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (const polylines of Object.values(data.lines)) for (const pl of polylines) skyPolyline(ctx, p, pl)
    ctx.stroke()
  }

  // ---- stars
  const starSize = (mag: number) => (0.45 + 0.55 * Math.max(0, opt.magLimit - mag) ** 1.22) * unit * opt.starScale
  for (const [ra, dec, mag, bv] of data.stars) {
    if (mag > opt.magLimit) continue
    const q = p.project(ra, dec)
    if (q.alt < -0.5) continue
    const r = starSize(mag)
    const color = opt.starColors ? bvColor(bv) : pal.star
    if (opt.glow && mag < 1.8) {
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 4)
      g.addColorStop(0, opt.starColors ? color.replace('rgb', 'rgba').replace(')', ',0.35)') : rgba(pal.star, 0.35))
      g.addColorStop(1, rgba(pal.star, 0))
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(q.x, q.y, r * 4, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(q.x, q.y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // ---- planets & moon
  const labelFont = (size: number, weight = 400) => `${weight} ${size}px ${font.body}`
  if (opt.planets) {
    for (const b of planetPositions(opt.time)) {
      const q = p.project(b.ra, b.dec)
      if (q.alt < 0) continue
      const r = starSize(Math.min(b.mag, 0.5)) * 0.9
      ctx.fillStyle = pal.star
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = rgba(pal.star, 0.6)
      ctx.lineWidth = unit * 1.2
      ctx.beginPath(); ctx.arc(q.x, q.y, r + unit * 4, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = rgba(pal.label, 0.9)
      ctx.font = labelFont(unit * 14, 600)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(PLANET_NAMES[b.name][opt.lang].toUpperCase(), q.x + r + unit * 9, q.y)
    }
  }
  if (opt.moon) {
    const m = moonPosition(opt.time)
    const q = p.project(m.ra, m.dec)
    if (q.alt > -1) {
      const r = unit * 16
      // direction towards the sun on the map decides which side is lit
      const sun = sunPosition(opt.time)
      const sh = toHorizontal(o, sun.ra, sun.dec)
      const sp = p.fromHorizontal(Math.max(sh.alt, -50), sh.az)
      const angle = Math.atan2(sp[1] - q.y, sp[0] - q.x)
      ctx.save()
      ctx.translate(q.x, q.y)
      ctx.rotate(angle)
      ctx.fillStyle = rgba(pal.star, 0.14)
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
      const k = m.illumination
      ctx.fillStyle = pal.star
      ctx.beginPath()
      ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false)
      if (k >= 0.5) ctx.ellipse(0, 0, r * (2 * k - 1), r, 0, Math.PI / 2, (3 * Math.PI) / 2, false)
      else ctx.ellipse(0, 0, r * (1 - 2 * k), r, 0, Math.PI / 2, -Math.PI / 2, true)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = rgba(pal.label, 0.9)
      ctx.font = labelFont(unit * 14, 600)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(PLANET_NAMES.Moon[opt.lang].toUpperCase(), q.x + r + unit * 8, q.y)
    }
  }

  // ---- labels
  ctx.textBaseline = 'middle'
  if (opt.starNames) {
    ctx.font = labelFont(unit * 13)
    ctx.fillStyle = rgba(pal.label, 0.85)
    ctx.textAlign = 'left'
    for (const [ra, dec, mag, name] of data.names) {
      if (mag > opt.magLimit) continue
      const q = p.project(ra, dec)
      if (q.alt < 3) continue
      ctx.fillText(name, q.x + starSize(mag) + unit * 6, q.y + unit * 1)
    }
  }
  if (opt.constellationNames) {
    ctx.font = labelFont(unit * 15, 600)
    ctx.fillStyle = rgba(pal.label, 0.72)
    for (const [ra, dec, rank, en, nl] of data.labels) {
      if (rank > 2) continue
      const q = p.project(ra, dec)
      if (q.alt < 4) continue
      spacedText(ctx, (opt.lang === 'nl' ? nl : en).toUpperCase(), q.x, q.y, unit * 3)
    }
  }
  ctx.restore() // end clip

  // ---- ring
  ctx.strokeStyle = pal.ring
  ctx.fillStyle = pal.ring
  if (opt.ring !== 'none') {
    ctx.lineWidth = Math.max(1, unit * 2.2)
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()
    if (opt.ring === 'double' || opt.ring === 'ticks') {
      ctx.lineWidth = Math.max(0.8, unit * 1.1)
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.03, 0, Math.PI * 2); ctx.stroke()
    }
    if (opt.ring === 'ticks') {
      ctx.lineWidth = Math.max(0.6, unit * 1)
      ctx.beginPath()
      for (let a = 0; a < 360; a += 2) {
        const len = a % 10 === 0 ? 0.03 : 0.015
        const s = Math.sin(a * RAD), c = Math.cos(a * RAD)
        ctx.moveTo(cx + s * R, cy - c * R)
        ctx.lineTo(cx + s * R * (1 + len), cy - c * R * (1 + len))
      }
      ctx.stroke()
    }
  }
  if (opt.compass) {
    const dirs = opt.lang === 'nl' ? ['N', 'O', 'Z', 'W'] : ['N', 'E', 'S', 'W']
    ctx.font = labelFont(unit * 22, 600)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const rr = R * (opt.ring === 'none' ? 1.06 : 1.09)
    // looking up: north top, east left, south bottom, west right
    ;[[0, -1], [-1, 0], [0, 1], [1, 0]].forEach(([dx, dy], i) => ctx.fillText(dirs[i], cx + dx * rr, cy + dy * rr))
  }

  // ---- text block
  if (poster) {
    const top = H - margin - textH
    const maxW = W - 2 * margin
    ctx.fillStyle = pal.text
    ctx.textBaseline = 'alphabetic'
    let y = top + textH * 0.36
    if (opt.title.trim()) {
      const t = font.upper ? opt.title.toUpperCase() : opt.title
      const spacing = font.upper ? 0.12 : 0
      const size = fitFont(ctx, t, font.title, font.titleWeight, textH * (font.title.includes('Great Vibes') ? 0.36 : 0.26), maxW, spacing)
      ctx.font = `${font.titleWeight} ${size}px ${font.title}`
      spacedText(ctx, t, cx, y, size * spacing)
    }
    y += textH * 0.2
    if (opt.subtitle.trim()) {
      const size = fitFont(ctx, opt.subtitle, font.body, 400, textH * 0.1, maxW)
      ctx.font = `400 ${size}px ${font.body}`
      ctx.fillStyle = rgba(pal.text, 0.85)
      spacedText(ctx, opt.subtitle, cx, y, 0)
      y += textH * 0.14
    } else y += textH * 0.02
    const details = opt.lines.filter((l) => l.trim())
    if (details.length) {
      ctx.strokeStyle = rgba(pal.text, 0.5)
      ctx.lineWidth = Math.max(1, unit * 1.4)
      ctx.beginPath(); ctx.moveTo(cx - W * 0.05, y - textH * 0.04); ctx.lineTo(cx + W * 0.05, y - textH * 0.04); ctx.stroke()
      y += textH * 0.1
      ctx.fillStyle = rgba(pal.text, 0.8)
      for (const line of details) {
        const txt = line.toUpperCase()
        const size = fitFont(ctx, txt, font.body, 400, textH * 0.068, maxW, 0.18)
        ctx.font = `400 ${size}px ${font.body}`
        spacedText(ctx, txt, cx, y, size * 0.18)
        y += textH * 0.11
      }
    }
  }
}
