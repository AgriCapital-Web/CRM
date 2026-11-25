const PREVIEW_HOSTS = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];
const BUILD_VERSION = "2026.11.25.1";
const ACCEPTED_VERSION_KEY = "agricapital-crm-update-accepted";

function registrationAllowed() {
  const host = window.location.hostname;
  const previewHost = host.startsWith("id-preview--") || host.startsWith("preview--") ||
    PREVIEW_HOSTS.some((root) => host === root || host.endsWith("." + root));
  return import.meta.env.PROD && window.top === window.self && !previewHost &&
    new URLSearchParams(location.search).get("sw") !== "off";
}

async function unregisterAppWorkers() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.filter((registration) =>
    registration.active?.scriptURL.endsWith("/sw.js")
  ).map((registration) => registration.unregister()));
}

function isInstalledPwa() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

function requestMandatoryUpdate(registration?: ServiceWorkerRegistration) {
  window.dispatchEvent(new CustomEvent("agri:pwa-update-required", {
    detail: { registration, version: BUILD_VERSION },
  }));
}

export async function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!registrationAllowed()) {
    await unregisterAppWorkers();
    return;
  }

  try {
    const hadController = Boolean(navigator.serviceWorker.controller);
    const accepted = window.localStorage.getItem(ACCEPTED_VERSION_KEY);
    if (!hadController) window.localStorage.setItem(ACCEPTED_VERSION_KEY, BUILD_VERSION);
    else if (isInstalledPwa() && accepted !== BUILD_VERSION) requestMandatoryUpdate(undefined);

    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/", updateViaCache: "none",
    });

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading || window.localStorage.getItem(ACCEPTED_VERSION_KEY) !== BUILD_VERSION) return;
      reloading = true;
      window.location.reload();
    });

    const notifyWaiting = () => {
      if (isInstalledPwa() && registration.waiting && navigator.serviceWorker.controller) requestMandatoryUpdate(registration);
    };
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (isInstalledPwa() && installing.state === "installed" && navigator.serviceWorker.controller) requestMandatoryUpdate(registration);
      });
    });
    notifyWaiting();

    const check = () => registration.update().then(notifyWaiting).catch(() => undefined);
    void check();
    window.addEventListener("online", () => void check());
    window.addEventListener("pageshow", () => void check());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void check();
    });
    window.setInterval(() => void check(), 15 * 60 * 1000);
  } catch {
    // Les erreurs temporaires de service worker ne bloquent pas le CRM.
  }
}

export function acceptMandatoryPwaUpdate(registration?: ServiceWorkerRegistration) {
  window.localStorage.setItem(ACCEPTED_VERSION_KEY, BUILD_VERSION);
  if (registration?.waiting) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  window.location.reload();
}
