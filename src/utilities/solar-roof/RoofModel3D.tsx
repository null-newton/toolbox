import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Hand, LoaderCircle, Minus, MousePointer2, Move, Orbit, Plus, RotateCcw, Sparkles } from 'lucide-react'
import type { LatLon, Obstacle } from './solar'
import {
  composeSatelliteTexture,
  upscaleSatelliteTexture,
  type ComposedTexture,
} from './satelliteTexture'

interface ModelFace {
  id: string
  points: LatLon[]
  panelZone?: LatLon[]
  tilt: number
  azimuth: number
  height?: number
  panelEnabled: boolean
  panels: LatLon[][]
  active: boolean
}

interface ViewerLabels {
  select: string
  rectangle: string
  move: string
  orbit: string
  pan: string
  top: string
  perspective: string
  fit: string
  loadingMap: string
  upscalingMap: string
  mapReady: string
  mapFallback: string
  controlsHint: string
  surfaceFit: string
  surfaceNotFit: string
}

interface Props {
  workingArea: LatLon[]
  faces: ModelFace[]
  obstacles: Obstacle[]
  wallHeight: number
  resetLabel: string
  labels: ViewerLabels
  onCreateShape: (points: LatLon[]) => void
  onMoveShape: (id: string, points: LatLon[]) => void
  onToggleSurface: (id: string) => void
  onSelectSurface: (id: string) => void
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

interface Camera {
  yaw: number
  pitch: number
  dolly: number
  panX: number
  panY: number
}

type Tool = 'select' | 'rectangle' | 'move' | 'orbit' | 'pan'
type TexturePhase = 'loading' | 'upscaling' | 'ready' | 'fallback'

const RAD = Math.PI / 180
const M_PER_DEG_LAT = 111_320
const PERSPECTIVE: Camera = { yaw: -0.68, pitch: 0.72, dolly: 1, panX: 0, panY: 0 }
const TOP: Camera = { yaw: 0, pitch: 1.48, dolly: 1, panX: 0, panY: 0 }

/** Perspective 3D viewer for the finite site selected on the satellite map. */
export function RoofModel3D({
  workingArea,
  faces,
  obstacles,
  wallHeight,
  resetLabel,
  labels,
  onCreateShape,
  onMoveShape,
  onToggleSurface,
  onSelectSurface,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef({ w: 900, h: 520 })
  const [camera, setCamera] = useState<Camera>(PERSPECTIVE)
  const [tool, setTool] = useState<Tool>('rectangle')
  const [texture, setTexture] = useState<ComposedTexture | null>(null)
  const [texturePhase, setTexturePhase] = useState<TexturePhase>('loading')
  const [shapePreview, setShapePreview] = useState<LatLon[] | null>(null)
  const shapePreviewRef = useRef<LatLon[] | null>(null)
  const [movePreview, setMovePreview] = useState<{ id: string; points: LatLon[] } | null>(null)
  const movePreviewRef = useRef<{ id: string; points: LatLon[] } | null>(null)
  const hitSurfaces = useRef<{ id: string; points: { x: number; y: number }[]; depth: number }[]>([])
  const groundInteraction = useRef<{
    toGround: (x: number, y: number) => { x: number; y: number } | null
    toLatLon: (point: { x: number; y: number }) => LatLon
    toLocal: (point: LatLon) => { x: number; y: number }
    contains: (point: { x: number; y: number }) => boolean
  } | null>(null)
  const areaKey = useMemo(
    () => workingArea.map((p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`).join('|'),
    [workingArea]
  )

  // Progressive texture pipeline: show the native maximum-zoom crop first,
  // then replace it in place when the shared Real-ESRGAN 4× job completes.
  useEffect(() => {
    const controller = new AbortController()
    let source: ComposedTexture | null = null
    composeSatelliteTexture(workingArea, controller.signal)
      .then(async (composed) => {
        source = composed
        setTexture(composed)
        setTexturePhase('upscaling')
        const image = await upscaleSatelliteTexture(composed, controller.signal)
        if (controller.signal.aborted) return
        setTexture({
          ...composed,
          image,
          width: image.naturalWidth,
          height: image.naturalHeight,
        })
        setTexturePhase('ready')
      })
      .catch((error: unknown) => {
        if ((error as Error)?.name === 'AbortError') return
        if (source) {
          setTexture(source)
          setTexturePhase('fallback')
        } else {
          setTexturePhase('fallback')
        }
      })
    return () => controller.abort()
    // Coordinates are represented by areaKey; depending on the array identity
    // would restart a costly upscale for backwards-compatible inferred areas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey])

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
    const displayFaces = faces.map((face) =>
      movePreview?.id === face.id ? { ...face, points: movePreview.points } : face
    )
    const ground = workingArea.map((p) => ({ ...toXY(p), z: 0 }))
    const roofMappers = new Map<string, (point: LatLon, lift?: number) => Vec3>()
    for (const face of displayFaces) {
      const xy = face.points.map(toXY)
      const faceHeight = face.height ?? wallHeight
      const downX = Math.sin(face.azimuth * RAD)
      const downY = Math.cos(face.azimuth * RAD)
      const maxDown = Math.max(...xy.map((p) => p.x * downX + p.y * downY))
      roofMappers.set(face.id, (point, lift = 0) => {
        const p = toXY(point)
        const down = p.x * downX + p.y * downY
        return { ...p, z: faceHeight + (maxDown - down) * Math.tan(face.tilt * RAD) + lift }
      })
    }

    const world: Vec3[] = [...ground]
    for (const face of displayFaces) world.push(...face.points.map((p) => roofMappers.get(face.id)!(p)))
    for (const obstacle of obstacles) {
      const point = toXY(obstacle.point)
      world.push({ ...point, z: obstacle.height })
    }
    const maxZ = Math.max(wallHeight, ...world.map((p) => p.z))
    const targetZ = maxZ * 0.3
    const radius = Math.max(
      2,
      ...world.map((p) => Math.hypot(p.x, p.y, (p.z - targetZ) * 0.75))
    )
    const distance = (radius * 2.65) / camera.dolly
    const focal = Math.min(w, h) / (2 * Math.tan(42 * RAD * 0.5))
    const rotate = (p: Vec3) => {
      const z = p.z - targetZ
      const cosY = Math.cos(camera.yaw)
      const sinY = Math.sin(camera.yaw)
      const side = p.x * cosY - p.y * sinY
      const away = p.x * sinY + p.y * cosY
      return {
        side,
        vertical: away * Math.sin(camera.pitch) - z * Math.cos(camera.pitch),
        depth: away * Math.cos(camera.pitch) + z * Math.sin(camera.pitch),
      }
    }
    const project = (p: Vec3): Projected => {
      const r = rotate(p)
      const cameraDepth = Math.max(radius * 0.08, distance - r.depth)
      const perspective = focal / cameraDepth
      return {
        ...p,
        sx: w / 2 + camera.panX + r.side * perspective,
        sy: h / 2 + camera.panY + r.vertical * perspective,
        depth: r.depth,
      }
    }
    const toLatLon = (point: { x: number; y: number }): LatLon => ({
      lat: origin.lat + point.y / M_PER_DEG_LAT,
      lon: origin.lon + point.x / mLon,
    })
    const groundXY = ground.map((point) => ({ x: point.x, y: point.y }))
    groundInteraction.current = {
      toGround: (screenX, screenY) => {
        const screenSide = (screenX - w / 2 - camera.panX) / focal
        const screenVertical = (screenY - h / 2 - camera.panY) / focal
        const sinPitch = Math.sin(camera.pitch)
        const cosPitch = Math.cos(camera.pitch)
        const denominator = screenVertical * cosPitch + sinPitch
        if (Math.abs(denominator) < 1e-5) return null
        const away =
          (screenVertical * (distance + targetZ * sinPitch) - targetZ * cosPitch) / denominator
        const cameraDepth = distance - away * cosPitch + targetZ * sinPitch
        if (cameraDepth <= 0) return null
        const side = screenSide * cameraDepth
        return {
          x: side * Math.cos(camera.yaw) + away * Math.sin(camera.yaw),
          y: -side * Math.sin(camera.yaw) + away * Math.cos(camera.yaw),
        }
      },
      toLatLon,
      toLocal: toXY,
      contains: (point) => pointInPolygon2D(point, groundXY),
    }
    const path = (points: Vec3[]) => {
      const projected = points.map(project)
      ctx.beginPath()
      ctx.moveTo(projected[0].sx, projected[0].sy)
      for (const p of projected.slice(1)) ctx.lineTo(p.sx, p.sy)
      ctx.closePath()
      return projected
    }

    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#060a12')
    bg.addColorStop(1, '#111827')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    const halo = ctx.createRadialGradient(w / 2, h * 0.56, 20, w / 2, h * 0.56, w * 0.52)
    halo.addColorStop(0, 'rgba(56,189,248,0.10)')
    halo.addColorStop(1, 'rgba(15,23,42,0)')
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, w, h)

    // Project the satellite image as a perspective-correct subdivided mesh,
    // clipped to the exact polygon the user selected.
    path(ground)
    ctx.fillStyle = 'rgba(15,23,42,0.9)'
    ctx.fill()
    if (texture) {
      ctx.save()
      path(ground)
      ctx.clip()
      drawTextureMesh(ctx, texture, toXY, project)
      ctx.restore()
    }
    path(ground)
    ctx.fillStyle = texture ? 'rgba(15,23,42,0.10)' : 'rgba(15,118,110,0.15)'
    ctx.fill()
    ctx.strokeStyle = '#34d399'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 5])
    ctx.stroke()
    ctx.setLineDash([])

    const surfaces: Surface[] = []
    hitSurfaces.current = []
    for (const face of displayFaces) {
      const lift = roofMappers.get(face.id)!
      const roof = face.points.map((p) => lift(p))
      for (let i = 0; i < roof.length; i++) {
        const a = roof[i]
        const b = roof[(i + 1) % roof.length]
        surfaces.push({
          points: [a, b, { ...b, z: 0 }, { ...a, z: 0 }],
          fill: face.active ? 'rgba(54,70,108,0.96)' : 'rgba(31,41,55,0.96)',
          stroke: 'rgba(148,163,184,0.32)',
        })
      }
      surfaces.push({
        points: roof,
        fill: face.panelEnabled
          ? face.active
            ? 'rgba(16,185,129,0.96)'
            : 'rgba(5,150,105,0.92)'
          : face.active
            ? 'rgba(99,102,241,0.92)'
            : 'rgba(51,65,85,0.96)',
        stroke: face.active ? '#e0e7ff' : face.panelEnabled ? '#6ee7b7' : '#94a3b8',
        width: face.active ? 2.5 : 1.5,
      })
      const roofScreen = roof.map(project)
      hitSurfaces.current.push({
        id: face.id,
        points: roofScreen.map((point) => ({ x: point.sx, y: point.sy })),
        depth: roofScreen.reduce((sum, point) => sum + point.depth, 0) / roofScreen.length,
      })
      if (face.panelZone?.length) {
        surfaces.push({
          points: face.panelZone.map((p) => lift(p, 0.06)),
          fill: 'rgba(16,185,129,0.34)',
          stroke: '#6ee7b7',
          width: 2,
          dash: [5, 3],
        })
      }
      for (const panel of face.panels) {
        surfaces.push({
          points: panel.map((p) => lift(p, 0.14)),
          fill: 'rgba(9,35,85,0.98)',
          stroke: '#7dd3fc',
          width: 0.8,
        })
      }
    }
    if (shapePreview?.length === 4) {
      const previewRoof = shapePreview.map((point) => ({ ...toXY(point), z: wallHeight }))
      for (let index = 0; index < previewRoof.length; index++) {
        const a = previewRoof[index]
        const b = previewRoof[(index + 1) % previewRoof.length]
        surfaces.push({
          points: [a, b, { ...b, z: 0 }, { ...a, z: 0 }],
          fill: 'rgba(56,189,248,0.18)',
          stroke: 'rgba(125,211,252,0.72)',
          dash: [5, 3],
        })
      }
      surfaces.push({
        points: previewRoof,
        fill: 'rgba(56,189,248,0.32)',
        stroke: '#7dd3fc',
        width: 2,
        dash: [5, 3],
      })
    }
    for (const obstacle of obstacles) addObstacleSurfaces(surfaces, toXY(obstacle.point), obstacle)
    surfaces.sort((a, b) => averageDepth(a, project) - averageDepth(b, project))
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

    // Horizon and compass cues make orbit direction legible.
    ctx.fillStyle = 'rgba(15,23,42,0.82)'
    ctx.beginPath()
    ctx.arc(31, 31, 19, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f87171'
    ctx.beginPath()
    ctx.moveTo(31, 14)
    ctx.lineTo(26, 30)
    ctx.lineTo(36, 30)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '600 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('N', 31, 42)
  }, [camera, faces, movePreview, obstacles, shapePreview, texture, wallHeight, workingArea])

  useEffect(draw, [draw])
  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const resize = () => {
      sizeRef.current = { w: element.clientWidth, h: element.clientHeight }
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    return () => observer.disconnect()
  }, [draw])

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ distance: number; midX: number; midY: number } | null>(null)
  const forcedPan = useRef(false)
  const editorDrag = useRef<
    | { kind: 'rectangle'; start: { x: number; y: number } }
    | { kind: 'select'; x: number; y: number; moved: number }
    | { kind: 'move'; id: string; start: { x: number; y: number }; original: LatLon[] }
    | null
  >(null)
  const local = (event: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const pointerDown = (event: React.PointerEvent) => {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    const point = local(event)
    pointers.current.set(event.pointerId, point)
    forcedPan.current = event.button === 1 || event.button === 2 || event.shiftKey || event.altKey
    if (pointers.current.size === 2) {
      editorDrag.current = null
      setShapePreview(null)
      shapePreviewRef.current = null
      setMovePreview(null)
      movePreviewRef.current = null
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      }
      return
    }
    if (forcedPan.current) return
    const interaction = groundInteraction.current
    if (tool === 'rectangle' && interaction) {
      const groundPoint = interaction.toGround(point.x, point.y)
      if (groundPoint && interaction.contains(groundPoint)) {
        editorDrag.current = { kind: 'rectangle', start: groundPoint }
        setShapePreview(null)
        shapePreviewRef.current = null
      }
    } else if (tool === 'select') {
      editorDrag.current = { kind: 'select', ...point, moved: 0 }
    } else if (tool === 'move' && interaction) {
      const hit = hitSurfaceAt(point.x, point.y, hitSurfaces.current)
      const groundPoint = interaction.toGround(point.x, point.y)
      const face = hit ? faces.find((candidate) => candidate.id === hit) : undefined
      if (hit && groundPoint && face) {
        onSelectSurface(hit)
        editorDrag.current = { kind: 'move', id: hit, start: groundPoint, original: face.points }
      }
    }
  }
  const pointerMove = (event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const next = local(event)
    pointers.current.set(event.pointerId, next)
    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      const previousGesture = gesture.current
      gesture.current = { distance, midX, midY }
      setCamera((value) => ({
        ...value,
        dolly: clamp(value.dolly * (distance / Math.max(1, previousGesture.distance)), 0.42, 2.2),
        panX: value.panX + midX - previousGesture.midX,
        panY: value.panY + midY - previousGesture.midY,
      }))
      return
    }
    const editing = editorDrag.current
    const interaction = groundInteraction.current
    if (editing?.kind === 'select') {
      editing.moved += Math.abs(next.x - previous.x) + Math.abs(next.y - previous.y)
      return
    }
    if (editing?.kind === 'rectangle' && interaction) {
      const end = interaction.toGround(next.x, next.y)
      if (!end) return
      const rectangle = rectangleOnGround(editing.start, end)
      const preview = rectangle.every(interaction.contains) ? rectangle.map(interaction.toLatLon) : null
      shapePreviewRef.current = preview
      setShapePreview(preview)
      return
    }
    if (editing?.kind === 'move' && interaction) {
      const end = interaction.toGround(next.x, next.y)
      if (!end) return
      const delta = { x: end.x - editing.start.x, y: end.y - editing.start.y }
      const moved = editing.original.map((point) => {
        const localPoint = interaction.toLocal(point)
        return interaction.toLatLon({ x: localPoint.x + delta.x, y: localPoint.y + delta.y })
      })
      if (moved.map(interaction.toLocal).every(interaction.contains)) {
        const preview = { id: editing.id, points: moved }
        movePreviewRef.current = preview
        setMovePreview(preview)
      }
      return
    }
    if (tool === 'pan' || forcedPan.current) {
      setCamera((value) => ({
        ...value,
        panX: value.panX + next.x - previous.x,
        panY: value.panY + next.y - previous.y,
      }))
    } else if (tool === 'orbit') {
      setCamera((value) => ({
        ...value,
        yaw: value.yaw + (next.x - previous.x) * 0.007,
        pitch: clamp(value.pitch - (next.y - previous.y) * 0.0055, 0.02, 1.48),
      }))
    }
  }
  const pointerUp = (event: React.PointerEvent) => {
    const point = local(event)
    const editing = editorDrag.current
    if (editing?.kind === 'select' && editing.moved < 6) {
      const hit = hitSurfaceAt(point.x, point.y, hitSurfaces.current)
      if (hit) onToggleSurface(hit)
    } else if (editing?.kind === 'rectangle' && shapePreviewRef.current && groundInteraction.current) {
      const preview = shapePreviewRef.current
      const localPoints = preview.map(groundInteraction.current.toLocal)
      const width = Math.abs(localPoints[1].x - localPoints[0].x)
      const height = Math.abs(localPoints[3].y - localPoints[0].y)
      if (width >= 0.5 && height >= 0.5) {
        onCreateShape(preview)
        setTool('select')
      }
    } else if (editing?.kind === 'move' && movePreviewRef.current?.id === editing.id) {
      onMoveShape(editing.id, movePreviewRef.current.points)
    }
    editorDrag.current = null
    setShapePreview(null)
    shapePreviewRef.current = null
    setMovePreview(null)
    movePreviewRef.current = null
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) gesture.current = null
    if (pointers.current.size === 0) forcedPan.current = false
  }
  const pointerCancel = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId)
    editorDrag.current = null
    gesture.current = null
    forcedPan.current = false
    shapePreviewRef.current = null
    movePreviewRef.current = null
    setShapePreview(null)
    setMovePreview(null)
  }
  const dolly = (factor: number) =>
    setCamera((value) => ({ ...value, dolly: clamp(value.dolly * factor, 0.42, 2.2) }))
  const fit = () => setCamera((value) => ({ ...value, dolly: 1, panX: 0, panY: 0 }))

  const statusLabel =
    texturePhase === 'loading'
      ? labels.loadingMap
      : texturePhase === 'upscaling'
        ? labels.upscalingMap
        : texturePhase === 'ready'
          ? labels.mapReady
          : labels.mapFallback

  return (
    <div ref={wrapRef} className="relative h-[430px] w-full overflow-hidden bg-slate-950 sm:h-[520px]">
      <canvas
        ref={canvasRef}
        className={`size-full touch-none select-none ${
          tool === 'rectangle'
            ? 'cursor-crosshair'
            : tool === 'select'
              ? 'cursor-pointer'
              : tool === 'move' || tool === 'pan'
                ? 'cursor-move'
                : 'cursor-grab active:cursor-grabbing'
        }`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerCancel}
        onContextMenu={(event) => event.preventDefault()}
        onDoubleClick={() => (tool === 'orbit' || tool === 'pan') && fit()}
        onWheel={(event) => {
          event.preventDefault()
          dolly(Math.exp(-event.deltaY * 0.0012))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            editorDrag.current = null
            setShapePreview(null)
            shapePreviewRef.current = null
            setMovePreview(null)
            movePreviewRef.current = null
          } else if (event.key === 'r') setCamera(PERSPECTIVE)
          else if (event.key === '1') setCamera(TOP)
          else if (event.key === '2') setCamera(PERSPECTIVE)
          else if (event.key === '+' || event.key === '=') dolly(1.12)
          else if (event.key === '-') dolly(0.89)
          else if (event.key.startsWith('Arrow')) {
            event.preventDefault()
            const dx = event.key === 'ArrowLeft' ? -18 : event.key === 'ArrowRight' ? 18 : 0
            const dy = event.key === 'ArrowUp' ? -18 : event.key === 'ArrowDown' ? 18 : 0
            setCamera((value) => ({ ...value, panX: value.panX + dx, panY: value.panY + dy }))
          }
        }}
        tabIndex={0}
        role="img"
        aria-label="Perspective 3D model of the selected satellite area, building and panels"
      />

      <div className="absolute top-3 right-14 left-14 flex items-center gap-1 overflow-x-auto rounded-xl border border-white/12 bg-slate-950/82 p-1 shadow-xl backdrop-blur">
        <ToolButton active={tool === 'select'} label={labels.select} onClick={() => setTool('select')}>
          <MousePointer2 className="size-3.5" />
        </ToolButton>
        <ToolButton active={tool === 'rectangle'} label={labels.rectangle} onClick={() => setTool('rectangle')}>
          <Box className="size-3.5" />
        </ToolButton>
        <ToolButton active={tool === 'move'} label={labels.move} onClick={() => setTool('move')}>
          <Move className="size-3.5" />
        </ToolButton>
        <span className="mx-1 h-5 w-px shrink-0 bg-white/10" />
        <ToolButton active={tool === 'orbit'} label={labels.orbit} onClick={() => setTool('orbit')}>
          <Orbit className="size-3.5" />
        </ToolButton>
        <ToolButton active={tool === 'pan'} label={labels.pan} onClick={() => setTool('pan')}>
          <Hand className="size-3.5" />
        </ToolButton>
        <span className="mx-1 h-5 w-px shrink-0 bg-white/10" />
        <ToolButton label={labels.top} onClick={() => setCamera(TOP)} />
        <ToolButton label={labels.perspective} onClick={() => setCamera(PERSPECTIVE)} />
        <ToolButton label={labels.fit} onClick={fit} />
      </div>

      <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-xl border border-white/12 bg-slate-950/82 p-1 backdrop-blur">
        <button onClick={() => dolly(1.14)} className="grid size-8 place-items-center rounded-lg text-slate-200 hover:bg-white/10" aria-label="Zoom in">
          <Plus className="size-4" />
        </button>
        <button onClick={() => dolly(0.88)} className="grid size-8 place-items-center rounded-lg text-slate-200 hover:bg-white/10" aria-label="Zoom out">
          <Minus className="size-4" />
        </button>
        <button onClick={() => setCamera(PERSPECTIVE)} className="grid size-8 place-items-center rounded-lg text-slate-200 hover:bg-white/10" aria-label={resetLabel}>
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      <div className="absolute bottom-12 left-3 flex items-center gap-3 rounded-lg bg-slate-950/72 px-2.5 py-1.5 text-[10px] text-slate-300 backdrop-blur">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-emerald-500" />{labels.surfaceFit}</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-slate-500" />{labels.surfaceNotFit}</span>
      </div>

      <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-6rem)] items-center gap-2 rounded-lg border border-white/10 bg-slate-950/78 px-2.5 py-1.5 text-[11px] text-slate-300 backdrop-blur">
        {texturePhase === 'loading' || texturePhase === 'upscaling' ? (
          <LoaderCircle className="size-3.5 animate-spin text-indigo-300" />
        ) : (
          <Sparkles className={`size-3.5 ${texturePhase === 'ready' ? 'text-emerald-300' : 'text-amber-300'}`} />
        )}
        {statusLabel}
        <span className="border-l border-white/10 pl-2 text-slate-500">Imagery © Esri</span>
      </div>
      <div className="absolute right-3 bottom-3 hidden rounded-lg bg-slate-950/65 px-2.5 py-1.5 text-[10px] text-slate-400 backdrop-blur md:block">
        {labels.controlsHint}
      </div>
    </div>
  )
}

function ToolButton({
  active = false,
  label,
  onClick,
  children,
}: {
  active?: boolean
  label: string
  onClick: () => void
  children?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium ${
        active ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
      {label}
    </button>
  )
}

function drawTextureMesh(
  ctx: CanvasRenderingContext2D,
  texture: ComposedTexture,
  toXY: (point: LatLon) => { x: number; y: number },
  project: (point: Vec3) => Projected
) {
  const columns = 14
  const rows = 14
  const { bounds, image } = texture
  const imageWidth = image.naturalWidth || texture.width
  const imageHeight = image.naturalHeight || texture.height
  const at = (column: number, row: number) => {
    const u = column / columns
    const v = row / rows
    const point = toXY({
      lon: bounds.minLon + (bounds.maxLon - bounds.minLon) * u,
      lat: bounds.maxLat - (bounds.maxLat - bounds.minLat) * v,
    })
    return {
      src: { x: u * imageWidth, y: v * imageHeight },
      dst: project({ ...point, z: 0 }),
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = at(column, row)
      const b = at(column + 1, row)
      const c = at(column + 1, row + 1)
      const d = at(column, row + 1)
      drawTexturedTriangle(ctx, image, [a.src, b.src, c.src], [a.dst, b.dst, c.dst])
      drawTexturedTriangle(ctx, image, [a.src, c.src, d.src], [a.dst, c.dst, d.dst])
    }
  }
}

function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: { x: number; y: number }[],
  destination: Projected[]
) {
  const [s0, s1, s2] = source
  const [d0, d1, d2] = destination
  const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y)
  if (Math.abs(denominator) < 1e-6) return
  const a = (d0.sx * (s1.y - s2.y) + d1.sx * (s2.y - s0.y) + d2.sx * (s0.y - s1.y)) / denominator
  const b = (d0.sy * (s1.y - s2.y) + d1.sy * (s2.y - s0.y) + d2.sy * (s0.y - s1.y)) / denominator
  const c = (d0.sx * (s2.x - s1.x) + d1.sx * (s0.x - s2.x) + d2.sx * (s1.x - s0.x)) / denominator
  const d = (d0.sy * (s2.x - s1.x) + d1.sy * (s0.x - s2.x) + d2.sy * (s1.x - s0.x)) / denominator
  const e =
    (d0.sx * (s1.x * s2.y - s2.x * s1.y) +
      d1.sx * (s2.x * s0.y - s0.x * s2.y) +
      d2.sx * (s0.x * s1.y - s1.x * s0.y)) /
    denominator
  const f =
    (d0.sy * (s1.x * s2.y - s2.x * s1.y) +
      d1.sy * (s2.x * s0.y - s0.x * s2.y) +
      d2.sy * (s0.x * s1.y - s1.x * s0.y)) /
    denominator
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(d0.sx, d0.sy)
  ctx.lineTo(d1.sx, d1.sy)
  ctx.lineTo(d2.sx, d2.sy)
  ctx.closePath()
  ctx.clip()
  ctx.transform(a, b, c, d, e, f)
  ctx.drawImage(image, 0, 0)
  ctx.restore()
}

function addObstacleSurfaces(surfaces: Surface[], center: { x: number; y: number }, obstacle: Obstacle) {
  const radius = obstacle.width / 2
  const ring = Array.from({ length: 8 }, (_, index) => ({
    x: center.x + Math.cos((index / 8) * Math.PI * 2) * radius,
    y: center.y + Math.sin((index / 8) * Math.PI * 2) * radius,
  }))
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index]
    const b = ring[(index + 1) % ring.length]
    surfaces.push({
      points: [{ ...a, z: 0 }, { ...b, z: 0 }, { ...b, z: obstacle.height }, { ...a, z: obstacle.height }],
      fill: 'rgba(154,83,35,0.9)',
      stroke: 'rgba(253,186,116,0.5)',
    })
  }
  surfaces.push({
    points: ring.map((point) => ({ ...point, z: obstacle.height })),
    fill: 'rgba(249,115,22,0.88)',
    stroke: '#fdba74',
  })
}

function averageDepth(surface: Surface, project: (point: Vec3) => Projected) {
  return surface.points.reduce((sum, point) => sum + project(point).depth, 0) / surface.points.length
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function rectangleOnGround(start: { x: number; y: number }, end: { x: number; y: number }) {
  return [
    { x: start.x, y: start.y },
    { x: end.x, y: start.y },
    { x: end.x, y: end.y },
    { x: start.x, y: end.y },
  ]
}

function hitSurfaceAt(
  x: number,
  y: number,
  surfaces: { id: string; points: { x: number; y: number }[]; depth: number }[]
) {
  return [...surfaces]
    .sort((a, b) => b.depth - a.depth)
    .find((surface) => pointInPolygon2D({ x, y }, surface.points))?.id
}

function pointInPolygon2D(point: { x: number; y: number }, polygon: { x: number; y: number }[]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]
    const b = polygon[previous]
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}
