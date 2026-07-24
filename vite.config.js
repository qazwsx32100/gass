import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vite.dev/config/
export default defineConfig(() => {
  const canUploadSourceMaps = Boolean(
    process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT
  )

  return {
    plugins: [
      react(),
      canUploadSourceMaps && sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        telemetry: false,
        sourcemaps: {
          filesToDeleteAfterUpload: './dist/**/*.map'
        }
      })
    ].filter(Boolean),
    build: {
      sourcemap: canUploadSourceMaps ? 'hidden' : false
    }
  }
})
