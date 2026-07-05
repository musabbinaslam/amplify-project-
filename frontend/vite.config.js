import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Baked into the JS bundle at build time — compared against /api/public/release.
const appBuildId = process.env.VERCEL_GIT_COMMIT_SHA || 'dev'

// Only upload source maps when an auth token is available (CI/Vercel build env),
// so local/dev builds without the token don't fail.
const enableSentryPlugin = Boolean(process.env.SENTRY_AUTH_TOKEN)

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(appBuildId),
  },
  build: {
    sourcemap: true,
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
})
