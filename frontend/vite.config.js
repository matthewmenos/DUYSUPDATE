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
    // Vercel's project Root Directory is either the repo root `/` or
    // `frontend/` depending on how the project was imported. To be robust to
    // both, Vite builds into its default `frontend/dist`, and the buildCommand
    // in vercel.json additionally copies it to the repo-root `dist/` so that
    // `outputDirectory: "dist"` resolves correctly no matter which root Vercel
    // actually uses.
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
});
