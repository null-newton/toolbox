export interface Song {
  id: number
  title: string
  artist: string
  album: string
  duration: number
  syncedLyrics: string | null
  plainLyrics: string | null
  ttmlLyrics?: string | null
  source?: 'unison' | 'lrclib'
}

export interface LyricLine {
  time: number
  text: string
}

export function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = []
  const offset = Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0) / 1000
  for (const row of source.split(/\r?\n/)) {
    const stamps = [...row.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    const text = row.replace(/\[[^\]]*\]/g, '').trim()
    if (!text) continue
    for (const stamp of stamps) {
      const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0
      lines.push({ time: Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) + fraction - offset), text })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

export function songLines(song: Song): LyricLine[] {
  if (song.ttmlLyrics) return parseTtml(song.ttmlLyrics)
  const timed = parseLrc(song.syncedLyrics ?? '')
  return timed.length ? timed : (song.plainLyrics ?? '').split(/\r?\n/)
    .map((text) => text.trim()).filter(Boolean).map((text) => ({ text, time: 0 }))
}

/** Read TTML as inert XML, never as HTML; render only lyric paragraph text. */
export function parseTtml(source: string): LyricLine[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) return []
  const document = new DOMParser().parseFromString(source, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) return []
  return [...document.getElementsByTagNameNS('*', 'p')].map((paragraph) => ({
    // Speech mode follows the words directly; it doesn't need TTML's clock.
    time: 0,
    text: (paragraph.textContent ?? '').replace(/\s+/g, ' ').trim(),
  })).filter((line) => line.text)
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })

export function words(text: string): string[] {
  const normalized = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’]/g, '')
  return [...segmenter.segment(normalized)].filter((part) => part.isWordLike).map((part) => part.segment)
}

/** Match an ordered phrase anywhere in the lyrics, allowing transcription mistakes.
 * Subsequence edit distance permits a phrase to span multiple lyric lines.
 * Near-equal repeated choruses prefer the current location; without an anchor,
 * ambiguity is reported so the UI can wait for a distinctive phrase.
 */
export function matchLyrics(lines: LyricLine[], transcript: string, nearLine = -1) {
  const phrase = words(transcript).slice(-18)
  if (phrase.length < 4) return null
  const tokens = lines.flatMap((line, index) => words(line.text).map((word) => ({ word, index })))
  if (!tokens.length) return null
  let previous = new Array<number>(tokens.length + 1).fill(0)
  for (let i = 1; i <= phrase.length; i += 1) {
    const row = [i]
    for (let j = 1; j <= tokens.length; j += 1) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1,
        previous[j - 1] + (phrase[i - 1] === tokens[j - 1].word ? 0 : 1))
    }
    previous = row
  }
  const byLine = new Map<number, number>()
  for (let j = 1; j <= tokens.length; j += 1) {
    // Require the last word to agree so alignment doesn't advance into silence.
    if (tokens[j - 1].word !== phrase.at(-1)) continue
    const score = 1 - previous[j] / phrase.length
    const index = tokens[j - 1].index
    if (score >= 0.72 && score > (byLine.get(index) ?? 0)) byLine.set(index, score)
  }
  const matches = [...byLine].map(([index, score]) => ({ index, score }))
    .sort((a, b) => b.score - a.score)
  if (!matches.length) return null
  const bestScore = matches[0].score
  const similar = matches.filter((match) => match.score >= bestScore - 0.06)
  if (nearLine >= 0) similar.sort((a, b) => Math.abs(a.index - nearLine) - Math.abs(b.index - nearLine)
    || Number(a.index < nearLine) - Number(b.index < nearLine))
  return { ...similar[0], ambiguous: nearLine < 0 && similar.length > 1 }
}
