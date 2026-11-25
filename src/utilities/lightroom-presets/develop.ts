// Lightroom develop settings → pixels. Pure (no DOM, no React) so it runs on
// the main thread, in the export worker and under `node --test`.
//
// Presets are stored in Lightroom's own vocabulary (crs:* keys such as
// Exposure2012, HueAdjustmentRed, ToneCurvePV2012), which keeps imported
// files round-trippable. `resolveDev` turns those into a normalized `Dev`,
// `adaptDev` nudges it for the photo at hand, and `createRenderer` builds a
// fast per-pixel pipeline from it.

export type SettingValue = number | string | boolean | number[]
export type Settings = Record<string, SettingValue>

export interface Preset {
  id: string
  name: string
  group: string
  settings: Settings
  /** Friendly names of preset features this tool can't reproduce (masks, profiles…). */
  ignored: string[]
  createdAt: number
  updatedAt: number
}

export const HSL_COLORS = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'] as const
const HSL_HUES = [0, 30, 60, 120, 180, 240, 270, 300]

export interface Dev {
  exposure: number
  contrast: number
  highlights: number
  shadows: number
  whites: number
  blacks: number
  texture: number
  clarity: number
  dehaze: number
  vibrance: number
  saturation: number
  temp: number
  tint: number
  hue: number[]
  sat: number[]
  lum: number[]
  gray: boolean
  grayMix: number[]
  param: number[]
  paramSplit: number[]
  curve: number[] | null
  curveR: number[] | null
  curveG: number[] | null
  curveB: number[] | null
  shadowHue: number
  shadowSat: number
  shadowLum: number
  midHue: number
  midSat: number
  midLum: number
  highHue: number
  highSat: number
  highLum: number
  globalHue: number
  globalSat: number
  globalLum: number
  balance: number
  vigAmount: number
  vigMid: number
  vigFeather: number
  vigRound: number
  grainAmount: number
  grainSize: number
}

const zeros8 = () => [0, 0, 0, 0, 0, 0, 0, 0]

export function neutralDev(): Dev {
  return {
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, texture: 0, clarity: 0, dehaze: 0,
    vibrance: 0, saturation: 0, temp: 0, tint: 0, hue: zeros8(), sat: zeros8(), lum: zeros8(), gray: false, grayMix: zeros8(),
    param: [0, 0, 0, 0], paramSplit: [25, 50, 75], curve: null, curveR: null, curveG: null, curveB: null,
    shadowHue: 0, shadowSat: 0, shadowLum: 0, midHue: 0, midSat: 0, midLum: 0, highHue: 0, highSat: 0, highLum: 0,
    globalHue: 0, globalSat: 0, globalLum: 0, balance: 0, vigAmount: 0, vigMid: 50, vigFeather: 50, vigRound: 0,
    grainAmount: 0, grainSize: 25,
  }
}

export function toNumber(value: SettingValue | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(value)) return Number(value)
  return undefined
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

function curveOf(value: SettingValue | undefined): number[] | null {
  if (!Array.isArray(value) || value.length < 4 || value.length % 2) return null
  const identity = value.every((n, i) => (i % 2 ? n === value[i - 1] : true))
  return identity ? null : value.slice()
}

/** Normalize Lightroom settings (PV2012 names, with legacy fallbacks). */
export function resolveDev(s: Settings): Dev {
  const n = (key: string, fallback = 0) => toNumber(s[key]) ?? fallback
  const has = (key: string) => toNumber(s[key]) !== undefined
  const d = neutralDev()
  d.exposure = has('Exposure2012') ? n('Exposure2012') : n('Exposure')
  d.contrast = n('Contrast2012')
  d.highlights = has('Highlights2012') ? n('Highlights2012') : -n('Recovery')
  d.shadows = has('Shadows2012') ? n('Shadows2012') : n('FillLight')
  d.whites = n('Whites2012')
  d.blacks = n('Blacks2012')
  d.texture = n('Texture')
  d.clarity = has('Clarity2012') ? n('Clarity2012') : n('Clarity')
  d.dehaze = n('Dehaze')
  d.vibrance = n('Vibrance')
  d.saturation = n('Saturation')
  if (has('IncrementalTemperature')) d.temp = n('IncrementalTemperature')
  else if (has('Temperature')) {
    // Absolute kelvin (raw presets): treat as a shift from daylight, in mireds.
    d.temp = clamp((1e6 / 5500 - 1e6 / clamp(n('Temperature'), 2000, 50000)) * 0.9, -100, 100)
  }
  if (has('IncrementalTint')) d.tint = n('IncrementalTint')
  else if (has('Tint')) d.tint = clamp(n('Tint') * 0.66, -100, 100)
  HSL_COLORS.forEach((c, i) => {
    d.hue[i] = n(`HueAdjustment${c}`)
    d.sat[i] = n(`SaturationAdjustment${c}`)
    d.lum[i] = n(`LuminanceAdjustment${c}`)
    d.grayMix[i] = n(`GrayMixer${c}`)
  })
  d.gray = s.ConvertToGrayscale === true || s.ConvertToGrayscale === 'True'
  d.param = [n('ParametricShadows'), n('ParametricDarks'), n('ParametricLights'), n('ParametricHighlights')]
  d.paramSplit = [n('ParametricShadowSplit', 25), n('ParametricMidtoneSplit', 50), n('ParametricHighlightSplit', 75)]
  d.curve = curveOf(s.ToneCurvePV2012 ?? s.ToneCurve)
  d.curveR = curveOf(s.ToneCurvePV2012Red)
  d.curveG = curveOf(s.ToneCurvePV2012Green)
  d.curveB = curveOf(s.ToneCurvePV2012Blue)
  d.shadowHue = n('SplitToningShadowHue')
  d.shadowSat = n('SplitToningShadowSaturation')
  d.highHue = n('SplitToningHighlightHue')
  d.highSat = n('SplitToningHighlightSaturation')
  d.balance = n('SplitToningBalance')
  d.midHue = n('ColorGradeMidtoneHue')
  d.midSat = n('ColorGradeMidtoneSat')
  d.shadowLum = n('ColorGradeShadowLum')
  d.midLum = n('ColorGradeMidtoneLum')
  d.highLum = n('ColorGradeHighlightLum')
  d.globalHue = n('ColorGradeGlobalHue')
  d.globalSat = n('ColorGradeGlobalSat')
  d.globalLum = n('ColorGradeGlobalLum')
  d.vigAmount = n('PostCropVignetteAmount')
  d.vigMid = n('PostCropVignetteMidpoint', 50)
  d.vigFeather = n('PostCropVignetteFeather', 50)
  d.vigRound = n('PostCropVignetteRoundness')
  d.grainAmount = n('GrainAmount')
  d.grainSize = n('GrainSize', 25)
  return d
}

// Fields whose distance from neutral is scaled by the preset "amount".
const SCALED: (keyof Dev)[] = [
  'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'texture', 'clarity', 'dehaze', 'vibrance', 'saturation',
  'temp', 'tint', 'shadowSat', 'shadowLum', 'midSat', 'midLum', 'highSat', 'highLum', 'globalSat', 'globalLum', 'vigAmount', 'grainAmount',
]

/** Preset amount like Lightroom's (0 = off, 1 = as authored, 2 = doubled). */
export function scaleDev(dev: Dev, amount: number): Dev {
  if (amount === 1) return dev
  const out: Dev = { ...dev, hue: dev.hue.map((v) => v * amount), sat: dev.sat.map((v) => v * amount), lum: dev.lum.map((v) => v * amount),
    grayMix: dev.grayMix.map((v) => v * amount), param: dev.param.map((v) => v * amount) }
  for (const key of SCALED) (out[key] as number) = (dev[key] as number) * amount
  const sc = (c: number[] | null) => (c ? c.map((v, i) => (i % 2 ? c[i - 1] + (v - c[i - 1]) * amount : v)) : null)
  out.curve = sc(dev.curve); out.curveR = sc(dev.curveR); out.curveG = sc(dev.curveG); out.curveB = sc(dev.curveB)
  out.gray = dev.gray && amount >= 0.5
  return out
}

// ───────────────────────── Scene analysis + adaptive tweaks ─────────────────────────

export type Scene = 'dark' | 'bright' | 'contrast' | 'flat' | 'balanced'

export interface ImageStats {
  mean: number
  p02: number
  p50: number
  p98: number
  shadowFrac: number
  highlightFrac: number
  saturation: number
  scene: Scene
}

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

/** Luminance distribution of an RGBA buffer (usually a small thumbnail). */
export function analyzePixels(data: Uint8ClampedArray): ImageStats {
  const hist = new Uint32Array(256)
  let satSum = 0
  let count = 0
  const step = data.length > 4 * 250_000 ? 8 : 4
  for (let i = 0; i < data.length; i += step) {
    if (data[i + 3] < 8) continue
    const r = data[i], g = data[i + 1], b = data[i + 2]
    hist[(r * 54 + g * 183 + b * 19) >> 8]++
    const mx = r > g ? (r > b ? r : b) : g > b ? g : b
    const mn = r < g ? (r < b ? r : b) : g < b ? g : b
    satSum += mx ? (mx - mn) / mx : 0
    count++
  }
  if (!count) return { mean: 0.5, p02: 0, p50: 0.5, p98: 1, shadowFrac: 0, highlightFrac: 0, saturation: 0, scene: 'balanced' }
  const pct = (p: number) => {
    const target = p * count
    let acc = 0
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) return i / 255 }
    return 1
  }
  let mean = 0, shadows = 0, highlights = 0
  for (let i = 0; i < 256; i++) {
    mean += i * hist[i]
    if (i < 38) shadows += hist[i]
    if (i > 217) highlights += hist[i]
  }
  const stats = { mean: mean / count / 255, p02: pct(0.02), p50: pct(0.5), p98: pct(0.98), shadowFrac: shadows / count, highlightFrac: highlights / count, saturation: satSum / count }
  return { ...stats, scene: classifyScene(stats) }
}

export function classifyScene(s: Omit<ImageStats, 'scene'>): Scene {
  if (s.p50 < 0.27 || (s.mean < 0.3 && s.shadowFrac > 0.35)) return 'dark'
  if (s.p50 > 0.68 || (s.mean > 0.66 && s.highlightFrac > 0.3)) return 'bright'
  if (s.p98 - s.p02 < 0.55) return 'flat'
  if (s.shadowFrac > 0.18 && s.highlightFrac > 0.12) return 'contrast'
  return 'balanced'
}

export interface AdaptiveChange { field: keyof Dev; from: number; to: number }

/**
 * Adjust a resolved preset for one photo: a dark photo gets its shadows
 * opened up and is spared extra crushing, a bright one gets highlight
 * recovery instead of more exposure, flat photos get punch and contrasty
 * ones are calmed down. `strength` (0–1) scales every nudge.
 */
export function adaptDev(dev: Dev, stats: ImageStats, strength: number): { dev: Dev; changes: AdaptiveChange[] } {
  const s = clamp(strength, 0, 1)
  const out: Dev = { ...dev }
  if (s === 0) return { dev: out, changes: [] }
  const { scene } = stats

  // Exposure: partial auto-exposure toward mid-grey, and the preset's own
  // exposure is eased off when it pushes the wrong way for this photo.
  const medianLinear = Math.max(0.004, srgbToLinear(stats.p50))
  const needed = clamp(Math.log2(0.18 / medianLinear), -2.5, 2.5)
  let exposure = dev.exposure
  if (exposure * needed < 0) exposure *= 1 - 0.65 * s * Math.min(1, Math.abs(needed) / 1.5)
  const darkKeep = scene === 'dark' ? 0.55 : 1 // night shots should still look like night
  exposure += clamp(needed * 0.4 * darkKeep * s, -0.9, 0.9)
  out.exposure = exposure

  const shadowWeight = clamp((stats.shadowFrac - 0.08) * 2.8, 0, 1)
  const highlightWeight = clamp((stats.highlightFrac - 0.04) * 3.2, 0, 1)
  out.shadows = clamp(dev.shadows + 38 * shadowWeight * s, -100, 100)
  out.highlights = clamp(dev.highlights - 42 * highlightWeight * s, -100, 100)

  if (scene === 'dark') {
    if (dev.blacks < 0) out.blacks = dev.blacks * (1 - 0.6 * s)
    if (dev.contrast > 0) out.contrast = dev.contrast * (1 - 0.35 * s)
    if (dev.dehaze > 0) out.dehaze = dev.dehaze * (1 - 0.5 * s)
    if (dev.vigAmount < 0) out.vigAmount = dev.vigAmount * (1 - 0.5 * s)
    if (dev.param[0] < 0) out.param = [dev.param[0] * (1 - 0.5 * s), dev.param[1], dev.param[2], dev.param[3]]
  } else if (scene === 'bright') {
    if (dev.whites > 0) out.whites = dev.whites * (1 - 0.6 * s)
    if (dev.param[3] > 0) out.param = [dev.param[0], dev.param[1], dev.param[2], dev.param[3] * (1 - 0.5 * s)]
    out.blacks = clamp(out.blacks - 8 * s, -100, 100)
  } else if (scene === 'flat') {
    out.contrast = clamp(dev.contrast + 18 * s, -100, 100)
    out.blacks = clamp(dev.blacks - 16 * s, -100, 100)
    if (stats.p98 < 0.86) out.whites = clamp(dev.whites + 22 * s, -100, 100)
    if (dev.dehaze <= 0) out.dehaze = dev.dehaze + 8 * s
  } else if (scene === 'contrast') {
    if (dev.contrast > 0) out.contrast = dev.contrast * (1 - 0.5 * s)
    if (dev.clarity > 0) out.clarity = dev.clarity * (1 - 0.3 * s)
  }

  // Colour: don't over-cook already vivid photos; give dull ones a little life.
  if (!dev.gray) {
    if (stats.saturation > 0.45) {
      if (dev.saturation > 0) out.saturation = dev.saturation * (1 - 0.5 * s)
      if (dev.vibrance > 0) out.vibrance = dev.vibrance * (1 - 0.4 * s)
    } else if (stats.saturation < 0.14) {
      out.vibrance = clamp(dev.vibrance + 12 * s, -100, 100)
    }
  }

  const changes: AdaptiveChange[] = []
  for (const key of ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'clarity', 'dehaze', 'vibrance', 'saturation', 'vigAmount'] as (keyof Dev)[]) {
    const from = dev[key] as number
    const to = out[key] as number
    const minDelta = key === 'exposure' ? 0.05 : 1
    if (Math.abs(to - from) >= minDelta) changes.push({ field: key, from, to })
  }
  return { dev: out, changes }
}

// ───────────────────────── Renderer ─────────────────────────

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Monotone cubic (Fritsch–Carlson) through Lightroom curve points (0–255). */
function curveFn(flat: number[]): (x: number) => number {
  const pts: [number, number][] = []
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i] / 255, flat[i + 1] / 255])
  pts.sort((a, b) => a[0] - b[0])
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const n = xs.length
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]))
  const m: number[] = [d[0]]
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2)
  m.push(d[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i] }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (i < n - 2 && x > xs[i + 1]) i++
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h
    const t2 = t * t, t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]
  }
}

/** Display-domain tone mapping for Basic panel sliders + parametric curve. */
function toneFn(dev: Dev): (v: number) => number {
  const B = dev.blacks / 100, S = dev.shadows / 100, H = dev.highlights / 100, W = dev.whites / 100
  const contrastExp = 2 ** ((dev.contrast / 100) * 0.8)
  const mid = 0.46
  const splits = dev.paramSplit.map((v) => clamp(v / 100, 0.05, 0.95))
  const bounds = [0, splits[0], splits[1], splits[2], 1]
  return (v: number) => {
    let x = v
    if (x > 1) {
      // Over-exposed data (exposure/WB gains): highlights and whites decide how much is recovered.
      x = 1 + (x - 1) * clamp(1 + H * 0.8 + Math.min(0, W) * 0.4, 0.05, 2)
    }
    const xc = x > 1 ? 1 : x
    x += B * 0.1 * Math.max(0, 1 - xc / 0.45) ** 2
    x += S * 0.25 * ((xc * (1 - xc) ** 3) / 0.1055)
    x += H * 0.22 * ((xc ** 3 * (1 - xc)) / 0.1055)
    x += W * 0.18 * (x >= 1 ? 1 : smooth(0.4, 1, xc))
    x = clamp(x, 0, 1)
    if (contrastExp !== 1) {
      x = x < mid ? mid * (x / mid) ** contrastExp : 1 - (1 - mid) * ((1 - x) / (1 - mid)) ** contrastExp
    }
    if (dev.param.some((p) => p !== 0)) {
      let add = 0
      for (let r = 0; r < 4; r++) {
        if (!dev.param[r]) continue
        const lo = bounds[r], hi = bounds[r + 1]
        const c = (lo + hi) / 2, hw = Math.max(0.08, hi - lo)
        const t = Math.abs(x - c) / hw
        if (t < 1) add += (dev.param[r] / 100) * 0.13 * Math.cos((t * Math.PI) / 2) ** 2
      }
      x += add * Math.min(1, x * 10, (1 - x) * 10)
    }
    return clamp(x, 0, 1)
  }
}

function hueRgb(h: number): [number, number, number] {
  const f = (k: number) => {
    const kk = (k + h / 60) % 6
    return 1 - Math.max(0, Math.min(kk, 4 - kk, 1))
  }
  return [f(5), f(3), f(1)]
}

/** Zero-luma chroma direction for a hue, used for tinting (colour grading). */
function chroma(h: number, amount: number): [number, number, number] {
  const [r, g, b] = hueRgb(h)
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return [(r - y) * amount, (g - y) * amount, (b - y) * amount]
}

/** 360-entry table interpolating the 8 HSL colour bands around the hue circle. */
function hueTable(values: number[]): Float32Array {
  const t = new Float32Array(360)
  for (let h = 0; h < 360; h++) {
    let i = HSL_HUES.length - 1
    for (let k = 0; k < HSL_HUES.length; k++) if (HSL_HUES[k] <= h) i = k
    const j = (i + 1) % HSL_HUES.length
    const h0 = HSL_HUES[i], h1 = j === 0 ? 360 : HSL_HUES[j]
    const f = (h - h0) / (h1 - h0)
    t[h] = values[i] * (1 - f) + values[j] * f
  }
  return t
}

const TONE_N = 2048
const TONE_MAX = 2
const ENC_N = 16384

export type Renderer = (data: Uint8ClampedArray, width: number, height: number) => void

/** Builds an in-place RGBA renderer for one set of develop settings. */
export function createRenderer(dev: Dev): Renderer {
  const toLin = new Float32Array(256)
  for (let i = 0; i < 256; i++) toLin[i] = srgbToLinear(i / 255)
  const enc = new Float32Array(ENC_N)
  for (let i = 0; i < ENC_N; i++) {
    const l = i / (ENC_N - 1)
    enc[i] = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055
  }

  // White balance + exposure as linear gains, normalized to keep luminance.
  const t = dev.temp / 100, tn = dev.tint / 100
  let wr = 2 ** (0.32 * t + 0.12 * tn), wg = 2 ** (-0.25 * tn), wb = 2 ** (-0.32 * t + 0.12 * tn)
  const norm = 1 / (0.2126 * wr + 0.7152 * wg + 0.0722 * wb)
  const ev = 2 ** dev.exposure
  wr *= norm * ev; wg *= norm * ev; wb *= norm * ev

  const tone = toneFn(dev)
  const master = dev.curve ? curveFn(dev.curve) : null
  const ch = [dev.curveR, dev.curveG, dev.curveB].map((c) => (c ? curveFn(c) : null))
  const lut = [new Float32Array(TONE_N), new Float32Array(TONE_N), new Float32Array(TONE_N)]
  const lutM = new Float32Array(TONE_N)
  for (let i = 0; i < TONE_N; i++) {
    let y = tone((i / (TONE_N - 1)) * TONE_MAX)
    if (master) y = master(y)
    lutM[i] = y
    for (let c = 0; c < 3; c++) lut[c][i] = ch[c] ? ch[c]!(y) : y
  }
  const [lutR, lutG, lutB] = lut
  const toneScale = (TONE_N - 1) / TONE_MAX
  const encode = (l: number) => {
    const v = l <= 1 ? enc[(l * (ENC_N - 1)) | 0] : 1 + Math.log2(l) * 0.45
    return v > TONE_MAX ? TONE_MAX : v
  }

  const clarity = dev.clarity / 100, texture = dev.texture / 100, dz = dev.dehaze / 100
  const local = clarity !== 0 || texture !== 0 || dz !== 0
  const satF = 1 + dev.saturation / 100 + (dz > 0 ? dz * 0.3 : dz * 0.5)
  const vib = dev.vibrance / 100
  const doSat = satF !== 1 || vib !== 0

  const hslActive = dev.hue.some(Boolean) || dev.sat.some(Boolean) || dev.lum.some(Boolean)
  const hueT = hueTable(dev.hue), satT = hueTable(dev.sat), lumT = hueTable(dev.lum), grayT = hueTable(dev.grayMix)

  const grade = [
    [dev.shadowHue, dev.shadowSat, dev.shadowLum],
    [dev.midHue, dev.midSat, dev.midLum],
    [dev.highHue, dev.highSat, dev.highLum],
    [dev.globalHue, dev.globalSat, dev.globalLum],
  ]
  const gradeActive = grade.some(([, s, l]) => s !== 0 || l !== 0)
  const gc = grade.map(([h, s]) => chroma(h, (s / 100) * 0.3))
  const gl = grade.map(([, , l]) => (l / 100) * 0.2)
  const balance = dev.balance / 100

  const vig = dev.vigAmount / 100
  const vigR0 = 0.2 + (dev.vigMid / 100) * 0.75
  const vigW = 0.04 + (dev.vigFeather / 100) * 0.9
  const round = clamp(dev.vigRound / 100, -1, 1)
  const grain = dev.grainAmount / 100

  return (data, width, height) => {
    // Local contrast (clarity / texture / dehaze) compares each pixel with a
    // blurred, tone-mapped luminance grid sampled bilinearly.
    let grid: Float32Array | null = null
    let gw = 0, gh = 0, cell = 1
    if (local) {
      cell = Math.max(2, Math.round(Math.max(width, height) / 160))
      gw = Math.max(2, Math.ceil(width / cell)); gh = Math.max(2, Math.ceil(height / cell))
      const sum = new Float32Array(gw * gh), cnt = new Float32Array(gw * gh)
      for (let y = 0; y < height; y += 2) {
        const row = ((y / cell) | 0) * gw
        for (let x = 0; x < width; x += 2) {
          const i = (y * width + x) * 4
          const l = 0.2126 * toLin[data[i]] * wr + 0.7152 * toLin[data[i + 1]] * wg + 0.0722 * toLin[data[i + 2]] * wb
          const k = row + ((x / cell) | 0)
          sum[k] += l; cnt[k]++
        }
      }
      grid = new Float32Array(gw * gh)
      for (let k = 0; k < grid.length; k++) grid[k] = lutM[(encode(cnt[k] ? sum[k] / cnt[k] : 0) * toneScale) | 0]
      boxBlur(grid, gw, gh, 2)
      boxBlur(grid, gw, gh, 2)
    }
    const cx = width / 2, cy = height / 2
    const ax = round > 0 ? 1 / (cx + (Math.max(cx, cy) - cx) * round) : 1 / cx
    const ay = round > 0 ? 1 / (cy + (Math.max(cx, cy) - cy) * round) : 1 / cy
    const grainCell = Math.max(1, ((1 + dev.grainSize / 18) * Math.max(width, height)) / 2400)

    for (let y = 0; y < height; y++) {
      const gy = grid ? Math.min(gh - 1.001, Math.max(0, y / cell - 0.5)) : 0
      const gy0 = gy | 0, fy = gy - gy0
      const ny = (y - cy) * ay
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        let r = lutR[(encode(toLin[data[i]] * wr) * toneScale) | 0]
        let g = lutG[(encode(toLin[data[i + 1]] * wg) * toneScale) | 0]
        let b = lutB[(encode(toLin[data[i + 2]] * wb) * toneScale) | 0]
        let Y = 0.2126 * r + 0.7152 * g + 0.0722 * b

        if (grid) {
          const gx = Math.min(gw - 1.001, Math.max(0, x / cell - 0.5))
          const gx0 = gx | 0, fx = gx - gx0, k = gy0 * gw + gx0
          const blur = (grid[k] * (1 - fx) + grid[k + 1] * fx) * (1 - fy) + (grid[k + gw] * (1 - fx) + grid[k + gw + 1] * fx) * fy
          const detail = Y - blur
          const mask = Y <= 0 || Y >= 1 ? 0 : 4 * Y * (1 - Y)
          let dY = detail * (clarity * 1.1 + texture * 0.5) * mask + detail * dz * 0.7
          if (dz > 0) dY -= dz * 0.06 * (1 - Y)
          else if (dz < 0) dY += (0.75 - Y) * -dz * 0.35
          r += dY; g += dY; b += dY; Y += dY
        }

        if (doSat) {
          const mx = r > g ? (r > b ? r : b) : g > b ? g : b
          const mn = r < g ? (r < b ? r : b) : g < b ? g : b
          const s = mx - mn
          const f = satF * (1 + vib * (vib > 0 ? (1 - Math.min(1, s * 1.5)) ** 2 : 1))
          r = Y + (r - Y) * f; g = Y + (g - Y) * f; b = Y + (b - Y) * f
        }

        if (hslActive || dev.gray) {
          r = r < 0 ? 0 : r > 1 ? 1 : r; g = g < 0 ? 0 : g > 1 ? 1 : g; b = b < 0 ? 0 : b > 1 ? 1 : b
          const mx = r > g ? (r > b ? r : b) : g > b ? g : b
          const mn = r < g ? (r < b ? r : b) : g < b ? g : b
          const c = mx - mn
          let h = 0
          if (c > 1e-5) {
            if (mx === r) h = ((g - b) / c) % 6
            else if (mx === g) h = (b - r) / c + 2
            else h = (r - g) / c + 4
            h *= 60
            if (h < 0) h += 360
          }
          const hi = h | 0
          const sv = mx > 0 ? c / mx : 0
          if (dev.gray) {
            const yy = 0.2126 * r + 0.7152 * g + 0.0722 * b
            const gray = yy * (1 + (grayT[hi] / 100) * 0.9 * sv)
            r = g = b = gray
          } else if (c > 1e-5) {
            const nh = (h + (hueT[hi] / 100) * 30 + 360) % 360
            const ns = clamp(sv * (1 + satT[hi] / 100), 0, 1)
            const nv = mx * (1 + (lumT[hi] / 100) * 0.45 * sv)
            const [hr, hg, hb] = hueRgb(nh)
            r = nv * (1 - ns + ns * hr); g = nv * (1 - ns + ns * hg); b = nv * (1 - ns + ns * hb)
          }
          Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
        }

        if (gradeActive) {
          const tb = clamp(Y - balance * 0.25, 0, 1)
          const ws = (1 - tb) * (1 - tb), wh = tb * tb, wm = 2 * tb * (1 - tb)
          for (let z = 0; z < 4; z++) {
            const wz = z === 0 ? ws : z === 1 ? wm : z === 2 ? wh : 1
            const v = gc[z]
            const dl = gl[z] * wz
            r += (v[0] * wz + dl); g += (v[1] * wz + dl); b += (v[2] * wz + dl)
          }
        }

        if (vig !== 0) {
          const nx = (x - cx) * ax
          const d = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2
          const w = smooth(vigR0 - vigW / 2, vigR0 + vigW / 2, d) * Math.abs(vig) * 0.9
          if (vig < 0) { r *= 1 - w; g *= 1 - w; b *= 1 - w }
          else { r += (1 - r) * w; g += (1 - g) * w; b += (1 - b) * w }
        }

        if (grain !== 0) {
          const n = valueNoise(x / grainCell, y / grainCell) - 0.5
          const yy = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b, 0, 1)
          const a = n * grain * 0.22 * (0.35 + 2.6 * yy * (1 - yy))
          r += a; g += a; b += a
        }

        data[i] = r * 255
        data[i + 1] = g * 255
        data[i + 2] = b * 255
      }
    }
  }
}

function boxBlur(a: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(a.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++ } }
      tmp[y * w + x] = s / n
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++ } }
      a[y * w + x] = s / n
    }
  }
}

function hash(x: number, y: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function valueNoise(x: number, y: number) {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = x - x0, fy = y - y0
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1)
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy
}

/** Everything needed to render one photo: resolved, scaled and (optionally) adapted. */
export interface ApplyOptions { amount: number; adaptive: boolean; strength: number }

export function devFor(preset: Preset, options: ApplyOptions, stats: ImageStats | null) {
  const base = scaleDev(resolveDev(preset.settings), options.amount / 100)
  if (!options.adaptive || !stats) return { dev: base, changes: [] as AdaptiveChange[] }
  return adaptDev(base, stats, options.strength / 100)
}
