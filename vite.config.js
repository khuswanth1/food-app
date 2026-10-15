import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.VITE_PROXY_TARGET || 'http://localhost:8000';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // In dev, WebSockets go straight to the API instead of through Vite's proxy, which logs a noisy
  // "ws proxy socket error" every time a tab closes or the API reloads. Production builds keep
  // same-origin /ws (nginx proxies it). An explicit VITE_WS_URL always wins.
  define: command === 'serve' && !process.env.VITE_WS_URL
    ? { 'import.meta.env.VITE_WS_URL': JSON.stringify(target.replace(/^http/, 'ws')) }
    : {},
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          maps: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },
}));
