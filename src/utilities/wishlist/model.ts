export type Availability = 'unknown' | 'in_stock' | 'out_of_stock' | 'preorder'
export type Sort = 'priority' | 'price' | 'date' | 'store' | 'availability'
export interface Collection { id: string; name: string; share_token: string | null }
export interface Item {
  id: string; title: string; url: string; price: number | null; currency: string
  availability: Availability; priority: number; tags: string[]; created_at: string; reserved?: boolean
}
export interface Draft { title: string; url: string; price: string; currency: string; availability: Availability; priority: number; tags: string }
export const emptyDraft: Draft = { title: '', url: '', price: '', currency: 'EUR', availability: 'unknown', priority: 2, tags: '' }
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export const availabilityValues: Availability[] = ['unknown', 'in_stock', 'out_of_stock', 'preorder']
export const sortValues: Sort[] = ['priority', 'price', 'date', 'store', 'availability']
export function normalizeUrl(value: string): string {
  if (value.length > 2048) throw new Error('invalid')
  const url = new URL(value.trim())
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.')) throw new Error('invalid')
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) if (/^(utm_.*|ref|ref_|tag|linkCode|psc|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key)
  if (/^(www\.)?bol\.com$/.test(url.hostname)) {
    url.searchParams.delete('cid')
    url.searchParams.delete('referrer')
  }
  // Amazon paths encode the same ASIN in several formats, often with a title.
  if (/^(www\.)?amazon\.(com|nl|de|fr|co\.uk|com\.be)$/.test(url.hostname)) {
    const asin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]
    if (asin) { url.pathname = `/dp/${asin.toUpperCase()}`; url.search = '' }
  }
  url.hostname = url.hostname.replace(/^www\./, '')
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
  url.searchParams.sort()
  return url.href
}
/** A wishlist is not a product, even though it is hosted by a supported shop. */
export function isWishlistUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    const host = url.hostname.replace(/^www\./, '')
    return (/^amazon\.(com|nl|de|fr|co\.uk|com\.be)$/.test(host) && /^\/(?:hz\/wishlist|gp\/registry\/wishlist)(?:\/|$)/i.test(url.pathname)) ||
      (host === 'bol.com' && /^\/(?:[a-z]{2}\/){0,2}(?:verlanglijstje|wishlist)(?:\/|$)/i.test(url.pathname))
  } catch { return false }
}

export type MetadataError = 'metadataBackend' | 'metadataAuth' | 'metadataRateLimit' | 'metadataBlocked' | 'metadataUnsupported' | 'metadataWishlist' | 'metadataFailed'
export function metadataError(status: number, code?: unknown): MetadataError {
  if (code === 'wishlist_url') return 'metadataWishlist'
  if (code === 'unsupported_shop') return 'metadataUnsupported'
  if (code === 'shop_blocked') return 'metadataBlocked'
  if (code === 'not_configured' || status === 404) return 'metadataBackend'
  if (status === 401) return 'metadataAuth'
  if (status === 429) return 'metadataRateLimit'
  return 'metadataFailed'
}

export function draftPayload(draft: Draft) {
  const tags = [...new Set(draft.tags.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean))]
  const price = draft.price.trim() === '' ? null : Number(draft.price.replace(',', '.'))
  const title = draft.title.trim()
  if (!title || title.length > 300 || tags.length > 20 || tags.join(',').length > 600 ||
    tags.some(tag => tag.length > 30) || !/^[A-Z]{3}$/.test(draft.currency) ||
    (price !== null && (!Number.isFinite(price) || price < 0 || price >= 1e10 || !/^\d+(?:[.,]\d{1,2})?$/.test(draft.price.trim()))) ||
    !availabilityValues.includes(draft.availability) || ![1, 2, 3].includes(draft.priority)) throw new Error('invalid')
  return { title, url: normalizeUrl(draft.url), price, currency: draft.currency, availability: draft.availability, priority: draft.priority, tags }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_response')
  return value as Record<string, unknown>
}
export function parseItems(value: unknown): Item[] {
  if (!Array.isArray(value)) throw new Error('invalid_response')
  return value.map(raw => {
    const row = object(raw)
    if (!uuid(row.id) || typeof row.title !== 'string' || typeof row.url !== 'string' ||
      typeof row.currency !== 'string' || typeof row.availability !== 'string' ||
      !availabilityValues.includes(row.availability as Availability) ||
      typeof row.priority !== 'number' || !Array.isArray(row.tags) || !row.tags.every(t => typeof t === 'string') ||
      typeof row.created_at !== 'string' || Number.isNaN(Date.parse(row.created_at)) ||
      (row.price !== null && typeof row.price !== 'number') || (row.reserved !== undefined && typeof row.reserved !== 'boolean')) throw new Error('invalid_response')
    const validated = draftPayload({ title: row.title, url: row.url, currency: row.currency, price: row.price === null ? '' : String(row.price), tags: row.tags.join(','), availability: row.availability as Availability, priority: row.priority })
    return { ...validated, id: row.id, created_at: row.created_at, reserved: row.reserved as boolean | undefined }
  })
}
export function parseCollections(value: unknown): Collection[] {
  if (!Array.isArray(value)) throw new Error('invalid_response')
  return value.map(raw => {
    const row = object(raw)
    if (!uuid(row.id) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 100 || (row.share_token !== null && !uuid(row.share_token))) throw new Error('invalid_response')
    return { id: row.id, name: row.name, share_token: row.share_token }
  })
}
export function visibleItems(items: Item[], sort: Sort, search: string, tag: string): Item[] {
  const query = search.trim().toLowerCase()
  return items.filter(item => (!tag || item.tags.includes(tag)) &&
    `${item.title} ${new URL(item.url).hostname} ${item.tags.join(' ')}`.toLowerCase().includes(query))
    .sort((a, b) => {
      if (sort === 'price') {
        if (a.price === null || b.price === null) return a.price === b.price ? 0 : a.price === null ? 1 : -1
        return a.currency.localeCompare(b.currency) || a.price - b.price
      }
      if (sort === 'store') return new URL(a.url).hostname.localeCompare(new URL(b.url).hostname)
      if (sort === 'availability') {
        const rank: Record<Availability, number> = { in_stock: 0, preorder: 1, unknown: 2, out_of_stock: 3 }
        return rank[a.availability] - rank[b.availability]
      }
      if (sort === 'priority') return a.priority - b.priority || b.created_at.localeCompare(a.created_at)
      return b.created_at.localeCompare(a.created_at)
    })
}
