import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Shield, Settings2, List, Bell, Globe, Package, UsersRound, UserPlus, Database, HardDrive, MapPinned, History, IdCard, Map, KeyRound } from "lucide-react";
import { PERMISSIONS } from "@/lib/roles";
import { usePermissions } from "@/hooks/usePermissions";
import Utilisateurs from "@/pages/Utilisateurs";
import Offres from "@/pages/Offres";
import Equipes from "@/pages/Equipes";
import AccountRequests from "@/pages/AccountRequests";
import GestionRoles from "@/pages/parametres/GestionRoles";
import GestionGeographie from "@/pages/parametres/GestionGeographie";
import GestionStatuts from "@/pages/parametres/GestionStatuts";
import ConfigurationSysteme from "@/pages/parametres/ConfigurationSysteme";
import GestionNotifications from "@/pages/parametres/GestionNotifications";
import GestionBaseDonnees from "@/pages/parametres/GestionBaseDonnees";
import { SyncQueueContent as SyncQueue } from "@/pages/SyncQueue";
import GestionZones from "@/pages/parametres/GestionZones";
import JournalAudit from "@/pages/parametres/JournalAudit";
import GestionCartes from "@/pages/parametres/GestionCartes";
import GestionRemuneration from "@/pages/parametres/GestionRemuneration";
import ReinitialiserCodesAcces from "@/pages/parametres/ReinitialiserCodesAcces";
import { useSearchParams } from "react-router-dom";

interface TabConfig {
  value: string;
  label: string;
  mobileLabel?: string;
  icon: React.ElementType;
  permission: string;
  component: React.ComponentType;
}

const Parametres = () => {
  const [searchParams] = useSearchParams();
  const { can } = usePermissions();
  const defaultTab = searchParams.get('tab') || 'utilisateurs';

  const tabs: TabConfig[] = [
    { value: 'utilisateurs', label: 'Utilisateurs', mobileLabel: 'Users', icon: Users, permission: PERMISSIONS.MANAGE_USERS, component: Utilisateurs },
    { value: 'cartes', label: 'Carte du personnel', mobileLabel: 'Cartes', icon: IdCard, permission: PERMISSIONS.MANAGE_USERS, component: GestionCartes },
    { value: 'equipes', label: 'Équipes', icon: UsersRound, permission: PERMISSIONS.MANAGE_TEAMS, component: Equipes },

    { value: 'roles', label: 'Rôles', icon: Shield, permission: PERMISSIONS.MANAGE_ROLES, component: GestionRoles },
    { value: 'demandes', label: 'Demandes', icon: UserPlus, permission: PERMISSIONS.MANAGE_USERS, component: AccountRequests },
    { value: 'geographie', label: 'Géographie', icon: Map, permission: PERMISSIONS.MANAGE_GEO, component: GestionGeographie },
    { value: 'zones', label: 'Zones', icon: MapPinned, permission: PERMISSIONS.MANAGE_TEAMS, component: GestionZones },
    { value: 'offres', label: 'Offres', icon: Package, permission: PERMISSIONS.MANAGE_OFFERS, component: Offres },
    { value: 'remuneration', label: 'Rémunération', mobileLabel: 'Rémun.', icon: Settings2, permission: PERMISSIONS.MANAGE_REMUNERATION, component: GestionRemuneration },
    { value: 'codes-acces', label: 'Codes d’accès', mobileLabel: 'Codes', icon: KeyRound, permission: PERMISSIONS.MANAGE_SYSTEM, component: ReinitialiserCodesAcces },
    { value: 'statuts', label: 'Statuts', icon: List, permission: PERMISSIONS.MANAGE_SYSTEM, component: GestionStatuts },
    { value: 'notifications', label: 'Notifs', icon: Bell, permission: PERMISSIONS.MANAGE_SYSTEM, component: GestionNotifications },
    { value: 'tracabilite', label: 'Traçabilité', mobileLabel: 'Traces', icon: History, permission: PERMISSIONS.VIEW_AUDIT, component: JournalAudit },
    { value: 'database', label: 'BDD', icon: Database, permission: PERMISSIONS.MANAGE_SYSTEM, component: GestionBaseDonnees },
    { value: 'systeme', label: 'Système', icon: Globe, permission: PERMISSIONS.MANAGE_SYSTEM, component: ConfigurationSysteme },
    { value: 'offline', label: 'Hors ligne', icon: HardDrive, permission: PERMISSIONS.MANAGE_SYSTEM, component: SyncQueue },
  ];

  const visibleTabs = tabs.filter(tab => can(tab.permission));
  const activeDefault = visibleTabs.find(t => t.value === defaultTab) ? defaultTab : visibleTabs[0]?.value || 'utilisateurs';

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PARAMETRES}>
      <MainLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Paramètres</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Configuration et gestion de la plateforme
            </p>
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
                <tab.component />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default Parametres;
