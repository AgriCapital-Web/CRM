import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import InstallPrompt from "@/components/pwa/InstallPrompt";
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ForcePasswordChange = lazy(() => import("./pages/ForcePasswordChange"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clients = lazy(() => import("./pages/Clients"));
const ValidationDossiers = lazy(() => import("./pages/ValidationDossiers"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const Plantations = lazy(() => import("./pages/Plantations"));
const PlantationDetail = lazy(() => import("./pages/PlantationDetail"));
const GestionPaiements = lazy(() => import("./pages/GestionPaiements"));
const Finance = lazy(() => import("./pages/Finance"));
const Commissions = lazy(() => import("./pages/Commissions"));
const Portefeuilles = lazy(() => import("./pages/Portefeuilles"));
const NouvelleAcquisition = lazy(() => import("./pages/NouvelleAcquisition"));
const PrestationsIndependantes = lazy(() => import("./pages/PrestationsIndependantes"));
const Parametres = lazy(() => import("./pages/Parametres"));
const Profil = lazy(() => import("./pages/Profil"));
const HistoriqueComplet = lazy(() => import("./pages/HistoriqueComplet"));
const AccountRequest = lazy(() => import("./pages/AccountRequest"));
const Tickets = lazy(() => import("./pages/Tickets"));
const ProprietairesTerres = lazy(() => import("./pages/ProprietairesTerres"));
const ProprietaireTerreDetail = lazy(() => import("./pages/ProprietaireTerreDetail"));
const Parcelles = lazy(() => import("./pages/Parcelles"));
const Documents = lazy(() => import("./pages/Documents"));
const Leads = lazy(() => import("./pages/Leads"));
const RelancesLeadsProspects = lazy(() => import("./pages/RelancesLeadsProspects"));
const SyncQueue = lazy(() => import("./pages/SyncQueue"));
const PublicLead = lazy(() => import("./pages/PublicLead"));
const VerificationCarte = lazy(() => import("./pages/VerificationCarte"));
const BeneficiaireParticulier = lazy(() => import("./pages/BeneficiaireParticulier"));
const TechnicienTerrain = lazy(() => import("./pages/TechnicienTerrain"));
const Messagerie = lazy(() => import("./pages/Messagerie"));
const AgriCapitalConnect = lazy(() => import("./pages/AgriCapitalConnect"));
const AgriCapitalIntelligence = lazy(() => import("./pages/AgriCapitalIntelligence"));
const ExternalMeetingGuest = lazy(() => import("./pages/ExternalMeetingGuest"));

const NotFound = lazy(() => import("./pages/NotFound"));
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
    <Suspense fallback={null}>
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
      <Route path="/acquisitions/nouveau" element={<ProtectedRoute requiredPermission={PERMISSIONS.CREATE_ACQUISITION}><NouvelleAcquisition /></ProtectedRoute>} />
      <Route path="/acquisitions/validation" element={<ProtectedRoute><ValidationDossiers /></ProtectedRoute>} />
      <Route path="/acquisitions/prestations-independantes" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_RAPPORTS_TECHNIQUES}><PrestationsIndependantes /></ProtectedRoute>} />
      <Route path="/nouvelle-acquisition" element={<ProtectedRoute requiredPermission={PERMISSIONS.CREATE_ACQUISITION}><NouvelleAcquisition /></ProtectedRoute>} />
      
      <Route path="/acquisition/:id" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><NouvelleAcquisition /></ProtectedRoute>} />
      <Route path="/acquisitions/:id" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><NouvelleAcquisition /></ProtectedRoute>} />
            <Route path="/beneficiaire-particulier/:id" element={<ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><BeneficiaireParticulier /></ProtectedRoute>} />
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
      <Route path="/finance" element={<ProtectedRoute requiredAnyPermission={["finance.view", "finance.payroll"]}><Finance /></ProtectedRoute>} />
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
    </Suspense>
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
