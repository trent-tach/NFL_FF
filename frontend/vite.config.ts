import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from "node:url";    // Node built-in; this file runs in Node, not the browser

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
            // lets you write "@/features/home" instead of "../../features/home"
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
