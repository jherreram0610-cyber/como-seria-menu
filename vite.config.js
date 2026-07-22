import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Permite abrir el dev server a través de un túnel (ngrok, etc.) para
    // probar desde el celular contra el entorno local en vez de producción.
    allowedHosts: true,
    watch: {
      // Docker en Windows no propaga bien los eventos de archivo a través del bind mount;
      // sin esto, los cambios no se recargan (hay que confiar en polling en su lugar).
      usePolling: process.env.VITE_WATCH_POLLING === '1',
    },
    proxy: {
      // Solo para desarrollo local (vite dev). En Vercel /api se sirve directamente.
      '/api': process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
    },
  },
})
