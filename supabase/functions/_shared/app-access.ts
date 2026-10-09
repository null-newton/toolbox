/** Keep edge fallbacks under the same account rules as the self-hosted server. */
export function withAppAccess(appId: string, cors: Record<string, string>, handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    const respond = (error: string, status: number) => new Response(JSON.stringify({ error }), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    })
    const authorization = req.headers.get('authorization')
    if (!authorization?.startsWith('Bearer ') || authorization.length > 8192) return respond('Log in to use this app.', 401)
    const base = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_ANON_KEY')
    if (!base || !key) return respond('Account access is not configured.', 503)
    const headers = { apikey: key, Authorization: authorization, 'Content-Type': 'application/json' }
    try {
      const user = await fetch(`${base}/auth/v1/user`, { headers, signal: AbortSignal.timeout(5000) })
      if (user.status === 401 || user.status === 403) return respond('Log in again.', 401)
      if (!user.ok) return respond('Account verification unavailable.', 503)
      const identity = await user.json()
      if (!identity.id) return respond('Invalid account session.', 401)
      const permission = await fetch(`${base}/rest/v1/rpc/can_use_app`, {
        method: 'POST', headers, body: JSON.stringify({ p_app: appId }), signal: AbortSignal.timeout(5000),
      })
      if (!permission.ok) return respond('Account settings unavailable.', 503)
      if (await permission.json() !== true) return respond('Access to this app is disabled.', 403)
    } catch { return respond('Account verification unavailable.', 503) }
    return handler(req)
  }
}
