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

// Static per-tool manifests (/apps/<id>.webmanifest): iOS ignores the blob: manifest app-identity builds, so it needs a real file whose start_url opens the tool.
function toolManifests(): Plugin {
  const BG = '#071013'
  const build = (root: string) => {
    const src = readFileSync(resolve(root, 'src/utilities/index.ts'), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    return [...src.matchAll(/id: '([\w-]+)',\s*name: '([^']+)',\s*description:\s*'([^']*)'/g)].map(([, id, name, description]) => [id, JSON.stringify({ id: `/?app=${id}`, name: `${name} · Toolbox`, short_name: name, description, start_url: `/?app=${id}`, scope: '/', display: 'standalone', background_color: BG, theme_color: BG, icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }] })] as const)
  }
  let root = process.cwd()
  return {
    name: 'tool-manifests',
    configResolved(config) { root = config.root },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const id = /^\/apps\/([\w-]+)\.webmanifest$/.exec(req.url?.split('?')[0] ?? '')?.[1], m = id && build(root).find(([k]) => k === id)
        if (!m) return next()
        res.setHeader('Content-Type', 'application/manifest+json'); res.end(m[1])
      })
    },
    generateBundle() { for (const [id, source] of build(root)) this.emitFile({ type: 'asset', fileName: `apps/${id}.webmanifest`, source }) },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), stampStandaloneBuildId(), toolManifests()],
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
