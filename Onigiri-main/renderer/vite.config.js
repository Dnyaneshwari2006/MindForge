import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const BACKEND = 'http://127.0.0.1:39871'; // explicit IPv4 — avoids ECONNREFUSED on Node 18+

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Load .env from the project root (one level up from renderer/)
  envDir: path.resolve(__dirname, '..'),
  server: {
    host: true,          // listen on 0.0.0.0 → accessible from LAN / mobile
    port: process.env.PORT ? parseInt(process.env.PORT) : 5174,
    strictPort: true,
    // Only set up proxy in development mode (when backend may be running)
    ...(mode !== 'production' ? {
      proxy: {
        '/api': {
          target: BACKEND,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/ws': {
          target: 'ws://127.0.0.1:39871',
          ws: true,
        },
      },
    } : {}),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
}))
