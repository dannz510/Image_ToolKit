import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * No path aliases: every source module imports relatively, so the config stays
 * dependency-free (no @types/node needed for the typecheck).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    // Local Python API (`npm run api`) so /api behaves identically in dev and prod.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
    // `npm run preview` serves the production build but can still talk to
    // the local Python API for a full-fidelity smoke test.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          fabric: ['fabric'],
        },
      },
    },
  },
})