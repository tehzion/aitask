import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    watch: {
      usePolling: true,
    },
  },
  build: {
    // Never emit source maps in production — they expose internal logic & file paths
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — changes rarely, long cache life
          vendor: ['react', 'react-dom'],
          // Router — separate so navigation code doesn't bust the app chunk
          router: ['react-router-dom'],
          // Recharts is the heaviest single dependency (~400 kB minified)
          charts: ['recharts'],
          // Icon library — large registry, isolate from business logic
          icons: ['lucide-react'],
        },
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          // Only load the dev-locator in development; never ship it to production
          ...(mode === 'development' ? ['react-dev-locator'] : []),
        ],
      },
    }),
    tsconfigPaths(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'AiTask - Marketing Agency Task Management',
        short_name: 'AiTask',
        description: 'Marketing agency task, project, calendar, and approval management.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#2563eb',
        background_color: '#f6f7f9',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
        navigateFallback: '/index.html',
        runtimeCaching: [],
      },
    }),
  ],
}));
