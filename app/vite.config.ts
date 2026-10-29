import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps the build portable: it can be served from any sub-path or opened from a static host.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: { echarts: ["echarts"], react: ["react", "react-dom", "react-router-dom"] } },
    },
  },
});
