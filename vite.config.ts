import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 读取当前应用版本号。
 */
function readAppVersion() {
  const packageJsonText = readFileSync(new URL('./package.json', import.meta.url), 'utf8')
  const packageJson = JSON.parse(packageJsonText) as { version?: string }
  return packageJson.version ?? '0.0.0'
}

const appVersion = readAppVersion()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
