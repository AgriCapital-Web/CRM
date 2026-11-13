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
void registerAppServiceWorker();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </HelmetProvider>
);