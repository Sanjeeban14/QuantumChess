import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Relative base so the built app works from any path: a GitHub Pages
  // project subpath (e.g. /qc-game/), a root domain (Vercel), or local preview.
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  // Strip verbose console calls from production builds (keep warn/error)
  esbuild: {
    pure: ['console.log', 'console.info', 'console.debug'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
}))
