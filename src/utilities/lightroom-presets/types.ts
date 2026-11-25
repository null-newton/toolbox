import type { Edit, ImageStats } from './develop'

export interface Photo {
  id: string
  file: File
  name: string
  /** ~360px decoded copy for the grid, strip tiles and scene analysis. */
  thumb: ImageData
  stats: ImageStats
  /** Preset + strength + adaptive + per-photo tools; null when untouched. */
  edit: Edit | null
}
