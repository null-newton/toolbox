import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LoaderCircle,
  Mic,
  Music2,
  Pause,
  Play,
  Search,
  Settings2,
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

interface RecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}

interface RecognitionEventLike {
  resultIndex: number
  results: { length: number; [index: number]: RecognitionResultLike }
}

interface RecognitionErrorLike {
  error: string
}

interface RecognitionLike {
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  lang: string
  processLocally?: boolean
  onresult: ((event: RecognitionEventLike) => void) | null
  onerror: ((event: RecognitionErrorLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognitionAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

type RecognitionOptions = {
  langs: string[]
  processLocally: boolean
  quality?: 'dictation'
}

type RecognitionConstructor = (new () => RecognitionLike) & {
  available?: (options: RecognitionOptions) => Promise<RecognitionAvailability>
  install?: (options: RecognitionOptions) => Promise<boolean>
}

const STR = {
  en: {
    title: 'Live Lyrics',
    subtitle: 'Let your microphone hear a few words. We’ll find the song and keep the lyrics moving with the music.',
    idle: 'Ready when the music is',
    idleHint: 'For the best result, play a clear vocal section near your microphone.',
    listen: 'Start listening',
    listening: 'Listening for lyrics…',
    heard: 'What I’m hearing',
    searching: 'Checking that lyric fragment…',
    stop: 'Stop listening',
    permission: 'Microphone access is needed to listen. Check your browser permission and try again.',
    unsupported: 'Live transcription is not supported in this browser. Try Chrome or Edge, or use manual search.',
    noMatch: 'No confident match yet. Keep the music playing or search manually.',
    genericError: 'Something went wrong while identifying the song.',
    preparingLocal: 'Preparing private on-device transcription…',
    downloadingModel: 'Downloading the speech model for this language…',
    localReady: 'Using on-device transcription',
    cloudReady: 'Using browser transcription',
    networkRetry: 'The browser speech service lost its connection. Retrying…',
    networkError: 'Your browser’s speech service could not connect. Check the connection, disable strict tracking protection for this page, or try current Chrome or Edge. Manual song search still works below.',
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
    settings: 'Recognition settings',
    apiKey: 'Musixmatch API key',
    songLanguage: 'Song language',
    apiHint: 'Optional when the server already has a key. Stored only in this browser and sent only to your Toolbox backend.',
    save: 'Save key',
    removeKey: 'Remove key',
    keySaved: 'Saved in this browser',
    privacy: 'Audio is handled by your browser’s speech service. Toolbox receives only the recognized words, never a recording.',
    source: 'Synced lyrics from LRCLIB',
    setupNeeded: 'Automatic identification is not configured yet. Add a Musixmatch API key in settings, or ask the server owner to configure one.',
  },
  nl: {
    title: 'Live songtekst',
    subtitle: 'Laat je microfoon een paar woorden horen. We zoeken het nummer en laten de tekst met de muziek meelopen.',
    idle: 'Klaar wanneer de muziek dat is',
    idleHint: 'Speel voor het beste resultaat een duidelijk gezongen stuk dicht bij je microfoon.',
    listen: 'Begin met luisteren',
    listening: 'Luisteren naar de tekst…',
    heard: 'Dit hoor ik',
    searching: 'Dit tekstfragment controleren…',
    stop: 'Stop met luisteren',
    permission: 'Microfoontoegang is nodig. Controleer de browsertoestemming en probeer opnieuw.',
    unsupported: 'Live transcriptie werkt niet in deze browser. Probeer Chrome of Edge, of zoek handmatig.',
    noMatch: 'Nog geen zekere match. Laat de muziek spelen of zoek handmatig.',
    genericError: 'Er ging iets mis bij het herkennen van het nummer.',
    preparingLocal: 'Privé transcriptie op dit apparaat voorbereiden…',
    downloadingModel: 'Het spraakmodel voor deze taal downloaden…',
    localReady: 'Transcriptie op dit apparaat actief',
    cloudReady: 'Browsertranscriptie actief',
    networkRetry: 'De spraakdienst van de browser verloor de verbinding. Opnieuw proberen…',
    networkError: 'De spraakdienst van je browser kon geen verbinding maken. Controleer de verbinding, schakel strikte trackingbeveiliging voor deze pagina uit of probeer een recente Chrome of Edge. Handmatig zoeken hieronder blijft werken.',
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
    settings: 'Herkenningsinstellingen',
    apiKey: 'Musixmatch API-sleutel',
    songLanguage: 'Taal van het nummer',
    apiHint: 'Optioneel als de server al een sleutel heeft. Alleen in deze browser bewaard en enkel naar je Toolbox-backend gestuurd.',
    save: 'Sleutel bewaren',
    removeKey: 'Sleutel verwijderen',
    keySaved: 'Bewaard in deze browser',
    privacy: 'Audio wordt door de spraakdienst van je browser verwerkt. Toolbox ontvangt alleen herkende woorden, nooit een opname.',
    source: 'Gesynchroniseerde tekst van LRCLIB',
    setupNeeded: 'Automatische herkenning is nog niet ingesteld. Voeg een Musixmatch API-sleutel toe of vraag de serverbeheerder er een in te stellen.',
  },
}

const KEY_STORAGE = 'song-listener-musixmatch-key'
const LANGUAGE_STORAGE = 'song-listener-language'
const API_URL = `${functionsBase}/song-listener`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

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

function words(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function alignToLyrics(fragment: string, lines: LyricLine[]) {
  const heard = words(fragment)
  const indexed = lines.flatMap((line, lineIndex) =>
    words(line.text).map((word) => ({ word, lineIndex }))
  )
  const haystack = indexed.map((item) => item.word)

  for (let size = Math.min(10, heard.length); size >= 4; size -= 1) {
    const needle = heard.slice(-size)
    for (let start = Math.max(0, haystack.length - 1); start >= 0; start -= 1) {
      if (needle.every((word, offset) => haystack[start + offset] === word)) {
        const last = indexed[start + size - 1]
        if (!last) continue
        const next = lines[last.lineIndex + 1]
        return next ? Math.max(lines[last.lineIndex].time, next.time - 0.4) : lines[last.lineIndex].time + 2
      }
    }
  }

  // Speech recognition commonly misses short connector words. Fall back to a
  // small two-line overlap score instead of abandoning an otherwise good match.
  let best = { score: 0, time: 0 }
  const tail = new Set(heard.slice(-12))
  lines.forEach((line, index) => {
    const windowWords = words(`${line.text} ${lines[index + 1]?.text ?? ''}`)
    const score = windowWords.filter((word) => tail.has(word)).length / Math.max(1, Math.min(tail.size, windowWords.length))
    if (score > best.score) best = { score, time: line.time }
  })
  return best.score >= 0.45 ? best.time + 2 : 0
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

function getRecognitionConstructor(): RecognitionConstructor | undefined {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

export function SongListener() {
  const t = useT(STR)
  const [listening, setListening] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [preparingRecognition, setPreparingRecognition] = useState(false)
  const [speechStatus, setSpeechStatus] = useState('')
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const [track, setTrack] = useState<Song | null>(null)
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [levels, setLevels] = useState(() => Array.from({ length: 30 }, () => 0.14))
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Song[]>([])
  const [manualSearching, setManualSearching] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [keyInput, setKeyInput] = useState(() => localStorage.getItem(KEY_STORAGE) ?? '')
  const [keySaved, setKeySaved] = useState(() => Boolean(localStorage.getItem(KEY_STORAGE)))
  const [songLanguage, setSongLanguage] = useState(() => localStorage.getItem(LANGUAGE_STORAGE) ?? 'en-US')

  const recognitionRef = useRef<RecognitionLike | null>(null)
  const listeningRef = useRef(false)
  const searchingRef = useRef(false)
  const finalTranscriptRef = useRef('')
  const lastQueryRef = useRef('')
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationRef = useRef<number | null>(null)
  const restartTimerRef = useRef<number | null>(null)
  const restartDelayRef = useRef(0)
  const networkErrorsRef = useRef(0)
  const clockRef = useRef({ position: 0, startedAt: 0 })
  const activeLineRef = useRef<HTMLParagraphElement | null>(null)

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
    activeLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
    listeningRef.current = false
    setListening(false)
    setPreparingRecognition(false)
    setSpeechStatus('')
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current)
    restartTimerRef.current = null
    recognitionRef.current?.stop()
    recognitionRef.current = null
    cleanupAudio()
  }, [cleanupAudio])

  useEffect(() => () => {
    listeningRef.current = false
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current)
    recognitionRef.current?.abort()
    cleanupAudio()
  }, [cleanupAudio])

  const selectTrack = useCallback((song: Song, heard = '') => {
    const parsed = parseLrc(song.syncedLyrics)
    const aligned = heard ? alignToLyrics(heard, parsed) : 0
    setTrack(song)
    setResults([])
    setPosition(aligned)
    clockRef.current = { position: aligned, startedAt: performance.now() }
    setPlaying(true)
    stopListening()
  }, [stopListening])

  const lookupFragment = useCallback(async (fragment: string) => {
    const clean = fragment.trim().split(/\s+/).slice(-12).join(' ')
    if (clean.split(' ').length < 6 || clean === lastQueryRef.current || searchingRef.current) return
    lastQueryRef.current = clean
    searchingRef.current = true
    setLookingUp(true)
    try {
      const headers: Record<string, string> = {}
      const storedKey = localStorage.getItem(KEY_STORAGE)
      if (storedKey) headers['x-musixmatch-key'] = storedKey
      const response = await fetch(`${API_URL}?action=identify&q=${encodeURIComponent(clean)}`, { headers: apiHeaders(headers) })
      const body = await response.json() as { data?: Song | null; error?: string }
      if (!response.ok) throw new Error(body.error || t.genericError)
      if (body.data) selectTrack(body.data, fragment)
      else setError(t.noMatch)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t.genericError
      setError(message.includes('Musixmatch API key') ? t.setupNeeded : message)
    } finally {
      searchingRef.current = false
      setLookingUp(false)
    }
  }, [selectTrack, t.genericError, t.noMatch, t.setupNeeded])

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
    const Recognition = getRecognitionConstructor()
    setError('')
    setTrack(null)
    setTranscript('')
    setInterim('')
    setSpeechStatus('')
    setPreparingRecognition(false)
    finalTranscriptRef.current = ''
    lastQueryRef.current = ''
    networkErrorsRef.current = 0
    restartDelayRef.current = 0
    if (!Recognition) {
      setError(t.unsupported)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      })
      streamRef.current = stream
      listeningRef.current = true
      setListening(true)
      beginVisualizer(stream)

      const recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.lang = songLanguage

      // Prefer a local language pack when the browser exposes the new
      // on-device API. This avoids the remote recognition service that emits
      // `network` errors in privacy-focused browsers and some managed setups.
      if (Recognition.available && Recognition.install) {
        setPreparingRecognition(true)
        setSpeechStatus(t.preparingLocal)
        try {
          const options: RecognitionOptions = {
            langs: [songLanguage],
            processLocally: true,
            quality: 'dictation',
          }
          const availability = await Recognition.available(options)
          if (availability === 'available') {
            recognition.processLocally = true
            setSpeechStatus(t.localReady)
          } else if (availability === 'downloadable' || availability === 'downloading') {
            setSpeechStatus(t.downloadingModel)
            if (await Recognition.install(options)) {
              recognition.processLocally = true
              setSpeechStatus(t.localReady)
            } else {
              setSpeechStatus(t.cloudReady)
            }
          } else {
            setSpeechStatus(t.cloudReady)
          }
        } catch {
          // Experimental on-device APIs can be present but blocked by browser
          // policy. Remote recognition remains the compatible fallback.
          setSpeechStatus(t.cloudReady)
        } finally {
          setPreparingRecognition(false)
        }
      } else {
        setSpeechStatus(t.cloudReady)
      }

      if (!listeningRef.current) return
      recognition.onresult = (event) => {
        networkErrorsRef.current = 0
        setSpeechStatus(recognition.processLocally ? t.localReady : t.cloudReady)
        let temporary = ''
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const value = event.results[index][0]?.transcript ?? ''
          if (event.results[index].isFinal) finalTranscriptRef.current += ` ${value}`
          else temporary += ` ${value}`
        }
        const finalValue = finalTranscriptRef.current.trim()
        setTranscript(finalValue)
        setInterim(temporary.trim())
        if (finalValue.split(/\s+/).length >= 6) void lookupFragment(finalValue)
      }
      recognition.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return
        if (event.error === 'network') {
          networkErrorsRef.current += 1
          if (networkErrorsRef.current === 1) {
            restartDelayRef.current = 1500
            setSpeechStatus(t.networkRetry)
          } else {
            listeningRef.current = false
            setListening(false)
            setSpeechStatus('')
            cleanupAudio()
            setError(t.networkError)
          }
          return
        }
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          listeningRef.current = false
          setListening(false)
          cleanupAudio()
          setError(t.permission)
        } else {
          setError(`${t.genericError} (${event.error})`)
        }
      }
      recognition.onend = () => {
        if (!listeningRef.current) return
        const delay = restartDelayRef.current || 250
        restartDelayRef.current = 0
        restartTimerRef.current = window.setTimeout(() => {
          if (!listeningRef.current) return
          try { recognition.start() } catch { /* browser is already restarting */ }
        }, delay)
      }
      recognitionRef.current = recognition
      recognition.start()
    } catch {
      cleanupAudio()
      listeningRef.current = false
      setListening(false)
      setError(t.permission)
    }
  }, [beginVisualizer, cleanupAudio, lookupFragment, songLanguage, t.cloudReady, t.downloadingModel, t.genericError, t.localReady, t.networkError, t.networkRetry, t.permission, t.preparingLocal, t.unsupported])

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

  const saveKey = () => {
    const value = keyInput.trim()
    if (value) localStorage.setItem(KEY_STORAGE, value)
    else localStorage.removeItem(KEY_STORAGE)
    setKeySaved(Boolean(value))
    localStorage.setItem(LANGUAGE_STORAGE, songLanguage)
    setShowSettings(false)
  }

  const reset = () => {
    setTrack(null)
    setPlaying(false)
    setPosition(0)
    setTranscript('')
    setError('')
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-up pb-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <Waves className="size-4" /> Audio recognition
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">{t.subtitle}</p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          aria-label={t.settings}
          title={t.settings}
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <Settings2 className="size-5" />
        </button>
      </header>

      {track ? (
        <section className="mt-8 grid min-h-[620px] overflow-hidden rounded-3xl border border-white/10 bg-[#090c14]/90 shadow-2xl shadow-indigo-950/30 lg:grid-cols-[340px_1fr]">
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

            <button onClick={reset} className="relative mt-auto pt-8 text-xs font-medium text-slate-500 hover:text-white">
              {t.restart}
            </button>
          </aside>

          <div className="relative flex min-h-[560px] flex-col overflow-hidden">
            <div className="absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-[#090c14] to-transparent" />
            <div className="absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[#090c14] to-transparent" />
            <div className="h-[620px] overflow-y-auto px-7 py-48 sm:px-12 lg:h-auto lg:flex-1 lg:px-16">
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

            <div className={`relative mx-auto grid size-36 place-items-center rounded-full border transition-all duration-500 sm:size-44 ${listening ? 'border-cyan-300/40 bg-cyan-400/10 shadow-[0_0_70px_rgb(34_211_238/0.16)]' : 'border-white/10 bg-white/[0.035]'}`}>
              {listening && <span className="absolute inset-0 animate-ping rounded-full border border-cyan-300/20" />}
              <div className={`grid size-24 place-items-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 shadow-xl shadow-indigo-500/30 sm:size-28 ${listening ? 'scale-105' : ''}`}>
                {lookingUp || preparingRecognition ? <LoaderCircle className="size-11 animate-spin" /> : <Mic className="size-11" />}
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
              <h2 className="text-xl font-semibold text-white">{listening ? t.listening : t.idle}</h2>
              {!listening && <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{t.idleHint}</p>}
              {listening && speechStatus && <p className="mx-auto mt-2 max-w-md text-xs text-cyan-300/80">{speechStatus}</p>}
            </div>

            {(transcript || interim) && (
              <div className="relative mx-auto mt-6 max-w-xl rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t.heard}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">
                  {transcript} <span className="text-slate-500">{interim}</span>
                </p>
                {lookingUp && <p className="mt-2 flex items-center gap-2 text-xs text-cyan-300"><LoaderCircle className="size-3 animate-spin" />{t.searching}</p>}
              </div>
            )}

            <div className="relative mt-7">
              {listening ? (
                <button onClick={stopListening} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15">
                  <Square className="size-4" fill="currentColor" /> {t.stop}
                </button>
              ) : (
                <button onClick={startListening} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-indigo-500/25 hover:brightness-110">
                  <Mic className="size-5" /> {t.listen}
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

      {showSettings && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowSettings(false) }}>
          <div role="dialog" aria-modal="true" aria-label={t.settings} className="w-full max-w-md rounded-3xl border border-white/10 bg-[#101522] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-violet-500/15 text-violet-300"><KeyRound className="size-5" /></span><h2 className="text-lg font-bold">{t.settings}</h2></div>
              <button onClick={() => setShowSettings(false)} aria-label="Close" className="grid size-9 place-items-center rounded-xl text-slate-500 hover:bg-white/5 hover:text-white"><X className="size-5" /></button>
            </div>
            <label className="mt-6 block text-sm font-medium text-slate-200" htmlFor="musixmatch-key">{t.apiKey}</label>
            <input id="musixmatch-key" type="password" autoComplete="off" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} placeholder="••••••••••••••••" className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-sm text-white outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/15" />
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{t.apiHint}</p>
            {keySaved && <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300"><Check className="size-3.5" />{t.keySaved}</p>}
            <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor="song-language">{t.songLanguage}</label>
            <select id="song-language" value={songLanguage} onChange={(event) => setSongLanguage(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#090c14] px-4 py-3 text-sm text-white outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/15">
              <option value="en-US">English</option>
              <option value="nl-NL">Nederlands</option>
              <option value="fr-FR">Français</option>
              <option value="de-DE">Deutsch</option>
              <option value="es-ES">Español</option>
              <option value="it-IT">Italiano</option>
              <option value="pt-BR">Português</option>
            </select>
            <div className="mt-6 flex gap-2">
              <button onClick={saveKey} className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-bold text-white hover:brightness-110">{t.save}</button>
              {keySaved && <button onClick={() => { setKeyInput(''); localStorage.removeItem(KEY_STORAGE); setKeySaved(false) }} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white">{t.removeKey}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
