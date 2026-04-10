import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    // Debug API plugin — injects a script that exposes state via /debug endpoints
    {
      name: 'debug-api',
      configureServer(server) {
        server.middlewares.use('/debug', (req, res) => {
          // This serves a page that communicates with the main app via BroadcastChannel
          // The actual data comes from the browser (main.tsx __debug)
          res.setHeader('Content-Type', 'text/html');
          res.end(`
            <html><body>
            <h3>FlowStudio Debug</h3>
            <p>Use curl or browser console in the main app:</p>
            <pre>window.__debug.getState()</pre>
            <p>Or open main app and run debug commands there.</p>
            </body></html>
          `);
        });
      },
    },
  ],
  server: {
    port: 3001,
    host: '0.0.0.0',
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
      '/tiktok-api': {
        target: 'https://open.tiktokapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiktok-api/, ''),
      },
      '/tiktok-upload': {
        target: 'https://open-upload-i18n.tiktokapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiktok-upload/, ''),
      },
    },
  },
})
