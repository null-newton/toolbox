import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initCursorGlow } from './lib/cursor-glow'

initCursorGlow()
// Installed tool apps launch at /?app=<id>&<options>; route them into the tool with those options.
const qs = new URLSearchParams(location.search), app = qs.get('app'); qs.delete('app')
if (app && /^[\w-]+$/.test(app) && (!location.hash || location.hash === '#/')) history.replaceState(null, '', `/#/tools/${app}${`${qs}` ? `?${qs}` : ''}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
