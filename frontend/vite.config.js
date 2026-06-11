import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        globIgnores: ['**/logo.png', '**/logo2.png'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /socket\.io/],
        runtimeCaching: [
          {
            urlPattern: /\/version\.json/,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'CallsFlow',
        short_name: 'CallsFlow',
        description: 'Inbound lead platform for insurance agents',
        theme_color: '#0e0e0e',
        background_color: '#0e0e0e',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
