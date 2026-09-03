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
    // Production deploys use the single Vercel project at the repo root:
    // vercel.json runs `npm run build:frontend` and serves `frontend/dist`
    // as the static output alongside the serverless backend (/api/*).
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
});
