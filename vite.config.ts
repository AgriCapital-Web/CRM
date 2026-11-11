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
    // Manifest utilisé par le service worker pour précharger aussi les chunks lazy.
    manifest: "asset-manifest.json",
    sourcemap: false,
    minify: "esbuild" as const,
    rollupOptions: {
      output: {
        // Cache-busting: content hash in filenames.
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        // Laisser Vite/Rolldown répartir les dépendances automatiquement.
        // Le découpage manuel de React/React Router/Radix peut créer des
        // dépendances circulaires entre chunks et casser l'initialisation.
      },
    },
    chunkSizeWarningLimit: 1000,
  },
}));
