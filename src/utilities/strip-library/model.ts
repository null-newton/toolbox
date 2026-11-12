/** One edition as returned by the backend `strip-library` lookup. */
export interface Edition {
  title: string
  series: string | null
  issueNumber: string | null
  year: number | null
  image: string | null
  url: string | null
  details: Record<string, string>
}

export interface LookupResult {
  isbn: string
  /** True when `match` carries the scanned barcode/ISBN itself. */
  exact: boolean
  match: Edition
  editions: Edition[]
}

/** An album saved in the user's library (stored in utility_configs). */
export interface Album {
  id: string
  isbn: string
  title: string
  series: string | null
  issueNumber: string | null
  year: number | null
  image: string | null
  url: string | null
  /** A few useful rows from stripinfo's details table. */
  writer?: string
  artist?: string
  publisher?: string
  cover?: string
  pages?: string
  read: boolean
  addedAt: string
}

export type SortKey = 'series' | 'added' | 'title' | 'year'

export interface StripLibraryConfig extends Record<string, unknown> {
  albums: Album[]
  sort: SortKey
}

export const DEFAULTS: StripLibraryConfig = { albums: [], sort: 'series' }

/** Same normalization as the backend: digits (and a trailing X), no dashes. */
export function normalizeIsbn(raw: string): string | null {
  const value = raw.replace(/[\s-]/g, '').toUpperCase()
  return /^(?:\d{9}[\dX]|\d{12,13}|\d{8})$/.test(value) ? value : null
}

const pick = (details: Record<string, string>, ...keys: string[]) => {
  for (const key of keys) if (details[key] && details[key] !== 'geen') return details[key]
  return undefined
}

export function albumFromEdition(edition: Edition, isbn: string): Album {
  const d = edition.details
  return {
    id: crypto.randomUUID(),
    isbn,
    title: edition.title,
    series: edition.series,
    issueNumber: edition.issueNumber,
    year: edition.year,
    image: edition.image,
    url: edition.url,
    writer: pick(d, 'Scenario'),
    artist: pick(d, 'Tekeningen'),
    publisher: pick(d, 'Uitgever(s)', 'Uitgever'),
    cover: pick(d, 'Kaft'),
    pages: pick(d, "Pagina's"),
    read: false,
    addedAt: new Date().toISOString(),
  }
}

/** The barcode/ISBN printed on this edition, if any. */
export function editionCode(edition: Edition): string | null {
  return normalizeIsbn(edition.details.Barcode ?? '') ?? normalizeIsbn(edition.details.ISBN ?? '')
}

export const sameEdition = (album: Album, edition: Edition) =>
  edition.url ? album.url === edition.url : album.title === edition.title && album.year === edition.year

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function sortAlbums(albums: Album[], sort: SortKey): Album[] {
  const list = [...albums]
  switch (sort) {
    case 'added':
      return list.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    case 'title':
      return list.sort((a, b) => collator.compare(a.title, b.title))
    case 'year':
      return list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || collator.compare(a.title, b.title))
    default:
      return list.sort((a, b) =>
        collator.compare(a.series ?? '￿', b.series ?? '￿') ||
        collator.compare(a.issueNumber ?? '', b.issueNumber ?? '') ||
        collator.compare(a.title, b.title))
  }
}

export function matchesQuery(album: Album, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [album.title, album.series, album.issueNumber, album.writer, album.artist, album.publisher, album.isbn]
    .some((value) => value?.toLowerCase().includes(q))
}
