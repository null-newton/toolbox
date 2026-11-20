import { useRef, useState } from 'react'
import { Link2, Loader2, X } from 'lucide-react'
import { MediaRightsConfirmation } from '../../legal/MediaRightsConfirmation'
import { downloadViaBackend } from '../yt-dlp/download'
import { Pills } from './Inspector'
import type { T } from './strings'

// Pull a video/audio from a URL through the Video Downloader backend and hand it to the editor as a File.
export function UrlImport({ t, allowed, onFile, onClose }: { t: T; allowed: boolean; onFile: (f: File) => Promise<void>; onClose: () => void }) {
  const [url, setUrl] = useState(''), [quality, setQuality] = useState<'720' | '1080' | 'best'>('1080'), [audioOnly, setAudioOnly] = useState(false)
  const [rights, setRights] = useState(false), [status, setStatus] = useState<string | null>(null), [pct, setPct] = useState<number | null>(null), [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const busy = status !== null
  const run = async () => {
    if (!rights) return setError(t.rightsNeeded)
    const ctl = (abort.current = new AbortController())
    setError(null); setStatus(t.importing); setPct(null); setRights(false)
    try {
      // Force H.264/AAC MP4 (or m4a) so every browser can decode it for preview and fast export.
      const file = await downloadViaBackend({ mode: audioOnly ? 'audio' : 'video', videoQuality: quality, forceMp4: true, audioFormat: 'm4a', playlist: 'single' }, url.trim(), (e) => {
        if (e.type === 'progress') { setStatus(t.importing); setPct(e.percent) } else if (e.type === 'status') { setStatus(t.processing); setPct(null) } else { setStatus(t.transferring); setPct(e.percent) }
      }, ctl.signal)
      await onFile(file)
      setUrl('')
    } catch (e) { if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : String(e)) } finally { setStatus(null); setPct(null); abort.current = null }
  }
  return <div className="glass mt-3 rounded-2xl p-4">
    <div className="flex items-center gap-2"><Link2 className="size-4 text-indigo-300" /><h3 className="text-sm font-semibold text-slate-200">{t.urlTitle}</h3><button onClick={onClose} className="ml-auto text-slate-500 hover:text-white" aria-label={t.cancel}><X className="size-4" /></button></div>
    {!allowed ? <p className="mt-2 text-sm text-slate-400">{t.signInForUrl}</p> : <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={url} onChange={(e) => { setUrl(e.target.value); setRights(false) }} disabled={busy} placeholder={t.urlPlaceholder} className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-400/60 focus:outline-none" />
        <span className="text-xs text-slate-400">{t.quality}</span>
        <Pills value={quality} options={[['720', '720p'], ['1080', '1080p'], ['best', t.best]]} onChange={setQuality} />
        <label className="flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={audioOnly} onChange={(e) => setAudioOnly(e.target.checked)} className="accent-indigo-500" />{t.audioOnly}</label>
      </div>
      <MediaRightsConfirmation checked={rights} disabled={busy} onChange={setRights} />
      <div className="mt-3 flex items-center gap-3">
        {busy ? <>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all ${pct === null ? 'w-full animate-pulse' : ''}`} style={pct === null ? undefined : { width: `${pct}%` }} /></div>
          <span className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="size-3.5 animate-spin" />{status}{pct !== null && ` ${Math.round(pct)}%`}</span>
          <button onClick={() => abort.current?.abort()} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10">{t.cancel}</button>
        </> : <button onClick={run} disabled={!url.trim() || !rights} className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{t.importBtn}</button>}
      </div>
      {error && <p className="mt-2 break-words text-xs text-rose-300">{error}</p>}
    </>}
  </div>
}
