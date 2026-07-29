/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Vite rejects any request whose Host header isn't localhost by default -- needed so
    // ngrok's forwarded domain (a different Host) doesn't get a 403 from the dev server itself.
    allowedHosts: true,
  },
  test: {
    environment: 'jsdom',
  },
})
