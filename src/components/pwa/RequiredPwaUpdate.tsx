import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { acceptMandatoryPwaUpdate } from "@/lib/registerAppServiceWorker";

type UpdateDetail = { registration?: ServiceWorkerRegistration; version?: string };

export default function RequiredPwaUpdate() {
  const [detail, setDetail] = useState<UpdateDetail | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const show = (event: Event) => setDetail((event as CustomEvent<UpdateDetail>).detail || {});
    window.addEventListener("agri:pwa-update-required", show);
    return () => window.removeEventListener("agri:pwa-update-required", show);
  }, []);

  if (!detail) return null;
  const apply = () => {
    setInstalling(true);
    acceptMandatoryPwaUpdate(detail.registration);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4" role="alertdialog" aria-modal="true" aria-labelledby="pwa-update-title">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></div>
        <h2 id="pwa-update-title" className="text-xl font-bold">Mise à jour obligatoire</h2>
        <p className="mt-2 text-sm text-muted-foreground">Une nouvelle version d’AgriCapital 360 est disponible. Installez-la pour continuer à utiliser le CRM avec la version à jour.</p>
        <Button className="mt-5 w-full" onClick={apply} disabled={installing}>
          <RefreshCw className={installing ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
          {installing ? "Installation en cours…" : "Installer la mise à jour"}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">Cette demande ne réapparaîtra pas après confirmation de l’installation.</p>
      </div>
    </div>
  );
}
