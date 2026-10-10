import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import Index from "./pages/Index";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Plantations from "./pages/Plantations";
import PlantationDetail from "./pages/PlantationDetail";
import GestionPaiements from "./pages/GestionPaiements";
import Finance from "./pages/Finance";
import Commissions from "./pages/Commissions";
import Portefeuilles from "./pages/Portefeuilles";
import NouvelleAcquisition from "./pages/NouvelleAcquisition";
import Parametres from "./pages/Parametres";
import Profil from "./pages/Profil";
import HistoriqueComplet from "./pages/HistoriqueComplet";
import AccountRequest from "./pages/AccountRequest";
import Tickets from "./pages/Tickets";
import ProprietairesTerres from "./pages/ProprietairesTerres";
import ProprietaireTerreDetail from "./pages/ProprietaireTerreDetail";
import Parcelles from "./pages/Parcelles";
import Documents from "./pages/Documents";
import Leads from "./pages/Leads";
import SyncQueue from "./pages/SyncQueue";
import PublicLead from "./pages/PublicLead";
import VerificationCarte from "./pages/VerificationCarte";
import BeneficiaireParticulier from "./pages/BeneficiaireParticulier";
import TechnicienTerrain from "./pages/TechnicienTerrain";
import Messagerie from "./pages/Messagerie";

import NotFound from "./pages/NotFound";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { cleanupLegacyStorage } from "@/lib/storageMaintenance";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

const DomainRouter = () => {
  return (
    <Routes>
      {/* Page d'accueil = Login */}
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/account-request" element={<AccountRequest />} />

      {/* Formulaire public prospects */}
      <Route path="/leads/public" element={<PublicLead />} />

      {/* Vérification publique d'une carte du personnel (QR code) */}
      {/* Unique parcours public de scan/vérification : app.agricapital.ci/verify */}
      <Route path="/verify" element={<VerificationCarte />} />
      <Route path="/verify/:code" element={<VerificationCarte />} />

      {/* Routes privées : chaque route porte explicitement sa permission métier. */}
      <Route path="/dashboard" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_DASHBOARD}><Dashboard /></ProtectedRoute>} />
      <Route path="/leads" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_LEADS}><Leads /></ProtectedRoute>} />
      <Route path="/synchronisation" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_DASHBOARD}><SyncQueue /></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><Clients /></ProtectedRoute>} />
      <Route path="/clients/new" element={<ProtectedRoute requiredPermission={PERMISSIONS.CREATE_ACQUISITION}><NouvelleAcquisition /></ProtectedRoute>} />
      <Route path="/client/:id" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><ClientDetail /></ProtectedRoute>} />
      <Route path="/client/:id/historique" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><HistoriqueComplet /></ProtectedRoute>} />
      <Route path="/plantations" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PLANTATIONS}><Plantations /></ProtectedRoute>} />
      <Route path="/plantations/:id" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PLANTATIONS}><PlantationDetail /></ProtectedRoute>} />
      <Route path="/proprietaires-terres" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PROPRIETAIRES}><ProprietairesTerres /></ProtectedRoute>} />
      <Route path="/proprietaires-terres/:id" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PROPRIETAIRES}><ProprietaireTerreDetail /></ProtectedRoute>} />
      <Route path="/parcelles" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PARCELLES}><Parcelles /></ProtectedRoute>} />
      <Route path="/documents" element={<ProtectedRoute requiredPermission="documents.view"><Documents /></ProtectedRoute>} />
      <Route path="/acquisitions" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><Clients /></ProtectedRoute>} />
      <Route path="/acquisitions/nouveau" element={<ProtectedRoute requiredPermission={PERMISSIONS.CREATE_ACQUISITION}><NouvelleAcquisition /></ProtectedRoute>} />
      <Route path="/nouvelle-acquisition" element={<ProtectedRoute requiredPermission={PERMISSIONS.CREATE_ACQUISITION}><NouvelleAcquisition /></ProtectedRoute>} />
      <Route path="/acquisitions/:id" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><ClientDetail /></ProtectedRoute>} />
            <Route path="/beneficiaire-particulier" element={<ProtectedRoute requiredPermission={PERMISSIONS.CREATE_BENEFICIAIRE}><BeneficiaireParticulier /></ProtectedRoute>} />
      <Route path="/messagerie" element={<ProtectedRoute requiredPermission={"messagerie.view" as any}><Messagerie /></ProtectedRoute>} />
      <Route path="/profil" element={<Profil />} />
      
      {/* Paiements */}
      <Route path="/paiements" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PAIEMENTS}><GestionPaiements /></ProtectedRoute>} />
            
      {/* Redirections vers Paramètres */}
                                    
            
      {/* Rapports */}
      <Route path="/finance" element={<ProtectedRoute requiredPermission="finance.view"><Finance /></ProtectedRoute>} />
      <Route path="/terrain" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_RAPPORTS_TECHNIQUES}><TechnicienTerrain /></ProtectedRoute>} />
      
      {/* Finances */}
      <Route path="/commissions" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_COMMISSIONS}><Commissions /></ProtectedRoute>} />
      <Route path="/portefeuilles" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PORTEFEUILLES}><Portefeuilles /></ProtectedRoute>} />
      
      {/* Support */}
      <Route path="/support" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_TICKETS}><Tickets /></ProtectedRoute>} />
                    
      {/* Admin */}
      <Route path="/parametres" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PARAMETRES}><Parametres /></ProtectedRoute>} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

let legacyStorageCleanupCompleted = false;

const LegacyStorageMaintenance = () => {
  const { user } = useAuth();
  const { isPdg, isDg, loading } = usePermissions();

  useEffect(() => {
    if (loading || !user || (!isPdg && !isDg) || legacyStorageCleanupCompleted) return;
    void cleanupLegacyStorage()
      .then(() => { legacyStorageCleanupCompleted = true; })
      .catch(() => {});
  }, [loading, user, isPdg, isDg]);

  return null;
};


const SpaNavigationGuard = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const onSubmit = (event: Event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.dataset.nativeSubmit !== "true") {
        event.preventDefault();
      }
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const pathAnchor = event.composedPath().find((node) => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
      const target = event.target as Element | null;
      const anchor = pathAnchor || target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.dataset.nativeNavigation === "true") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search && url.hash === window.location.hash)) return;
      if (/\.(?:pdf|jpg|jpeg|png|gif|webp|mp4|webm|csv|xlsx?|docx?|pptx?)$/i.test(url.pathname)) return;
      event.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    };

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [navigate]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SpaNavigationGuard />
          <InstallPrompt />
          <LegacyStorageMaintenance />
          <DomainRouter />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
