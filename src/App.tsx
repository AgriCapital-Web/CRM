import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import Index from "./pages/Index";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ForcePasswordChange from "./pages/ForcePasswordChange";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ValidationDossiers from "./pages/ValidationDossiers";
import ClientDetail from "./pages/ClientDetail";
import Plantations from "./pages/Plantations";
import PlantationDetail from "./pages/PlantationDetail";
import GestionPaiements from "./pages/GestionPaiements";
import Finance from "./pages/Finance";
import PrestationsIndependantes from "./pages/PrestationsIndependantes";
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
import RelancesLeadsProspects from "./pages/RelancesLeadsProspects";
import SyncQueue from "./pages/SyncQueue";
import PublicLead from "./pages/PublicLead";
import VerificationCarte from "./pages/VerificationCarte";
import BeneficiaireParticulier from "./pages/BeneficiaireParticulier";
import TechnicienTerrain from "./pages/TechnicienTerrain";
import Messagerie from "./pages/Messagerie";
import AgriCapitalConnect from "./pages/AgriCapitalConnect";
import AgriCapitalIntelligence from "./pages/AgriCapitalIntelligence";
import ExternalMeetingGuest from "./pages/ExternalMeetingGuest";

import NotFound from "./pages/NotFound";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

const LegacyAcquisitionFallback = () => {
  const location = useLocation();
  const match = location.pathname.match(/^\/acquisition-([^/]+)\/?$/);
  if (match?.[1]) return <Navigate to={`/acquisitions/${match[1]}${location.search}`} replace />;
  return <NotFound />;
};

const DomainRouter = () => {
  return (
    <Routes>
      {/* Page d'accueil = Login */}
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/change-password-required" element={<ProtectedRoute><ForcePasswordChange /></ProtectedRoute>} />
      <Route path="/account-request" element={<AccountRequest />} />

      {/* Formulaire public prospects */}
      <Route path="/leads/public" element={<PublicLead />} />
      <Route path="/rejoindre-reunion" element={<ExternalMeetingGuest />} />

      {/* Vérification publique d'une carte du personnel (QR code) */}
      {/* Unique parcours public de scan/vérification : app.agricapital.ci/verify */}
      <Route path="/verify" element={<VerificationCarte />} />
      <Route path="/verify/:code" element={<VerificationCarte />} />

      {/* Routes privées : chaque route porte explicitement sa permission métier. */}
      <Route path="/dashboard" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_DASHBOARD}><Dashboard /></ProtectedRoute>} />
      <Route path="/leads" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_LEADS}><Leads view="all" /></ProtectedRoute>} />
      <Route path="/leads-relances" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_LEADS}><RelancesLeadsProspects /></ProtectedRoute>} />
      <Route path="/prospects" element={<Navigate to="/leads" replace />} />
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
      <Route path="/prestations-independantes" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><PrestationsIndependantes /></ProtectedRoute>} />
      <Route path="/acquisitions/nouveau" element={<ProtectedRoute requiredPermission={PERMISSIONS.CREATE_ACQUISITION}><NouvelleAcquisition /></ProtectedRoute>} />
      <Route path="/acquisitions/validation" element={<ProtectedRoute><ValidationDossiers /></ProtectedRoute>} />
      <Route path="/nouvelle-acquisition" element={<ProtectedRoute requiredPermission={PERMISSIONS.CREATE_ACQUISITION}><NouvelleAcquisition /></ProtectedRoute>} />
      
      <Route path="/acquisition/:id" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><NouvelleAcquisition /></ProtectedRoute>} />
      <Route path="/acquisitions/:id" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><NouvelleAcquisition /></ProtectedRoute>} />
            <Route path="/beneficiaire-particulier" element={<ProtectedRoute requiredPermission={PERMISSIONS.CREATE_BENEFICIAIRE}><BeneficiaireParticulier /></ProtectedRoute>} />
      <Route path="/messagerie" element={<Navigate to="/connect" replace />} />
      <Route path="/connect" element={<ProtectedRoute><AgriCapitalConnect /></ProtectedRoute>} />
      <Route path="/intelligence" element={<AgriCapitalIntelligence />} />
      <Route path="/espace-travail" element={<ProtectedRoute><Navigate to="/connect?module=documents" replace /></ProtectedRoute>} />
      <Route path="/espace-travail-360" element={<ProtectedRoute><Navigate to="/connect?module=organisation" replace /></ProtectedRoute>} />
      <Route path="/espace-rh-360" element={<ProtectedRoute><Navigate to="/connect?module=rh" replace /></ProtectedRoute>} />
      <Route path="/profil" element={<ProtectedRoute><Profil /></ProtectedRoute>} />
      
      {/* Paiements */}
      <Route path="/paiements" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PAIEMENTS}><GestionPaiements /></ProtectedRoute>} />
            
      {/* Redirections vers Paramètres */}
                                    
            
      {/* Rapports */}
      <Route path="/finance" element={<ProtectedRoute requiredPermission="finance.view"><Finance /></ProtectedRoute>} />
      <Route path="/planification-budgetaire" element={<ProtectedRoute requiredPermission="finance.view"><Navigate to="/connect?module=budgets" replace /></ProtectedRoute>} />
      <Route path="/finance/historique" element={<ProtectedRoute requiredPermission="finance.manage"><Navigate to="/finance?tab=historique" replace /></ProtectedRoute>} />
      <Route path="/finance/analytique" element={<ProtectedRoute requiredPermission="finance.view"><Navigate to="/finance?tab=analytique" replace /></ProtectedRoute>} />
      <Route path="/terrain" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_RAPPORTS_TECHNIQUES}><TechnicienTerrain /></ProtectedRoute>} />
      
      {/* Finances */}
      <Route path="/commissions" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_COMMISSIONS}><Commissions /></ProtectedRoute>} />
      <Route path="/portefeuilles" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PORTEFEUILLES}><Portefeuilles /></ProtectedRoute>} />
      
      {/* Support */}
      <Route path="/support" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_TICKETS}><Tickets /></ProtectedRoute>} />
                    
      {/* Admin */}
      <Route path="/parametres" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PARAMETRES}><Parametres /></ProtectedRoute>} />

      {/* 404 */}
      <Route path="*" element={<LegacyAcquisitionFallback />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <InstallPrompt />
          <DomainRouter />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
