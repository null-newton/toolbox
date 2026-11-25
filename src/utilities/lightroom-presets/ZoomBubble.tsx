import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

const SIZE = 150

/**
 * Magnifier for the preview canvas: tap/click the photo and a round zoom bubble
 * appears above the finger, follows it while dragging and stays after release.
 * Tap the bubble to close it. It redraws whenever the canvas re-renders (the
 * preview dispatches a `rendered` event), so slider changes show up live.
 */
export function ZoomBubble({ canvasRef, resetKey, label }: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  resetKey: string
  label: string
}) {
  const bubbleRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<HTMLCanvasElement>(null)
  const pointRef = useRef<{ fx: number; fy: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(resetKey)
  if (key !== resetKey) {
    // A different photo: close the bubble.
    setKey(resetKey)
    setOpen(false)
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current, bubble = bubbleRef.current, zoom = zoomRef.current, point = pointRef.current
    const container = bubble?.parentElement
    if (!canvas || !bubble || !zoom || !point || !container || !canvas.width) return
    const rect = canvas.getBoundingClientRect(), crect = container.getBoundingClientRect()
    const px = rect.left - crect.left + point.fx * rect.width
    const py = rect.top - crect.top + point.fy * rect.height
    // Keep the bubble clear of the finger: above it if there's room, otherwise beside it.
    const size = Math.max(80, Math.min(SIZE, crect.height - 8))
    const gap = 24
    let left: number, top: number
    if (py - size - gap >= 4) {
      left = px - size / 2
      top = py - size - gap
    } else {
      left = px + gap + size <= crect.width - 4 ? px + gap : px - gap - size
      top = py - size / 2
    }
    bubble.style.width = bubble.style.height = `${size}px`
    bubble.style.left = `${Math.max(4, Math.min(crect.width - size - 4, left))}px`
    bubble.style.top = `${Math.max(4, Math.min(crect.height - size - 4, top))}px`

    const dpr = window.devicePixelRatio || 1
    const out = Math.round(size * dpr)
    if (zoom.width !== out) { zoom.width = out; zoom.height = out }
    const ratio = canvas.width / rect.width // canvas pixels per CSS pixel
    const factor = Math.min(6, Math.max(2.5, ratio)) // at least 2.5×, at most 6× the on-screen size
    const src = (size / factor) * ratio
    const ctx = zoom.getContext('2d')!
    ctx.fillStyle = '#05080a'
    ctx.fillRect(0, 0, out, out)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(canvas, point.fx * canvas.width - src / 2, point.fy * canvas.height - src / 2, src, src, 0, 0, out, out)
  }, [canvasRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let pressed = false
    const update = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointRef.current = {
        fx: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        fy: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
      }
      setOpen(true)
      draw()
    }
    const down = (e: PointerEvent) => { pressed = true; canvas.setPointerCapture(e.pointerId); update(e) }
    const move = (e: PointerEvent) => { if (pressed) update(e) }
    const up = () => { pressed = false }
    const onResize = () => draw()
    canvas.style.touchAction = 'none'
    canvas.style.cursor = 'zoom-in'
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('rendered', onResize)
    window.addEventListener('resize', onResize)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('rendered', onResize)
      window.removeEventListener('resize', onResize)
    }
  }, [canvasRef, draw])

  // The bubble element mounts when opened; draw into it once it exists.
  useEffect(() => { if (open) draw() }, [open, draw])

  return (
    <div
      ref={bubbleRef}
      // Close on a tap that starts on the bubble (not the click that trails a tap on the photo).
      onPointerDown={(e) => { e.stopPropagation(); setOpen(false) }}
      role="button"
      aria-label={label}
      title={label}
      className={`absolute z-10 overflow-hidden rounded-full shadow-2xl shadow-black/60 ring-2 ring-white/80 ${open ? '' : 'hidden'}`}
      style={{ width: SIZE, height: SIZE }}
    >
      <canvas ref={zoomRef} className="size-full" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 ring-1 ring-black/40" />
    </div>
  )
}
