// Lightroom preset file formats: .xmp (Lightroom Classic 7.3+/CC, Camera Raw)
// and legacy .lrtemplate, plus a minimal ZIP reader/writer for preset packs
// and batch exports. Pure TS (regex XML, no DOMParser) so it's testable in node.
import type { Preset, SettingValue, Settings } from './develop.ts'

const META_KEYS = new Set([
  'PresetType', 'Cluster', 'UUID', 'SupportsAmount', 'SupportsAmount2', 'SupportsColor', 'SupportsMonochrome', 'SupportsHighDynamicRange',
  'SupportsNormalDynamicRange', 'SupportsSceneReferred', 'SupportsOutputReferred', 'RequiresRGBTables', 'CameraModelRestriction',
  'Copyright', 'ContactInfo', 'Version', 'HasSettings', 'Name', 'ShortName', 'SortName', 'Group', 'Description', 'AlreadyApplied',
])

/** Preset features this tool can't reproduce, keyed by a name prefix/exact key. */
const UNSUPPORTED: [RegExp, string][] = [
  [/^(Look|CameraProfile|RGBTable|Table_)/, 'Profile / Look'],
  [/BasedCorrections$|^MaskGroup|^RetouchInfo|^RedEyeInfo/, 'Masks & local adjustments'],
  [/^(Sharpness|SharpenRadius|SharpenDetail|SharpenEdgeMasking)$/, 'Sharpening'],
  [/^(LuminanceSmoothing|ColorNoiseReduction|LuminanceNoiseReduction)/, 'Noise reduction'],
  [/^(LensProfile|LensManual|AutoLateralCA|VignetteAmount|DefringePurple|DefringeGreen|Distortion)/, 'Lens corrections'],
  [/^(Perspective|UprightTransform|CropAngle|CropTop|CropLeft|CropBottom|CropRight|HasCrop)/, 'Crop & transform'],
  [/^(RedHue|RedSaturation|GreenHue|GreenSaturation|BlueHue|BlueSaturation|ShadowTint)$/, 'Calibration'],
]

const NEUTRAL_VALUES = new Set([0, false, 'False', '0', '', 'Default'])

export function ignoredFeatures(settings: Settings, extra: string[] = []): string[] {
  const out = new Set<string>()
  for (const name of extra) {
    const hit = UNSUPPORTED.find(([re]) => re.test(name))
    if (hit) out.add(hit[1])
  }
  for (const [key, value] of Object.entries(settings)) {
    const hit = UNSUPPORTED.find(([re]) => re.test(key))
    if (!hit) continue
    if (NEUTRAL_VALUES.has(value as never)) continue
    if (/^(LensProfileSetup|LensProfileName|CameraProfile)$/.test(key) && /^(LensDefaults|Adobe Standard|Default)$/.test(String(value))) continue
    out.add(hit[1])
  }
  return [...out]
}

const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase()
    if (k === 'amp') return '&'
    if (k === 'lt') return '<'
    if (k === 'gt') return '>'
    if (k === 'quot') return '"'
    if (k === 'apos') return "'"
    return String.fromCodePoint(k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10))
  })

const encodeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function typed(raw: string): SettingValue {
  if (raw === 'True') return true
  if (raw === 'False') return false
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw.trim())) return Number(raw)
  return raw
}

export interface ParsedPreset { name: string; group: string; settings: Settings; ignored: string[] }

export function parseXmp(text: string, fallbackName: string): ParsedPreset {
  if (!/camera-raw-settings/.test(text) && !/crs:/.test(text)) throw new Error('not-a-preset')
  const settings: Settings = {}
  const strings: Record<string, string> = {}
  const dropped: string[] = []

  // Element-form values first (outermost first, so nested Look/mask blocks are swallowed whole).
  let rest = text.replace(/<crs:([A-Za-z0-9_]+)>([\s\S]*?)<\/crs:\1>/g, (_, key: string, inner: string) => {
    const lis = [...inner.matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/g)].map((m) => decodeXml(m[1].trim()))
    if (/<rdf:Description|<crs:/.test(inner)) {
      dropped.push(key)
    } else if (/^ToneCurve/.test(key) && lis.length) {
      const pts = lis.flatMap((li) => li.split(/\s*,\s*/).map(Number))
      if (pts.every(Number.isFinite)) settings[key] = pts
    } else if (/<rdf:Alt/.test(inner) && lis.length) {
      strings[key] = lis[0]
    } else if (!/</.test(inner)) {
      if (META_KEYS.has(key)) strings[key] = decodeXml(inner.trim())
      else settings[key] = typed(decodeXml(inner.trim()))
    } else {
      dropped.push(key)
    }
    return ''
  })
  // Self-closing nested blocks like <crs:Look rdf:parseType="Resource"/> are rare; strip any remaining crs elements.
  rest = rest.replace(/<crs:[A-Za-z0-9_]+[^>]*\/>/g, (m) => { dropped.push(m.slice(5).split(/[\s/>]/)[0]); return '' })

  for (const m of rest.matchAll(/\bcrs:([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/g)) {
    const [, key, raw] = m
    const value = decodeXml(raw)
    if (META_KEYS.has(key)) strings[key] = value
    else settings[key] = typed(value)
  }
  if (!Object.keys(settings).length) throw new Error('not-a-preset')
  return {
    name: strings.Name || fallbackName,
    group: strings.Group || '',
    settings,
    ignored: ignoredFeatures(settings, dropped),
  }
}

// ───────── .lrtemplate (a Lua table literal) ─────────

type Lua = string | number | boolean | Lua[] | { [k: string]: Lua }

function parseLua(src: string): Lua {
  let i = 0
  const ws = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++
      if (src.startsWith('--', i)) { while (i < src.length && src[i] !== '\n') i++; continue }
      break
    }
  }
  const str = (): string => {
    const q = src[i++]
    let out = ''
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') {
        const c = src[++i]
        out += c === 'n' ? '\n' : c === 't' ? '\t' : c
        i++
      } else out += src[i++]
    }
    i++
    return out
  }
  const value = (): Lua => {
    ws()
    const c = src[i]
    if (c === '{') {
      i++
      const obj: Record<string, Lua> = {}
      const arr: Lua[] = []
      for (;;) {
        ws()
        if (src[i] === '}') { i++; break }
        let key: string | null = null
        const save = i
        if (src[i] === '[') {
          i++
          const k = value()
          ws(); i++ // ]
          ws()
          if (src[i] === '=') { i++; key = String(k) } else i = save
        } else {
          const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 200))
          if (m) {
            const after = i + m[0].length
            let j = after
            while (/\s/.test(src[j] ?? '')) j++
            if (src[j] === '=' && src[j + 1] !== '=') { key = m[0]; i = j + 1 }
          }
        }
        const v = value()
        if (key !== null) obj[key] = v
        else arr.push(v)
        ws()
        if (src[i] === ',' || src[i] === ';') i++
      }
      return Object.keys(obj).length ? obj : arr
    }
    if (c === '"' || c === "'") return str()
    if (src.startsWith('ZSTR', i)) { i += 4; ws(); return value() }
    if (src.startsWith('true', i)) { i += 4; return true }
    if (src.startsWith('false', i)) { i += 5; return false }
    if (src.startsWith('nil', i)) { i += 3; return '' }
    const m = /^-?(\d+\.?\d*(e[+-]?\d+)?|\.\d+)/i.exec(src.slice(i, i + 40))
    if (m) { i += m[0].length; return Number(m[0]) }
    throw new Error('lua-parse')
  }
  const start = src.indexOf('{')
  if (start < 0) throw new Error('lua-parse')
  i = start
  return value()
}

const zstr = (s: string) => s.replace(/^\$\$\$\/[^=]*=/, '')

export function parseLrtemplate(text: string, fallbackName: string): ParsedPreset {
  const root = parseLua(text)
  if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('not-a-preset')
  const value = root.value as Record<string, Lua> | undefined
  const raw = (value?.settings ?? root.settings) as Record<string, Lua> | undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not-a-preset')
  const settings: Settings = {}
  const dropped: string[] = []
  for (const [key, v] of Object.entries(raw)) {
    if (typeof v === 'number' || typeof v === 'boolean') settings[key] = v
    else if (typeof v === 'string') settings[key] = typed(v)
    else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) settings[key] = v as number[]
    else dropped.push(key)
  }
  const title = typeof root.title === 'string' ? zstr(root.title) : ''
  const name = (typeof root.internalName === 'string' && root.internalName) || title || fallbackName
  return { name, group: '', settings, ignored: ignoredFeatures(settings, dropped) }
}

// ───────── XMP export ─────────

function formatValue(key: string, value: number): string {
  if (/^Exposure/.test(key)) return (value > 0 ? '+' : '') + value.toFixed(2)
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(2))
  if (/^(Temperature|ParametricShadowSplit|ParametricMidtoneSplit|ParametricHighlightSplit|.*Hue|PostCropVignetteMidpoint|PostCropVignetteFeather|GrainSize|GrainFrequency|ColorGradeBlending)$/.test(key) || /SplitToning.*Hue/.test(key)) {
    return String(rounded)
  }
  return (rounded > 0 ? '+' : '') + rounded
}

const altBlock = (key: string, value: string) =>
  `   <crs:${key}>\n    <rdf:Alt>\n     <rdf:li xml:lang="x-default">${encodeXml(value)}</rdf:li>\n    </rdf:Alt>\n   </crs:${key}>\n`

export function presetToXmp(preset: Pick<Preset, 'id' | 'name' | 'group' | 'settings'>): string {
  const attrs: string[] = []
  const seqs: string[] = []
  const entries = Object.entries(preset.settings).filter(([k]) => !META_KEYS.has(k)).sort(([a], [b]) => a.localeCompare(b))
  const hasProcess = entries.some(([k]) => k === 'ProcessVersion')
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      const lis = []
      for (let i = 0; i + 1 < value.length; i += 2) lis.push(`     <rdf:li>${Math.round(value[i])}, ${Math.round(value[i + 1])}</rdf:li>`)
      seqs.push(`   <crs:${key}>\n    <rdf:Seq>\n${lis.join('\n')}\n    </rdf:Seq>\n   </crs:${key}>\n`)
    } else if (typeof value === 'boolean') attrs.push(`crs:${key}="${value ? 'True' : 'False'}"`)
    else if (typeof value === 'number') attrs.push(`crs:${key}="${formatValue(key, value)}"`)
    else attrs.push(`crs:${key}="${encodeXml(value)}"`)
  }
  const uuid = preset.id.replace(/[^0-9a-f]/gi, '').toUpperCase().padEnd(32, '0').slice(0, 32)
  const head = [
    'crs:PresetType="Normal"', 'crs:Cluster=""', `crs:UUID="${uuid}"`, 'crs:SupportsAmount2="True"', 'crs:SupportsAmount="True"',
    'crs:SupportsColor="True"', 'crs:SupportsMonochrome="True"', 'crs:SupportsHighDynamicRange="True"', 'crs:SupportsNormalDynamicRange="True"',
    'crs:SupportsSceneReferred="True"', 'crs:SupportsOutputReferred="True"', 'crs:CameraModelRestriction=""', 'crs:Copyright=""', 'crs:ContactInfo=""',
    'crs:Version="15.0"', ...(hasProcess ? [] : ['crs:ProcessVersion="11.0"']),
  ]
  const all = [...head, ...attrs, 'crs:HasSettings="True"'].map((a) => `   ${a}`).join('\n')
  return `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        ">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
${all}>
${altBlock('Name', preset.name)}${altBlock('ShortName', '')}${altBlock('SortName', '')}${altBlock('Group', preset.group || 'Toolbox')}${altBlock('Description', '')}${seqs.join('')}  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`
}

export const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'preset'

// ───────── ZIP ─────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Store-only ZIP (photos are already compressed; presets are tiny). */
export function createZip(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const used = new Set<string>()
  for (const file of files) {
    let name = file.name
    for (let n = 2; used.has(name.toLowerCase()); n++) name = file.name.replace(/(\.[^.]*)?$/, (ext) => ` (${n})${ext}`)
    used.add(name.toLowerCase())
    const nameBytes = enc.encode(name)
    const crc = crc32(file.data)
    const size = file.data.length
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true)
    lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true); lv.setUint32(22, size, true); lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true); cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true); cv.setUint32(24, size, true); cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    locals.push(local, file.data)
    centrals.push(central)
    offset += local.length + size
  }
  const cdSize = centrals.reduce((a, c) => a + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true)
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + cdSize + 22)
  let p = 0
  for (const part of [...locals, ...centrals, end]) { out.set(part, p); p += part.length }
  return out
}

/** Reads a ZIP (stored or deflated entries), skipping folders and macOS metadata. */
export async function readZip(buffer: ArrayBuffer): Promise<{ name: string; data: Uint8Array }[]> {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('bad-zip')
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const dec = new TextDecoder()
  const out: { name: string; data: Uint8Array }[] = []
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/') || name.includes('__MACOSX/') || /(^|\/)\._/.test(name)) continue
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const raw = bytes.subarray(start, start + compSize)
    if (method === 0) out.push({ name, data: raw.slice() })
    else if (method === 8) {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      out.push({ name, data: new Uint8Array(await new Response(stream).arrayBuffer()) })
    }
  }
  return out
}

/** Parse any supported preset file (zip packs expand to several presets). */
export async function parsePresetFile(name: string, buffer: ArrayBuffer): Promise<{ presets: ParsedPreset[]; failed: string[] }> {
  const lower = name.toLowerCase()
  const base = (n: string) => n.split('/').pop()!.replace(/\.[^.]+$/, '')
  const parseText = (n: string, text: string): ParsedPreset => {
    if (n.toLowerCase().endsWith('.lrtemplate')) return parseLrtemplate(text, base(n))
    return parseXmp(text, base(n))
  }
  if (lower.endsWith('.zip')) {
    const entries = await readZip(buffer)
    const presets: ParsedPreset[] = []
    const failed: string[] = []
    for (const entry of entries) {
      if (!/\.(xmp|lrtemplate)$/i.test(entry.name)) continue
      try {
        const parsed = parseText(entry.name, new TextDecoder().decode(entry.data))
        const folder = entry.name.split('/').slice(-2, -1)[0]
        if (!parsed.group && folder) parsed.group = folder
        presets.push(parsed)
      } catch { failed.push(entry.name) }
    }
    return { presets, failed }
  }
  try {
    return { presets: [parseText(name, new TextDecoder().decode(buffer))], failed: [] }
  } catch {
    return { presets: [], failed: [name] }
  }
}
