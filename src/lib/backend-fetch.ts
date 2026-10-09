import { functionsBase, supabase } from './supabase'

/** Attach the current user token only to our backend, never to external APIs. */
export async function backendFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input)
  if (url.startsWith(`${functionsBase}/`)) {
    const { data: { session } } = await supabase.auth.getSession()
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    if (session) headers.set('Authorization', `Bearer ${session.access_token}`)
    return globalThis.fetch(input, { ...init, headers })
  }
  return globalThis.fetch(input, init)
}
