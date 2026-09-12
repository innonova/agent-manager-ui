import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// Every build gets an id, baked into the bundle and written next to it as
// build.json, so a running page can tell when the manager serves a newer
// build (deploys restart the manager; the page then offers a reload).
const BUILD_ID = new Date().toISOString()
function buildId(): Plugin {
  const body = JSON.stringify({ id: BUILD_ID })
  return {
    name: 'build-id',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build.json', source: body })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/build.json') return next()
        res.setHeader('content-type', 'application/json')
        res.end(body)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [vue(), vueDevTools(), tailwindcss(), buildId()],
  server: {
    proxy: {
      // The manager owns /api; in development it runs separately.
      '/api': { target: process.env.AGENT_MANAGER_URL ?? 'http://127.0.0.1:4268', changeOrigin: false, ws: true },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
