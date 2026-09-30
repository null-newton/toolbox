import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import {
  AlignCenter, Captions, Check, ChevronDown, Download, FileText, Film,
  Languages, Link2, LoaderCircle, Pause, Play, Plus, RotateCcw, Sparkles,
  Trash2, Upload, WandSparkles,
} from 'lucide-react'
import { functionsBase } from '../../lib/supabase'

type Cue = { id: number; start: number; end: number; text: string }
type Phase = 'source' | 'ready' | 'transcribing' | 'editing' | 'rendering'

const api = `${functionsBase}/subtitle-studio`

function clock(seconds: number, millis = false) {
  const value = Math.max(0, seconds)
  const h = Math.floor(value / 3600)
  const m = Math.floor((value % 3600) / 60)
  const s = Math.floor(value % 60)
  const ms = Math.round((value % 1) * 1000)
  return millis
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
    : `${String(m + h * 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

function srt(cues: Cue[]) {
  return cues.map((cue, i) => `${i + 1}\n${clock(cue.start, true)} --> ${clock(cue.end, true)}\n${cue.text.trim()}\n`).join('\n')
}

const LANGUAGES = [
  ['auto', 'Auto-detect'], ['en', 'English'], ['nl', 'Dutch'], ['fr', 'French'],
  ['de', 'German'], ['es', 'Spanish'], ['it', 'Italian'], ['pt', 'Portuguese'],
]

export function SubtitleStudio() {
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [tab, setTab] = useState<'url' | 'upload'>('url')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [phase, setPhase] = useState<Phase>('source')
  const [progress, setProgress] = useState(0)
  const [jobId, setJobId] = useState('')
  const [language, setLanguage] = useState('auto')
  const [model, setModel] = useState('base')
  const [cues, setCues] = useState<Cue[]>([])
  const [activeCue, setActiveCue] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [fontSize, setFontSize] = useState(32)
  const [position, setPosition] = useState<'bottom' | 'middle'>('bottom')
  const [background, setBackground] = useState(true)

  useEffect(() => () => { if (videoUrl.startsWith('blob:')) URL.revokeObjectURL(videoUrl) }, [videoUrl])

  const duration = useMemo(() => cues.reduce((max, cue) => Math.max(max, cue.end), 0), [cues])
  const words = useMemo(() => cues.reduce((n, cue) => n + cue.text.trim().split(/\s+/).filter(Boolean).length, 0), [cues])

  function selectFile(next: File | null) {
    if (!next) return
    if (!next.type.startsWith('video/')) { setError('Choose a video file such as MP4, MOV, WebM, or MKV.'); return }
    if (videoUrl.startsWith('blob:')) URL.revokeObjectURL(videoUrl)
    setFile(next)
    setVideoUrl(URL.createObjectURL(next))
    setPhase('ready')
    setError('')
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    selectFile(event.dataTransfer.files[0] || null)
  }

  async function parseResponse(response: Response) {
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Something went wrong.')
    return data
  }

  async function uploadVideo(source: File) {
    setStatus('Preparing secure upload…')
    const created = await parseResponse(await fetch(`${api}?action=create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: source.name, size: source.size }),
    }))
    setJobId(created.jobId)
    setStatus('Uploading video…')
    const chunkSize = 20 * 1024 * 1024
    for (let offset = 0; offset < source.size; offset += chunkSize) {
      const chunk = source.slice(offset, Math.min(source.size, offset + chunkSize))
      await parseResponse(await fetch(`${api}?action=upload&job=${encodeURIComponent(created.jobId)}&offset=${offset}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk,
      }))
      setProgress(8 + Math.round(((offset + chunk.size) / source.size) * 34))
    }
    setProgress(42)
    return created.jobId as string
  }

  async function transcribe() {
    if (tab === 'url' && !url.trim()) { setError('Paste a video URL first.'); return }
    if (tab === 'upload' && !file) { setError('Choose a video file first.'); return }
    setError('')
    setPhase('transcribing')
    setProgress(5)
    try {
      const id = file && tab === 'upload' ? await uploadVideo(file) : ''
      setStatus(tab === 'url' ? 'Downloading source video…' : 'Extracting audio…')
      setProgress(id ? 48 : 20)
      const data = await parseResponse(await fetch(`${api}?action=transcribe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id || undefined, url: tab === 'url' ? url.trim() : undefined, language, model }),
      }))
      setJobId(data.jobId)
      setCues(data.cues)
      setVideoUrl(`${api}?action=file&job=${encodeURIComponent(data.jobId)}&kind=source`)
      setProgress(100)
      setStatus('Transcript ready')
      setPhase('editing')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed.')
      setPhase(file ? 'ready' : 'source')
    }
  }

  function updateCue(id: number, patch: Partial<Cue>) {
    setCues(current => current.map(cue => cue.id === id ? { ...cue, ...patch } : cue))
  }

  function seek(cue: Cue, index: number) {
    setActiveCue(index)
    if (videoRef.current) videoRef.current.currentTime = cue.start
  }

  function addCue() {
    const last = cues.at(-1)
    setCues(current => [...current, { id: Date.now(), start: last?.end || 0, end: (last?.end || 0) + 2, text: 'New subtitle' }])
  }

  function downloadSrt() { saveBlob(new Blob([srt(cues)], { type: 'application/x-subrip' }), 'subtitles.srt') }

  async function renderVideo() {
    setPhase('rendering'); setError(''); setProgress(12); setStatus('Rendering subtitles onto video…')
    try {
      await parseResponse(await fetch(`${api}?action=render`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, srt: srt(cues), style: { fontSize, position, background } }),
      }))
      setProgress(100); setStatus('Captioned video ready'); setPhase('editing')
      window.location.href = `${api}?action=file&job=${encodeURIComponent(jobId)}&kind=render`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Video export failed.'); setPhase('editing')
    }
  }

  const reset = () => {
    setFile(null); setUrl(''); setCues([]); setJobId(''); setVideoUrl(''); setError(''); setProgress(0); setPhase('source')
  }

  const active = cues[activeCue]

  return (
    <div className="mx-auto w-full max-w-[1440px] animate-fade-up pb-16">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-slate-700/80 pb-7">
        <div>
          <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.24em] text-cyan-300">
            <span className="h-px w-7 bg-cyan-300" /> Media utility / AI transcription
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100 sm:text-5xl">Subtitle Studio</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Turn any video into accurate, editable subtitles — then export the SRT or burn captions straight into the video.</p>
        </div>
        {phase !== 'source' && <button onClick={reset} className="flex items-center gap-2 border border-slate-700 bg-panel px-4 py-2.5 text-sm text-slate-300 hover:border-slate-500 hover:text-white"><RotateCcw className="size-4" /> Start over</button>}
      </header>

      {phase === 'source' || phase === 'ready' || phase === 'transcribing' ? (
        <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
          <section className="glass p-5 sm:p-8">
            <div className="mb-7 flex border-b border-slate-700">
              {(['url', 'upload'] as const).map(item => <button key={item} onClick={() => setTab(item)} className={`-mb-px flex flex-1 items-center justify-center gap-2 border-b-2 px-4 pb-4 text-sm font-semibold ${tab === item ? 'border-indigo-300 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-200'}`}>{item === 'url' ? <Link2 className="size-4" /> : <Upload className="size-4" />}{item === 'url' ? 'Paste video URL' : 'Upload a video'}</button>)}
            </div>
            {tab === 'url' ? (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-200">Video URL</label>
                <div className="flex gap-2"><input value={url} onChange={e => { setUrl(e.target.value); setPhase(e.target.value ? 'ready' : 'source') }} placeholder="https://youtube.com/watch?v=…" className="form-input h-12 flex-1 font-mono" /><button onClick={async () => { const text = await navigator.clipboard.readText(); setUrl(text); setPhase('ready') }} className="border border-slate-700 px-4 text-sm text-slate-300 hover:border-cyan-400 hover:text-cyan-300">Paste</button></div>
                <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Check className="size-3.5 text-indigo-300" /> YouTube, Vimeo, TikTok, X, and thousands more via yt-dlp</p>
              </div>
            ) : (
              <div onDragOver={e => e.preventDefault()} onDrop={drop} onClick={() => inputRef.current?.click()} className="group flex min-h-52 cursor-pointer flex-col items-center justify-center border border-dashed border-slate-600 bg-slate-950/40 p-8 text-center transition hover:border-indigo-300 hover:bg-indigo-300/[.03]">
                <input ref={inputRef} type="file" accept="video/*,.mkv" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => selectFile(e.target.files?.[0] || null)} />
                <span className="mb-4 grid size-12 place-items-center border border-slate-700 bg-panel text-indigo-300 group-hover:border-indigo-300"><Upload className="size-5" /></span>
                <strong className="text-slate-100">{file ? file.name : 'Drop your video here'}</strong>
                <span className="mt-2 text-sm text-slate-500">{file ? `${(file.size / 1048576).toFixed(1)} MB · click to replace` : 'or click to browse · MP4, MOV, WebM, MKV'}</span>
              </div>
            )}

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200"><Languages className="size-4 text-cyan-300" /> Spoken language</span><span className="relative block"><select value={language} onChange={e => setLanguage(e.target.value)} className="form-input h-11 appearance-none">{LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 size-4 text-slate-500" /></span></label>
              <label className="block"><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200"><Sparkles className="size-4 text-cyan-300" /> Accuracy model</span><span className="relative block"><select value={model} onChange={e => setModel(e.target.value)} className="form-input h-11 appearance-none"><option value="tiny">Tiny · fastest</option><option value="base">Base · balanced</option><option value="small">Small · accurate</option><option value="medium">Medium · best</option></select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 size-4 text-slate-500" /></span></label>
            </div>
            {error && <p className="mt-5 border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
            {phase === 'transcribing' ? <div className="mt-7"><div className="mb-2 flex justify-between text-xs"><span className="flex items-center gap-2 text-slate-300"><LoaderCircle className="size-3.5 animate-spin text-indigo-300" />{status}</span><span className="font-mono text-indigo-300">{progress}%</span></div><div className="h-1 bg-slate-800"><div className="h-full bg-indigo-300 transition-all duration-700" style={{ width: `${progress}%` }} /></div><p className="mt-3 text-xs text-slate-500">Keep this tab open. Processing time depends on video length and model size.</p></div> : <button onClick={transcribe} className="mt-7 flex w-full items-center justify-center gap-2 bg-indigo-300 px-5 py-3.5 text-sm font-bold text-slate-950 hover:bg-indigo-200 disabled:opacity-40" disabled={(tab === 'url' ? !url.trim() : !file)}><WandSparkles className="size-4" /> Generate subtitles</button>}
          </section>

          <aside className="glass flex flex-col p-6">
            <p className="font-mono text-[10px] uppercase tracking-[.22em] text-slate-500">Workflow</p>
            <div className="mt-5 space-y-1">{[['01','Add a video','Paste a link or upload from your device'],['02','AI transcription','Whisper detects speech and timings'],['03','Review & style','Edit every line and choose its look'],['04','Export','Download SRT or captioned MP4']].map(([n,title,desc], i) => <div key={n} className={`flex gap-4 border-l p-4 ${i === 0 ? 'border-indigo-300 bg-indigo-300/[.04]' : 'border-slate-700'}`}><span className={`font-mono text-xs ${i === 0 ? 'text-indigo-300' : 'text-slate-600'}`}>{n}</span><div><p className="text-sm font-semibold text-slate-200">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{desc}</p></div></div>)}</div>
            <div className="mt-auto border-t border-slate-700 pt-5 text-xs leading-5 text-slate-500"><span className="text-slate-300">Private by design.</span> Temporary media is automatically cleared by the server after two hours.</div>
          </aside>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,.9fr)]">
          <div className="space-y-5">
            <section className="glass overflow-hidden">
              <div className="relative aspect-video bg-black">
                <video ref={videoRef} src={videoUrl} className="h-full w-full" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={e => { const time = e.currentTarget.currentTime; setCurrentTime(time); const i = cues.findIndex(c => time >= c.start && time <= c.end); if (i >= 0) setActiveCue(i) }} />
                {active && <div className={`pointer-events-none absolute inset-x-6 flex justify-center ${position === 'middle' ? 'top-1/2 -translate-y-1/2' : 'bottom-12'}`}><span className={`${background ? 'bg-black/80 px-3 py-1.5' : ''} max-w-[85%] text-center font-bold text-white [text-shadow:0_2px_4px_#000]`} style={{ fontSize: `${Math.max(16, fontSize * .72)}px` }}>{active.text}</span></div>}
                <button onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()} className="absolute left-4 bottom-3 grid size-8 place-items-center bg-black/70 text-white">{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
              </div>
              <div className="flex items-center justify-between border-t border-slate-700 px-4 py-3 text-xs text-slate-500"><span>{clock(currentTime)} / {clock(duration)}</span><span>{cues.length} captions · {words} words</span></div>
            </section>
            <section className="glass p-5">
              <div className="mb-5 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-cyan-300">Caption style</p><h2 className="mt-1 font-bold text-slate-100">Preview & appearance</h2></div><AlignCenter className="size-5 text-slate-500" /></div>
              <div className="grid gap-5 sm:grid-cols-3"><label className="text-xs text-slate-400">Font size <input type="range" min="20" max="54" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="mt-3 w-full accent-indigo-300" /><span className="font-mono text-slate-200">{fontSize}px</span></label><label className="text-xs text-slate-400">Position<select className="form-input mt-2" value={position} onChange={e => setPosition(e.target.value as 'bottom'|'middle')}><option value="bottom">Bottom</option><option value="middle">Middle</option></select></label><label className="flex items-center gap-3 self-end border border-slate-700 px-3 py-2.5 text-xs text-slate-300"><input type="checkbox" checked={background} onChange={e => setBackground(e.target.checked)} className="accent-indigo-300" /> Dark background</label></div>
            </section>
          </div>

          <section className="glass flex max-h-[760px] min-h-[620px] flex-col">
            <div className="flex items-center justify-between border-b border-slate-700 p-5"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-cyan-300">Transcript</p><h2 className="mt-1 text-lg font-bold text-slate-100">Edit subtitles</h2></div><button onClick={addCue} className="flex items-center gap-2 border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-indigo-300 hover:text-indigo-300"><Plus className="size-3.5" /> Add line</button></div>
            <div className="flex-1 overflow-y-auto p-3">{cues.map((cue, i) => <div key={cue.id} onClick={() => seek(cue, i)} className={`group mb-2 grid cursor-pointer grid-cols-[44px_1fr_28px] gap-3 border p-3 ${activeCue === i ? 'border-indigo-300/60 bg-indigo-300/[.05]' : 'border-slate-800 hover:border-slate-600'}`}><button className={`grid size-8 place-items-center self-start ${activeCue === i ? 'bg-indigo-300 text-slate-950' : 'bg-slate-800 text-slate-500'}`}><Play className="size-3" /></button><div><div className="mb-2 flex items-center gap-2 font-mono text-[10px] text-slate-500"><input aria-label="Start time" type="number" step="0.1" value={cue.start} onChange={e => updateCue(cue.id, { start: Number(e.target.value) })} className="w-16 bg-transparent text-cyan-300 outline-none" />→<input aria-label="End time" type="number" step="0.1" value={cue.end} onChange={e => updateCue(cue.id, { end: Number(e.target.value) })} className="w-16 bg-transparent text-cyan-300 outline-none" /><span>{clock(cue.start)}–{clock(cue.end)}</span></div><textarea value={cue.text} onChange={e => updateCue(cue.id, { text: e.target.value })} onClick={e => e.stopPropagation()} rows={2} className="w-full resize-none bg-transparent text-sm leading-5 text-slate-200 outline-none" /></div><button aria-label="Delete caption" onClick={e => { e.stopPropagation(); setCues(current => current.filter(c => c.id !== cue.id)) }} className="self-start p-1 text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-300"><Trash2 className="size-4" /></button></div>)}</div>
            {error && <p className="mx-4 mb-3 text-xs text-red-300">{error}</p>}
            {phase === 'rendering' && <div className="border-t border-slate-700 px-5 py-3"><div className="mb-2 flex justify-between text-xs text-slate-400"><span>{status}</span><span>{progress}%</span></div><div className="h-1 bg-slate-800"><div className="h-full bg-indigo-300" style={{ width: `${progress}%` }} /></div></div>}
            <div className="grid grid-cols-2 gap-3 border-t border-slate-700 p-4"><button onClick={downloadSrt} className="flex items-center justify-center gap-2 border border-slate-600 px-3 py-3 text-xs font-semibold text-slate-200 hover:border-cyan-300 hover:text-cyan-300"><FileText className="size-4" /> Download SRT</button><button onClick={renderVideo} disabled={phase === 'rendering'} className="flex items-center justify-center gap-2 bg-indigo-300 px-3 py-3 text-xs font-bold text-slate-950 hover:bg-indigo-200 disabled:opacity-50">{phase === 'rendering' ? <LoaderCircle className="size-4 animate-spin" /> : <Film className="size-4" />} Export video</button></div>
          </section>
        </div>
      )}
      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[.15em] text-slate-600"><span className="flex items-center gap-2"><Captions className="size-3.5" /> Whisper transcription · FFmpeg rendering</span><span className="flex items-center gap-2"><Download className="size-3.5" /> SRT + MP4 export</span></footer>
    </div>
  )
}
