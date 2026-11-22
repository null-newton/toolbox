/** Labels and colour skins shared by the board cards and the embed. */

export const BOARD_STR = {
  en: {
    days: 'days', hours: 'hrs', minutes: 'min', seconds: 'sec', ago: 'ago', now: 'Happening now', passed: 'Passed',
    same: 'Same time as you', ahead: 'ahead', behind: 'behind', yearly: 'Every year', today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday',
  },
  nl: {
    days: 'dagen', hours: 'uur', minutes: 'min', seconds: 'sec', ago: 'geleden', now: 'Nu bezig', passed: 'Voorbij',
    same: 'Zelfde tijd als jij', ahead: 'voor', behind: 'achter', yearly: 'Elk jaar', today: 'Vandaag', tomorrow: 'Morgen', yesterday: 'Gisteren',
  },
}

export type Skin = 'dark' | 'light'

export const skins = {
  dark: { card: 'border border-[#24373c] bg-[#0d181c]/95', text: 'text-white', muted: 'text-slate-400', faint: 'text-slate-500', accent: 'text-[#c8ff3d]', chip: 'bg-white/5 text-slate-300' },
  light: { card: 'border border-slate-200 bg-white shadow-sm', text: 'text-slate-900', muted: 'text-slate-600', faint: 'text-slate-400', accent: 'text-emerald-600', chip: 'bg-slate-100 text-slate-600' },
}
