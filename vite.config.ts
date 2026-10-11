import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild" as const,
    rollupOptions: {
      output: {
        // Cache-busting: content hash in filenames
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        manualChunks(id) {
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/react-router-dom/")
          ) return "vendor";
          if (id.includes("/node_modules/@supabase/supabase-js/")) return "supabase";
          if (
            id.includes("/node_modules/@radix-ui/react-dialog/") ||
            id.includes("/node_modules/@radix-ui/react-select/") ||
            id.includes("/node_modules/@radix-ui/react-tabs/")
          ) return "ui";
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
}));
