// Canvas drawing shared by the live preview and both exporters, so output matches the preview.
import { cropStage, placeClip, type FitMode, type Overlay, type TextOverlay, type VideoClip } from './types'

const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (!words.length) { lines.push(''); continue }
    let line = ''
    for (const w of words) { const c = line ? `${line} ${w}` : w; if (ctx.measureText(c).width <= maxWidth || !line) line = c; else { lines.push(line); line = w } }
    if (line) lines.push(line)
  }
  return lines
}

function drawTextOverlay(ctx: CanvasRenderingContext2D, o: TextOverlay, cw: number, ch: number) {
  const bx = o.x * cw, by = o.y * ch, bw = o.w * cw, bh = o.h * ch, fs = Math.max(8, o.fontScale * ch), pad = fs * 0.3, lh = fs * 1.2
  ctx.font = `${o.bold ? '700' : '400'} ${fs}px ${FONT}`; ctx.textBaseline = 'top'
  const lines = wrapText(ctx, o.text, bw - pad * 2)
  if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(bx, by, bw, Math.min(bh, lines.length * lh + pad * 2)) }
  ctx.fillStyle = o.color; ctx.textAlign = o.align
  const tx = o.align === 'left' ? bx + pad : o.align === 'right' ? bx + bw - pad : bx + bw / 2
  lines.forEach((l, i) => ctx.fillText(l, tx, by + pad + i * lh))
}

export interface ActiveOverlay { overlay: Overlay; image?: HTMLImageElement | null }
export interface VideoLayer { source: CanvasImageSource; sw: number; sh: number; clip: VideoClip }

// Paint one frame; `cropEdit` draws the whole (uncropped) source with everything outside the crop dimmed.
export function drawFrame(ctx: CanvasRenderingContext2D, cw: number, ch: number, layer: VideoLayer | null, overlays: ActiveOverlay[], fit: FitMode = 'contain', cropEdit = false) {
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, cw, ch)
  if (layer && layer.sw && layer.sh) {
    const { source: s, sw, sh, clip } = layer
    if (cropEdit) {
      const u = cropStage(sw, sh, cw, ch), c = clip.crop
      ctx.drawImage(s, 0, 0, sw, sh, u.dx, u.dy, u.dw, u.dh)
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.rect(u.dx, u.dy, u.dw, u.dh); ctx.rect(u.dx + c.x * u.dw, u.dy + c.y * u.dh, c.w * u.dw, c.h * u.dh); ctx.fill('evenodd')
    } else {
      const p = placeClip(clip, sw, sh, cw, ch, fit)
      ctx.drawImage(s, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh)
    }
  }
  for (const { overlay: o, image } of overlays) {
    if (o.type === 'color') { ctx.globalAlpha = o.opacity; ctx.fillStyle = o.color; ctx.fillRect(o.x * cw, o.y * ch, o.w * cw, o.h * ch); ctx.globalAlpha = 1 }
    else if (o.type === 'image') {
      if (!image?.complete || !image.naturalWidth) continue
      const bw = o.w * cw, bh = o.h * ch, k = Math.min(bw / image.naturalWidth, bh / image.naturalHeight), dw = image.naturalWidth * k, dh = image.naturalHeight * k
      ctx.drawImage(image, o.x * cw + (bw - dw) / 2, o.y * ch + (bh - dh) / 2, dw, dh)
    } else drawTextOverlay(ctx, o, cw, ch)
  }
}
