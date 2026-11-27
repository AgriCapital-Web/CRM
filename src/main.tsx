import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import { AppErrorBoundary } from "./components/common/AppErrorBoundary";
import "./index.css";
import { registerAppServiceWorker } from "./lib/registerAppServiceWorker";
import { toast as sonnerToast } from "sonner";
import { toUserText } from "./lib/userMessage";
import { installGlobalTextNormalization } from "./lib/utils";
for (const k of ["error", "warning", "info", "success", "message"] as const) {
  const orig = (sonnerToast as any)[k];
  (sonnerToast as any)[k] = (msg: unknown, opts?: any) =>
    orig(toUserText(msg), opts ? { ...opts, description: toUserText(opts.description) } : opts);
}

installGlobalTextNormalization();

// Une page restée ouverte pendant un déploiement peut encore demander un ancien
// chunk Vite supprimé. Recharger une seule fois permet de récupérer le manifeste courant.
const CHUNK_RELOAD_KEY = "agricapital:chunk-reload-at";
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  try {
    const previousAttempt = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (!previousAttempt || Date.now() - previousAttempt > 30_000) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
      window.location.reload();
      return;
    }
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    window.location.reload();
  }
});

void registerAppServiceWorker();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </HelmetProvider>
);