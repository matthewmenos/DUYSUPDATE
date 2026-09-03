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
    // Vercel's project Root Directory is `backend/`, so the SPA must be built
    // into `backend/dist` for Vercel to serve it (outputDirectory = "dist").
    outDir: '../backend/dist',
    emptyOutDir: true,
    sourcemap: true
  }
});
