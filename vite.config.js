import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Helix IPTV',
        short_name: 'Helix',
        description: 'Modern IPTV Streaming Application',
        theme_color: '#0f0f14',
        background_color: '#0f0f14',
        display: 'standalone',
        icons: [
          {
            src: 'https://via.placeholder.com/192x192?text=H',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://via.placeholder.com/512x512?text=H',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  optimizeDeps: {
    include: ['react-window', 'react-virtualized-auto-sizer']
  }
})
