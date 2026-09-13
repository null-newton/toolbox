export function isSidebarHidden(search: string): boolean {
  return new URLSearchParams(search).get('sidebar') === 'hidden'
}

export function loginUrl(location: { pathname: string; search: string; hash: string }): string {
  const returnTo = location.pathname + location.search + location.hash
  return `/login?${new URLSearchParams({ returnTo })}`
}

export function loginDestination(search: string): string {
  const returnTo = new URLSearchParams(search).get('returnTo')
  // Only return to app pages, never an external URL or back to login.
  if (!returnTo || returnTo.includes('\\')) return '/'
  return /^\/(?:$|[?#]|(?:tools|transfer)\/[^/?#]+(?:[?#]|$))/.test(returnTo)
    ? returnTo
    : '/'
}
