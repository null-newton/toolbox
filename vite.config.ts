import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
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
