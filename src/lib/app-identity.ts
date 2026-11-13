import { useEffect, type RefObject } from 'react'

export const BRAND_ICON = '<path d="M3 9h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z"/><path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"/><path d="M3 13h6m6 0h6"/><path d="M9 11v4m6-4v4"/>'
const BG = '#071013', TILE = '#0d181c', ACCENT = '#c8ff3d'

// Wraps 24×24 Lucide-style inner markup in the brand tile; `maskable` leaves the safe-zone padding Android needs.
export function tileSvg(inner: string, maskable = false) {
  const s = maskable ? 0.5 : 0.62, o = (1 - s) * 256
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="${maskable ? BG : TILE}"/>${maskable ? '' : `<rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="${ACCENT}" stroke-width="16"/>`}<g transform="translate(${o} ${o}) scale(${(512 * s) / 24})" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`
}

const svgUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`

function png(svg: string, size: number) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d')!.drawImage(img, 0, 0, size, size); resolve(c.toDataURL('image/png')) }
    img.onerror = reject
    img.src = svgUrl(svg)
  })
}

function link(rel: string, attrs: Record<string, string> = {}) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el) }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

function meta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el) }
  el.content = content
}

let manifestUrl = ''
// iOS (all WebKit) only reads the manifest present at page load, so it gets none and saves the page's own URL instead.
const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

// Gives the current page its own tab icon, title and installable PWA identity (one per tool).
export function useAppIdentity(id: string | null, name: string, description: string, iconRef: RefObject<HTMLElement | null>, search = '') {
  // Mirror the tool + its options into the real query (/?app=<id>&…) so a home-screen save reopens it even if the hash is dropped.
  const launch = id ? `/?${new URLSearchParams([['app', id], ...new URLSearchParams(search)])}` : '/'
  useEffect(() => { if (isIOS && location.pathname + location.search !== launch) history.replaceState(history.state, '', launch + location.hash) }, [launch])
  useEffect(() => {
    const svg = iconRef.current?.querySelector('svg')
    const inner = id && svg ? svg.innerHTML : BRAND_ICON
    const title = id ? `${name} · Toolbox` : 'Toolbox'
    document.title = title; meta('apple-mobile-web-app-title', id ? name : 'Toolbox'); meta('application-name', id ? name : 'Toolbox')
    const icon = tileSvg(inner)
    link('icon', { type: 'image/svg+xml', href: svgUrl(icon) })
    let cancelled = false
    void Promise.all([png(icon, 180), png(icon, 192), png(icon, 512), png(tileSvg(inner, true), 512)]).then(([apple, p192, p512, mask]) => {
      if (cancelled) return
      link('apple-touch-icon', { href: apple })
      const origin = location.origin, start = origin + launch
      const manifest = {
        id: id ? `/?app=${id}` : '/', name: title, short_name: id ? name : 'Toolbox', description, start_url: start, scope: `${origin}/`,
        display: 'standalone', background_color: BG, theme_color: BG,
        icons: [{ src: p192, sizes: '192x192', type: 'image/png' }, { src: p512, sizes: '512x512', type: 'image/png' }, { src: mask, sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
      }
      if (isIOS) return
      if (manifestUrl) URL.revokeObjectURL(manifestUrl)
      manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }))
      link('manifest', { href: manifestUrl })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [id, name, description, iconRef, launch])
}
