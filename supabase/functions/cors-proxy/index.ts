import { withAppAccess } from '../_shared/app-access.ts'
// CORS proxy for the Shortest Route utility's shared-list import.
//
// Browsers can't fetch google.com / apple.com pages directly (no CORS
// headers), and public proxies like allorigins are unreliable. This function
// fetches a whitelisted set of map hosts server-side and returns the body
// with permissive CORS headers.
//
// Deploy with: npx supabase functions deploy cors-proxy

const ALLOWED_HOSTS = new Set([
  'www.google.com',
  'google.com',
  'maps.app.goo.gl',
  'maps.apple.com',
  'guides.apple.com',
])

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

Deno.serve(withAppAccess('route-optimizer', CORS_HEADERS, async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const target = new URL(req.url).searchParams.get('url')
  let parsed: URL
  try {
    parsed = new URL(target ?? '')
  } catch {
    return new Response('Missing or invalid ?url= parameter', { status: 400, headers: CORS_HEADERS })
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return new Response(`Host not allowed: ${parsed.hostname}`, { status: 403, headers: CORS_HEADERS })
  }

  const upstream = await fetch(parsed, {
    headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en' },
    redirect: 'follow',
  })
  const body = await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
  })
}))
