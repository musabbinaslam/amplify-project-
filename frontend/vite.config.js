import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Baked into the JS bundle at build time — compared against /api/public/release.
const appBuildId = process.env.VERCEL_GIT_COMMIT_SHA || 'dev'

// Only upload source maps when an auth token is available (CI/Vercel build env),
// so local/dev builds without the token don't fail.
const enableSentryPlugin = Boolean(process.env.SENTRY_AUTH_TOKEN)

function apiProxyTarget(env) {
  const raw = String(env.VITE_API_URL || 'http://127.0.0.1:3002').trim().replace(/\/$/, '')
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`)
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1'
    return url.origin
  } catch {
    return 'http://127.0.0.1:3002'
  }
}

function rewriteOriginToLocalhost(proxy) {
  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.setHeader('origin', 'http://localhost:5173')
  })
  proxy.on('proxyReqWs', (proxyReq) => {
    proxyReq.setHeader('origin', 'http://localhost:5173')
  })
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = apiProxyTarget(env)

  return {
    define: {
      'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(appBuildId),
    },
    server: {
      host: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
          configure: rewriteOriginToLocalhost,
        },
        '/socket.io': {
          target: backend,
          changeOrigin: true,
          ws: true,
          configure: rewriteOriginToLocalhost,
        },
      },
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'firebase-core': ['firebase/app'],
            'firebase-auth': ['firebase/auth'],
            'firebase-analytics': ['firebase/analytics'],
            'sentry': ['@sentry/react'],
            'recharts': ['recharts'],
            'socket': ['socket.io-client'],
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
    plugins: [
      react(),
      ...(enableSentryPlugin
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              authToken: process.env.SENTRY_AUTH_TOKEN,
              release: { name: appBuildId },
              sourcemaps: { filesToDeleteAfterUpload: ['**/*.map'] },
            }),
          ]
        : []),
    ],
  }
})
