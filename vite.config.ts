import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

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
  ],
}));
