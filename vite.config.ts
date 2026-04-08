import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        headers: { Origin: 'http://127.0.0.1:8188' },
      },
      '/ws': {
        target: 'ws://127.0.0.1:8188',
        ws: true,
      },
    },
  },
})
