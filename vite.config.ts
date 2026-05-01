import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // LAN: telefoon op hetzelfde WiFi gebruikt http://<pc-ip>:5173 — `localhost` op de telefoon wijst naar het toestel zelf.
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
  },
  preview: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/@supabase')) {
            return 'supabase'
          }
        },
      },
    },
  },
})
