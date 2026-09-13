import { useCallback, useEffect, useRef, useState } from 'react'
import { functionsBase } from '../../lib/supabase'
import { useT } from '../../i18n/LanguageContext'
import { matchLyrics, songLines, words } from './lyrics'
import type { Song } from './lyrics'
import { SPEECH_STR } from './speechStrings'

interface SpeechResult { isFinal: boolean; [index: number]: { transcript: string } }
interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

const API_URL = `${functionsBase}/song-listener`
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const HEADERS = KEY ? { Authorization: `Bearer ${KEY}`, apikey: KEY } : undefined
const LOOKUP_INTERVAL = 8_000

export function useSpeechLyrics() {
  const t = useT(SPEECH_STR)
  const [listening, setListening] = useState(false)
  const [searching, setSearching] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [track, setTrack] = useState<Song | null>(null)
  const [activeLine, setActiveLine] = useState(-1)
  const [candidates, setCandidates] = useState<Song[]>([])
  const session = useRef({
    generation: 0, active: false, recognition: null as Recognition | null,
    restartTimer: 0, lookupTimer: 0, silenceTimer: 0,
    request: null as AbortController | null, lastLookup: 0, lastWordsAt: 0,
    phrase: '', lastQuery: '', song: null as Song | null, line: -1,
  })

  // Invalidates every callback and request before releasing the microphone.
  const dispose = useCallback(() => {
    const current = session.current
    current.generation += 1
    current.active = false
    window.clearTimeout(current.restartTimer)
    window.clearTimeout(current.lookupTimer)
    window.clearTimeout(current.silenceTimer)
    current.request?.abort()
    current.request = null
    if (current.recognition) {
      current.recognition.onend = null
      current.recognition.onerror = null
      current.recognition.onresult = null
      current.recognition.abort()
      current.recognition = null
    }
  }, [])
  useEffect(() => dispose, [dispose])

  const stop = useCallback(() => {
    dispose()
    setListening(false)
    setSearching(false)
  }, [dispose])

  const align = useCallback((phrase: string) => {
    const current = session.current
    if (!current.song) return
    const match = matchLyrics(songLines(current.song), phrase, current.line)
    if (match && !match.ambiguous) {
      current.line = match.index
      setActiveLine(match.index)
    }
  }, [])

  const select = useCallback((song: Song) => {
    const current = session.current
    current.request?.abort()
    current.request = null
    window.clearTimeout(current.lookupTimer)
    current.song = song
    current.line = -1
    setTrack(song)
    setActiveLine(-1)
    setCandidates([])
    setSearching(false)
    setError('')
    align(current.phrase)
  }, [align])

  const lookup = useCallback(async (query: string, byTitle = false, automatic = false) => {
    const current = session.current
    current.request?.abort()
    const controller = new AbortController()
    current.request = controller
    const generation = current.generation
    const valid = () => generation === current.generation && current.request === controller && !controller.signal.aborted
    current.lastLookup = Date.now()
    current.lastQuery = query
    setSearching(true)
    setError('')
    try {
      const response = await fetch(byTitle
        ? `${API_URL}?action=search&plain=1&q=${encodeURIComponent(query)}`
        : `${API_URL}?action=search-lyrics`, {
        method: byTitle ? 'GET' : 'POST',
        headers: { ...HEADERS, ...(!byTitle ? { 'Content-Type': 'application/json' } : {}) },
        ...(!byTitle ? { body: JSON.stringify({ text: query }) } : {}),
        signal: controller.signal,
      })
      const body = await response.json() as { data?: Song[] }
      if (!valid()) return
      if (!response.ok) {
        if (automatic) stop()
        setError(t.lookupFailed)
        return
      }
      const ranked = (body.data ?? []).filter((song) => songLines(song).length > 0).map((song) => ({
        song, match: matchLyrics(songLines(song), query),
      })).sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
      const best = ranked[0]
      // Alternate album editions of the same song aren't competing identities.
      const other = ranked.find((item) => words(`${item.song.title} ${item.song.artist}`).join(' ')
        !== words(`${best?.song.title} ${best?.song.artist}`).join(' '))
      if (!byTitle && best?.match && best.match.score >= 0.8
        && best.match.score - (other?.match?.score ?? 0) >= 0.12) {
        select(best.song)
      } else {
        setCandidates(ranked.map((item) => item.song))
        if (!ranked.length) setError(automatic ? t.noMatch : t.noResults)
      }
    } catch {
      if (valid()) {
        if (automatic) stop()
        setError(t.lookupFailed)
      }
    } finally {
      if (current.request === controller) {
        current.request = null
        setSearching(false)
      }
    }
  }, [select, stop, t])

  const start = useCallback((language: string) => {
    stop()
    setError('')
    const browser = window as SpeechWindow
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!Constructor) { setError(t.unsupported); return }
    const current = session.current
    const generation = current.generation
    current.active = true
    current.phrase = ''
    current.lastQuery = ''
    current.lastLookup = 0
    current.lastWordsAt = 0
    setTranscript('')
    setListening(true)
    const valid = () => current.active && current.generation === generation
    const armSilenceTimeout = () => {
      window.clearTimeout(current.silenceTimer)
      current.silenceTimer = window.setTimeout(() => {
        if (valid()) { stop(); setError(t.silent) }
      }, 60_000)
    }
    const scheduleLookup = () => {
      window.clearTimeout(current.lookupTimer)
      if (!valid() || current.song || words(current.phrase).length < 4 || current.phrase === current.lastQuery) return
      current.lookupTimer = window.setTimeout(() => {
        if (!valid() || current.song) return
        if (current.request) { current.lookupTimer = window.setTimeout(scheduleLookup, 500); return }
        void lookup(current.phrase, false, true).then(scheduleLookup)
      }, Math.max(500, LOOKUP_INTERVAL - (Date.now() - current.lastLookup)))
    }
    const recognize = () => {
      if (!valid()) return
      const recognition = new Constructor()
      current.recognition = recognition
      recognition.lang = language
      recognition.continuous = true
      recognition.interimResults = true
      recognition.onresult = (event) => {
        if (!valid()) return
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i]
          const text = result[0].transcript.trim()
          if (result.isFinal && text) {
            const now = Date.now()
            const previous = now - current.lastWordsAt < 8_000 ? current.phrase : ''
            current.phrase = `${previous} ${text}`.trim().split(/\s+/).slice(-18).join(' ').slice(-240)
            current.lastWordsAt = now
            align(current.phrase)
            if (words(text).length >= 4) align(text)
            armSilenceTimeout()
            scheduleLookup()
          } else interim += ` ${text}`
        }
        setTranscript(`${current.phrase}${interim}`.trim())
      }
      recognition.onerror = (event) => {
        if (!valid() || event.error === 'no-speech') return
        stop()
        setError(['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)
          ? t.permission : event.error === 'network' ? t.network : t.failed)
      }
      recognition.onend = () => {
        if (valid()) current.restartTimer = window.setTimeout(recognize, 400)
      }
      try { recognition.start() } catch { stop(); setError(t.failed) }
    }
    armSilenceTimeout()
    recognize()
  }, [align, lookup, stop, t])

  const reset = () => {
    stop()
    session.current.song = null
    session.current.line = -1
    session.current.phrase = ''
    setTrack(null)
    setActiveLine(-1)
    setCandidates([])
    setTranscript('')
    setError('')
  }
  const seek = (index: number) => {
    session.current.line = index
    setActiveLine(index)
  }
  const search = (query: string, byTitle: boolean) => {
    // Explicit correction takes precedence over pending automatic lookups.
    stop()
    if (!byTitle) session.current.phrase = query
    return lookup(query, byTitle)
  }
  return { listening, searching, transcript, error, track, activeLine, candidates, start, stop, select, reset, seek, search }
}
