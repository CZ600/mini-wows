import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.VITE_API_TARGET || 'http://localhost:8000',
      '/ws': {
        target: process.env.VITE_WS_TARGET || 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
