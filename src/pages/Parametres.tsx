import { lazy, Suspense } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Shield, Settings2, List, Bell, Globe, Package, UsersRound, UserPlus, Database, HardDrive, MapPinned, IdCard, Map, KeyRound, Cable, Contact, History } from "lucide-react";
import { PERMISSIONS } from "@/lib/roles";
import { usePermissions } from "@/hooks/usePermissions";
const Utilisateurs = lazy(() => import("@/pages/Utilisateurs"));
const Offres = lazy(() => import("@/pages/Offres"));
const Equipes = lazy(() => import("@/pages/Equipes"));
const AccountRequests = lazy(() => import("@/pages/AccountRequests"));
const GestionRoles = lazy(() => import("@/pages/parametres/GestionRoles"));
const GestionGeographie = lazy(() => import("@/pages/parametres/GestionGeographie"));
const GestionStatuts = lazy(() => import("@/pages/parametres/GestionStatuts"));
const ConfigurationSysteme = lazy(() => import("@/pages/parametres/ConfigurationSysteme"));
const GestionNotifications = lazy(() => import("@/pages/parametres/GestionNotifications"));
const GestionBaseDonnees = lazy(() => import("@/pages/parametres/GestionBaseDonnees"));
const SyncQueue = lazy(async () => {
  const module = await import("@/pages/SyncQueue");
  return { default: module.SyncQueueContent };
});
const GestionZones = lazy(() => import("@/pages/parametres/GestionZones"));
const GestionCartes = lazy(() => import("@/pages/parametres/GestionCartes"));
const GestionRemuneration = lazy(() => import("@/pages/parametres/GestionRemuneration"));
const ReinitialiserCodesAcces = lazy(() => import("@/pages/parametres/ReinitialiserCodesAcces"));
const IntegrationAcreMap = lazy(() => import("@/pages/parametres/IntegrationAcreMap"));
const ImportContacts = lazy(() => import("@/pages/parametres/ImportContacts"));
const JournalAudit = lazy(() => import("@/pages/parametres/JournalAudit"));
import { useSearchParams } from "react-router-dom";

interface TabConfig {
  value: string;
  label: string;
  mobileLabel?: string;
  icon: React.ElementType;
  permission: string;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}

const Parametres = () => {
  const [searchParams] = useSearchParams();
  const { can } = usePermissions();
  const defaultTab = searchParams.get('tab') || 'utilisateurs';

  const tabs: TabConfig[] = [
    { value: 'utilisateurs', label: 'Utilisateurs', mobileLabel: 'Utilis.', icon: Users, permission: PERMISSIONS.MANAGE_USERS, component: Utilisateurs },
    { value: 'cartes', label: 'Carte du personnel', mobileLabel: 'Cartes', icon: IdCard, permission: PERMISSIONS.MANAGE_USERS, component: GestionCartes },
    { value: 'equipes', label: 'Équipes', icon: UsersRound, permission: PERMISSIONS.MANAGE_TEAMS, component: Equipes },

    { value: 'roles', label: 'Rôles', icon: Shield, permission: PERMISSIONS.MANAGE_ROLES, component: GestionRoles },
    { value: 'demandes', label: 'Demandes', icon: UserPlus, permission: PERMISSIONS.MANAGE_ACCOUNT_REQUESTS, component: AccountRequests },
    { value: 'geographie', label: 'Géographie', icon: Map, permission: PERMISSIONS.MANAGE_GEO, component: GestionGeographie },
    { value: 'zones', label: 'Zones', icon: MapPinned, permission: PERMISSIONS.MANAGE_GEO, component: GestionZones },
    { value: 'offres', label: 'Offres', icon: Package, permission: PERMISSIONS.MANAGE_OFFERS, component: Offres },
    { value: 'remuneration', label: 'Rémunération', mobileLabel: 'Rémun.', icon: Settings2, permission: PERMISSIONS.MANAGE_REMUNERATION, component: GestionRemuneration },
    { value: 'codes-acces', label: 'Codes d’accès', mobileLabel: 'Codes', icon: KeyRound, permission: PERMISSIONS.MANAGE_SYSTEM, component: ReinitialiserCodesAcces },
    { value: 'statuts', label: 'Statuts', icon: List, permission: PERMISSIONS.MANAGE_SYSTEM, component: GestionStatuts },
    { value: 'notifications', label: 'Notifications', mobileLabel: 'Alertes', icon: Bell, permission: PERMISSIONS.MANAGE_SYSTEM, component: GestionNotifications },
    { value: 'database', label: 'Base de données', mobileLabel: 'Données', icon: Database, permission: PERMISSIONS.MANAGE_SYSTEM, component: GestionBaseDonnees },
    { value: 'systeme', label: 'Système', icon: Globe, permission: PERMISSIONS.MANAGE_SYSTEM, component: ConfigurationSysteme },
    { value: 'acremap', label: 'AcreMap API', mobileLabel: 'AcreMap', icon: Cable, permission: PERMISSIONS.MANAGE_SYSTEM, component: IntegrationAcreMap },
    { value: 'contacts', label: 'Importer contacts', mobileLabel: 'Contacts', icon: Contact, permission: PERMISSIONS.MANAGE_SYSTEM, component: ImportContacts },
    { value: 'offline', label: 'Hors ligne', icon: HardDrive, permission: PERMISSIONS.MANAGE_SYSTEM, component: SyncQueue },
    { value: 'audit', label: 'Journal d’audit', mobileLabel: 'Audit', icon: History, permission: PERMISSIONS.VIEW_AUDIT, component: JournalAudit },
  ];

  const visibleTabs = tabs.filter(tab => can(tab.permission));
  const activeDefault = visibleTabs.find(t => t.value === defaultTab) ? defaultTab : visibleTabs[0]?.value || 'utilisateurs';

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PARAMETRES}>
      <MainLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Paramètres</h1>
          </div>

          <Tabs defaultValue={activeDefault} className="space-y-4">
            <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <TabsList className="inline-flex flex-nowrap gap-1 h-auto p-1 bg-muted/50 min-w-max">
                {visibleTabs.map(tab => (
                  <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm whitespace-nowrap">
                    <tab.icon className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.mobileLabel || tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {visibleTabs.map(tab => (
              <TabsContent key={tab.value} value={tab.value}>
                <Suspense fallback={null}><tab.component /></Suspense>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default Parametres;
