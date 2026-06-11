import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Baked into the JS bundle at build time — used to detect "new deploy available"
// while this tab is still running an older build in memory.
const appBuildId = process.env.VERCEL_GIT_COMMIT_SHA || 'dev'

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(appBuildId),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        // Precache hashed assets only — NOT index.html (so F5 fetches fresh HTML from network).
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        globIgnores: ['**/logo.png', '**/logo2.png'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /socket\.io/],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 16, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
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
