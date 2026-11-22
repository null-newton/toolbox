import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { CityClock, CountdownCard } from './BoardView'
import { skins } from './strings'
import { decodeEmbed, useNow } from './time'

/**
 * Public, chrome-less board for <iframe> embeds on other sites
 * (#/embed/board?c=…). The whole board is encoded in `c`, so it needs no
 * account, database or network access, and works for logged-out visitors.
 */
export function BoardEmbed() {
  const { search } = useLocation()
  const data = useMemo(() => decodeEmbed(new URLSearchParams(search).get('c') ?? ''), [search])
  const now = useNow(1000)
  const rootRef = useRef<HTMLDivElement>(null)

  // Tell the host page how tall the board is, so it can size the iframe
  // (the tool's own preview uses this; other sites may ignore it).
  useEffect(() => {
    const el = rootRef.current
    if (!el || window.parent === window) return
    const post = () => window.parent.postMessage({ type: 'toolbox-board-height', height: Math.ceil(el.getBoundingClientRect().height) }, '*')
    const ro = new ResizeObserver(post)
    ro.observe(el)
    return () => ro.disconnect()
  }, [data])

  const transparent = data?.opts.transparent ?? false
  const theme = data?.opts.theme ?? 'dark'
  useEffect(() => {
    // The app paints body/html dark; embeds pick their own page background.
    const bg = transparent ? 'transparent' : theme === 'light' ? '#f8fafc' : '#071013'
    const prev = [document.documentElement.style.background, document.body.style.background, document.documentElement.style.colorScheme]
    document.documentElement.style.background = bg
    document.body.style.background = bg
    document.documentElement.style.colorScheme = transparent ? 'normal' : theme
    return () => {
      document.documentElement.style.background = prev[0]
      document.body.style.background = prev[1]
      document.documentElement.style.colorScheme = prev[2]
    }
  }, [theme, transparent])

  if (!data) return <p className="p-4 text-sm text-slate-400">This embed link is invalid.</p>

  const { board, opts } = data
  const s = skins[opts.theme]
  const props = { lang: opts.lang, hour12: board.hour12, skin: opts.theme, transparent: opts.transparent }

  return (
    <div ref={rootRef} className="p-4">
      {opts.title && <h1 className={`mb-3 text-lg font-bold ${s.text}`}>{opts.title}</h1>}
      {board.events.length > 0 && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {board.events.map((e) => <CountdownCard key={e.id} event={e} now={now} {...props} />)}
        </div>
      )}
      {board.cities.length > 0 && (
        <div className={`grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))] ${board.events.length ? 'mt-3' : ''}`}>
          {board.cities.map((c) => <CityClock key={c.id} city={c} at={now} {...props} />)}
        </div>
      )}
    </div>
  )
}
