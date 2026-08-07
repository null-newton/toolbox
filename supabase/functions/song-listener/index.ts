const MUSIXMATCH_BASE = 'https://api.musixmatch.com/ws/1.1'
const LRCLIB_BASE = 'https://lrclib.net/api'
const CLIENT_ID = 'Toolbox Live Lyrics/1.0 (https://toolbox.zacsvae.com)'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-musixmatch-key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = any

async function readJson(url: string, options?: RequestInit): Promise<AnyJson> {
  const response = await fetch(url, options)
  const raw = await response.text()
  let body: AnyJson
  try { body = JSON.parse(raw) } catch { throw new Error(`Lyrics service returned an unreadable response (${response.status}).`) }
  if (!response.ok) throw new Error(body?.message?.body || body?.error || `Lyrics service returned ${response.status}.`)
  return body
}

function normalizeTrack(row: AnyJson) {
  return {
    id: row.id,
    title: row.trackName,
    artist: row.artistName,
    album: row.albumName,
    duration: row.duration,
    syncedLyrics: row.syncedLyrics,
    plainLyrics: row.plainLyrics,
  }
}

async function lrclibSearch(query: string) {
  const rows = await readJson(`${LRCLIB_BASE}/search?q=${encodeURIComponent(query)}`, {
    headers: { 'Lrclib-Client': CLIENT_ID },
  })
  return (Array.isArray(rows) ? rows : []).filter((row) => row.syncedLyrics).slice(0, 8).map(normalizeTrack)
}

async function exactLyrics(track: AnyJson) {
  const params = new URLSearchParams({
    track_name: track.track_name,
    artist_name: track.artist_name,
    album_name: track.album_name || '',
    duration: String(Math.round(track.track_length || 0)),
  })
  if (track.album_name && track.track_length) {
    try {
      const row = await readJson(`${LRCLIB_BASE}/get?${params}`, { headers: { 'Lrclib-Client': CLIENT_ID } })
      if (row?.syncedLyrics) return normalizeTrack(row)
    } catch { /* tolerant search below */ }
  }
  return (await lrclibSearch(`${track.track_name} ${track.artist_name}`))[0] ?? null
}

async function identify(fragment: string, key: string) {
  const params = new URLSearchParams({ q_lyrics: fragment, page_size: '5', page: '1', s_track_rating: 'desc', apikey: key })
  const payload = await readJson(`${MUSIXMATCH_BASE}/track.search?${params}`)
  const status = payload?.message?.header?.status_code
  if (status && status !== 200) throw new Error(status === 401 ? 'The Musixmatch API key was rejected.' : `Musixmatch returned ${status}.`)
  for (const item of payload?.message?.body?.track_list ?? []) {
    const result = item?.track && await exactLyrics(item.track)
    if (result) return result
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  try {
    if (action === 'search') {
      const query = (url.searchParams.get('q') || '').trim()
      if (query.length < 2) return json({ error: 'Enter a song title or artist.' }, 400)
      return json({ data: await lrclibSearch(query) })
    }
    if (action === 'identify') {
      const fragment = (url.searchParams.get('q') || '').trim().slice(-240)
      if (fragment.split(/\s+/).length < 4) return json({ error: 'A few more words are needed before searching.' }, 400)
      const key = req.headers.get('x-musixmatch-key') || Deno.env.get('MUSIXMATCH_API_KEY')
      if (!key) return json({ error: 'Song identification needs a Musixmatch API key. Add MUSIXMATCH_API_KEY on the server or enter one in the tool settings.' }, 400)
      return json({ data: await identify(fragment, key) })
    }
    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Song lookup failed.' }, 502)
  }
})
