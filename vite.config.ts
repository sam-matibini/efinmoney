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
          if (id.includes("@remotion") || id.includes("remotion")) return "remotion";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@adyen")) return "adyen";
          if (id.includes("@stripe") || id.includes("stripe-js")) return "stripe";
          if (id.includes("d3-") || id.includes("/d3/")) return "d3";
          if (id.includes("framer-motion")) return "framer-motion";
          if (id.includes("recharts")) return "recharts";
          if (id.includes("@sentry")) return "sentry";
          if (id.includes("posthog")) return "analytics";
          if (id.includes("jspdf") || id.includes("xlsx")) return "export";
          if (
            id.includes("react") ||
            id.includes("react-dom") ||
            id.includes("react-router") ||
            id.includes("@tanstack/react-query")
          ) {
            return "vendor";
          }
        },
      },
    },
  },
}));
