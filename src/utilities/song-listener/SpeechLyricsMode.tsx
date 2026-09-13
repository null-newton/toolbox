import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, LoaderCircle, Mic, Music2, Search, Square } from 'lucide-react'
import { useT } from '../../i18n/LanguageContext'
import { songLines, words } from './lyrics'
import { SPEECH_STR } from './speechStrings'
import { useSpeechLyrics } from './useSpeechLyrics'

export function SpeechLyricsMode() {
  const t = useT(SPEECH_STR)
  const speech = useSpeechLyrics()
  const [language, setLanguage] = useState('en-US')
  const [query, setQuery] = useState('')
  const [byTitle, setByTitle] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLButtonElement>(null)
  const lines = useMemo(() => speech.track ? songLines(speech.track) : [], [speech.track])

  useEffect(() => {
    const container = scrollRef.current
    const line = lineRef.current
    if (!container || !line) return
    container.scrollTo({
      top: container.scrollTop + line.getBoundingClientRect().top - container.getBoundingClientRect().top
        - (container.clientHeight - line.clientHeight) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }, [speech.activeLine, speech.track])

  const status = speech.searching ? t.searching : speech.listening
    ? speech.track ? speech.activeLine >= 0 ? t.following : t.aligning : t.waiting
    : t.paused

  const languageSelector = <label className="flex flex-col gap-2 text-xs font-medium text-slate-400">
    {t.language}
    <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={speech.listening}
      className="rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white disabled:opacity-50">
      <option value="en-US">English</option><option value="nl-NL">Nederlands</option>
      <option value="fr-FR">Français</option><option value="de-DE">Deutsch</option>
      <option value="es-ES">Español</option><option value="it-IT">Italiano</option>
      <option value="pt-BR">Português</option><option value="ja-JP">日本語</option>
      <option value="ko-KR">한국어</option><option value="zh-CN">中文</option>
    </select>
  </label>

  return (
    <div className="mt-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-white/[0.035] to-cyan-500/5 p-5 sm:p-7">
        {!speech.track && <p className="max-w-2xl text-sm leading-relaxed text-slate-400">{t.hint}</p>}
        <div className={`flex flex-wrap items-end gap-3 ${speech.track ? '' : 'mt-5'}`}>
          {!speech.track && languageSelector}
          <button onClick={() => speech.listening || speech.searching ? speech.stop() : speech.start(language)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:brightness-110">
            {speech.listening || speech.searching ? <Square className="size-4" /> : <Mic className="size-4" />}
            {speech.listening || speech.searching ? t.stop : speech.track ? t.resume : t.start}
          </button>
          <p role="status" className="flex items-center gap-2 py-3 text-xs text-cyan-200">
            {speech.searching ? <LoaderCircle className="size-4 animate-spin" /> : speech.listening && <span className="size-2 animate-pulse rounded-full bg-cyan-300" />}
            {status}
          </p>
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t.heard}</p>
          <p className="mt-2 min-h-6 text-base text-slate-200">{speech.transcript || '…'}</p>
        </div>
        {speech.track ? <details className="mt-3 text-xs text-slate-500">
          <summary className="cursor-pointer hover:text-slate-300">{t.language}</summary>
          <div className="mt-3 max-w-xs">{languageSelector}</div>
          <p className="mt-3 max-w-3xl text-[11px] leading-relaxed">{t.privacy}</p>
        </details> : <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-slate-500">{t.privacy}</p>}
      </section>

      {speech.error && <div role="alert" className="mt-4 flex gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />{speech.error}
      </div>}

      {speech.track ? (
        <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-[#090c14]/90">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-indigo-500/5 p-5 sm:px-8">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/30 to-cyan-400/10"><Music2 className="size-6 text-cyan-100" /></div>
              <div className="min-w-0"><h2 className="truncate text-xl font-bold">{speech.track.title}</h2><p className="truncate text-sm text-slate-400">{speech.track.artist}</p></div>
            </div>
            <button onClick={speech.reset} className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-cyan-100 hover:bg-white/5">{t.another}</button>
          </div>
          <p className="px-5 pt-4 text-xs text-slate-500 sm:px-8">{t.tap}</p>
          <div ref={scrollRef} className="h-[420px] overflow-y-auto overscroll-contain px-5 py-24 sm:h-[520px] sm:px-12 sm:py-48">
            {lines.map((line, index) => <button key={index} ref={index === speech.activeLine ? lineRef : null}
              onClick={() => speech.seek(index)} aria-current={index === speech.activeLine ? 'true' : undefined}
              className={`block w-full rounded-lg py-2 text-left text-2xl font-bold leading-snug tracking-tight transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-cyan-300 sm:text-3xl ${
                index === speech.activeLine ? 'text-white drop-shadow-[0_0_18px_rgb(103_232_249/0.2)]'
                  : speech.activeLine < 0 || Math.abs(index - speech.activeLine) <= 2 ? 'text-slate-500 hover:text-slate-300' : 'text-slate-700 hover:text-slate-400'
              }`}>{line.text}</button>)}
          </div>
          <p className="px-6 pb-4 text-right text-[10px] text-slate-500">
            {speech.track.source === 'unison'
              ? <a href="https://unison.boidu.dev" target="_blank" rel="noreferrer" className="hover:text-slate-300">Lyrics from Unison</a>
              : t.source}
          </p>
        </section>
      ) : (
        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
          <h2 className="font-semibold">{t.manual}</h2>
          <div className="mt-4 flex gap-2" role="group" aria-label={t.search}>
            {[false, true].map((title) => <button key={String(title)} onClick={() => { setByTitle(title); setQuery('') }} aria-pressed={byTitle === title}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${byTitle === title ? 'bg-indigo-400/15 text-indigo-200' : 'text-slate-500 hover:text-white'}`}>{title ? t.title : t.phrase}</button>)}
          </div>
          <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => {
            event.preventDefault()
            if (byTitle ? query.trim().length >= 2 : words(query).length >= 4) void speech.search(query.trim(), byTitle)
          }}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={240}
              aria-label={byTitle ? t.title : t.phrase} placeholder={byTitle ? t.titlePlaceholder : t.placeholder}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-indigo-400/60" />
            <button disabled={speech.searching || (byTitle ? query.trim().length < 2 : words(query).length < 4)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">
              {speech.searching ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}{t.search}
            </button>
          </form>
          {speech.candidates.length > 0 && <div className="mt-6">
            <p className="mb-3 text-xs text-slate-400">{t.results}</p>
            <div className="grid gap-2 sm:grid-cols-2">{speech.candidates.map((song) => <button key={song.id} onClick={() => speech.select(song)}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 p-3 text-left hover:border-indigo-400/40 hover:bg-indigo-500/5">
              <Music2 className="size-5 shrink-0 text-indigo-300" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{song.title}</span><span className="block truncate text-xs text-slate-500">{song.artist} · {song.album}</span></span>
            </button>)}</div>
          </div>}
        </section>
      )}
    </div>
  )
}
