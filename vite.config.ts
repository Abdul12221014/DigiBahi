import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: true, // Allow access from LAN
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
      '192.168.29.253',
      'Abduls-MacBook-Air-2.local',
      'annalisa-actinodrome-pablo.ngrok-free.dev'
    ],
  },
  plugins: [
    react(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  assetsInclude: ["**/*.md"],
}));
