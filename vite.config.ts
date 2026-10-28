import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// public/weekplanner.html is copied verbatim and served without
// cache-busting hashes; stamp a unique build id into it so the page can detect
// that a newer version was deployed and reload itself.
function stampStandaloneBuildId(): Plugin {
  let outDir = 'dist'
  return {
    name: 'stamp-standalone-build-id',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    closeBundle() {
      const file = resolve(outDir, 'weekplanner.html')
      const buildId = process.env.GITHUB_SHA?.slice(0, 12) || Date.now().toString(36)
      writeFileSync(file, readFileSync(file, 'utf8').replace('content="__BUILD_ID__"', `content="${buildId}"`))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), stampStandaloneBuildId()],
    // Served from the root of the custom subdomain (toolbox.zacsvae.com), so
    // assets live at '/'. (Was '/toolbox/' when hosted under zacsvae.com/toolbox.)
    base: '/',
    // Local dev only: proxy backend "functions" calls so the browser talks to
    // the Vite origin and never depends on the backend's CORS allow-list.
    server: {
      proxy: {
        '/functions': {
          target: env.VITE_DEV_BACKEND || 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
  }
})
