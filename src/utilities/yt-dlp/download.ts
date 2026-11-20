import { backendFetch as fetch } from '../../lib/backend-fetch'
import { functionsBase } from '../../lib/supabase'

export type DownloadEvent =
  | { type: 'progress'; percent: number; speed: string | null; eta: string | null }
  | { type: 'status'; stage: string | null }
  | { type: 'saving'; percent: number | null }

// Cloudflare Tunnel caps a response at 100 MB, so the finished file is fetched in slices.
const TUNNEL_CHUNK = 90 * 1024 * 1024
const MIME_BY_EXT: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', opus: 'audio/opus', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg' }

export const mimeFor = (filename: string) => MIME_BY_EXT[filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()] || 'application/octet-stream'

// Run yt-dlp on the backend, stream NDJSON progress, then pull the finished file into a File.
export async function downloadViaBackend(options: Record<string, unknown>, url: string, onEvent: (e: DownloadEvent) => void, signal?: AbortSignal): Promise<File> {
  const res = await fetch(`${functionsBase}/video-download`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...options, url, rightsConfirmed: true }), signal })
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error || `Server error (${res.status})`)
  const reader = res.body.getReader(), decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
      if (!line) continue
      const msg = JSON.parse(line)
      if (msg.type === 'progress') onEvent({ type: 'progress', percent: msg.percent, speed: msg.speed, eta: msg.eta })
      else if (msg.type === 'status') onEvent({ type: 'status', stage: msg.stage })
      else if (msg.type === 'error') throw new Error(msg.message)
      else if (msg.type === 'done') { reader.cancel().catch(() => {}); return fetchJobFile(msg.jobId, msg.filename, msg.size, onEvent, signal) }
    }
  }
  throw new Error('Download ended unexpectedly')
}

async function fetchJobFile(jobId: string, filename: string, size: number, onEvent: (e: DownloadEvent) => void, signal?: AbortSignal): Promise<File> {
  const base = `${functionsBase}/video-download?job=${encodeURIComponent(jobId)}`, parts: Blob[] = []
  onEvent({ type: 'saving', percent: size > 0 ? 0 : null })
  try {
    for (let offset = 0; offset < Math.max(size, 1); offset += TUNNEL_CHUNK) {
      const length = Math.min(TUNNEL_CHUNK, size - offset), res = await fetch(`${base}&offset=${offset}&length=${length}`, { signal })
      if (!res.ok) throw new Error(`Transfer failed (${res.status})`)
      parts.push(await res.blob())
      if (size > 0) onEvent({ type: 'saving', percent: Math.min(100, ((offset + length) / size) * 100) })
      else break
    }
  } finally { fetch(`${base}&release=1`).catch(() => {}) }
  return new File(parts, filename, { type: mimeFor(filename) })
}

export function saveFile(file: Blob, filename: string) {
  const u = URL.createObjectURL(file), a = Object.assign(document.createElement('a'), { href: u, download: filename })
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60_000)
}

// In-memory handoff of downloaded files to the video editor (survives client-side navigation only).
const editorInbox: File[] = []
export const sendToVideoEditor = (f: File) => { editorInbox.push(f) }
export const takeVideoEditorInbox = () => editorInbox.splice(0)
