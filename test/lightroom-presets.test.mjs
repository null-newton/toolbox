import assert from 'node:assert/strict'
import test from 'node:test'
import { adaptDev, analyzePixels, createRenderer, devFor, neutralDev, resolveDev } from '../src/utilities/lightroom-presets/develop.ts'
import { createZip, parseLrtemplate, parsePresetFile, parseXmp, presetToXmp, readZip } from '../src/utilities/lightroom-presets/formats.ts'

const XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
 <rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:PresetType="Normal" crs:UUID="ABC" crs:Version="15.0" crs:ProcessVersion="11.0"
   crs:Exposure2012="+0.50" crs:Contrast2012="-12" crs:HueAdjustmentRed="+8" crs:ConvertToGrayscale="False" crs:Sharpness="40">
   <crs:Name><rdf:Alt><rdf:li xml:lang="x-default">Sunny &amp; Warm</rdf:li></rdf:Alt></crs:Name>
   <crs:Group><rdf:Alt><rdf:li xml:lang="x-default">Pack</rdf:li></rdf:Alt></crs:Group>
   <crs:ToneCurvePV2012><rdf:Seq><rdf:li>0, 20</rdf:li><rdf:li>255, 240</rdf:li></rdf:Seq></crs:ToneCurvePV2012>
   <crs:Look><rdf:Description crs:Name="Adobe Color" crs:Amount="1"><crs:Group><rdf:Alt><rdf:li>Profiles</rdf:li></rdf:Alt></crs:Group></rdf:Description></crs:Look>
 </rdf:Description></rdf:RDF></x:xmpmeta>`

const LRT = `s = {
	id = "1234",
	internalName = "Old Classic",
	title = ZSTR "$$$/AgNamedPresets/Old=Old Classic",
	type = "Develop",
	value = {
		settings = {
			Exposure2012 = -0.3,
			Shadows2012 = 25,
			ConvertToGrayscale = true,
			ToneCurvePV2012 = { 0, 0, 128, 140, 255, 255, },
			LensProfileSetup = "LensDefaults",
		},
		uuid = "abcd",
	},
	version = 0,
}`

test('parses Lightroom XMP presets, ignoring profile looks', () => {
  const p = parseXmp(XMP, 'file')
  assert.equal(p.name, 'Sunny & Warm')
  assert.equal(p.group, 'Pack')
  assert.equal(p.settings.Exposure2012, 0.5)
  assert.equal(p.settings.Contrast2012, -12)
  assert.equal(p.settings.ConvertToGrayscale, false)
  assert.deepEqual(p.settings.ToneCurvePV2012, [0, 20, 255, 240])
  assert.equal(p.settings.Name, undefined)
  assert.ok(p.ignored.includes('Profile / Look'))
  assert.ok(p.ignored.includes('Sharpening'))
})

test('parses legacy .lrtemplate presets', () => {
  const p = parseLrtemplate(LRT, 'file')
  assert.equal(p.name, 'Old Classic')
  assert.equal(p.settings.Exposure2012, -0.3)
  assert.equal(p.settings.ConvertToGrayscale, true)
  assert.deepEqual(p.settings.ToneCurvePV2012, [0, 0, 128, 140, 255, 255])
  assert.deepEqual(p.ignored, [])
})

test('XMP export round-trips', () => {
  const p = parseXmp(XMP, 'file')
  const back = parseXmp(presetToXmp({ id: 'x', name: p.name, group: p.group, settings: p.settings }), 'y')
  assert.equal(back.name, 'Sunny & Warm')
  assert.deepEqual(back.settings, p.settings)
})

test('zip write/read round-trips and expands preset packs', async () => {
  const enc = new TextEncoder()
  const zip = createZip([{ name: 'Pack/a.xmp', data: enc.encode(XMP) }, { name: 'Pack/b.lrtemplate', data: enc.encode(LRT) }, { name: 'readme.txt', data: enc.encode('hi') }])
  assert.equal((await readZip(zip.buffer)).length, 3)
  const { presets, failed } = await parsePresetFile('pack.zip', zip.buffer)
  assert.deepEqual(presets.map((p) => p.name), ['Sunny & Warm', 'Old Classic'])
  assert.equal(presets[1].group, 'Pack')
  assert.deepEqual(failed, [])
})

const solid = (v, n = 64) => { const d = new Uint8ClampedArray(n * n * 4); for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255 } return d }

test('neutral settings leave pixels unchanged', () => {
  const d = new Uint8ClampedArray(32 * 32 * 4)
  for (let i = 0; i < d.length; i++) d[i] = (i * 37) % 256
  for (let i = 3; i < d.length; i += 4) d[i] = 255
  const before = d.slice()
  createRenderer(neutralDev())(d, 32, 32)
  let maxDiff = 0
  for (let i = 0; i < d.length; i++) maxDiff = Math.max(maxDiff, Math.abs(d[i] - before[i]))
  assert.ok(maxDiff <= 1, `max diff ${maxDiff}`)
})

test('exposure brightens and grayscale removes colour', () => {
  const d = solid(100)
  createRenderer(resolveDev({ Exposure2012: 1 }))(d, 64, 64)
  assert.ok(d[0] > 125)
  const c = new Uint8ClampedArray([200, 50, 50, 255])
  createRenderer(resolveDev({ ConvertToGrayscale: true }))(c, 1, 1)
  assert.equal(c[0], c[1]); assert.equal(c[1], c[2])
})

test('scene analysis and adaptive tweaks', () => {
  const dark = analyzePixels(solid(25))
  const bright = analyzePixels(solid(235))
  assert.equal(dark.scene, 'dark')
  assert.equal(bright.scene, 'bright')
  const base = resolveDev({ Exposure2012: 0.5, Blacks2012: -30, Whites2012: 30 })
  const a = adaptDev(base, dark, 1)
  assert.ok(a.dev.exposure > base.exposure)
  assert.ok(a.dev.shadows > 0)
  assert.ok(a.dev.blacks > base.blacks)
  const b = adaptDev(base, bright, 1)
  assert.ok(b.dev.exposure < base.exposure)
  assert.ok(b.dev.highlights < 0)
  assert.ok(b.dev.whites < base.whites)
  const off = devFor({ settings: { Exposure2012: 0.5 } }, { amount: 100, adaptive: false, strength: 100 }, dark)
  assert.equal(off.dev.exposure, 0.5)
  assert.equal(devFor({ settings: { Exposure2012: 0.5 } }, { amount: 50, adaptive: false, strength: 0 }, null).dev.exposure, 0.25)
})

test('per-photo tools, preset codes and baking edits into presets', async () => {
  const { applyTools, bakeEdit, editDev, presetCode } = await import('../src/utilities/lightroom-presets/develop.ts')
  assert.equal(presetCode('Warm Film'), 'WF')
  assert.equal(presetCode('Moody Matte 2'), 'MM2')
  assert.equal(presetCode('Punch'), 'PU')
  assert.equal(applyTools(neutralDev(), { Exposure2012: 0.5, Contrast2012: 10 }).exposure, 0.5)
  const preset = { id: 'p', name: 'P', group: '', settings: { Exposure2012: 0.4, Contrast2012: 20, Temperature: 6500 }, ignored: [], createdAt: 0, updatedAt: 0 }
  const edit = { presetId: 'p', amount: 50, adaptive: false, strength: 0, tools: { Exposure2012: 0.3, IncrementalTemperature: 5 } }
  const { dev } = editDev(edit, preset, null)
  assert.ok(Math.abs(dev.exposure - 0.5) < 1e-9)
  assert.equal(dev.contrast, 10)
  const baked = bakeEdit(edit, preset)
  assert.equal(baked.Exposure2012, 0.5)
  assert.equal(baked.Contrast2012, 10)
  assert.equal(baked.Temperature, undefined)
  assert.ok(typeof baked.IncrementalTemperature === 'number' && baked.IncrementalTemperature > 5)
})
