import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // MapLibre's worker is an ES module.
    worker: { format: 'es' },
    build: {
      // maplibre-gl alone is ~1.1 MB minified (~300 kB gzipped) and cannot be
      // split further; it is lazy-loaded. Application chunks stay well below.
      chunkSizeWarningLimit: 1200,
    },
    server: {
      port: 5173,
      // Proxying /api keeps the browser on a single origin in development,
      // so CORS never gets in the way.
      proxy: { '/api': env.VITE_API_PROXY_TARGET || 'http://localhost:8080' },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      restoreMocks: true,
      unstubGlobals: true,
    },
  }
})
