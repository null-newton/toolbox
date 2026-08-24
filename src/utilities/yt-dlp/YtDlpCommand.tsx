import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ClipboardPaste, X } from 'lucide-react'
import { SaveStatus } from '../../components/SaveStatus'
import { useUtilityConfig } from '../../hooks/useUtilityConfig'
import { useT } from '../../i18n/LanguageContext'
import { functionsBase } from '../../lib/supabase'

/**
 * Video downloader — two paths from one set of options:
 *
 *  1. "Download to this device": POSTs the options to the self-hosted backend
 *     (video-download function in the toolbox-backend repo), which runs yt-dlp
 *     on the server,
 *     streams progress back as NDJSON, and hands the finished file to the
 *     browser as a normal download. The user does nothing but click.
 *  2. "Copy the command": builds the exact `yt-dlp` command string to run
 *     locally — the offline / no-backend fallback, and useful for playlists
 *     (the server path always delivers a single file).
 *
 * A browser can't run yt-dlp itself (cross-origin reads of YouTube etc. are
 * blocked by CORS, and it needs a real process + ffmpeg), which is why the
 * download path goes through the backend. The command builder is pure string
 * work; only the download button touches the network.
 *
 * Option preferences persist via useUtilityConfig; the URL stays ephemeral.
 */

type Mode = 'video' | 'audio'

const CURRENT_RELEASE = '2026.08.19'
const RELEASE_CACHE_KEY = 'toolbox:yt-dlp:latest-release'
const RELEASE_CACHE_TTL = 6 * 60 * 60 * 1000

type ReleaseCache = {
  tag: string
  checkedAt: number
}

type Options = {
  mode: Mode
  videoQuality: string
  forceMp4: boolean
  audioFormat: string
  downloadSubs: boolean
  embedSubs: boolean
  autoSubs: boolean
  subLangs: string
  embedThumbnail: boolean
  embedMetadata: boolean
  embedChapters: boolean
  sponsorblock: boolean
  playlist: 'single' | 'full'
  restrictFilenames: boolean
  cookiesBrowser: string
  outputTemplate: string
  rateLimit: string
}

const DEFAULTS: Options = {
  mode: 'video',
  videoQuality: 'best',
  forceMp4: false,
  audioFormat: 'mp3',
  downloadSubs: false,
  embedSubs: false,
  autoSubs: false,
  subLangs: 'en',
  embedThumbnail: false,
  embedMetadata: false,
  embedChapters: false,
  sponsorblock: false,
  playlist: 'single',
  restrictFilenames: false,
  cookiesBrowser: '',
  outputTemplate: '',
  rateLimit: '',
}

const VIDEO_QUALITIES: { id: string; label: string }[] = [
  { id: 'best', label: 'Best available' },
  { id: '2160', label: '4K · 2160p' },
  { id: '1440', label: '1440p' },
  { id: '1080', label: '1080p' },
  { id: '720', label: '720p' },
  { id: '480', label: '480p' },
  { id: '360', label: '360p' },
]

const AUDIO_FORMATS: { id: string; label: string }[] = [
  { id: 'mp3', label: 'MP3' },
  { id: 'm4a', label: 'M4A' },
  { id: 'aac', label: 'AAC' },
  { id: 'alac', label: 'ALAC' },
  { id: 'opus', label: 'Opus' },
  { id: 'vorbis', label: 'Vorbis' },
  { id: 'flac', label: 'FLAC' },
  { id: 'wav', label: 'WAV' },
  { id: 'best', label: 'Best (no convert)' },
]

// A small, recognizable subset of the thousands of sites yt-dlp supports.
// The full, authoritative list lives on the yt-dlp supported-sites page.
const POPULAR_SITES: string[] = [
  'YouTube',
  'Vimeo',
  'TikTok',
  'Instagram',
  'Facebook',
  'X / Twitter',
  'Twitch',
  'Reddit',
  'SoundCloud',
  'Bandcamp',
  'Dailymotion',
  'BBC iPlayer',
]

const BROWSERS: { id: string; label: string }[] = [
  { id: '', label: 'None' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'firefox', label: 'Firefox' },
  { id: 'edge', label: 'Edge' },
  { id: 'safari', label: 'Safari' },
  { id: 'brave', label: 'Brave' },
  { id: 'chromium', label: 'Chromium' },
  { id: 'opera', label: 'Opera' },
  { id: 'vivaldi', label: 'Vivaldi' },
  { id: 'whale', label: 'Whale' },
]

const STR = {
  en: {
    loading: 'Loading your settings…',
    title: 'Video Downloader',
    builtFor: 'Built for',
    updateAvailable: 'Compatibility update available',
    updateNoticeBefore: 'This page targets yt-dlp ',
    updateNoticeBetween: ', but the latest stable release is ',
    updateNoticeAfter: '. Most commands should still work, but the page may need updating.',
    introBefore: 'Pick your options, then hit download — the server runs ',
    introAfter:
      ' for you and sends the file straight to your device. Prefer to run it yourself? Copy the ready-to-run command instead.',
    urlLabel: 'Video / playlist URL',
    urlPlaceholder: 'https://www.youtube.com/watch?v=…',
    pasteUrl: 'Paste',
    clearUrl: 'Clear',
    whatToDownload: 'What to download',
    optVideo: 'Video',
    optAudioOnly: 'Audio only',
    maxQuality: 'Max quality',
    qualityBest: 'Best available',
    preferMp4: 'Prefer MP4 (most compatible)',
    audioFormat: 'Audio format',
    audioBest: 'Best (no convert)',
    browserNone: 'None',
    moreOptions: 'Subtitles, extras & advanced',
    subtitles: 'Subtitles',
    downloadSubs: 'Download subtitles',
    autoSubs: 'Include auto-generated subtitles',
    embedSubs: 'Embed subtitles into the file',
    subLangsLabel: 'Languages (comma-separated, or “all”)',
    subLangsPlaceholder: 'en,fr,nl',
    extras: 'Extras',
    embedThumbnail: 'Embed thumbnail / cover art',
    embedMetadata: 'Embed title, artist & metadata',
    embedChapters: 'Embed chapters',
    sponsorblock: 'Remove sponsor segments (SponsorBlock)',
    advanced: 'Advanced',
    playlists: 'Playlists',
    playlistSingle: 'Single video only',
    playlistFull: 'Whole playlist',
    cookiesLabel: 'Use cookies from browser (for private / age-gated)',
    outputTemplateLabel: 'Output filename template',
    speedLimitLabel: 'Speed limit',
    restrictFilenames: 'Restrict filenames to ASCII (no spaces / special chars)',
    downloadHeading: 'Download',
    downloadButton: 'Download to this device',
    downloadStarting: 'Starting…',
    downloadPreparing: 'Preparing download…',
    downloadProcessing: 'Processing on server…',
    downloadSaving: 'Sending file to your device…',
    downloadDone: 'Done — check your downloads.',
    downloadNeedUrl: 'Enter a URL first.',
    downloadStageMerging: 'Merging video + audio…',
    downloadStageAudio: 'Extracting audio…',
    downloadStageEmbedding: 'Embedding extras…',
    playlistDownloadNote:
      'Playlist mode is set to “whole playlist”, but downloading here fetches only the single video. Copy the command below to grab the full playlist.',
    cookiesDownloadNote:
      'Browser cookies can’t be read by the server. If this video needs a login, copy the command and run it locally instead.',
    commandAndHelp: 'Command, setup & supported sites',
    command: 'Or copy the command',
    copy: 'Copy',
    copied: 'Copied!',
    enterUrlHint: 'Enter a URL above to drop it into the command.',
    firstTime: 'First time?',
    installBefore: 'Install or update yt-dlp — e.g. ',
    installMacos: ' (macOS / Linux), ',
    installAnyOs: ' (Python 3.11+ recommended), or grab an official binary from the ',
    releasesPage: 'releases page',
    installAfter: '. Full YouTube support also needs a JavaScript runtime such as ',
    installFfmpegBefore: '; conversion, merging and embedding need ',
    installFfmpeg: '. Only download content you have the right to.',
    supportedSites: 'Supported sites',
    supportedSitesIntro:
      'Works with YouTube and thousands of other sites — a few popular ones:',
    fullListLink: 'See the full list of supported sites →',
  },
  nl: {
    loading: 'Je instellingen laden…',
    title: 'Video-downloader',
    builtFor: 'Gebouwd voor',
    updateAvailable: 'Compatibiliteitsupdate beschikbaar',
    updateNoticeBefore: 'Deze pagina is gemaakt voor yt-dlp ',
    updateNoticeBetween: ', maar de laatste stabiele versie is ',
    updateNoticeAfter: '. De meeste commando’s werken nog, maar de pagina moet mogelijk worden bijgewerkt.',
    introBefore: 'Kies je opties en klik op downloaden — de server draait ',
    introAfter:
      ' voor jou en stuurt het bestand meteen naar je apparaat. Liever zelf uitvoeren? Kopieer dan het kant-en-klare commando.',
    urlLabel: 'Video- / afspeellijst-URL',
    urlPlaceholder: 'https://www.youtube.com/watch?v=…',
    pasteUrl: 'Plakken',
    clearUrl: 'Wissen',
    whatToDownload: 'Wat downloaden',
    optVideo: 'Video',
    optAudioOnly: 'Enkel audio',
    maxQuality: 'Maximale kwaliteit',
    qualityBest: 'Best beschikbaar',
    preferMp4: 'Voorkeur voor MP4 (meest compatibel)',
    audioFormat: 'Audioformaat',
    audioBest: 'Beste (geen conversie)',
    browserNone: 'Geen',
    moreOptions: 'Ondertitels, extra’s & geavanceerd',
    subtitles: 'Ondertitels',
    downloadSubs: 'Ondertitels downloaden',
    autoSubs: 'Automatisch gegenereerde ondertitels meenemen',
    embedSubs: 'Ondertitels in het bestand insluiten',
    subLangsLabel: 'Talen (kommagescheiden, of “all”)',
    subLangsPlaceholder: 'en,fr,nl',
    extras: 'Extra’s',
    embedThumbnail: 'Thumbnail / hoesafbeelding insluiten',
    embedMetadata: 'Titel, artiest & metadata insluiten',
    embedChapters: 'Hoofdstukken insluiten',
    sponsorblock: 'Sponsorfragmenten verwijderen (SponsorBlock)',
    advanced: 'Geavanceerd',
    playlists: 'Afspeellijsten',
    playlistSingle: 'Alleen losse video',
    playlistFull: 'Volledige afspeellijst',
    cookiesLabel: 'Cookies uit browser gebruiken (voor privé / leeftijdsgebonden)',
    outputTemplateLabel: 'Sjabloon voor bestandsnaam',
    speedLimitLabel: 'Snelheidslimiet',
    restrictFilenames: 'Bestandsnamen beperken tot ASCII (geen spaties / speciale tekens)',
    downloadHeading: 'Downloaden',
    downloadButton: 'Download naar dit apparaat',
    downloadStarting: 'Starten…',
    downloadPreparing: 'Download voorbereiden…',
    downloadProcessing: 'Verwerken op server…',
    downloadSaving: 'Bestand naar je apparaat sturen…',
    downloadDone: 'Klaar — kijk bij je downloads.',
    downloadNeedUrl: 'Voer eerst een URL in.',
    downloadStageMerging: 'Video + audio samenvoegen…',
    downloadStageAudio: 'Audio extraheren…',
    downloadStageEmbedding: 'Extra’s insluiten…',
    playlistDownloadNote:
      'Afspeellijstmodus staat op “volledige afspeellijst”, maar hier downloaden haalt enkel de losse video op. Kopieer het commando hieronder voor de volledige afspeellijst.',
    cookiesDownloadNote:
      'De server kan geen browsercookies lezen. Heeft deze video een login nodig? Kopieer dan het commando en voer het lokaal uit.',
    commandAndHelp: 'Commando, installatie & ondersteunde sites',
    command: 'Of kopieer het commando',
    copy: 'Kopiëren',
    copied: 'Gekopieerd!',
    enterUrlHint: 'Voer hierboven een URL in om die in het commando te plaatsen.',
    firstTime: 'Eerste keer?',
    installBefore: 'Installeer of update yt-dlp — bv. ',
    installMacos: ' (macOS / Linux), ',
    installAnyOs: ' (Python 3.11+ aanbevolen), of pak een officiële binary van de ',
    releasesPage: 'releases-pagina',
    installAfter: '. Volledige YouTube-ondersteuning vereist ook een JavaScript-runtime zoals ',
    installFfmpegBefore: '; voor conversie, samenvoegen en insluiten is ',
    installFfmpeg: ' nodig. Download alleen content waarop je recht hebt.',
    supportedSites: 'Ondersteunde sites',
    supportedSitesIntro:
      'Werkt met YouTube en duizenden andere sites — enkele populaire:',
    fullListLink: 'Bekijk de volledige lijst met ondersteunde sites →',
  },
}

// Fetch the finished file in slices below the Cloudflare Tunnel's 100 MB
// per-response cap, then reassemble in the browser (see fetchAndSave).
const TUNNEL_CHUNK = 90 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  opus: 'audio/opus',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
}

function mimeFor(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
  return MIME_BY_EXT[ext] || 'application/octet-stream'
}

/**
 * Wrap a value in single quotes for a POSIX shell, escaping any embedded
 * single quotes. Used for the URL, output template and rate limit so that
 * spaces and shell metacharacters can't break or inject into the command.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function isNewerRelease(candidate: string, current: string): boolean {
  const releasePattern = /^\d{4}\.\d{2}\.\d{2}$/
  return releasePattern.test(candidate) && candidate.localeCompare(current) > 0
}

/** Build the `-f` format selector for the chosen video quality. */
function videoFormat(quality: string): string {
  if (quality === 'best') {
    return 'bv*+ba/b'
  }
  const h = `[height<=${quality}]`
  return `bv*${h}+ba/b${h}`
}

function buildCommand(o: Options, url: string): string {
  const args: string[] = ['yt-dlp']

  if (o.mode === 'audio') {
    args.push('-x') // --extract-audio
    if (o.audioFormat !== 'best') args.push(`--audio-format ${o.audioFormat}`)
    args.push('--audio-quality 0') // best within the chosen format
  } else {
    args.push(`-f ${shellQuote(videoFormat(o.videoQuality))}`)
    // The upstream preset also prefers H.264/AAC and remuxes compatible files.
    if (o.forceMp4) args.push('-t mp4')
  }

  if (o.downloadSubs || o.autoSubs || o.embedSubs) {
    if (o.downloadSubs) args.push('--write-subs')
    if (o.autoSubs) args.push('--write-auto-subs')
    args.push(`--sub-langs ${shellQuote(o.subLangs || 'en')}`)
    if (o.embedSubs) args.push('--embed-subs')
  }

  if (o.embedThumbnail) args.push('--embed-thumbnail')
  if (o.embedMetadata) args.push('--embed-metadata')
  if (o.embedChapters) args.push('--embed-chapters')
  if (o.sponsorblock) args.push('--sponsorblock-remove sponsor')

  // yt-dlp follows playlists by default when given a playlist/channel URL.
  args.push(o.playlist === 'full' ? '--yes-playlist' : '--no-playlist')

  if (o.restrictFilenames) args.push('--restrict-filenames')
  if (o.cookiesBrowser) args.push(`--cookies-from-browser ${o.cookiesBrowser}`)
  if (o.rateLimit.trim()) args.push(`--limit-rate ${shellQuote(o.rateLimit.trim())}`)
  if (o.outputTemplate.trim()) args.push(`-o ${shellQuote(o.outputTemplate.trim())}`)

  args.push(url.trim() ? shellQuote(url.trim()) : "'<URL>'")

  return args.join(' ')
}

const inputClass =
  'glass w-full rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 transition-all duration-200 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20'

const labelClass = 'block text-xs font-medium text-slate-400'

function Field({
  label,
  group,
  children,
}: {
  label: string
  group?: boolean
  children: React.ReactNode
}) {
  const content = (
    <>
      <span className={labelClass}>{label}</span>
      <div className="mt-1.5">{children}</div>
    </>
  )
  return group ? (
    <div className="block" role="group" aria-label={label}>
      {content}
    </div>
  ) : (
    <label className="block">{content}</label>
  )
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-indigo-500"
      />
      {children}
    </label>
  )
}

function Pills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`rounded-lg px-3 py-1.5 text-xs transition-all ${
            value === opt.id
              ? 'bg-indigo-500 text-white'
              : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Foldout({
  title,
  className = '',
  children,
}: {
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <details className={`glass group rounded-2xl ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400 transition-colors hover:text-slate-200 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  )
}

type DownloadPhase =
  | 'idle'
  | 'starting'
  | 'downloading'
  | 'processing'
  | 'saving'
  | 'done'
  | 'error'

type Progress = { percent: number; speed: string | null; eta: string | null }

export function YtDlpCommand() {
  const t = useT(STR)
  const { config, setConfig, loading, saving } = useUtilityConfig('yt-dlp', DEFAULTS)
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [phase, setPhase] = useState<DownloadPhase>('idle')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [stage, setStage] = useState<string | null>(null)
  const [dlError, setDlError] = useState<string | null>(null)
  const [latestRelease, setLatestRelease] = useState<string | null>(null)
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function checkLatestRelease() {
      try {
        const cached = JSON.parse(localStorage.getItem(RELEASE_CACHE_KEY) || 'null') as ReleaseCache | null
        if (
          cached &&
          typeof cached.tag === 'string' &&
          Date.now() - cached.checkedAt < RELEASE_CACHE_TTL
        ) {
          setLatestRelease(cached.tag)
          return
        }

        const response = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
          headers: { Accept: 'application/vnd.github+json' },
          signal: controller.signal,
        })
        if (!response.ok) return

        const release = (await response.json()) as { tag_name?: unknown }
        if (typeof release.tag_name !== 'string') return

        const nextCache: ReleaseCache = { tag: release.tag_name, checkedAt: Date.now() }
        localStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify(nextCache))
        setLatestRelease(release.tag_name)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          // The version check is optional; downloading and command generation still work offline.
        }
      }
    }

    void checkLatestRelease()
    return () => controller.abort()
  }, [])

  if (loading) {
    return <p className="animate-pulse text-slate-400">{t.loading}</p>
  }

  const o = config
  const command = buildCommand(o, url)
  const updateAvailable = latestRelease
    ? isNewerRelease(latestRelease, CURRENT_RELEASE)
    : false
  const busy =
    phase === 'starting' || phase === 'downloading' || phase === 'processing' || phase === 'saving'

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  async function pasteUrl() {
    try {
      const clipboardText = await navigator.clipboard.readText()
      if (clipboardText) {
        setUrl(clipboardText.trim())
        setDlError(null)
      }
    } catch {
      // Clipboard access can be denied by the browser; manual paste still works.
    }
  }

  function clearUrl() {
    setUrl('')
    setDlError(null)
  }

  function stageLabel(s: string | null): string {
    if (s === 'Merger' || s === 'VideoConvertor') return t.downloadStageMerging
    if (s === 'ExtractAudio') return t.downloadStageAudio
    return t.downloadStageEmbedding
  }

  /**
   * Pull the finished file from the server and save it. The Cloudflare Tunnel
   * caps a single response at 100 MB, so we fetch the file in sub-100 MB slices
   * (?offset=&length=) and reassemble them into one Blob in the browser, then
   * trigger a normal download. Fetching each slice as a Blob keeps the browser
   * free to back large files on disk rather than holding it all in RAM. Finally
   * we release the server-side temp file.
   */
  async function fetchAndSave(jobId: string, filename: string, size: number) {
    const base = `${functionsBase}/video-download?job=${encodeURIComponent(jobId)}`
    const parts: Blob[] = []
    let fetched = 0
    for (let offset = 0; offset < Math.max(size, 1); offset += TUNNEL_CHUNK) {
      const length = Math.min(TUNNEL_CHUNK, size - offset)
      const res = await fetch(`${base}&offset=${offset}&length=${length}`)
      if (!res.ok) throw new Error(`Transfer failed (${res.status})`)
      parts.push(await res.blob())
      fetched += length
      if (size > 0) setProgress({ percent: (fetched / size) * 100, speed: null, eta: null })
      if (size === 0) break
    }

    const blob = new Blob(parts, { type: mimeFor(filename) })
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objUrl), 60_000)
    fetch(`${base}&release=1`).catch(() => {}) // best-effort cleanup
  }

  async function download() {
    const trimmed = url.trim()
    if (!trimmed) {
      setDlError(t.downloadNeedUrl)
      return
    }
    if (doneTimer.current) clearTimeout(doneTimer.current)
    setDlError(null)
    setProgress(null)
    setStage(null)
    setPhase('starting')

    try {
      const res = await fetch(`${functionsBase}/video-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...o, url: trimmed }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || `Server error (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      // Parse the NDJSON progress stream line by line.
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          const msg = JSON.parse(line)
          if (msg.type === 'progress') {
            setPhase('downloading')
            setProgress({ percent: msg.percent, speed: msg.speed, eta: msg.eta })
          } else if (msg.type === 'status') {
            setPhase('processing')
            setStage(msg.stage)
          } else if (msg.type === 'error') {
            throw new Error(msg.message)
          } else if (msg.type === 'done') {
            setPhase('saving')
            setProgress(null)
            await fetchAndSave(msg.jobId, msg.filename, msg.size)
            setPhase('done')
            doneTimer.current = setTimeout(() => setPhase('idle'), 5000)
          }
        }
      }
      // Stream ended without a terminal message (e.g. server crash / cutoff).
      setPhase((p) => (p === 'done' ? p : 'idle'))
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Download failed')
      setPhase('error')
    }
  }

  const determinate = (phase === 'downloading' || phase === 'saving') && progress !== null
  const busyLabel =
    phase === 'starting'
      ? t.downloadStarting
      : phase === 'downloading'
        ? progress
          ? `${Math.round(progress.percent)}%`
          : t.downloadPreparing
        : phase === 'processing'
          ? stageLabel(stage)
          : phase === 'saving'
            ? progress
              ? `${t.downloadSaving} ${Math.round(progress.percent)}%`
              : t.downloadSaving
            : t.downloadButton

  return (
    <div className="animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
          <a
            href={`https://github.com/yt-dlp/yt-dlp/releases/tag/${CURRENT_RELEASE}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs text-indigo-300 transition-colors hover:text-indigo-200"
          >
            {t.builtFor} · {CURRENT_RELEASE}
          </a>
        </div>
        <SaveStatus saving={saving} />
      </div>
      <p className="mt-2 text-slate-400">
        {t.introBefore}
        <a
          href="https://github.com/yt-dlp/yt-dlp"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-300 transition-colors hover:text-indigo-200"
        >
          yt-dlp
        </a>
        {t.introAfter}
      </p>

      {updateAvailable && latestRelease && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
        >
          <p className="font-medium">{t.updateAvailable}</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
            {t.updateNoticeBefore}
            {CURRENT_RELEASE}
            {t.updateNoticeBetween}
            <a
              href={`https://github.com/yt-dlp/yt-dlp/releases/tag/${latestRelease}`}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-amber-300/40 underline-offset-2 hover:text-white"
            >
              {latestRelease}
            </a>
            {t.updateNoticeAfter}
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_minmax(300px,420px)]">
        <div className="min-w-0 space-y-6">
          <Field label={t.urlLabel}>
            <div className="relative">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t.urlPlaceholder}
                className={`${inputClass} pr-24`}
              />
              <button
                type="button"
                onClick={url ? clearUrl : pasteUrl}
                className="no-glow absolute inset-y-1.5 right-1.5 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={url ? t.clearUrl : t.pasteUrl}
              >
                {url ? <X className="size-3.5" /> : <ClipboardPaste className="size-3.5" />}
                {url ? t.clearUrl : t.pasteUrl}
              </button>
            </div>
          </Field>

          <Field group label={t.whatToDownload}>
            <Pills<Mode>
              options={[
                { id: 'video', label: t.optVideo },
                { id: 'audio', label: t.optAudioOnly },
              ]}
              value={o.mode}
              onChange={(v) => setConfig({ mode: v })}
            />
          </Field>

          {o.mode === 'video' ? (
            <>
              <Field group label={t.maxQuality}>
                <Pills
                  options={VIDEO_QUALITIES.map((q) =>
                    q.id === 'best' ? { ...q, label: t.qualityBest } : q,
                  )}
                  value={o.videoQuality}
                  onChange={(v) => setConfig({ videoQuality: v })}
                />
              </Field>
              <Toggle checked={o.forceMp4} onChange={(v) => setConfig({ forceMp4: v })}>
                {t.preferMp4}
              </Toggle>
            </>
          ) : (
            <Field group label={t.audioFormat}>
              <Pills
                options={AUDIO_FORMATS.map((a) =>
                  a.id === 'best' ? { ...a, label: t.audioBest } : a,
                )}
                value={o.audioFormat}
                onChange={(v) => setConfig({ audioFormat: v })}
              />
            </Field>
          )}

          <Foldout title={t.moreOptions}>
            <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {t.subtitles}
            </p>
            <div className="mt-4 space-y-3">
              <Toggle checked={o.downloadSubs} onChange={(v) => setConfig({ downloadSubs: v })}>
                {t.downloadSubs}
              </Toggle>
              <Toggle checked={o.autoSubs} onChange={(v) => setConfig({ autoSubs: v })}>
                {t.autoSubs}
              </Toggle>
              <Toggle
                checked={o.embedSubs}
                onChange={(v) => setConfig({ embedSubs: v })}
              >
                {t.embedSubs}
              </Toggle>
              {(o.downloadSubs || o.autoSubs) && (
                <Field label={t.subLangsLabel}>
                  <input
                    value={o.subLangs}
                    onChange={(e) => setConfig({ subLangs: e.target.value })}
                    placeholder={t.subLangsPlaceholder}
                    className={inputClass}
                  />
                </Field>
              )}
            </div>
            </section>

            <section className="mt-6 border-t border-white/10 pt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {t.extras}
            </p>
            <div className="mt-4 space-y-3">
              <Toggle
                checked={o.embedThumbnail}
                onChange={(v) => setConfig({ embedThumbnail: v })}
              >
                {t.embedThumbnail}
              </Toggle>
              <Toggle
                checked={o.embedMetadata}
                onChange={(v) => setConfig({ embedMetadata: v })}
              >
                {t.embedMetadata}
              </Toggle>
              <Toggle
                checked={o.embedChapters}
                onChange={(v) => setConfig({ embedChapters: v })}
              >
                {t.embedChapters}
              </Toggle>
              <Toggle
                checked={o.sponsorblock}
                onChange={(v) => setConfig({ sponsorblock: v })}
              >
                {t.sponsorblock}
              </Toggle>
            </div>
            </section>

            <section className="mt-6 border-t border-white/10 pt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {t.advanced}
            </p>
            <div className="mt-4 space-y-4">
              <Field group label={t.playlists}>
                <Pills
                  options={[
                    { id: 'single', label: t.playlistSingle },
                    { id: 'full', label: t.playlistFull },
                  ]}
                  value={o.playlist}
                  onChange={(v) => setConfig({ playlist: v })}
                />
              </Field>
              <Field group label={t.cookiesLabel}>
                <Pills
                  options={BROWSERS.map((b) =>
                    b.id === '' ? { ...b, label: t.browserNone } : b,
                  )}
                  value={o.cookiesBrowser}
                  onChange={(v) => setConfig({ cookiesBrowser: v })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.outputTemplateLabel}>
                  <input
                    value={o.outputTemplate}
                    onChange={(e) => setConfig({ outputTemplate: e.target.value })}
                    placeholder="%(title)s.%(ext)s"
                    className={inputClass}
                  />
                </Field>
                <Field label={t.speedLimitLabel}>
                  <input
                    value={o.rateLimit}
                    onChange={(e) => setConfig({ rateLimit: e.target.value })}
                    placeholder="2M"
                    className={inputClass}
                  />
                </Field>
              </div>
              <Toggle
                checked={o.restrictFilenames}
                onChange={(v) => setConfig({ restrictFilenames: v })}
              >
                {t.restrictFilenames}
              </Toggle>
            </div>
            </section>
          </Foldout>
        </div>

        <div className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          <div className="glass rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {t.downloadHeading}
            </p>
            <button
              onClick={download}
              disabled={busy || !url.trim()}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? busyLabel : t.downloadButton}
            </button>

            {busy && (
              <div className="mt-4">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400 transition-all duration-300 ${
                      determinate ? '' : 'animate-pulse'
                    }`}
                    style={{ width: determinate && progress ? `${progress.percent}%` : '100%' }}
                  />
                </div>
                {phase === 'downloading' && progress && (progress.speed || progress.eta) && (
                  <p className="mt-2 text-[11px] text-slate-500">
                    {progress.speed}
                    {progress.speed && progress.eta ? ' · ETA ' : ''}
                    {progress.eta}
                  </p>
                )}
              </div>
            )}

            {phase === 'done' && (
              <p className="mt-3 text-xs text-emerald-300">{t.downloadDone}</p>
            )}
            {phase === 'error' && dlError && (
              <p className="mt-3 break-words text-xs text-rose-300">{dlError}</p>
            )}
            {!busy && o.playlist === 'full' && (
              <p className="mt-3 text-[11px] leading-relaxed text-amber-300/80">
                {t.playlistDownloadNote}
              </p>
            )}
            {!busy && o.cookiesBrowser && (
              <p className="mt-3 text-[11px] leading-relaxed text-amber-300/80">
                {t.cookiesDownloadNote}
              </p>
            )}
          </div>

          <Foldout title={t.commandAndHelp} className="mt-4">
            <section>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                {t.command}
              </p>
              <button
                onClick={copy}
                className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:brightness-110"
              >
                {copied ? t.copied : t.copy}
              </button>
            </div>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-4 font-mono text-xs leading-relaxed text-emerald-200">
              {command}
            </pre>
            {!url.trim() && (
              <p className="mt-3 text-xs text-slate-500">{t.enterUrlHint}</p>
            )}
            </section>

            <section className="mt-6 border-t border-white/10 pt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {t.firstTime}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              {t.installBefore}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">
                brew install yt-dlp
              </code>
              {t.installMacos}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">
                python3 -m pip install -U &quot;yt-dlp[default]&quot;
              </code>
              {t.installAnyOs}
              <a
                href="https://github.com/yt-dlp/yt-dlp/releases"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-300 transition-colors hover:text-indigo-200"
              >
                {t.releasesPage}
              </a>
              {t.installAfter}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">
                Deno 2.3+
              </code>
              {t.installFfmpegBefore}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">
                ffmpeg
              </code>
              {t.installFfmpeg}
            </p>
            </section>

            <section className="mt-6 border-t border-white/10 pt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {t.supportedSites}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              {t.supportedSitesIntro}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {POPULAR_SITES.map((site) => (
                <span
                  key={site}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300"
                >
                  {site}
                </span>
              ))}
            </div>
            <a
              href="https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs text-indigo-300 transition-colors hover:text-indigo-200"
            >
              {t.fullListLink}
            </a>
            </section>
          </Foldout>
        </div>
      </div>
    </div>
  )
}
