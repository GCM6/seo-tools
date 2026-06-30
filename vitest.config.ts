import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // No test files yet (scaffold task); don't fail the script until later tasks add tests.
    passWithNoTests: true,
  },
  resolve: {
    alias: { '@': new URL('.', import.meta.url).pathname },
  },
})
