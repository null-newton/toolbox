import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Mic,
  Music2,
  Pause,
  Play,
  Search,
  Square,
  Waves,
  X,
} from 'lucide-react'
import { useT } from '../../i18n/LanguageContext'
import { functionsBase } from '../../lib/supabase'

interface Song {
  id: number
  title: string
  artist: string
  album: string
  duration: number
  syncedLyrics: string
  plainLyrics: string | null
}

interface LyricLine {
  time: number
  text: string
}

interface AudioRecognition {
  track: Song | null
  recognized: {
    title: string
    artist: string
    album: string | null
    duration: number | null
  }
  offsetSeconds: number
  confidence: number | null
}

const STR = {
  en: {
    title: 'Live Lyrics',
    subtitle: 'Let your microphone hear the music. The backend identifies the recording and keeps its lyrics in sync.',
    idle: 'Ready when the music is',
    idleHint: 'Hold the device near the speaker. A clear 9-second sample gives the best match.',
    listen: 'Listen for a song',
    listening: 'Recording the music…',
    processing: 'Matching this sample on your backend…',
    stop: 'Cancel',
    permission: 'Microphone access is needed to listen. Check your browser permission and try again.',
    unsupported: 'Audio recording is not supported in this browser. Try a current browser or use manual search.',
    noMatch: 'That sample could not be identified. Try a louder or clearer section, or search manually.',
    genericError: 'Something went wrong while identifying the song.',
    catalogNotReady: 'The backend recognizer is not ready yet. Install ShazamIO on the backend.',
    noSyncedLyrics: 'was recognized, but no synchronized lyrics were found for it.',
    manual: 'Know the song already?',
    manualHint: 'Search by title and artist to open its synced lyrics.',
    searchPlaceholder: 'Song title or artist…',
    search: 'Search',
    noResults: 'No synced lyrics found for that search.',
    results: 'Possible matches',
    nowPlaying: 'NOW FOLLOWING',
    sync: 'Lyrics timing',
    earlier: 'Lyrics earlier',
    later: 'Lyrics later',
    restart: 'Listen for another song',
    privacy: 'A short microphone sample is encrypted in transit and deleted from your Toolbox backend after matching. ShazamIO sends its audio signature to Shazam.',
    source: 'Synced lyrics from LRCLIB',
  },
  nl: {
    title: 'Live songtekst',
    subtitle: 'Laat je microfoon de muziek horen. De backend herkent het nummer en laat de tekst meelopen.',
    idle: 'Klaar wanneer de muziek dat is',
    idleHint: 'Houd het apparaat dicht bij de luidspreker. Een helder fragment van 9 seconden werkt het beste.',
    listen: 'Luister naar een nummer',
    listening: 'De muziek opnemen…',
    processing: 'Dit fragment op je backend herkennen…',
    stop: 'Annuleren',
    permission: 'Microfoontoegang is nodig. Controleer de browsertoestemming en probeer opnieuw.',
    unsupported: 'Audio opnemen werkt niet in deze browser. Probeer een recente browser of zoek handmatig.',
    noMatch: 'Dit fragment kon niet worden herkend. Probeer een luider of helderder stuk, of zoek handmatig.',
    genericError: 'Er ging iets mis bij het herkennen van het nummer.',
    catalogNotReady: 'De herkenningssoftware op de backend is nog niet klaar. Installeer ShazamIO op de backend.',
    noSyncedLyrics: 'werd herkend, maar er werd geen gesynchroniseerde songtekst gevonden.',
    manual: 'Ken je het nummer al?',
    manualHint: 'Zoek op titel en artiest om de gesynchroniseerde tekst te openen.',
    searchPlaceholder: 'Titel of artiest…',
    search: 'Zoeken',
    noResults: 'Geen gesynchroniseerde songtekst gevonden.',
    results: 'Mogelijke matches',
    nowPlaying: 'NU GEVOLGD',
    sync: 'Timing songtekst',
    earlier: 'Tekst vroeger',
    later: 'Tekst later',
    restart: 'Luister naar een ander nummer',
    privacy: 'Een kort microfoonfragment wordt versleuteld verstuurd en daarna van je Toolbox-backend verwijderd. ShazamIO stuurt de audiovingerafdruk naar Shazam.',
    source: 'Gesynchroniseerde tekst van LRCLIB',
  },
}

const API_URL = `${functionsBase}/song-listener`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const SAMPLE_DURATION_MS = 9_000

function apiHeaders(extra: Record<string, string> = {}) {
  return {
    ...(ANON_KEY ? { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY } : {}),
    ...extra,
  }
}

function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const row of source.split(/\r?\n/)) {
    const match = row.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]\s*(.*)$/)
    if (!match) continue
    const fraction = match[3] ? Number(`0.${match[3].padEnd(3, '0').slice(0, 3)}`) : 0
    const time = Number(match[1]) * 60 + Number(match[2]) + fraction
    const text = match[4].trim()
    if (text) lines.push({ time, text })
  }
  return lines.sort((a, b) => a.time - b.time)
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

export function SongListener() {
  const t = useT(STR)
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [track, setTrack] = useState<Song | null>(null)
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [levels, setLevels] = useState(() => Array.from({ length: 30 }, () => 0.14))
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Song[]>([])
  const [manualSearching, setManualSearching] = useState(false)

  const listeningRef = useRef(false)
  const cancelledRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const captureStartedRef = useRef(0)
  const captureTimerRef = useRef<number | null>(null)
  const requestAbortRef = useRef<AbortController | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationRef = useRef<number | null>(null)
  const clockRef = useRef({ position: 0, startedAt: 0 })
  const activeLineRef = useRef<HTMLParagraphElement | null>(null)
  const lyricsScrollRef = useRef<HTMLDivElement | null>(null)

  const lyrics = useMemo(() => parseLrc(track?.syncedLyrics ?? ''), [track])
  const activeIndex = useMemo(() => {
    let found = -1
    for (let index = 0; index < lyrics.length; index += 1) {
      if (lyrics[index].time <= position + 0.15) found = index
      else break
    }
    return found
  }, [lyrics, position])

  useEffect(() => {
    const container = lyricsScrollRef.current
    const activeLine = activeLineRef.current
    if (!container || !activeLine) return
    const containerBox = container.getBoundingClientRect()
    const lineBox = activeLine.getBoundingClientRect()
    const centeredTop = container.scrollTop
      + lineBox.top
      - containerBox.top
      - (container.clientHeight - lineBox.height) / 2
    container.scrollTo({ top: centeredTop, behavior: 'smooth' })
  }, [activeIndex])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const next = clockRef.current.position + (performance.now() - clockRef.current.startedAt) / 1000
      setPosition(track ? Math.min(next, track.duration) : next)
      if (track && next >= track.duration) setPlaying(false)
    }, 120)
    return () => window.clearInterval(timer)
  }, [playing, track])

  const cleanupAudio = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    animationRef.current = null
    streamRef.current?.getTracks().forEach((mediaTrack) => mediaTrack.stop())
    streamRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
    setLevels(Array.from({ length: 30 }, () => 0.14))
  }, [])

  const stopListening = useCallback(() => {
    cancelledRef.current = true
    listeningRef.current = false
    setListening(false)
    setProcessing(false)
    if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current)
    captureTimerRef.current = null
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    requestAbortRef.current?.abort()
    requestAbortRef.current = null
    cleanupAudio()
  }, [cleanupAudio])

  useEffect(() => () => {
    cancelledRef.current = true
    listeningRef.current = false
    if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    requestAbortRef.current?.abort()
    cleanupAudio()
  }, [cleanupAudio])

  const selectTrack = useCallback((song: Song, startAt = 0) => {
    const aligned = Math.max(0, Math.min(song.duration, startAt))
    setTrack(song)
    setResults([])
    setPosition(aligned)
    clockRef.current = { position: aligned, startedAt: performance.now() }
    setPlaying(true)
    stopListening()
  }, [stopListening])

  const beginVisualizer = useCallback((stream: MediaStream) => {
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.82
    context.createMediaStreamSource(stream).connect(analyser)
    audioContextRef.current = context
    const data = new Uint8Array(analyser.frequencyBinCount)
    let lastDraw = 0
    const draw = (now: number) => {
      if (!listeningRef.current) return
      if (now - lastDraw > 65) {
        analyser.getByteFrequencyData(data)
        setLevels(Array.from({ length: 30 }, (_, index) => Math.max(0.12, data[index + 2] / 255)))
        lastDraw = now
      }
      animationRef.current = requestAnimationFrame(draw)
    }
    animationRef.current = requestAnimationFrame(draw)
  }, [])

  const startListening = useCallback(async () => {
    setError('')
    setTrack(null)
    setProcessing(false)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t.unsupported)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      })
      streamRef.current = stream
      cancelledRef.current = false
      listeningRef.current = true
      setListening(true)
      beginVisualizer(stream)
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate))
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64_000,
      })
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []
      captureStartedRef.current = performance.now()
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        stopListening()
        setError(t.genericError)
      }
      recorder.onstop = async () => {
        mediaRecorderRef.current = null
        listeningRef.current = false
        setListening(false)
        cleanupAudio()
        if (cancelledRef.current) return
        const sample = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (sample.size < 4_000) {
          setError(t.noMatch)
          return
        }
        const controller = new AbortController()
        requestAbortRef.current = controller
        setProcessing(true)
        try {
          const response = await fetch(`${API_URL}?action=recognize`, {
            method: 'POST',
            headers: apiHeaders({ 'Content-Type': sample.type }),
            body: sample,
            signal: controller.signal,
          })
          const body = await response.json() as {
            data?: AudioRecognition | null
            error?: string
            code?: string
          }
          if (!response.ok) {
            if (body.code === 'catalog_not_ready' || body.code === 'recognizer_not_ready') {
              throw new Error(t.catalogNotReady)
            }
            throw new Error(body.error || t.genericError)
          }
          if (!body.data) {
            setError(t.noMatch)
            return
          }
          if (!body.data.track) {
            setError(`${body.data.recognized.title} — ${body.data.recognized.artist} ${t.noSyncedLyrics}`)
            return
          }
          // The recognizer returns the song position at the sample's start.
          // Adding elapsed client time advances it to the response's arrival.
          const elapsed = (performance.now() - captureStartedRef.current) / 1000
          selectTrack(body.data.track, body.data.offsetSeconds + elapsed)
        } catch (reason) {
          if (reason instanceof DOMException && reason.name === 'AbortError') return
          setError(reason instanceof Error ? reason.message : t.genericError)
        } finally {
          requestAbortRef.current = null
          setProcessing(false)
        }
      }
      recorder.start(1_000)
      captureTimerRef.current = window.setTimeout(() => {
        captureTimerRef.current = null
        if (recorder.state !== 'inactive') recorder.stop()
      }, SAMPLE_DURATION_MS)
    } catch {
      cleanupAudio()
      listeningRef.current = false
      setListening(false)
      setError(t.permission)
    }
  }, [beginVisualizer, cleanupAudio, selectTrack, stopListening, t.catalogNotReady, t.genericError, t.noMatch, t.noSyncedLyrics, t.permission, t.unsupported])

  const searchManually = async (event: FormEvent) => {
    event.preventDefault()
    if (query.trim().length < 2) return
    setManualSearching(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}?action=search&q=${encodeURIComponent(query.trim())}`, { headers: apiHeaders() })
      const body = await response.json() as { data?: Song[]; error?: string }
      if (!response.ok) throw new Error(body.error || t.genericError)
      setResults(body.data ?? [])
      if (!body.data?.length) setError(t.noResults)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.genericError)
    } finally {
      setManualSearching(false)
    }
  }

  const changePosition = (next: number) => {
    const clamped = Math.max(0, Math.min(track?.duration ?? Number.POSITIVE_INFINITY, next))
    setPosition(clamped)
    clockRef.current = { position: clamped, startedAt: performance.now() }
  }

  const togglePlaying = () => {
    if (playing) {
      clockRef.current = { position, startedAt: performance.now() }
      setPlaying(false)
    } else {
      clockRef.current = { position, startedAt: performance.now() }
      setPlaying(true)
    }
  }

  const reset = () => {
    setTrack(null)
    setPlaying(false)
    setPosition(0)
    setError('')
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-up pb-8">
      <header>
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <Waves className="size-4" /> Audio recognition
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">{t.subtitle}</p>
        </div>
      </header>

      {track ? (
        <section className="mt-8 grid overflow-hidden rounded-3xl border border-white/10 bg-[#090c14]/90 shadow-2xl shadow-indigo-950/30 lg:h-[680px] lg:grid-cols-[340px_1fr]">
          <aside className="relative flex flex-col overflow-hidden border-b border-white/10 bg-gradient-to-b from-indigo-950/70 via-violet-950/45 to-[#0a0d16] p-6 lg:border-b-0 lg:border-r">
            <div className="pointer-events-none absolute -left-24 -top-28 size-80 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="relative mx-auto mt-4 grid aspect-square w-full max-w-[250px] place-items-center rounded-[2rem] border border-white/10 bg-gradient-to-br from-indigo-500/30 via-violet-500/15 to-cyan-400/10 shadow-2xl shadow-indigo-950/80">
              <div className="absolute inset-5 rounded-full border border-white/10" />
              <div className="absolute inset-11 rounded-full border border-dashed border-white/10" />
              <Music2 className="size-20 text-white/80" strokeWidth={1.25} />
            </div>

            <div className="relative mt-7">
              <p className="text-[10px] font-bold tracking-[0.22em] text-cyan-300">{t.nowPlaying}</p>
              <h2 className="mt-2 text-2xl font-bold leading-tight text-white">{track.title}</h2>
              <p className="mt-1 text-base text-slate-300">{track.artist}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{track.album}</p>
            </div>

            <div className="relative mt-7">
              <input
                aria-label={t.sync}
                type="range"
                min="0"
                max={Math.max(1, track.duration)}
                step="0.1"
                value={position}
                onChange={(event) => changePosition(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-cyan-300"
              />
              <div className="mt-2 flex justify-between font-mono text-[11px] text-slate-500">
                <span>{formatTime(position)}</span><span>{formatTime(track.duration)}</span>
              </div>
            </div>

            <div className="relative mt-5 flex items-center justify-center gap-3">
              <button onClick={() => changePosition(position - 5)} aria-label={t.earlier} title="−5s" className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white">
                <ChevronLeft className="size-5" />
              </button>
              <button onClick={togglePlaying} className="grid size-14 place-items-center rounded-full bg-white text-slate-950 shadow-xl shadow-white/10 hover:bg-cyan-100" aria-label={playing ? 'Pause lyrics' : 'Resume lyrics'}>
                {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="ml-0.5 size-5" fill="currentColor" />}
              </button>
              <button onClick={() => changePosition(position + 5)} aria-label={t.later} title="+5s" className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white">
                <ChevronRight className="size-5" />
              </button>
            </div>

            <button
              onClick={reset}
              className="relative mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.11] hover:text-white"
            >
              <Mic className="size-4" />
              {t.restart}
            </button>
          </aside>

          <div className="relative flex h-[560px] min-h-0 flex-col overflow-hidden lg:h-full">
            <div className="absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-[#090c14] to-transparent" />
            <div className="absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[#090c14] to-transparent" />
            <div ref={lyricsScrollRef} className="relative min-h-0 flex-1 overscroll-contain overflow-y-auto px-7 py-48 sm:px-12 lg:px-16">
              {lyrics.map((line, index) => {
                const distance = Math.abs(index - activeIndex)
                const active = index === activeIndex
                return (
                  <p
                    key={`${line.time}-${index}`}
                    ref={active ? activeLineRef : null}
                    onClick={() => changePosition(line.time)}
                    className={`cursor-pointer py-2 text-2xl font-bold leading-snug tracking-tight transition-all duration-500 sm:text-3xl ${
                      active
                        ? 'translate-x-2 text-white drop-shadow-[0_0_18px_rgb(103_232_249/0.2)]'
                        : distance <= 2 ? 'text-slate-500 hover:text-slate-300' : 'text-slate-700 hover:text-slate-500'
                    }`}
                  >
                    {line.text}
                  </p>
                )
              })}
            </div>
            <div className="absolute bottom-5 right-6 z-20 text-[10px] text-slate-600">{t.source}</div>
          </div>
        </section>
      ) : (
        <>
          <section className="relative mt-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.055] to-white/[0.025] px-5 py-10 text-center shadow-2xl shadow-indigo-950/20 sm:px-10 sm:py-14">
            <div className="pointer-events-none absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-3xl" />

            <div className={`relative mx-auto grid size-36 place-items-center rounded-full border transition-all duration-500 sm:size-44 ${listening || processing ? 'border-cyan-300/40 bg-cyan-400/10 shadow-[0_0_70px_rgb(34_211_238/0.16)]' : 'border-white/10 bg-white/[0.035]'}`}>
              {listening && <span className="absolute inset-0 animate-ping rounded-full border border-cyan-300/20" />}
              <div className={`grid size-24 place-items-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 shadow-xl shadow-indigo-500/30 sm:size-28 ${listening ? 'scale-105' : ''}`}>
                {processing ? <LoaderCircle className="size-11 animate-spin" /> : <Mic className="size-11" />}
              </div>
            </div>

            <div className="relative mx-auto mt-7 flex h-12 max-w-sm items-center justify-center gap-1 overflow-hidden" aria-hidden="true">
              {levels.map((level, index) => (
                <span
                  key={index}
                  className={`w-1 rounded-full transition-[height,background-color] duration-100 ${listening ? 'bg-gradient-to-t from-indigo-500 to-cyan-300' : 'bg-slate-700'}`}
                  style={{ height: `${Math.max(5, level * 46)}px` }}
                />
              ))}
            </div>

            <div className="relative mt-4">
              <h2 className="text-xl font-semibold text-white">{processing ? t.processing : listening ? t.listening : t.idle}</h2>
              {!listening && !processing && <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{t.idleHint}</p>}
            </div>

            <div className="relative mt-7">
              {listening ? (
                <button onClick={stopListening} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15">
                  <Square className="size-4" fill="currentColor" /> {t.stop}
                </button>
              ) : (
                <button onClick={startListening} disabled={processing} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-indigo-500/25 hover:brightness-110 disabled:cursor-wait disabled:opacity-50">
                  {processing ? <LoaderCircle className="size-5 animate-spin" /> : <Mic className="size-5" />} {processing ? t.processing : t.listen}
                </button>
              )}
            </div>

            <p className="relative mx-auto mt-5 max-w-lg text-[11px] leading-relaxed text-slate-600">{t.privacy}</p>
          </section>

          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-300" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError('')} aria-label="Dismiss" className="no-glow text-amber-200/50 hover:text-amber-100"><X className="size-4" /></button>
            </div>
          )}

          <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-indigo-300"><Search className="size-5" /></div>
              <div>
                <h2 className="font-semibold text-white">{t.manual}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{t.manualHint}</p>
              </div>
            </div>
            <form onSubmit={searchManually} className="mt-5 flex flex-col gap-2 sm:flex-row">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/15" />
              <button disabled={manualSearching || query.trim().length < 2} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40">
                {manualSearching ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />} {t.search}
              </button>
            </form>

            {results.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t.results}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {results.map((song) => (
                    <button key={song.id} onClick={() => selectTrack(song)} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-left hover:border-indigo-400/30 hover:bg-indigo-500/5">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/25 to-cyan-400/10 text-indigo-200"><Music2 className="size-5" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{song.title}</span><span className="block truncate text-xs text-slate-500">{song.artist} · {formatTime(song.duration)}</span></span>
                      <Play className="size-4 shrink-0 text-slate-500" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}

    </div>
  )
}
