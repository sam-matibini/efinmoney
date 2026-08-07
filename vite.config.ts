import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// Committed public backend defaults so builds outside Lovable (e.g. Vercel, where
// .env is gitignored and never reaches the repo) still target the correct project.
// These are publishable values — the anon key is protected by Row Level Security.
const FALLBACK_SUPABASE_PROJECT_ID = "hgmskcvaeadnyovbroup";
const FALLBACK_SUPABASE_URL = "https://hgmskcvaeadnyovbroup.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbXNrY3ZhZWFkbnlvdmJyb3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MTYwNDAsImV4cCI6MjA4MzQ5MjA0MH0.RLEn7EDysi6kgT9t_dOm92uwC5BeAU495wrDtvHypyM";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY;
  const supabaseProjectId = env.VITE_SUPABASE_PROJECT_ID || FALLBACK_SUPABASE_PROJECT_ID;

  return {
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
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabaseKey),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
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
  };
});
