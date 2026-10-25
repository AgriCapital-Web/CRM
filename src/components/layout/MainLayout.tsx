import { ReactNode, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PERMISSIONS, ROLE_SHORT_LABELS } from "@/lib/roles";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationCenter } from "@/components/common/NotificationCenter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import AIAssistant from "@/components/ai/AIAssistant";
import { cn, formatUserShortName } from "@/lib/utils";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { useGlobalRealtime } from "@/hooks/useGlobalRealtime";
import {
  LayoutDashboard, Users, Sprout, CreditCard, LogOut, Menu, Receipt, History, CalendarDays,
  BarChart3, Ticket, Wallet, FileText, Settings, UserCircle, Wifi, WifiOff, RefreshCw, Signal,
  LandPlot, Layers, Target, CloudUpload, MessageSquare
} from "lucide-react";

interface MainLayoutProps { children: ReactNode; }

const MainLayout = ({ children }: MainLayoutProps) => {
  const { signOut, profile, userRoles } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { isOnline, isSyncing, syncNow, pendingCount, pendingFiles, networkQuality } = useOfflineSync();
  const queueCount = pendingCount + pendingFiles;
  const photoUrl = useSignedUrl('photos-profils', profile?.photo_url);
  useGlobalRealtime();

  const menuItems = [
    { icon: LayoutDashboard, label: "Tableau de bord", path: "/dashboard", permission: PERMISSIONS.VIEW_DASHBOARD },
    { icon: Users, label: "Leads et prospects", path: "/leads", permission: PERMISSIONS.VIEW_LEADS },
    { icon: Users, label: "Acquisition", path: "/acquisitions", permission: PERMISSIONS.VIEW_CLIENTS },
    { icon: LandPlot, label: "Convention foncière", path: "/proprietaires-terres", permission: PERMISSIONS.VIEW_PROPRIETAIRES },
    { icon: LandPlot, label: "Parcelles", path: "/parcelles", permission: PERMISSIONS.VIEW_PARCELLES },
    { icon: Sprout, label: "Plantations", path: "/plantations", permission: PERMISSIONS.VIEW_PLANTATIONS },
    { icon: Sprout, label: "Opérations techniques", path: "/terrain", permission: PERMISSIONS.VIEW_RAPPORTS_TECHNIQUES },
    { icon: Wallet, label: "Finance & Comptabilité", path: "/finance", permission: "finance.view" as any },
    { icon: CreditCard, label: "Paiements", path: "/paiements", permission: PERMISSIONS.VIEW_PAIEMENTS },
    { icon: Receipt, label: "Commissions", path: "/commissions", permission: PERMISSIONS.VIEW_COMMISSIONS },
    { icon: Wallet, label: "Portefeuilles", path: "/portefeuilles", permission: PERMISSIONS.VIEW_PORTEFEUILLES },
    { icon: Users, label: "Équipes", path: "/parametres?tab=equipes", permission: PERMISSIONS.VIEW_PARAMETRES },
    { icon: Ticket, label: "Support", path: "/support", permission: PERMISSIONS.VIEW_TICKETS },
    { icon: Layers, label: "AgriCapital 360", path: "/connect", permission: "messagerie.view" as any },
    { icon: CloudUpload, label: "Synchronisation", path: "/synchronisation", permission: PERMISSIONS.VIEW_DASHBOARD },
  ];

  const visibleMenuItems = menuItems.filter(item => can(item.permission));
  const handleLogout = async () => { await signOut(); navigate("/"); };
  const getInitials = (name: string) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'AG';

  const NetworkIndicator = ({ compact = false }: { compact?: boolean }) => {
    if (!isOnline) return <span className="flex items-center gap-1 text-xs font-semibold text-destructive"><WifiOff className="h-3.5 w-3.5" /> {!compact && 'Hors ligne'}</span>;
    if (networkQuality === 'slow') return <span className="flex items-center gap-1 text-xs font-semibold text-accent"><Signal className="h-3.5 w-3.5" /> {!compact && 'Réseau lent'}</span>;
    return <span className={cn("flex items-center gap-1 text-xs font-semibold", compact ? "text-primary" : "text-primary-foreground")}><Wifi className="h-3.5 w-3.5" /> {!compact && 'En ligne'}</span>;
  };

  const SidebarContent = () => (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-primary text-primary-foreground shadow-xl">
      <div className="shrink-0 border-b border-primary-foreground/10 px-4 py-3 bg-white/95 backdrop-blur">
        <button onClick={() => navigate('/dashboard')} className="flex w-full items-center justify-center">
          <img src="/images/Logo%20%20AgriCapital%20-360%C2%B0.png?v=20261023-official" alt="AgriCapital 360 — La plateforme métier intelligente d’AgriCapital" className="w-full max-w-[220px] h-auto object-contain" />
          <span className="sr-only">AgriCapital 360 — La plateforme métier intelligente d’AgriCapital</span>
        </button>
        <p className="mt-2 text-center text-[10px] leading-tight text-muted-foreground">La plateforme métier intelligente d’AgriCapital.</p>
      </div>

      <nav aria-label="Navigation principale" className="pointer-events-auto flex min-h-0 flex-1 flex-col gap-0 overflow-x-hidden overflow-y-auto overscroll-y-contain touch-pan-y px-2 py-1 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
        {visibleMenuItems.length === 0 && (
          <div className="rounded-md bg-primary-foreground/10 px-3 py-4 text-xs text-primary-foreground/90">
            Aucun rôle attribué à votre compte. Contactez un administrateur ou reconnectez-vous.
            <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={handleLogout}>Se reconnecter</Button>
          </div>
        )}
        {visibleMenuItems.map((item) => {
          const active = location.pathname === (item.path.split("?")[0]);
          return (
            <Button
              key={item.path}
              asChild
              variant="ghost"
              className={cn(
                "!h-8 w-full min-w-0 shrink-0 justify-start gap-2 rounded-md px-2 mb-[2px] text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground transition-colors duration-150",
                active && "bg-primary-foreground text-primary shadow-sm hover:bg-primary-foreground hover:text-primary"
              )}
              title={item.label}
            >
              <Link to={item.path} onClick={() => { if (open) setOpen(false); }} aria-current={active ? "page" : undefined} className="flex h-8 w-full min-w-0 items-center gap-2">
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left text-sm font-medium">{item.label}</span>
              </Link>
            </Button>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-primary-foreground/10 p-3">
        <div className="mb-2 rounded-md bg-primary-foreground/10 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <NetworkIndicator />
            {queueCount > 0 && (
              <button type="button" onClick={() => { navigate("/synchronisation"); setOpen(false); }} title="Voir les opérations et pièces jointes en attente" aria-label={`${queueCount} élément(s) en attente de synchronisation`} className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Badge className="bg-accent text-accent-foreground">{queueCount}</Badge>
              </button>
            )}
          </div>
        </div>
        <div className="space-y-0">
          <Button variant="ghost" className={cn("!h-8 w-full justify-start gap-2 rounded-md px-2 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground", location.pathname === "/profil" && "bg-primary-foreground/15 text-primary-foreground")} onClick={() => { navigate("/profil"); setOpen(false); }}>
            <UserCircle className="h-4 w-4" /><span className="text-sm font-medium">Profil</span>
          </Button>
          {can("parametres.view") && (
            <Button variant="ghost" className={cn("!h-8 w-full justify-start gap-2 rounded-md px-2 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground", location.pathname === "/parametres" && "bg-primary-foreground/15 text-primary-foreground")} onClick={() => { navigate("/parametres"); setOpen(false); }}>
              <Settings className="h-4 w-4" /><span className="text-sm font-medium">Paramètres</span>
            </Button>
          )}
          <Button variant="ghost" className="!h-8 w-full justify-start gap-2 rounded-md px-2 text-primary-foreground/80 hover:bg-destructive hover:text-destructive-foreground" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /><span className="text-sm font-medium">Déconnexion</span>
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen min-w-0 bg-muted/35">
      <aside className="fixed inset-y-0 left-0 z-[60] hidden h-dvh w-64 flex-shrink-0 overflow-hidden pointer-events-auto md:flex"><SidebarContent /></aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <SheetTrigger asChild><Button variant="outline" size="icon"><Menu className="h-5 w-5" /></Button></SheetTrigger>
            <NotificationCenter />
            {can("tickets.create") && <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navigate("/support?create=1")} title="Créer un ticket" aria-label="Créer un ticket"><Ticket className="h-4 w-4" /></Button>}
            <NetworkIndicator compact />
          </div>
          <Avatar className="h-8 w-8 cursor-pointer" role="button" tabIndex={0} aria-label="Ouvrir mon profil" onClick={() => navigate('/profil')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/profil'); } }}><AvatarImage src={photoUrl || ''} /><AvatarFallback className="bg-primary text-primary-foreground text-xs">{getInitials(formatUserShortName(profile?.nom_complet))}</AvatarFallback></Avatar>
        </div>
        <SheetContent side="left" className="z-[60] h-[100dvh] max-h-[100dvh] w-72 overflow-hidden p-0 pointer-events-auto"><SidebarContent /></SheetContent>
      </Sheet>

      <main className="min-w-0 flex-1 overflow-x-hidden pt-14 md:ml-64 md:pt-0 bg-muted/20">
        <header className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b bg-background/80 px-6 backdrop-blur-xl shadow-sm md:flex">
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <NetworkIndicator />
            <NotificationCenter />
            {can("tickets.create") && <Button variant="outline" size="sm" className="h-9 gap-2 whitespace-nowrap" onClick={() => navigate("/support?create=1")} title="Créer un ticket"><Ticket className="h-4 w-4" /><span>Créer un ticket</span></Button>}
            {queueCount > 0 && (
              <button type="button" onClick={() => navigate("/synchronisation")} title="Voir les opérations et pièces jointes en attente" aria-label={`${queueCount} élément(s) en attente de synchronisation`} className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Badge variant="outline" className="border-accent text-accent">{queueCount} en attente</Badge>
              </button>
            )}
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={syncNow} disabled={isSyncing || !isOnline} title="Synchroniser">
              <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
            </Button>
            <div className="text-right leading-tight"><p className="text-sm font-semibold">{formatUserShortName(profile?.nom_complet)}</p><p className="text-xs text-muted-foreground">{userRoles.map(r => ROLE_SHORT_LABELS[r] || r).join(" / ") || "Compte actif"}</p></div>
            <Avatar className="h-9 w-9 cursor-pointer" role="button" tabIndex={0} aria-label="Ouvrir mon profil" onClick={() => navigate('/profil')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/profil'); } }}><AvatarImage src={photoUrl || ''} /><AvatarFallback className="bg-primary text-primary-foreground text-sm">{getInitials(profile?.nom_complet || '')}</AvatarFallback></Avatar>
          </div>
        </header>
        <div className="min-w-0 w-full max-w-[1600px] mx-auto p-3 sm:p-5 lg:p-7">{children}</div>
      </main>


      <AIAssistant mode="staff" context={`Utilisateur: ${formatUserShortName(profile?.nom_complet)}; rôles: ${userRoles.join(", ") || "N/A"}; département: ${profile?.departement || "non défini"}; équipe principale: ${profile?.equipe_id || "non définie"}; relation RH: ${profile?.relation_rh || "non définie"}`} />
    </div>
  );
};

export default MainLayout;
