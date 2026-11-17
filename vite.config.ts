import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // En GitHub Pages la app vive en /<repo>/; el workflow define VITE_BASE.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Taxonomía y contratos compartidos con el backend (Edge Function).
      "@shared": fileURLToPath(new URL("./supabase/functions/api", import.meta.url)),
    },
  },
  server: { host: true, port: 5173 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
