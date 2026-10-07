import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import { AppErrorBoundary } from "./components/common/AppErrorBoundary";
import "./index.css";
import { registerAppServiceWorker } from "./lib/registerAppServiceWorker";

void registerAppServiceWorker();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </HelmetProvider>
);