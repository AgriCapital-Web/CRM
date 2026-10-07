const PREVIEW_HOSTS = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];

function registrationAllowed() {
  const host = window.location.hostname;
  const previewHost =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    PREVIEW_HOSTS.some((root) => host === root || host.endsWith("." + root));

  return (
    import.meta.env.PROD &&
    window.top === window.self &&
    !previewHost &&
    new URLSearchParams(location.search).get("sw") !== "off"
  );
}

async function unregisterAppWorkers() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => registration.active?.scriptURL.endsWith("/sw.js"))
      .map((registration) => registration.unregister())
  );
}

export async function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  if (!registrationAllowed()) {
    await unregisterAppWorkers();
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    // Keep updates silent: activate a waiting worker without forcing a reload.
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    const checkForUpdate = () =>
      registration.update().catch(() => {
        // A temporary network failure must never break the CRM.
      });

    void checkForUpdate();
    setInterval(() => void checkForUpdate(), 15 * 60 * 1000);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void checkForUpdate();
      }
    });
  } catch {
    // Service worker support must remain non-blocking for the CRM.
  }
}
