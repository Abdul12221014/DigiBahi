import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
    allowedHosts: [
      'localhost',
      '.local',
      '.ngrok-free.dev',
      '.ngrok.io',
      '.ngrok.app',
    ],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Inject service worker registration into entry HTML automatically
      injectRegister: 'auto',
      // Always generate the SW even in dev (makes offline testing easier)
      devOptions: { enabled: false },
      workbox: {
        // Cache the app shell (JS, CSS, HTML, fonts, icons)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Network-first for API calls so fresh data is preferred when online,
        // but the app doesn't break when offline (falls through to Dexie)
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 },
            },
          },
        ],
        // Don't cache these — they change often or are sensitive
        navigateFallbackDenylist: [/^\/api\//],
        // Precache limit: skip large PDFs / model files
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'DigitalMuneem - Professional Accounting',
        short_name: 'DigitalMuneem',
        description: 'Tablet-based accounting for Indian SMEs with pen input and GST compliance',
        start_url: '/',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#f5f3ed',
        theme_color: '#2d7a4a',
        lang: 'en-IN',
        dir: 'ltr',
        categories: ['business', 'finance', 'productivity'],
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  assetsInclude: ["**/*.md"],
}));
