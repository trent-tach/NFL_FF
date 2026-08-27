import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The proxy forwards any request starting with /api to the FastAPI server,
// so the frontend can just call fetch("/api/...") with no CORS headaches.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
