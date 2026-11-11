import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initCursorGlow } from './lib/cursor-glow'

initCursorGlow()
// Installed tool apps launch at /?app=<id> (manifest start_url); route them into the tool.
const app = new URLSearchParams(location.search).get('app')
if (app && /^[\w-]+$/.test(app) && (!location.hash || location.hash === '#/')) history.replaceState(null, '', `/#/tools/${app}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
