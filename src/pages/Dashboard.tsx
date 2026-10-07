import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { PlantationsMap } from "@/components/dashboard/PlantationsMap";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import TableSearchInput from "@/components/common/TableSearchInput";
import { PERMISSIONS, ROLE_SHORT_LABELS } from "@/lib/roles";
import { usePermissions } from "@/hooks/usePermissions";
import { formatUserShortName, formatWelcomeName } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users, Sprout, TrendingUp, CreditCard, AlertCircle, MapPin, Calendar,
  Bell, Award, DollarSign, FileText, Plus, FileCheck, Wallet, RefreshCw,
  Target, Tractor, LandPlot, UserRound, CheckCircle2, ChevronRight
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line
} from "recharts";

const money = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(Number(n || 0));

const num = (n: number, digits = 1) => Number(n || 0).toFixed(digits);

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const Dashboard = () => {
  const { profile, userRoles } = useAuth();
  const { can, isPdg, isDg } = usePermissions();
  const profilePhotoUrl = useSignedUrl("photos-profils", profile?.photo_url);

  const isClientOnly = userRoles.length > 0 && userRoles.every((r) => r === "user");
  const globalAdmin = isPdg || isDg;
  const canDashboardExecutiveFinance = globalAdmin || can("finance.view");
  const canFinancialOverview = canDashboardExecutiveFinance || can("rapports.view_financier");
  const canCommercialTeamPerformance = globalAdmin || can("parametres.manage_teams");
  const canTechnicalTeamPerformance = globalAdmin || can("parametres.manage_teams");

  const canClients = can(PERMISSIONS.VIEW_CLIENTS);
  const canLeads = can(PERMISSIONS.VIEW_LEADS);
  const canPlantations = can(PERMISSIONS.VIEW_PLANTATIONS);
  const canPayments = can(PERMISSIONS.VIEW_PAIEMENTS);
  const canFinance = can(PERMISSIONS.VIEW_RAPPORTS_FINANCIERS);
  const canTechnical = can(PERMISSIONS.VIEW_RAPPORTS_TECHNIQUES);
  const canCommissions = can(PERMISSIONS.VIEW_COMMISSIONS);
  const canPortfolios = can(PERMISSIONS.VIEW_PORTEFEUILLES);
  const canTickets = can(PERMISSIONS.VIEW_TICKETS);
  const canCreateAcquisition = can(PERMISSIONS.CREATE_ACQUISITION);
  const canValidateDocuments = can(PERMISSIONS.VALIDATE_PAYMENTS);

  const [connectionTime] = useState(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    clients: 0,
    plantations: 0,
    plantedHa: 0,
    engagedHa: 0,
    remainingHa: 0,
    production: 0,
    productionHa: 0,
    collected: 0,
    overdueCount: 0,
    overdueAmount: 0,
    dueAmount: 0,
    recoveryRate: 0,
    documentsPending: 0,
    proprietaires: 0,
    parcelles: 0,
    beneficiaries: 0,
    activeContracts: 0,
    installationContracts: 0,
    productionContracts: 0,
    avgProgress: 0,
    avgDaysRemaining: null as number | null,
    commissions: 0,
    portfolio: 0,
    forecastRevenue: 0,
    clientCredit: 0,
  });

  const [recentClients, setRecentClients] = useState<any[]>([]);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [offerPerformance, setOfferPerformance] = useState<any[]>([]);
  const [leadFunnel, setLeadFunnel] = useState<any[]>([]);
  const [cycle, setCycle] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [topClients, setTopClients] = useState<any[]>([]);
  const [regional, setRegional] = useState<any[]>([]);
  const [teamPerformance, setTeamPerformance] = useState<any[]>([]);
  const [tableSearch,setTableSearch]=useState("");

  const filteredRecentClients=recentClients.filter((row:any)=>JSON.stringify(row).toLowerCase().includes(tableSearch.trim().toLowerCase()));
  const filteredRecentPayments=recentPayments.filter((row:any)=>JSON.stringify(row).toLowerCase().includes(tableSearch.trim().toLowerCase()));

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [
        clientsRes,
        plantationsRes,
        paymentsRes,
        leadsRes,
        docsRes,
        proprietairesRes,
        parcellesRes,
        beneficiariesRes,
        interventionsRes,
        commissionsRes,
        portfoliosRes,
        regionsRes,
        monnaieRes,
        directoryRes
      ] = await Promise.all([
        canClients || canTechnical || canPlantations || globalAdmin
          ? (supabase as any).from("clients").select("id,id_unique,nom_complet,created_at,updated_at,statut_global,nombre_plantations,total_hectares,montant_total_contrat,formule_nom,formule_code,phase_actuelle,compte_actif,numero_ordre_global,commercial_id,paiement_initial_paye_at,pi_paye_at,type_client")
          : Promise.resolve({ data: [], count: 0 }),
        canPlantations || globalAdmin
          ? (supabase as any).from("plantations").select("id,id_unique,client_id,superficie_ha,superficie_activee,surface_reellement_plantee,date_activation,statut_global,created_at,region_id,departement_id,village_nom,village,alerte_non_paiement,alerte_visite_retard")
          : Promise.resolve({ data: [] }),
        canPayments || globalAdmin
          ? (supabase as any).from("paiements").select("id,client_id,plantation_id,montant,montant_paye,statut,date_paiement,date_echeance,type_paiement,mode_paiement,reference,est_paiement_initial,created_at").order("date_paiement", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        canLeads || globalAdmin
          ? (supabase as any).from("leads").select("id,statut,created_at,converti_at,prochaine_relance_at,assigned_to")
          : Promise.resolve({ data: [] }),
        canClients || globalAdmin
          ? (supabase as any).from("documents_acquisition").select("id,statut,obligatoire,created_at")
          : Promise.resolve({ data: [] }),
        canPlantations || canClients || globalAdmin
          ? (supabase as any).from("proprietaires_terres").select("id,surface_totale_ha,statut")
          : Promise.resolve({ data: [] }),
        canPlantations || canClients || globalAdmin
          ? (supabase as any).from("parcelles").select("id,surface_totale_ha,surface_disponible_ha,surface_attribuee_ha,statut")
          : Promise.resolve({ data: [] }),
        canPlantations || canClients || globalAdmin
          ? (supabase as any).from("beneficiaire_attributions").select("id,client_id,statut,surface_attribuee_ha")
          : Promise.resolve({ data: [] }),
        canTechnical || canPlantations || globalAdmin
          ? (supabase as any).from("interventions_techniques").select("id,type_intervention,statut,date_intervention,plantation_id,client_id")
          : Promise.resolve({ data: [] }),
        canCommissions || canFinance || globalAdmin
          ? (supabase as any).from("commissions").select("montant_commission,statut")
          : Promise.resolve({ data: [] }),
        canPortfolios || canFinance || globalAdmin
          ? (supabase as any).from("portefeuilles").select("solde_commissions,total_gagne,total_verse")
          : Promise.resolve({ data: [] }),
        canPlantations || globalAdmin
          ? (supabase as any).from("regions").select("id,nom")
          : Promise.resolve({ data: [] }),
        canClients || canPayments || globalAdmin
          ? (supabase as any).from("v_monnaie_clients").select("client_id,monnaie_client")
          : Promise.resolve({ data: [] }),
        canCommercialTeamPerformance || canTechnicalTeamPerformance
          ? (supabase as any).from("profils_annuaire").select("id,user_id,nom_complet,equipe_id")
          : Promise.resolve({ data: [] })
      ]);

      const clients = clientsRes.data || [];
      const plantations = plantationsRes.data || [];
      const payments = paymentsRes.data || [];
      const leads = leadsRes.data || [];
      const docs = docsRes.data || [];
      const proprietaires = proprietairesRes.data || [];
      const parcelles = parcellesRes.data || [];
      const beneficiaries = beneficiariesRes.data || [];
      const interventions = interventionsRes.data || [];
      const commissions = commissionsRes.data || [];
      const portfolios = portfoliosRes.data || [];
      const regions = regionsRes.data || [];
      const monnaieRows = monnaieRes.data || [];
      const directory = directoryRes.data || [];

      const validPayments = payments.filter((p: any) => p.statut === "valide" && Number(p.montant_paye ?? p.montant ?? 0) > 0);
      const collected = validPayments.reduce((s: number, p: any) => s + Number(p.montant_paye ?? p.montant ?? 0), 0);
      const overdue = payments.filter((p: any) => {
        if (p.statut === "valide" || p.statut === "annule" || p.statut === "planifie") return false;
        if (!p.date_echeance) return false;
        return new Date(p.date_echeance) <= today() && Number(p.montant_paye || 0) < Number(p.montant || 0);
      });
      const overdueAmount = overdue.reduce((s: number, p: any) => s + Math.max(0, Number(p.montant || 0) - Number(p.montant_paye || 0)), 0);

      const engagedHa = clients.filter((c:any)=>c.id_unique!=="AC-DEMO").reduce((s: number, c: any) => s + Number(c.total_hectares || 0), 0);
      const plantedHa = plantations.reduce((s: number, p: any) =>
        s + Number(p.surface_reellement_plantee || p.superficie_activee || p.superficie_ha || 0), 0);
      const productionRows = plantations.filter((p: any) => p.statut_global === "en_production");
      const productionHa = productionRows.reduce((s: number, p: any) => s + Number(p.superficie_activee || p.superficie_ha || 0), 0);
      const remainingHa = Math.max(0, engagedHa - plantedHa);

      const activeContracts = clients.filter((c: any) => c.compte_actif === true && c.id_unique !== "AC-DEMO");
      const contractRows = activeContracts.filter((c: any) => c.type_client !== "beneficiaire_particulier" && ["PalmInvest","TerraPalm","PalmTerroir"].includes(c.formule_nom) && Number(c.montant_total_contrat || 0) > 0);
      const paidByClient = new Map<string, number>();
      validPayments.forEach((p: any) => paidByClient.set(p.client_id, (paidByClient.get(p.client_id) || 0) + Number(p.montant_paye ?? p.montant ?? 0)));
      const contractProgress = contractRows.map((c: any) => {
        const total = Number(c.montant_total_contrat || 0);
        const paid = paidByClient.get(c.id) || 0;
        return { client: c, total, paid, remaining: Math.max(0, total - paid), pct: total > 0 ? Math.min(100, Math.round((paid * 100) / total)) : 0 };
      });
      const avgProgress = contractProgress.length ? Math.round(contractProgress.reduce((s: number, r: any) => s + r.pct, 0) / contractProgress.length) : 0;
      const forecastRevenue = contractRows.reduce((s: number, c: any) => s + Number(c.montant_total_contrat || 0), 0);
      const dueAmount = contractProgress.reduce((s: number, r: any) => s + r.remaining, 0);

      const clientCredit = monnaieRows.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.monnaie_client || 0)), 0);
      const contractEndDates = contractRows
        .map((r: any) => r.contrat_fin_at ? new Date(r.contrat_fin_at) : null)
        .filter((d: Date | null): d is Date => Boolean(d && d.getTime() > Date.now()));
      const avgDaysRemaining = contractEndDates.length
        ? Math.round(contractEndDates.reduce((s: number, d: Date) => s + Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000)), 0) / contractEndDates.length)
        : null;
      const recoveryRate = dueAmount + collected > 0 ? Math.round((collected / (collected + dueAmount)) * 100) : 0;

      const commissionTotal = commissions
        .filter((c: any) => c.statut !== "annule")
        .reduce((s: number, c: any) => s + Number(c.montant_commission || 0), 0);
      const portfolioTotal = commissions.filter((c: any) => c.statut !== "annule" && c.statut !== "payee").reduce((s: number, c: any) => s + Number(c.montant_commission || 0), 0);

      setStats({
        clients: clients.length,
        plantations: plantations.length,
        plantedHa,
        engagedHa,
        remainingHa,
        production: productionRows.length,
        productionHa,
        collected,
        overdueCount: overdue.length,
        overdueAmount,
        dueAmount,
        recoveryRate,
        documentsPending: docs.filter((d: any) => d.statut === "en_attente").length,
        proprietaires: proprietaires.length,
        parcelles: parcelles.length,
        beneficiaries: new Set(beneficiaries.map((b: any) => b.client_id).filter(Boolean)).size,
        activeContracts: activeContracts.length,
        installationContracts: activeContracts.filter((r: any) => r.phase_actuelle === "installation").length,
        productionContracts: activeContracts.filter((r: any) => r.phase_actuelle === "production").length,
        avgProgress,
        avgDaysRemaining,
        commissions: commissionTotal,
        portfolio: portfolioTotal,
        forecastRevenue,
        clientCredit,
      });

      // IMPORTANT: "Clients récents" = ordre de création récent, pas numéro métier.
      setRecentClients(
        [...clients]
          .sort((a: any, b: any) => {
            const byDate = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
            return byDate || Number(b.numero_ordre_global || 0) - Number(a.numero_ordre_global || 0);
          })
          .slice(0, 5)
      );

      // IMPORTANT: uniquement les paiements réellement encaissés/validés.
      // Les échéances planifiées et les lignes à 0 F ne sont jamais affichées ici.
      const clientMap = new Map(clients.map((c: any) => [c.id, c.nom_complet]));
      setRecentPayments(
        [...validPayments]
          .filter((p: any) => p.date_paiement)
          .sort((a: any, b: any) => new Date(b.date_paiement).getTime() - new Date(a.date_paiement).getTime())
          .slice(0, 5)
          .map((p: any) => ({ ...p, client_nom: clientMap.get(p.client_id) || "—" }))
      );

      const officialOffers = new Map([["PalmInvest",{name:"PalmInvest",clients:0,hectares:0}],["TerraPalm",{name:"TerraPalm",clients:0,hectares:0}],["PalmTerroir",{name:"PalmTerroir",clients:0,hectares:0}]]);
      clients.filter((c:any)=>c.id_unique!=="AC-DEMO"&&c.type_client!=="beneficiaire_particulier"&&officialOffers.has(c.formule_nom)).forEach((c:any)=>{const row=officialOffers.get(c.formule_nom)!;row.clients+=1;row.hectares+=Number(c.total_hectares||0);});
      setOfferPerformance([...officialOffers.values()].filter((x:any)=>x.clients>0).sort((a,b)=>b.clients-a.clients));

      if (canCommercialTeamPerformance || canTechnicalTeamPerformance) {
        const profileByUser = new Map(directory.map((p: any) => [p.user_id, p]));
        const profileById = new Map(directory.map((p: any) => [p.id, p]));
        const teamMap = new Map<string, any>();
        if (canCommercialTeamPerformance) clients.forEach((cl: any) => { const p=profileByUser.get(cl.commercial_id) as any; const teamId=p?.equipe_id; if(!teamId)return; const key="commercial:"+teamId; const row=teamMap.get(key)||{key,teamId,type:"commercial",nom:"Équipe commerciale",clients:0,hectares:0,interventions:0}; row.clients+=1; row.hectares+=Number(cl.total_hectares||0); teamMap.set(key,row); });
        if (canTechnicalTeamPerformance) interventions.forEach((i: any) => { const p=profileById.get(i.agent_technique_id) as any; const teamId=p?.equipe_id; if(!teamId)return; const key="technique:"+teamId; const row=teamMap.get(key)||{key,teamId,type:"technique",nom:"Équipe technique",clients:0,hectares:0,interventions:0}; row.interventions+=1; teamMap.set(key,row); });
        setTeamPerformance([...teamMap.values()].sort((a,b)=>(b.clients+b.interventions)-(a.clients+a.interventions)).slice(0,10));
      }

      const funnelMap = new Map<string, number>();
      leads.forEach((l: any) => funnelMap.set(l.statut || "non renseigné", (funnelMap.get(l.statut || "non renseigné") || 0) + 1));
      setLeadFunnel([...funnelMap.entries()].map(([name, value]) => ({ name, value })));

      // Le pilotage technique est un parcours CLIENT, pas un simple comptage de lignes d'intervention.
      // Dès que le paiement initial est validé, le dossier entre dans le périmètre technique.
      // Les bénéficiaires particuliers actifs sont également suivis techniquement sans PI.
      const technicalClients = clients.filter((c: any) =>
        c.compte_actif === true &&
        !["archive", "supprime", "supprimé"].includes(String(c.statut_global || "").toLowerCase()) &&
        (
          Boolean(c.paiement_initial_paye_at || c.pi_paye_at) ||
          String(c.type_client || "").toLowerCase() === "beneficiaire_particulier"
        )
      );
      const technicalClientIds = new Set([...technicalClients.map((c: any) => c.id).filter(Boolean), ...interventions.map((i: any) => i.client_id).filter(Boolean)]);

      const cycleTypes = [
        ["validation_parcelle", "Parcelles validées"],
        ["defrichage", "Défrichage"],
        ["piquetage", "Piquetage"],
        ["trouaison", "Trouaison"],
        ["mise_en_terre", "Mise en terre"],
      ];
      setCycle(cycleTypes.map(([code, label]) => {
        const rows = interventions.filter((i: any) =>
          technicalClientIds.has(i.client_id) &&
          String(i.type_intervention || "").toLowerCase() === code
        );
        const doneClientIds = new Set(rows.filter((i: any) => {
          const statut = String(i.statut || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          return [
            "termine",
            "terminee",
            "valide",
            "validee",
            "complete",
            "complet",
            "realise",
            "realisee",
            "acheve",
            "achevee",
          ].includes(statut);
        }).map((i: any) => i.client_id).filter(Boolean));
        const total = technicalClientIds.size;
        const done = doneClientIds.size;
        return { label, total, done, pct: total ? Math.round((done / total) * 100) : 0 };
      }));

      const regionMap = new Map<string, string>(regions.map((r: any) => [String(r.id), String(r.nom)]));
      const regionCounts = new Map<string, number>();
      plantations.forEach((p: any) => {
        const name = regionMap.get(p.region_id) || "Non renseignée";
        regionCounts.set(name, (regionCounts.get(name) || 0) + 1);
      });
      setRegional([...regionCounts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8));

      const months: any[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i, 1);
        d.setHours(0, 0, 0, 0);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        const mPlant = plantations.filter((p: any) => {
          const dt = new Date(p.date_plantation || p.date_activation || p.created_at);
          return dt >= d && dt <= end;
        }).reduce((s: number, p: any) => s + Number(p.surface_reellement_plantee || p.superficie_activee || p.superficie_ha || 0), 0);
        const mPay = validPayments.filter((p: any) => {
          const dt = new Date(p.date_paiement || p.created_at);
          return dt >= d && dt <= end;
        }).reduce((s: number, p: any) => s + Number(p.montant_paye ?? p.montant ?? 0), 0);
        months.push({
          mois: d.toLocaleDateString("fr-FR", { month: "short" }),
          hectares: mPlant,
          paiements: mPay / 1000000,
        });
      }
      setMonthly(months);

      const newAlerts: any[] = [];
      if (canPayments && overdue.length) newAlerts.push({ type: "error", message: `${overdue.length} paiement(s) arrivé(s) à échéance et non réglé(s) — ${money(overdueAmount)}`, href: "/paiements" });
      if (canClients && docs.filter((d: any) => d.statut === "en_attente").length) newAlerts.push({ type: "warning", message: `${docs.filter((d: any) => d.statut === "en_attente").length} document(s) en attente de vérification`, href: "/documents" });
      const technicalAlerts = plantations.filter((p: any) => p.statut_global !== "en_production" && (p.alerte_non_paiement || p.alerte_visite_retard));
      if (canTechnical && technicalAlerts.length) newAlerts.push({ type: "warning", message: `${technicalAlerts.length} plantation(s) nécessitent une intervention`, href: "/plantations" });
      if (canLeads) {
        const followups = leads.filter((l: any) => l.prochaine_relance_at && new Date(l.prochaine_relance_at) <= today()).length;
        if (followups) newAlerts.push({ type: "info", message: `${followups} lead(s) nécessitent une relance`, href: "/leads" });
      }
      setAlerts(newAlerts);

      const superficieGroups = [
        { label: "1 ha", min: 1, max: 1 },
        { label: "2 ha", min: 2, max: 2 },
        { label: "3–5 ha", min: 3, max: 5 },
        { label: "5–10 ha", min: 5, max: 10 },
        { label: "10–50 ha", min: 10, max: 50 },
        { label: "50–100 ha", min: 50, max: 100 },
        { label: "100+ ha", min: 100, max: Number.POSITIVE_INFINITY },
      ];
      setTopClients(
        superficieGroups.map((group) => ({
          label: group.label,
          count: clients.filter((client: any) => {
            const ha = Number(client.total_hectares || 0);
            if (group.min === group.max) return Math.round(ha * 100) / 100 === group.min;
            return ha >= group.min && ha < group.max;
          }).length,
        }))
      );

    } catch (error) {
      console.error("Erreur dashboard:", error);
    } finally {
      setLoading(false);
    }
  }, [canClients, canLeads, canPlantations, canPayments, canFinance, canTechnical, canCommissions, canPortfolios, globalAdmin, canCommercialTeamPerformance, canTechnicalTeamPerformance]);

  useEffect(() => { void fetchStats(false); }, [fetchStats]);
  const refreshSilently = useCallback(() => { void fetchStats(true); }, [fetchStats]);
  useRealtime({ table: "clients", onChange: refreshSilently });
  useRealtime({ table: "plantations", onChange: refreshSilently });
  useRealtime({ table: "paiements", onChange: refreshSilently });
  useRealtime({ table: "interventions_techniques", onChange: refreshSilently });

  const progress = stats.engagedHa > 0 ? Math.min(100, Math.round((stats.plantedHa / stats.engagedHa) * 100)) : 0;
  const roleLabel = userRoles.map((r) => ROLE_SHORT_LABELS[r] || r).join(" / ");

  const kpis = [
    { label:"Chiffre d'affaires", value:money(stats.forecastRevenue), sub:"Contrats actifs / prévisionnel", icon:Wallet, show:canFinancialOverview },
    { label:"Total encaissé", value:money(stats.collected), sub:"Encaissements validés", icon:CreditCard, show:canFinancialOverview },
    { label:"Reste à encaisser", value:money(stats.dueAmount), sub:"Créances contractuelles", icon:DollarSign, show:canFinancialOverview },
    { label:"Monnaie client", value:money(stats.clientCredit), sub:"Monnaie réellement enregistrée", icon:Wallet, show:canFinancialOverview },
    { label:"Acquisitions", value:stats.clients.toString(), sub:"Clients / dossiers", icon:Users, href:"/acquisitions", show:canClients },
    { label:"Plantations", value:stats.plantations.toString(), sub:num(stats.plantedHa)+" ha plantés", icon:Sprout, href:"/plantations", show:canPlantations },
    { label:"Production", value:stats.production.toString(), sub:num(stats.productionHa)+" ha en production", icon:TrendingUp, href:"/plantations?statut=en_production", show:canPlantations },
  ];

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="min-w-0 space-y-5 animate-fade-in">
          <div className="rounded-2xl bg-gradient-to-r from-primary to-primary/80 p-4 sm:p-6 text-primary-foreground shadow-lg">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative shrink-0">
                <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full p-0.5 bg-gradient-to-br from-amber-400 via-transparent to-primary">
                  <div className="h-full w-full rounded-full overflow-hidden bg-background">
                    {profilePhotoUrl ? (
                      <img src={profilePhotoUrl} alt={profile?.nom_complet || "Photo profil"} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-primary/20 text-xl font-bold">
                        {formatUserShortName(profile?.nom_complet).split(" ").map((n) => n[0]).join("").slice(0, 2) || "AG"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Bienvenue, <span className="text-accent font-extrabold drop-shadow-sm">{formatWelcomeName(profile?.nom_complet)}</span></h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-primary-foreground/90">
                  <Badge variant="secondary">{roleLabel || "Utilisateur"}</Badge>
                  <span>Connecté à {connectionTime}</span>
                  <span className="opacity-70">•</span>
                  
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void fetchStats(false)} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
              </Button>
            </div>
          </div>

          {!isClientOnly && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {canCreateAcquisition && <Button asChild className="h-11"><Link to="/nouvelle-acquisition"><Plus className="mr-2 h-4 w-4" />Nouveau client</Link></Button>}
              {canLeads && <Button asChild variant="outline" className="h-11"><Link to="/leads?new=1"><Plus className="mr-2 h-4 w-4" />Nouveau lead</Link></Button>}
              {canPayments && <Button asChild variant="outline" className="h-11"><Link to="/paiements"><CreditCard className="mr-2 h-4 w-4" />Paiement</Link></Button>}
              {canPlantations && <Button asChild variant="outline" className="h-11"><Link to="/plantations"><Sprout className="mr-2 h-4 w-4" />Plantations</Link></Button>}
              {canValidateDocuments && <Button asChild variant="outline" className="h-11"><Link to="/documents"><FileCheck className="mr-2 h-4 w-4" />Documents</Link></Button>}
            </div>
          )}

          {!isClientOnly && (
            <>
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {kpis.filter((k) => k.show).map((k) => {
                  const Icon = k.icon;
                  const card = (
                    <Card className="h-full transition-all hover:shadow-md hover:border-primary/50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">{k.label}</span>
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="mt-3 text-2xl sm:text-3xl font-bold">{loading ? "Chargement" : k.value}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{k.sub}</p>
                      </CardContent>
                    </Card>
                  );
                  return k.href ? <Link key={k.label} to={k.href} className="block">{card}</Link> : <div key={k.label}>{card}</div>;
                })}
              </section>

              {(canPlantations || canClients) && (
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><LandPlot className="h-5 w-5 text-primary" />Patrimoine agricole</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        ["Superficie engagée", `${num(stats.engagedHa)} ha`],
                        ["Superficie plantée", `${num(stats.plantedHa)} ha`],
                        ["Superficie restante", `${num(stats.remainingHa)} ha`],
                        ["Taux de réalisation", `${progress}%`],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="mt-1 text-lg font-bold">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4"><Progress value={progress} /><p className="mt-1 text-xs text-muted-foreground">{progress}% de la superficie engagée est réellement plantée.</p></div>
                  </CardContent>
                </Card>
              )}

              {canPlantations && stats.plantations > 0 && cycle.some((c: any) => c.total > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Tractor className="h-5 w-5 text-primary" />Cycle d'installation</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      {cycle.map((c) => (
                        <div key={c.label}>
                          <div className="flex justify-between gap-3 text-sm"><span>{c.label}</span><span className="font-medium">{c.done}/{c.total} · {c.pct}%</span></div>
                          <Progress className="mt-1" value={c.pct} />
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />Évolution agricole et financière</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={monthly}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => Number(v).toFixed(2) + " M"} />
                          <Tooltip formatter={(value: any, name: any) => name === "Paiements encaissés (M XOF)" ? [Number(value).toFixed(2) + " M XOF", name] : [value, name]} />
                          <Line yAxisId="left" type="monotone" dataKey="hectares" name="Hectares plantés" stroke="hsl(var(--primary))" strokeWidth={2} />
                          <Line yAxisId="right" type="monotone" dataKey="paiements" name="Paiements encaissés (M XOF)" stroke="hsl(var(--foreground))" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}

{teamPerformance.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="h-5 w-5 text-primary" />Performance par équipe</CardTitle></CardHeader>
                  <CardContent><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{teamPerformance.map((team) => (
                    <div key={team.key} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{team.nom}</p><p className="text-xs text-muted-foreground">{team.type === "commercial" ? "Équipe commerciale" : "Équipe technique"}</p></div><Badge variant="secondary">{team.type === "commercial" ? team.clients+" dossier(s)" : team.interventions+" intervention(s)"}</Badge></div>{team.type === "commercial" && <p className="mt-2 text-sm">{num(team.hectares)} ha rattachés</p>}</div>
                  ))}</div></CardContent>
                </Card>
              )}

              {canLeads && (leadFunnel.length > 0 || stats.clients > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-5 w-5 text-primary" />Tunnel commercial</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {leadFunnel.length ? leadFunnel.map((l) => (
                          <div key={l.name} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                            <span className="text-sm">{l.name}</span><Badge variant="secondary">{l.value}</Badge>
                          </div>
                        )) : <p className="text-sm text-muted-foreground">Aucun lead dans le périmètre accessible.</p>}
                        <div className="flex items-center justify-between rounded-lg border px-3 py-2"><span className="text-sm font-medium">Acquisitions</span><Badge>{stats.clients}</Badge></div>
                      </div>
                    </CardContent>
                  </Card>

                  {offerPerformance.length > 0 && <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="h-5 w-5 text-primary" />Performance par offre</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={offerPerformance} layout="vertical" margin={{ left: 10, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="clients" name="Clients" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>}
                </div>
              )}

              {(canClients || canFinance) && stats.activeContracts > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />Parcours des dossiers</CardTitle></CardHeader>
                  <CardContent>
                    <div className={canFinance ? "grid grid-cols-2 md:grid-cols-4 gap-3" : "grid grid-cols-3 gap-3"}>
                      {canClients && <>
                        <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Dossiers actifs</p><p className="text-xl font-bold">{stats.activeContracts}</p></div>
                        <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Installation</p><p className="text-xl font-bold">{stats.installationContracts}</p></div>
                        <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Production</p><p className="text-xl font-bold">{stats.productionContracts}</p></div>
                      </>}
                      {canFinance && <>
                        
                        <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Avancement moyen</p><p className="text-xl font-bold">{stats.avgDaysRemaining == null && stats.avgProgress === 0 ? "—" : stats.avgProgress + "%"}</p></div>
                      </>}
                    </div>
                  </CardContent>
                </Card>
              )}

              {(canPlantations || canClients) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ["Propriétaires fonciers", stats.proprietaires, UserRound],
                    ["Parcelles", stats.parcelles, LandPlot],
                    ["Bénéficiaires", stats.beneficiaries, Users],
                    ["Documents en attente", stats.documentsPending, FileText],
                  ].map(([label, value, Icon]: any) => (
                    <Card key={label}><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary" /></div><p className="mt-2 text-2xl font-bold">{value}</p></CardContent></Card>
                  ))}
                </div>
              )}

              {canPlantations && stats.plantations > 0 && <PlantationsMap />}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {canClients && recentClients.length > 0 && (
                  <Card>
                    <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-primary" />Clients récents</CardTitle><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher un client" /></div></CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Nom</TableHead><TableHead>Plantations</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {filteredRecentClients.length ? filteredRecentClients.map((c) => (
                            <TableRow key={c.id_unique}>
                              <TableCell className="font-mono text-xs">{c.id_unique}</TableCell>
                              <TableCell className="font-medium">{c.nom_complet}</TableCell>
                              <TableCell>{c.nombre_plantations || 0}</TableCell>
                              <TableCell><Badge variant={c.statut_global === "actif" ? "default" : c.statut_global === "retard" ? "destructive" : "secondary"}>{c.statut_global === "actif" ? "Actif" : c.statut_global === "retard" ? "Retard" : "Suspendu"}</Badge></TableCell>
                            </TableRow>
                          )) : <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Aucun client accessible.</TableCell></TableRow>}
                        </TableBody></Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {canPayments && recentPayments.length > 0 && (
                  <Card>
                    <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-5 w-5 text-primary" />Paiements récents</CardTitle><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher un paiement" /></div></CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table><TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Montant</TableHead><TableHead>Mode</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {filteredRecentPayments.length ? filteredRecentPayments.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.client_nom}</TableCell>
                              <TableCell>{money(Number(p.montant_paye ?? p.montant ?? 0))}</TableCell>
                              <TableCell className="text-xs">{p.mode_paiement || "—"}</TableCell>
                              <TableCell><Badge variant="default">Validé</Badge></TableCell>
                            </TableRow>
                          )) : <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Aucun paiement validé dans votre périmètre.</TableCell></TableRow>}
                        </TableBody></Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {(canPayments || canTechnical || canLeads || canClients) && (
                  <Card className="lg:col-span-1">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-5 w-5 text-orange-500" />À traiter</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {alerts.length ? alerts.map((a, i) => (
                        <Link key={i} to={a.href} className="block rounded-lg border p-3 hover:bg-muted/50">
                          <div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" /><span className="text-sm">{a.message}</span><ChevronRight className="ml-auto h-4 w-4 shrink-0" /></div>
                        </Link>
                      )) : <div className="py-5 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-green-600" />Aucune action urgente dans votre périmètre.</div>}
                    </CardContent>
                  </Card>
                )}

                {canPlantations && regional.length > 0 && (
                  <Card className="lg:col-span-1">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-5 w-5 text-primary" />Répartition géographique</CardTitle></CardHeader>
                    <CardContent>
                      {regional.length ? regional.map((r) => (
                        <div key={r.name} className="mb-3"><div className="flex justify-between text-xs"><span>{r.name}</span><span>{r.value}</span></div><Progress value={regional[0]?.value ? (r.value / regional[0].value) * 100 : 0} className="mt-1" /></div>
                      )) : <p className="text-sm text-muted-foreground">Aucune plantation géolocalisée dans votre périmètre.</p>}
                    </CardContent>
                  </Card>
                )}

                {canClients && stats.clients > 0 && topClients.some((g: any) => g.count > 0) && (
                  <Card className="lg:col-span-1">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Award className="h-5 w-5 text-primary" />Nombre de clients par superficie</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {topClients.filter((group: any) => group.count > 0).map((group: any) => (
                        <div key={group.label} className="flex items-center justify-between rounded-lg border p-2.5">
                          <span className="text-sm font-medium">{group.label}</span>
                          <span className="shrink-0 text-sm font-semibold">{group.count} client{group.count > 1 ? "s" : ""}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>

              {canTechnical && cycle.some((c: any) => c.total > 0) && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Tractor className="h-5 w-5 text-primary" />Pilotage technique</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {cycle.map((c) => <div key={c.label} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{c.label}</p><p className="mt-1 text-lg font-bold">{c.pct}%</p><p className="text-xs text-muted-foreground">{c.done}/{c.total} terminées</p></div>)}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {isClientOnly && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Button asChild><Link to="/profil"><Users className="mr-2 h-4 w-4" />Mon profil</Link></Button>
              <Button asChild variant="outline"><Link to="/paiements"><CreditCard className="mr-2 h-4 w-4" />Mes paiements</Link></Button>
              <Button asChild variant="outline"><Link to="/plantations"><Sprout className="mr-2 h-4 w-4" />Ma plantation</Link></Button>
              <Button asChild variant="outline"><Link to="/documents"><FileCheck className="mr-2 h-4 w-4" />Mes documents</Link></Button>
            </div>
          )}

          {loading && <p className="text-center text-xs text-muted-foreground">Chargement initial des données…</p>}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default Dashboard;
