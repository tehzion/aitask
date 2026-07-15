import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from 'vite-plugin-pwa';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

const readGitValue = (args: string[]) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const fullCommit = process.env.VERCEL_GIT_COMMIT_SHA || readGitValue(['rev-parse', 'HEAD']);
const shortCommit = fullCommit.slice(0, 7) || 'local';
const hasLocalChanges = !process.env.VERCEL && Boolean(readGitValue(['status', '--porcelain']));

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_COMMIT__: JSON.stringify(shortCommit),
    __APP_BUILD_ID__: JSON.stringify(`${packageJson.version}+${shortCommit}${hasLocalChanges ? '.dev' : ''}`),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __APP_BUILD_CHANNEL__: JSON.stringify(process.env.VERCEL_ENV || mode),
  },
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
          // Router — separate so navigation code doesn't bust the app chunk
          router: ['react-router-dom'],
          // Recharts is the heaviest single dependency (~400 kB minified)
          charts: ['recharts'],
          // Icon library — large registry, isolate from business logic
          icons: ['lucide-react'],
          // Auth/data client is loaded on demand and should not inflate the offline shell.
          supabase: ['@supabase/supabase-js'],
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
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png}'],
        globIgnores: [
          '**/Dashboard-*.js',
          '**/Tasks-*.js',
          '**/Calendar-*.js',
          '**/Clients-*.js',
          '**/Projects-*.js',
          '**/Reports-*.js',
          '**/Approvals-*.js',
          '**/Settings-*.js',
          '**/charts-*.js',
          '**/supabase-*.js',
        ],
      },
    }),
  ],
}));
