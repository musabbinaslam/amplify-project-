import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Baked into the JS bundle at build time — compared against /api/public/release.
const appBuildId = process.env.VERCEL_GIT_COMMIT_SHA || 'dev'

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(appBuildId),
  },
  plugins: [react()],
})
