const LRCLIB_BASE = 'https://lrclib.net/api'
const CLIENT_ID = 'Toolbox Live Lyrics/1.0 (https://toolbox.zacsvae.com)'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  try {
    if (action === 'recognize') {
      return json({ error: 'Audio fingerprinting is available only on the self-hosted Toolbox backend.' }, 501)
    }
    if (action === 'search') {
      const query = (url.searchParams.get('q') || '').trim()
      if (query.length < 2) return json({ error: 'Enter a song title or artist.' }, 400)
      return json({ data: await lrclibSearch(query) })
    }
    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Song lookup failed.' }, 502)
  }
})
