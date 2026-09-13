// Keep in sync with toolbox/supabase/functions/_shared/lyric-search.mjs.
const UNISON_BASE = 'https://unison.boidu.dev'
const CLIENT_ID = 'Toolbox Live Lyrics/1.0 (https://toolbox.zacsvae.com)'

export class LyricSearchError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function readUnison(path, fetchImpl) {
  try {
    const response = await fetchImpl(`${UNISON_BASE}${path}`, {
      headers: { 'User-Agent': CLIENT_ID, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 429) {
      throw new LyricSearchError('The free lyrics service is busy. Try again shortly.', 429, 'lyrics_search_busy')
    }
    if (!response.ok) throw new Error('Upstream failed')
    const body = await response.json()
    if (body?.success !== true) throw new Error('Invalid response')
    return body.data
  } catch (error) {
    if (error instanceof LyricSearchError) throw error
    throw new LyricSearchError('The free lyrics service is temporarily unavailable.', 502, 'lyrics_search_unavailable')
  }
}

/**
 * Search the actual lyric content through Unison's public, keyless read API.
 * LRCLIB remains the separate title/artist fallback; its q is metadata-only.
 * @param {unknown} query
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function searchByLyrics(query, { fetchImpl = fetch } = {}) {
  const phrase = typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : ''
  const wordCount = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(phrase)]
    .filter((part) => part.isWordLike).length
  if (phrase.length > 240 || wordCount < 4) {
    throw new LyricSearchError('Use at least four words and at most 240 characters.', 400, 'invalid_phrase')
  }
  // Unison puts metadata tiers ahead of lyric matches. Request a wider list,
  // then compare match scores across tiers before fetching up to six records.
  // The client verifies the heard phrase against the full lyrics before choosing.
  const params = new URLSearchParams({ q: phrase, limit: '100' })
  const rows = await readUnison(`/lyrics/search?${params}`, fetchImpl)
  if (!Array.isArray(rows)) throw new LyricSearchError('Invalid search response.', 502, 'lyrics_search_unavailable')
  const candidates = [...new Map(rows.slice(0, 100)
    .filter((row) => Number.isSafeInteger(row?.id) && row.id > 0
      && typeof row.song === 'string' && typeof row.artist === 'string')
    .map((row) => [row.id, row])).values()]
    .sort((a, b) => (Number(b.matchScore) || 0) - (Number(a.matchScore) || 0))
    .slice(0, 6)
  const lookups = await Promise.allSettled(candidates.map(async (candidate) => {
    // Search responses contain metadata only; fetch the complete record by ID.
    const row = await readUnison(`/lyrics/${candidate.id}`, fetchImpl)
    if (row?.id !== candidate.id || typeof row.lyrics !== 'string'
      || !row.lyrics.trim() || row.lyrics.length > 200_000
      || !['plain', 'lrc', 'ttml'].includes(row.format)) {
      throw new LyricSearchError('Invalid full lyrics response.', 502, 'lyrics_unavailable')
    }
    return {
      id: row.id, title: candidate.song, artist: candidate.artist,
      album: candidate.album || '', duration: Number(candidate.duration) || 0,
      syncedLyrics: row.format === 'lrc' ? row.lyrics : null,
      plainLyrics: row.format === 'plain' ? row.lyrics : null,
      ttmlLyrics: row.format === 'ttml' ? row.lyrics : null,
      source: 'unison',
    }
  }))
  if (lookups.length && lookups.every((lookup) => lookup.status === 'rejected')) {
    throw lookups[0].reason
  }
  return lookups.flatMap((lookup) => lookup.status === 'fulfilled' ? [lookup.value] : [])
}
