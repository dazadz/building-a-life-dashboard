/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The backend runs with `samuel serve` on port 8765.
    proxy: { '/api': 'http://127.0.0.1:8765' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // A zone well ahead of UTC, so code that slips into UTC dates fails the tests.
    env: { TZ: 'Pacific/Auckland' },
  },
})
