import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  build: {
    // Vercel's root directory is the repo root `/` and its effective Output
    // Directory is `dist` (its Vite/Other preset default). Build into the
    // repo-root `dist/` so Vercel finds the static output without needing any
    // dashboard setting. `emptyOutDir` is required because outDir sits outside
    // the Vite project root.
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true
  }
});
