// Presets are the only thing this tool keeps. Signed in, they're saved to the
// account (utility_configs, see LightroomPresets.tsx); signed out, they live in
// this browser's localStorage. Photos stay in memory and are never uploaded.
import type { Preset, Settings } from './develop.ts'

const KEY = 'toolbox:lightroom-presets:v1'

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`

const make = (name: string, settings: Settings): Preset => {
  const now = Date.now()
  return { id: newId(), name, group: 'Starter', settings: { ProcessVersion: '11.0', ...settings }, ignored: [], createdAt: now, updatedAt: now }
}

export function starterPresets(): Preset[] {
  return [
    make('Warm Film', {
      Exposure2012: 0.1, Contrast2012: -10, Highlights2012: -35, Shadows2012: 25, Whites2012: -10, Blacks2012: 12, IncrementalTemperature: 12, IncrementalTint: 4,
      Vibrance: 10, Saturation: -8, Clarity2012: -5, ParametricShadows: 18, ParametricHighlights: -10, SplitToningShadowHue: 200, SplitToningShadowSaturation: 12,
      SplitToningHighlightHue: 40, SplitToningHighlightSaturation: 18, GrainAmount: 18, GrainSize: 25, PostCropVignetteAmount: -12,
      ToneCurvePV2012: [0, 22, 64, 66, 128, 132, 192, 196, 255, 245],
    }),
    make('Moody Matte', {
      Exposure2012: -0.25, Contrast2012: 15, Highlights2012: -50, Shadows2012: 10, Blacks2012: 20, Clarity2012: 12, Dehaze: 6, Vibrance: -10, Saturation: -15,
      SaturationAdjustmentOrange: -10, SaturationAdjustmentGreen: -40, HueAdjustmentGreen: 25, LuminanceAdjustmentBlue: -15, SplitToningShadowHue: 210,
      SplitToningShadowSaturation: 18, ColorGradeMidtoneHue: 30, ColorGradeMidtoneSat: 6, PostCropVignetteAmount: -22,
      ToneCurvePV2012: [0, 38, 70, 64, 190, 198, 255, 238],
    }),
    make('Bright & Airy', {
      Exposure2012: 0.45, Contrast2012: -18, Highlights2012: -30, Shadows2012: 40, Whites2012: 18, Blacks2012: 10, IncrementalTemperature: 4, Vibrance: 12,
      Saturation: -6, Clarity2012: -8, SaturationAdjustmentOrange: -6, LuminanceAdjustmentOrange: 10, LuminanceAdjustmentBlue: 12, SaturationAdjustmentGreen: -15,
    }),
    make('Crisp B&W', {
      ConvertToGrayscale: true, Contrast2012: 30, Highlights2012: -20, Shadows2012: 15, Whites2012: 15, Blacks2012: -15, Clarity2012: 20, GrayMixerRed: 10,
      GrayMixerOrange: 15, GrayMixerBlue: -20, GrainAmount: 12, PostCropVignetteAmount: -15,
    }),
  ]
}

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return starterPresets()
    const parsed = JSON.parse(raw) as Preset[]
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.id === 'string' && p.settings) : []
  } catch {
    return starterPresets()
  }
}

export function savePresets(presets: Preset[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(presets))
    return true
  } catch {
    return false
  }
}
