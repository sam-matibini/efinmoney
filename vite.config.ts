import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Only split libs that are lazy-loaded and do not share React init order with the app shell.
          // Separate chunks for stripe/recharts/d3/sentry/etc. caused TDZ ReferenceErrors on Vercel prod.
          if (id.includes("@remotion") || id.includes("remotion")) return "remotion";
          if (id.includes("jspdf") || id.includes("xlsx")) return "export";
        },
      },
    },
  },
}));
