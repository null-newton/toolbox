import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Film, Magnet, Maximize2, Redo2, Scissors, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { MIN_LEN, type AudioTrack, type Overlay, type PlacedClip, type VideoClip } from './types'
import { fmtTime, type T } from './strings'

export type Selection = { kind: 'clip' | 'overlay' | 'audio'; id: string } | null
type Edge = 'l' | 'r'
type Drag =
  | { mode: 'scrub' }
  | { mode: 'clip'; id: string; x0: number; t0: number; moved: boolean; slip: boolean; ts0: number; te0: number; insertAt: number | null; cur: number }
  | { mode: 'trim'; kind: 'clip' | 'overlay' | 'audio'; id: string; edge: Edge; t0: number; a: number; b: number; c: number }
  | { mode: 'move'; kind: 'overlay' | 'audio'; id: string; t0: number; start0: number; len: number }

const MAX_PPS = 400
const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800]
const ROW = 40, GAP = 6
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

// Greedy-pack time ranges into the fewest non-overlapping rows.
function pack<I extends { id: string }>(items: I[], range: (i: I) => [number, number]): Map<string, number> {
  const ends: number[] = [], rows = new Map<string, number>()
  for (const it of [...items].sort((a, b) => range(a)[0] - range(b)[0])) {
    const [s, e] = range(it); let r = ends.findIndex((x) => x <= s + 1e-6)
    if (r < 0) { r = ends.length; ends.push(e) } else ends[r] = e
    rows.set(it.id, r)
  }
  return rows
}

export interface TimelineProps {
  t: T; placed: PlacedClip[]; overlays: Overlay[]; audio: AudioTrack[]; total: number; rulerDuration: number; playhead: number; playing: boolean
  selection: Selection; zoom: number; setZoom: (z: number) => void; snap: boolean; setSnap: (v: boolean) => void; canUndo: boolean; canRedo: boolean
  onSeek: (t: number) => void; onSelect: (s: Selection) => void; onBegin: () => void; onUndo: () => void; onRedo: () => void; onSplit: () => void; onDelete: () => void
  onUpdateClip: (id: string, p: Partial<VideoClip>) => void; onUpdateOverlay: (id: string, p: Partial<Overlay>) => void; onUpdateAudio: (id: string, p: Partial<AudioTrack>) => void; onReorder: (id: string, to: number) => void
}

export function Timeline(props: TimelineProps) {
  const { t, placed, overlays, audio, rulerDuration, playhead, playing, selection, zoom, setZoom, snap, setSnap } = props
  const scrollRef = useRef<HTMLDivElement>(null), contentRef = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState(800)
  const [drag, setDrag] = useState<Drag | null>(null)
  const live = useRef(props)
  useLayoutEffect(() => { live.current = props })
  const anchor = useRef<{ t: number; x: number } | null>(null)
  const dragRef = useRef<Drag | null>(null)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewW(el.clientWidth)); ro.observe(el); setViewW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const fitPps = Math.max(1e-3, (viewW - 24) / rulerDuration), pps = Math.min(MAX_PPS, fitPps * zoom), ppsRef = useRef(pps)
  useLayoutEffect(() => { ppsRef.current = pps }, [pps])
  const width = Math.max(viewW, rulerDuration * pps + 24)
  const px = (s: number) => s * pps

  // Keep the anchored time under the cursor when zoom changes.
  useLayoutEffect(() => { const a = anchor.current, el = scrollRef.current; if (a && el) el.scrollLeft = a.t * pps - a.x; anchor.current = null }, [pps])
  const zoomAround = (z: number, clientX?: number) => {
    const el = scrollRef.current; if (!el) return
    const x = clientX === undefined ? el.clientWidth / 2 : clientX - el.getBoundingClientRect().left
    anchor.current = { t: (el.scrollLeft + x) / ppsRef.current, x }; setZoom(clamp(z, 1, MAX_PPS / fitPps))
  }
  const zoomRef = useRef(zoomAround)
  useLayoutEffect(() => { zoomRef.current = zoomAround })
  useEffect(() => {
    const el = scrollRef.current; if (!el) return
    const onWheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey && !e.altKey) return; e.preventDefault(); zoomRef.current(live.current.zoom * Math.exp(-e.deltaY * 0.0025), e.clientX) }
    el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel)
  }, [])
  // Follow the playhead while playing.
  useEffect(() => {
    const el = scrollRef.current; if (!el || !playing) return
    const x = playhead * pps; if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - 40
  }, [playhead, playing, pps])

  const timeAt = (clientX: number) => Math.max(0, (clientX - (contentRef.current?.getBoundingClientRect().left ?? 0)) / ppsRef.current)
  // Snap a time to nearby edges (playhead, clip cuts, other blocks) within 8px.
  const snapT = (tt: number, self: string) => {
    const p = live.current; if (!p.snap) return tt
    const pts = [0, p.playhead, p.total, ...p.placed.flatMap((c) => c.clip.id === self ? [] : [c.offset, c.offset + c.length]), ...p.overlays.flatMap((o) => o.id === self ? [] : [o.start, o.start + o.duration]), ...p.audio.flatMap((a) => a.id === self ? [] : [a.start, a.start + a.length])]
    let best = tt, d = 8 / ppsRef.current
    for (const q of pts) if (Math.abs(q - tt) < d) { d = Math.abs(q - tt); best = q }
    return best
  }

  // Others' compacted layout without the dragged clip, for the insertion marker.
  const othersLayout = (id: string, all: PlacedClip[]) => { let o = 0; return all.filter((p) => p.clip.id !== id).map((p) => { const r = { id: p.clip.id, offset: o, length: p.length }; o += p.length; return r }) }

  const onMove = (e: PointerEvent) => {
    const d = dragRef.current, p = live.current; if (!d) return
    const tt = timeAt(e.clientX)
    if (d.mode === 'scrub') return p.onSeek(Math.min(tt, p.rulerDuration))
    if (d.mode === 'clip') {
      if (!d.moved && Math.abs(e.clientX - d.x0) < 4) return
      if (!d.moved) { d.moved = true; p.onBegin() }
      const c = p.placed.find((x) => x.clip.id === d.id)?.clip; if (!c) return
      if (d.slip) { const len = d.te0 - d.ts0, ts = clamp(d.ts0 - (tt - d.t0), 0, c.duration - len); p.onUpdateClip(d.id, { trimStart: ts, trimEnd: ts + len }) }
      else { d.insertAt = othersLayout(d.id, p.placed).filter((o) => o.offset + o.length / 2 < tt).length; d.cur = tt }
      return setDrag({ ...d })
    }
    const dt = tt - d.t0
    if (d.mode === 'move') {
      let s = Math.max(0, d.start0 + dt); const s1 = snapT(s, d.id), s2 = snapT(s + d.len, d.id) - d.len
      s = Math.abs(s1 - s) <= Math.abs(s2 - s) ? s1 : s2
      return d.kind === 'overlay' ? p.onUpdateOverlay(d.id, { start: Math.max(0, s) }) : p.onUpdateAudio(d.id, { start: Math.max(0, s) })
    }
    // trim: a/b/c are the item's original (start, length, sourceIn) or (trimStart, trimEnd) for clips
    if (d.kind === 'clip') {
      const c = p.placed.find((x) => x.clip.id === d.id)?.clip; if (!c) return
      if (d.edge === 'r') p.onUpdateClip(d.id, { trimEnd: clamp(d.b + dt, d.a + MIN_LEN, c.duration) })
      else p.onUpdateClip(d.id, { trimStart: clamp(d.a + dt, 0, d.b - MIN_LEN) })
    } else if (d.kind === 'overlay') {
      if (d.edge === 'r') p.onUpdateOverlay(d.id, { duration: Math.max(MIN_LEN, snapT(d.a + d.b + dt, d.id) - d.a) })
      else { const end = d.a + d.b, s = clamp(snapT(d.a + dt, d.id), 0, end - MIN_LEN); p.onUpdateOverlay(d.id, { start: s, duration: end - s }) }
    } else {
      const a = p.audio.find((x) => x.id === d.id); if (!a) return
      if (d.edge === 'r') p.onUpdateAudio(d.id, { length: clamp(snapT(d.a + d.b + dt, d.id) - d.a, MIN_LEN, a.duration - d.c) })
      else { const k = clamp(snapT(d.a + dt, d.id) - d.a, Math.max(-d.a, -d.c), d.b - MIN_LEN); p.onUpdateAudio(d.id, { start: d.a + k, trimStart: d.c + k, length: d.b - k }) }
    }
  }
  const begin = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation(); e.preventDefault()
    dragRef.current = d; setDrag(d)
    if (d.mode === 'trim' || d.mode === 'move') live.current.onBegin()
    const mv = (ev: PointerEvent) => onMoveRef.current(ev)
    const up = () => {
      const fin = dragRef.current
      if (fin?.mode === 'clip' && fin.moved && !fin.slip && fin.insertAt !== null) live.current.onReorder(fin.id, fin.insertAt)
      dragRef.current = null; setDrag(null); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  const onMoveRef = useRef(onMove)
  useLayoutEffect(() => { onMoveRef.current = onMove })

  const ovRows = useMemo(() => pack(overlays, (o) => [o.start, o.start + o.duration]), [overlays])
  const auRows = useMemo(() => pack(audio, (a) => [a.start, a.start + a.length]), [audio])
  const nOv = Math.max(1, ...[...ovRows.values()].map((r) => r + 1)), nAu = Math.max(1, ...[...auRows.values()].map((r) => r + 1))
  const step = STEPS.find((s) => s * pps >= 70) ?? 3600
  const ticks = useMemo(() => Array.from({ length: Math.floor(rulerDuration / step) + 1 }, (_, i) => i * step), [rulerDuration, step])
  const isSel = (k: string, id: string) => selection?.kind === k && selection.id === id
  const cd = drag?.mode === 'clip' && drag.moved && !drag.slip ? drag : null
  const marker = cd && cd.insertAt !== null ? (() => { const o = othersLayout(cd.id, placed); return cd.insertAt === 0 ? 0 : (o[cd.insertAt - 1]?.offset ?? 0) + (o[cd.insertAt - 1]?.length ?? 0) })() : null
  const lanes: Array<[string, number]> = [[t.video, 1], [t.overlays, nOv], [t.audio, nAu]]
  const ib = 'grid size-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 disabled:opacity-30'

  return <div className="glass mt-6 rounded-2xl p-4">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="mr-auto flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300"><Film className="size-4" /> {t.timeline}</h2>
      <button className={ib} title={t.undo} disabled={!props.canUndo} onClick={props.onUndo}><Undo2 className="size-4" /></button>
      <button className={ib} title={t.redo} disabled={!props.canRedo} onClick={props.onRedo}><Redo2 className="size-4" /></button>
      <button className={ib} title={t.split} onClick={props.onSplit}><Scissors className="size-4" /></button>
      <button className={ib} title={t.delete} disabled={!selection} onClick={props.onDelete}><Trash2 className="size-4" /></button>
      <button className={`${ib} ${snap ? '!border-indigo-400/50 !bg-indigo-500/25 !text-white' : ''}`} title={t.snap} onClick={() => setSnap(!snap)}><Magnet className="size-4" /></button>
      <span className="mx-1 h-5 w-px bg-white/10" />
      <button className={ib} title={t.zoomOut} onClick={() => zoomAround(zoom / 1.5)}><ZoomOut className="size-4" /></button>
      <input type="range" min={0} max={1} step={0.001} value={Math.log(zoom) / Math.log(Math.max(1.0001, MAX_PPS / fitPps))} onChange={(e) => zoomAround(Math.pow(Math.max(1.0001, MAX_PPS / fitPps), Number(e.target.value)))} className="w-28 accent-indigo-500" aria-label="Zoom" />
      <button className={ib} title={t.zoomIn} onClick={() => zoomAround(zoom * 1.5)}><ZoomIn className="size-4" /></button>
      <button className={ib} title={t.zoomFit} onClick={() => setZoom(1)}><Maximize2 className="size-4" /></button>
    </div>
    <p className="mt-1 text-xs text-slate-500">{t.hint}</p>

    <div className="mt-3 flex select-none gap-2">
      <div className="w-16 shrink-0">
        <div className="h-6" />
        {lanes.map(([l, n]) => <div key={l} style={{ height: n * ROW + (n - 1) * 2 }} className="mt-1.5 flex items-center text-[10px] font-medium uppercase tracking-wide text-slate-500">{l}</div>)}
      </div>
      <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden pb-2">
        <div ref={contentRef} className="relative" style={{ width }} onPointerDown={(e) => { props.onSelect(null); begin(e, { mode: 'scrub' }); props.onSeek(timeAt(e.clientX)) }}>
          <div className="relative h-6 cursor-ew-resize rounded-md bg-white/5">
            {ticks.map((s) => <div key={s} className="pointer-events-none absolute inset-y-0 border-l border-white/15" style={{ left: px(s) }}><span className="absolute left-1 top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-slate-500">{fmtTime(s, step < 1)}</span></div>)}
          </div>
          <Lane rows={1}>
            {placed.map((p) => {
              const dragging = cd?.id === p.clip.id
              return <Block key={p.clip.id} left={px(p.offset)} width={px(p.length)} top={0} selected={isSel('clip', p.clip.id)} theme="indigo" label={p.clip.name} sub={fmtTime(p.length)} ghost={dragging}
                style={dragging && cd ? { transform: `translateX(${(cd.cur - cd.t0) * pps}px)`, zIndex: 10 } : undefined}
                onBody={(e) => { props.onSelect({ kind: 'clip', id: p.clip.id }); const ph = live.current.playhead; if (ph < p.offset || ph >= p.offset + p.length) props.onSeek(p.offset); begin(e, { mode: 'clip', id: p.clip.id, x0: e.clientX, t0: timeAt(e.clientX), moved: false, slip: e.altKey || e.shiftKey, ts0: p.clip.trimStart, te0: p.clip.trimEnd, insertAt: null, cur: 0 }) }}
                onEdge={(e, edge) => { props.onSelect({ kind: 'clip', id: p.clip.id }); begin(e, { mode: 'trim', kind: 'clip', id: p.clip.id, edge, t0: timeAt(e.clientX), a: p.clip.trimStart, b: p.clip.trimEnd, c: 0 }) }} />
            })}
            {marker !== null && <div className="pointer-events-none absolute -inset-y-1 z-20 w-0.5 rounded bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]" style={{ left: px(marker) - 1 }} />}
          </Lane>
          <Lane rows={nOv}>
            {overlays.map((o) => <Block key={o.id} left={px(o.start)} width={px(o.duration)} top={(ovRows.get(o.id) ?? 0) * (ROW + 2)} selected={isSel('overlay', o.id)} theme="violet" grab label={overlayLabel(o)}
              onBody={(e) => { props.onSelect({ kind: 'overlay', id: o.id }); begin(e, { mode: 'move', kind: 'overlay', id: o.id, t0: timeAt(e.clientX), start0: o.start, len: o.duration }) }}
              onEdge={(e, edge) => { props.onSelect({ kind: 'overlay', id: o.id }); begin(e, { mode: 'trim', kind: 'overlay', id: o.id, edge, t0: timeAt(e.clientX), a: o.start, b: o.duration, c: 0 }) }} />)}
          </Lane>
          <Lane rows={nAu}>
            {audio.map((a) => <Block key={a.id} left={px(a.start)} width={px(a.length)} top={(auRows.get(a.id) ?? 0) * (ROW + 2)} selected={isSel('audio', a.id)} theme="emerald" grab label={a.name} sub={fmtTime(a.length)}
              onBody={(e) => { props.onSelect({ kind: 'audio', id: a.id }); begin(e, { mode: 'move', kind: 'audio', id: a.id, t0: timeAt(e.clientX), start0: a.start, len: a.length }) }}
              onEdge={(e, edge) => { props.onSelect({ kind: 'audio', id: a.id }); begin(e, { mode: 'trim', kind: 'audio', id: a.id, edge, t0: timeAt(e.clientX), a: a.start, b: a.length, c: a.trimStart }) }} />)}
          </Lane>
          <div className="pointer-events-none absolute inset-y-0 z-30 w-px bg-rose-400" style={{ left: px(Math.min(playhead, rulerDuration)) }}><div className="absolute -left-[5px] -top-0.5 h-2.5 w-[11px] rounded-b-sm bg-rose-400" /></div>
        </div>
      </div>
    </div>
  </div>
}

const Lane = ({ rows, children }: { rows: number; children: React.ReactNode }) => <div className="relative mt-1.5 rounded-md bg-white/[0.03]" style={{ height: rows * ROW + (rows - 1) * 2 }}>{children}</div>

const BLOCK_THEME = {
  indigo: { on: 'border-indigo-300 bg-indigo-500/40 text-white ring-1 ring-indigo-300/60', off: 'border-indigo-400/30 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30' },
  violet: { on: 'border-violet-300 bg-violet-500/40 text-white ring-1 ring-violet-300/60', off: 'border-violet-400/30 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30' },
  emerald: { on: 'border-emerald-300 bg-emerald-500/40 text-white ring-1 ring-emerald-300/60', off: 'border-emerald-400/30 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30' },
}

function Block({ left, width, top, selected, theme, label, sub, grab, ghost, style, onBody, onEdge }: {
  left: number; width: number; top: number; selected: boolean; theme: keyof typeof BLOCK_THEME; label: string; sub?: string; grab?: boolean; ghost?: boolean; style?: React.CSSProperties
  onBody: (e: React.PointerEvent) => void; onEdge: (e: React.PointerEvent, edge: Edge) => void
}) {
  const c = BLOCK_THEME[theme]
  return <div onPointerDown={onBody} title={label} style={{ left, width: Math.max(2, width), top: top + 3, height: ROW - GAP, ...style }}
    className={`group absolute overflow-hidden rounded-md border text-left text-[11px] leading-tight transition-colors ${grab ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${selected ? c.on : c.off} ${ghost ? 'opacity-50' : ''}`}>
    <span className="pointer-events-none block truncate px-2 pt-1 font-medium">{label}</span>
    {sub && width > 70 && <span className="pointer-events-none block truncate px-2 font-mono text-[9px] opacity-60">{sub}</span>}
    <div onPointerDown={(e) => onEdge(e, 'l')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 transition hover:bg-white/40" />
    <div onPointerDown={(e) => onEdge(e, 'r')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 transition hover:bg-white/40" />
  </div>
}

const overlayLabel = (o: Overlay) => (o.type === 'text' ? o.text || 'Text' : o.type === 'image' ? o.name : 'Colour')
