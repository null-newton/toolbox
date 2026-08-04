import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { LatLon, Obstacle } from './solar'

interface ModelFace {
  id: string
  points: LatLon[]
  panelZone?: LatLon[]
  tilt: number
  azimuth: number
  panels: LatLon[][]
  active: boolean
}

interface Props {
  workingArea: LatLon[]
  faces: ModelFace[]
  obstacles: Obstacle[]
  wallHeight: number
  resetLabel: string
}

interface Vec3 {
  x: number
  y: number
  z: number
}

interface Projected extends Vec3 {
  sx: number
  sy: number
  depth: number
}

interface Surface {
  points: Vec3[]
  fill: string
  stroke: string
  width?: number
  dash?: number[]
}

const RAD = Math.PI / 180
const M_PER_DEG_LAT = 111_320
const DEFAULT_CAMERA = { yaw: -0.62, pitch: 0.74, zoom: 1 }

/**
 * A small dependency-free 3D renderer. It only receives geometry from the
 * selected working polygon, so satellite tiles and the rest of the world never
 * enter the scene. Roof faces are lifted into planes from their tilt/azimuth.
 */
export function RoofModel3D({ workingArea, faces, obstacles, wallHeight, resetLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef({ w: 900, h: 430 })
  const [camera, setCamera] = useState(DEFAULT_CAMERA)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || workingArea.length < 3) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h } = sizeRef.current
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const origin = {
      lat: workingArea.reduce((sum, p) => sum + p.lat, 0) / workingArea.length,
      lon: workingArea.reduce((sum, p) => sum + p.lon, 0) / workingArea.length,
    }
    const mLon = M_PER_DEG_LAT * Math.cos(origin.lat * RAD)
    const toXY = (p: LatLon) => ({
      x: (p.lon - origin.lon) * mLon,
      y: (p.lat - origin.lat) * M_PER_DEG_LAT,
    })
    const ground = workingArea.map((p) => ({ ...toXY(p), z: 0 }))

    const roofMappers = new Map<string, (point: LatLon, lift?: number) => Vec3>()
    for (const face of faces) {
      const xy = face.points.map(toXY)
      const downX = Math.sin(face.azimuth * RAD)
      const downY = Math.cos(face.azimuth * RAD)
      const maxDown = Math.max(...xy.map((p) => p.x * downX + p.y * downY))
      roofMappers.set(face.id, (point, lift = 0) => {
        const p = toXY(point)
        const down = p.x * downX + p.y * downY
        return {
          ...p,
          z: wallHeight + (maxDown - down) * Math.tan(face.tilt * RAD) + lift,
        }
      })
    }

    const allWorld: Vec3[] = [...ground]
    for (const face of faces) {
      const lift = roofMappers.get(face.id)!
      allWorld.push(...face.points.map((p) => lift(p)))
    }
    for (const obstacle of obstacles) {
      const p = toXY(obstacle.point)
      allWorld.push({ ...p, z: obstacle.height })
    }

    const rotate = (p: Vec3) => {
      const cosY = Math.cos(camera.yaw)
      const sinY = Math.sin(camera.yaw)
      const side = p.x * cosY - p.y * sinY
      const away = p.x * sinY + p.y * cosY
      return {
        x: side,
        y: away * Math.sin(camera.pitch) - p.z * Math.cos(camera.pitch),
        depth: away * Math.cos(camera.pitch) + p.z * Math.sin(camera.pitch),
      }
    }
    const raw = allWorld.map(rotate)
    const minX = Math.min(...raw.map((p) => p.x))
    const maxX = Math.max(...raw.map((p) => p.x))
    const minY = Math.min(...raw.map((p) => p.y))
    const maxY = Math.max(...raw.map((p) => p.y))
    const naturalScale = Math.min((w - 80) / Math.max(1, maxX - minX), (h - 70) / Math.max(1, maxY - minY))
    const scale = naturalScale * camera.zoom
    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2
    const project = (p: Vec3): Projected => {
      const r = rotate(p)
      return {
        ...p,
        sx: w / 2 + (r.x - midX) * scale,
        sy: h / 2 + 8 + (r.y - midY) * scale,
        depth: r.depth,
      }
    }

    const path = (points: Vec3[]) => {
      const projected = points.map(project)
      ctx.beginPath()
      ctx.moveTo(projected[0].sx, projected[0].sy)
      for (const p of projected.slice(1)) ctx.lineTo(p.sx, p.sy)
      ctx.closePath()
      return projected
    }

    // Deep-space backdrop and a subtle halo beneath the finite site.
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#080d19')
    bg.addColorStop(1, '#111827')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    const halo = ctx.createRadialGradient(w / 2, h * 0.62, 10, w / 2, h * 0.62, w * 0.48)
    halo.addColorStop(0, 'rgba(99,102,241,0.13)')
    halo.addColorStop(1, 'rgba(15,23,42,0)')
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, w, h)

    // The user-selected ground plane. Grid lines are clipped to this polygon.
    path(ground)
    ctx.fillStyle = 'rgba(15,118,110,0.16)'
    ctx.fill()
    ctx.save()
    path(ground)
    ctx.clip()
    const xs = ground.map((p) => p.x)
    const ys = ground.map((p) => p.y)
    const minGX = Math.floor(Math.min(...xs) / 2) * 2
    const maxGX = Math.ceil(Math.max(...xs) / 2) * 2
    const minGY = Math.floor(Math.min(...ys) / 2) * 2
    const maxGY = Math.ceil(Math.max(...ys) / 2) * 2
    ctx.strokeStyle = 'rgba(52,211,153,0.12)'
    ctx.lineWidth = 1
    for (let x = minGX; x <= maxGX; x += 2) drawLine(ctx, project({ x, y: minGY, z: 0 }), project({ x, y: maxGY, z: 0 }))
    for (let y = minGY; y <= maxGY; y += 2) drawLine(ctx, project({ x: minGX, y, z: 0 }), project({ x: maxGX, y, z: 0 }))
    ctx.restore()
    path(ground)
    ctx.strokeStyle = '#34d399'
    ctx.lineWidth = 2
    ctx.setLineDash([7, 5])
    ctx.stroke()
    ctx.setLineDash([])

    const surfaces: Surface[] = []
    for (const face of faces) {
      const lift = roofMappers.get(face.id)!
      const roof = face.points.map((p) => lift(p))
      for (let i = 0; i < roof.length; i++) {
        const a = roof[i]
        const b = roof[(i + 1) % roof.length]
        surfaces.push({
          points: [a, b, { ...b, z: 0 }, { ...a, z: 0 }],
          fill: face.active ? 'rgba(67,80,116,0.96)' : 'rgba(38,49,70,0.95)',
          stroke: 'rgba(148,163,184,0.28)',
        })
      }
      surfaces.push({
        points: roof,
        fill: face.active ? 'rgba(99,102,241,0.92)' : 'rgba(51,65,85,0.96)',
        stroke: face.active ? '#a5b4fc' : '#94a3b8',
        width: face.active ? 2.5 : 1.5,
      })
      if (face.panelZone?.length) {
        surfaces.push({
          points: face.panelZone.map((p) => lift(p, 0.06)),
          fill: 'rgba(16,185,129,0.32)',
          stroke: '#6ee7b7',
          width: 2,
          dash: [5, 3],
        })
      }
      for (const panel of face.panels) {
        surfaces.push({
          points: panel.map((p) => lift(p, 0.14)),
          fill: 'rgba(15,48,102,0.98)',
          stroke: '#7dd3fc',
          width: 0.8,
        })
      }
    }

    // Nearby shading objects are simple finite prisms; enough to read their
    // footprint and relative height without pretending to know their exact form.
    for (const obstacle of obstacles) {
      const center = toXY(obstacle.point)
      const radius = obstacle.width / 2
      const ring = Array.from({ length: 8 }, (_, i) => ({
        x: center.x + Math.cos((i / 8) * Math.PI * 2) * radius,
        y: center.y + Math.sin((i / 8) * Math.PI * 2) * radius,
      }))
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        surfaces.push({
          points: [{ ...a, z: 0 }, { ...b, z: 0 }, { ...b, z: obstacle.height }, { ...a, z: obstacle.height }],
          fill: 'rgba(154,83,35,0.88)',
          stroke: 'rgba(253,186,116,0.45)',
        })
      }
      surfaces.push({
        points: ring.map((p) => ({ ...p, z: obstacle.height })),
        fill: 'rgba(249,115,22,0.86)',
        stroke: '#fdba74',
      })
    }

    surfaces.sort(
      (a, b) =>
        a.points.reduce((sum, p) => sum + project(p).depth, 0) / a.points.length -
        b.points.reduce((sum, p) => sum + project(p).depth, 0) / b.points.length
    )
    for (const surface of surfaces) {
      path(surface.points)
      ctx.fillStyle = surface.fill
      ctx.fill()
      ctx.strokeStyle = surface.stroke
      ctx.lineWidth = surface.width ?? 1
      ctx.setLineDash(surface.dash ?? [])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Orientation cue.
    ctx.fillStyle = 'rgba(15,23,42,0.82)'
    ctx.beginPath()
    ctx.arc(30, 30, 18, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f87171'
    ctx.beginPath()
    ctx.moveTo(30, 14)
    ctx.lineTo(25, 29)
    ctx.lineTo(35, 29)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '600 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('N', 30, 40)
  }, [camera, faces, obstacles, wallHeight, workingArea])

  useEffect(draw, [draw])
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const resize = () => {
      sizeRef.current = { w: el.clientWidth, h: el.clientHeight }
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    resize()
    return () => observer.disconnect()
  }, [draw])

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<number | null>(null)
  const local = (event: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const pointerDown = (event: React.PointerEvent) => {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, local(event))
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinchRef.current = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }
  const pointerMove = (event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const next = local(event)
    pointers.current.set(event.pointerId, next)
    if (pointers.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const factor = distance / pinchRef.current
      pinchRef.current = distance
      setCamera((c) => ({ ...c, zoom: Math.max(0.55, Math.min(3.5, c.zoom * factor)) }))
      return
    }
    setCamera((c) => ({
      ...c,
      yaw: c.yaw + (next.x - previous.x) * 0.008,
      pitch: Math.max(0.12, Math.min(1.45, c.pitch - (next.y - previous.y) * 0.006)),
    }))
  }
  const pointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinchRef.current = null
  }

  return (
    <div ref={wrapRef} className="relative h-[360px] w-full sm:h-[430px]">
      <canvas
        ref={canvasRef}
        className="size-full touch-none cursor-grab select-none active:cursor-grabbing"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onDoubleClick={() => setCamera(DEFAULT_CAMERA)}
        onWheel={(event) => {
          event.preventDefault()
          setCamera((c) => ({
            ...c,
            zoom: Math.max(0.55, Math.min(3.5, c.zoom * (event.deltaY < 0 ? 1.1 : 0.9))),
          }))
        }}
        role="img"
        aria-label="Interactive 3D model of the selected building and panel area"
      />
      <button
        onClick={() => setCamera(DEFAULT_CAMERA)}
        className="absolute right-3 bottom-3 flex items-center gap-2 rounded-lg border border-white/15 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 backdrop-blur hover:bg-slate-800"
      >
        <RotateCcw className="size-3.5" /> {resetLabel}
      </button>
    </div>
  )
}

function drawLine(ctx: CanvasRenderingContext2D, a: Projected, b: Projected) {
  ctx.beginPath()
  ctx.moveTo(a.sx, a.sy)
  ctx.lineTo(b.sx, b.sy)
  ctx.stroke()
}
