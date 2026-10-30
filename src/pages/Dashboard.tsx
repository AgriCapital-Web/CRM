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

const num = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(Number(n || 0)));

// AgriCapital est un compte interne, jamais un client commercial, même si un ancien enregistrement est mal catégorisé.
const isAgriCapitalInternal = (client: any) => /agricapital/i.test(String(client?.nom_complet || client?.nom || "").trim());

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
  const canCommercialTeamPerformance = globalAdmin || can("parametres.manage_teams");
  const canTechnicalTeamPerformance = globalAdmin || can("parametres.manage_teams");

  const canClients = can(PERMISSIONS.VIEW_CLIENTS);
  const canLeads = can(PERMISSIONS.VIEW_LEADS);
  const canOwners = can(PERMISSIONS.VIEW_PROPRIETAIRES);
  const canValidateOwners = can("proprietaires.validate");
  const canParcelles = can(PERMISSIONS.VIEW_PARCELLES);
  const canPlantations = can(PERMISSIONS.VIEW_PLANTATIONS);
  const canPayments = can(PERMISSIONS.VIEW_PAIEMENTS);
  const canFinance = can(PERMISSIONS.VIEW_RAPPORTS_FINANCIERS);
  const canTechnical = can(PERMISSIONS.VIEW_RAPPORTS_TECHNIQUES);
  const canCommissions = can(PERMISSIONS.VIEW_COMMISSIONS);
  const canPortfolios = can(PERMISSIONS.VIEW_PORTEFEUILLES);
  const canTickets = can(PERMISSIONS.VIEW_TICKETS);
  const canCreateAcquisition = can(PERMISSIONS.CREATE_ACQUISITION);
  const canValidateDocuments = can(PERMISSIONS.VALIDATE_PAYMENTS) || can("acquisitions.validate") || can("clients.validate") || userRoles.some((role) => ["pdg", "service_client", "chef_equipe_service_client"].includes(role));
  const canViewIndependentServiceCustomers = globalAdmin || userRoles.some((role) => ["service_client", "chef_equipe_service_client", "comptable", "manager_commercial_national", "responsable_operations"].includes(role));
  const canViewIndependentServiceProformas = canViewIndependentServiceCustomers || userRoles.some((role) => ["technicien", "chef_equipe_technique", "manager_technique_national"].includes(role));

  const [connectionTime] = useState(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    clients: 0,
    commercialClients: 0,
    clientsActive: 0,
    clientsOverdue: 0,
    clientsSuspended: 0,
    clientsPendingValidation: 0,
    salesPendingValidation: 0,
    leads: 0,
    prospects: 0,
    leadsNew: 0,
    leadsConverted: 0,
    prospectsConverted: 0,
    leadsFollowup: 0,
    conversionRate: 0,
    prospectsConversionRate: 0,
    ownerAreaHa: 0,
    partnershipTotalHa: 0,
    partnershipPlantedHa: 0,
    partnershipRemainingHa: 0,
    partnerOwnerAreaHa: 0,
    partnerOwnerPlantedHa: 0,
    partnerOwnerRemainingHa: 0,
    agriCapitalAreaHa: 0,
    agriCapitalSoldToClientsHa: 0,
    foncierPlantedHa: 0,
    foncierRemainingHa: 0,
    clientParcelCount: 0,
    clientParcelAreaHa: 0,
    settledClients: 0,
    internalPlantations: 0,
    internalAreaHa: 0,
    internalPlantedHa: 0,
    internalRemainingHa: 0,
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
    ownersPendingValidation: 0,
    parcelles: 0,
    proprietaireParcelles: 0,
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
    independentCustomers: 0,
    independentProformas: 0,
    independentServicePipelineAmount: 0,
  });

  const [recentClients, setRecentClients] = useState<any[]>([]);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [offerPerformance, setOfferPerformance] = useState<any[]>([]);
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
        independentCustomersRes,
        independentProformasRes,
        acquisitionsValidationRes,
        acquisitionsRes,
        plantationsRes,
        paymentsRes,
        leadsRes,
        docsRes,
        proprietairesRes,
        parcellesRes,
        conventionsRes,
        beneficiariesRes,
        interventionsRes,
        commissionsRes,
        portfoliosRes,
        regionsRes,
        monnaieRes,
        directoryRes,
        teamsRes,
        teamMembersRes
      ] = await Promise.all([
        canClients || canTechnical || canPlantations || globalAdmin
          ? (supabase as any).from("clients").select("id,id_unique,nom_complet,created_at,updated_at,statut,statut_global,validation_statut,contrat_solde_at,nombre_plantations,total_hectares,montant_total_contrat,formule_nom,formule_code,phase_actuelle,compte_actif,numero_ordre_global,commercial_id,created_by,paiement_initial_paye_at,pi_paye_at,type_client,type_client_foncier,parcelle_id,is_internal,famille_offre")
          : Promise.resolve({ data: [], count: 0 }),
        canViewIndependentServiceCustomers
          ? (supabase as any).from("independent_service_customers").select("id").is("archived_at", null)
          : Promise.resolve({ data: [] }),
        canViewIndependentServiceProformas
          ? (supabase as any).from("independent_service_proformas").select("id,status,total_amount").is("archived_at", null)
          : Promise.resolve({ data: [] }),
        canClients || globalAdmin
          ? (supabase as any).from("clients").select("id,validation_statut")
          : Promise.resolve({ data: [] }),
        canClients || canPlantations || globalAdmin
          ? (supabase as any).from("acquisitions").select("id,client_id,statut,statut_technique,superficie_ha,parcelle_id,created_at")
          : Promise.resolve({ data: [] }),
        canPlantations || globalAdmin
          ? (supabase as any).from("plantations").select("id,id_unique,client_id,parcelle_id,acquisition_id,superficie_ha,superficie_activee,surface_reellement_plantee,date_plantation,date_activation,statut_global,created_at,region_id,departement_id,village_nom,village,alerte_non_paiement,alerte_visite_retard")
          : Promise.resolve({ data: [] }),
        canPayments || globalAdmin
          ? (supabase as any).from("paiements").select("id,client_id,plantation_id,montant,montant_paye,statut,date_paiement,date_echeance,type_paiement,mode_paiement,reference,est_paiement_initial,created_at").order("date_paiement", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        canLeads || globalAdmin
          ? (supabase as any).from("leads").select("id,statut,created_at,converti_at,prochaine_relance_at,assigned_to,type_lead,etape_pipeline,etape_conversion")
          : Promise.resolve({ data: [] }),
        canClients || globalAdmin
          ? (supabase as any).from("documents_acquisition").select("id,client_id,statut,obligatoire,created_at")
          : Promise.resolve({ data: [] }),
        canOwners || canPlantations || canClients || globalAdmin
          ? (supabase as any).from("proprietaires_terres").select("id,surface_totale_ha,statut,validation_statut")
          : Promise.resolve({ data: [] }),
        canParcelles || canPlantations || canClients || globalAdmin
          ? (supabase as any).from("parcelles").select("id,proprietaire_id,surface_totale_ha,surface_proprietaire_ha,surface_disponible_ha,surface_attribuee_ha,surface_agricapital_ha,plantation_partagee_activee,convention_id,statut")
          : Promise.resolve({ data: [] }),
        canOwners || canParcelles || canPlantations || globalAdmin
          ? (supabase as any).from("conventions_foncieres").select("id,parcelle_id,proprietaire_id,statut,surface_totale_ha,part_proprietaire_ha,part_agricapital_ha")
          : Promise.resolve({ data: [] }),
        canPlantations || canClients || globalAdmin
          ? (supabase as any).from("beneficiaire_attributions").select("id,client_id,statut,surface_attribuee_ha")
          : Promise.resolve({ data: [] }),
        canTechnical || canPlantations || globalAdmin
          ? (supabase as any).from("interventions_techniques").select("id,type_intervention,statut,date_intervention,plantation_id,client_id,agent_technique_id")
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
          ? (supabase as any).from("profiles").select("id,user_id,nom_complet,username")
          : Promise.resolve({ data: [] }),
        canCommercialTeamPerformance || canTechnicalTeamPerformance
          ? (supabase as any).from("equipes").select("id,nom,type_equipe")
          : Promise.resolve({ data: [] }),
        canCommercialTeamPerformance || canTechnicalTeamPerformance
          ? (supabase as any).from("equipe_membres").select("equipe_id,profile_id")
          : Promise.resolve({ data: [] })
      ]);

      const clients = clientsRes.data || [];
      const independentCustomers = independentCustomersRes.data || [];
      const independentProformas = independentProformasRes.data || [];
      const acceptedIndependentProformas = independentProformas.filter((p: any) => ["acceptee", "en_cours", "terminee"].includes(String(p.status || "").toLowerCase()));
      const independentServicePipelineAmount = acceptedIndependentProformas.reduce((sum: number, p: any) => sum + Math.max(0, Number(p.total_amount || 0)), 0);
      const acquisitionsForValidation = acquisitionsValidationRes.data || [];
      const acquisitions = acquisitionsRes.data || [];
      const teamRows = teamsRes.data || [];
      const teamNameById = new Map(teamRows.map((team: any) => [team.id, String(team.nom || "").trim()]));
      const activeAcquisitionStatuses = new Set(["active", "en_attente_activation", "en_attente_intervention", "en_attente_paiement", "en_cours", "valide", "souscrite"]);
      const activeAcquisitionAreaByClient = new Map<string, number>();
      acquisitions.filter((a: any) => activeAcquisitionStatuses.has(String(a.statut || "").toLowerCase()) || activeAcquisitionStatuses.has(String(a.statut_technique || "").toLowerCase())).forEach((a: any) => {
        if (!a.client_id) return;
        activeAcquisitionAreaByClient.set(a.client_id, (activeAcquisitionAreaByClient.get(a.client_id) || 0) + Math.max(0, Number(a.superficie_ha || 0)));
      });
      const clientsWithAcquisitions = new Set(acquisitions
        .filter((a: any) => activeAcquisitionStatuses.has(String(a.statut || "").toLowerCase()) || activeAcquisitionStatuses.has(String(a.statut_technique || "").toLowerCase()))
        .map((a: any) => a.client_id)
        .filter(Boolean));
      const allExternalClients = clients.filter((c: any) =>
        !c.is_internal && !isAgriCapitalInternal(c) &&
        String(c.type_client || "").toLowerCase() !== "proprietaire_foncier"
      );
      // Les bénéficiaires particuliers restent hors du périmètre des clients officiels,
      // même s'ils possèdent une attribution ou une acquisition pour une plantation distincte.
      const commercialClients = allExternalClients.filter((c: any) =>
        String(c.type_client || "").toLowerCase() !== "beneficiaire_particulier" &&
        /^AC_C/i.test(String(c.id_unique || "").trim())
      );
      const plantations = plantationsRes.data || [];
      const payments = paymentsRes.data || [];
      const leads = leadsRes.data || [];
      const docs = docsRes.data || [];
      const proprietaires = proprietairesRes.data || [];
      const parcelles = parcellesRes.data || [];
      const conventions = conventionsRes.data || [];
      const beneficiaries = beneficiariesRes.data || [];
      const interventions = interventionsRes.data || [];
      const commissions = commissionsRes.data || [];
      const portfolios = portfoliosRes.data || [];
      const regions = regionsRes.data || [];
      const monnaieRows = monnaieRes.data || [];
      const directory = directoryRes.data || [];
      // Une parcelle ne peut pas compter plus de surface plantée que sa surface totale,
      // même si des lignes d'attribution (bénéficiaire/propriétaire) se chevauchent.
      const sumPlantedArea = (rows: any[]) => {
        const byParcel = new Map<string, number>();
        let withoutParcel = 0;
        rows.forEach((row: any) => {
          const amount = Math.max(0, Number(row.surface_reellement_plantee ?? row.superficie_activee ?? 0));
          if (row.parcelle_id) byParcel.set(row.parcelle_id, (byParcel.get(row.parcelle_id) || 0) + amount);
          else withoutParcel += amount;
        });
        const parcelAreaById = new Map<string, number>(parcelles.map((parcel: any) => [String(parcel.id), Math.max(0, Number(parcel.surface_totale_ha || 0))] as [string, number]));
        return withoutParcel + Array.from(byParcel.entries()).reduce((sum, [id, area]) => {
          const parcelArea = parcelAreaById.get(id);
          return sum + (parcelArea == null || parcelArea <= 0 ? area : Math.min(area, parcelArea));
        }, 0);
      };

      const validPayments = payments.filter((p: any) => p.statut === "valide" && Number(p.montant_paye ?? p.montant ?? 0) > 0);
      const commercialValidPayments = validPayments.filter((p: any) => commercialClients.some((client: any) => client.id === p.client_id));
      const collected = commercialValidPayments.reduce((s: number, p: any) => s + Number(p.montant_paye ?? p.montant ?? 0), 0);
      const overdue = payments.filter((p: any) => {
        if (!commercialClients.some((client: any) => client.id === p.client_id)) return false;
        if (p.statut === "valide" || p.statut === "annule" || p.statut === "planifie") return false;
        if (!p.date_echeance) return false;
        return new Date(p.date_echeance) <= today() && Number(p.montant_paye || 0) < Number(p.montant || 0);
      });
      const overdueAmount = overdue.reduce((s: number, p: any) => s + Math.max(0, Number(p.montant || 0) - Number(p.montant_paye || 0)), 0);

      const dashboardClientIds = new Set(commercialClients.map((c: any) => c.id));
      let engagedHa = commercialClients.reduce((s: number, c: any) => s + Number(c.total_hectares || 0), 0);
      const scopedPlantations = plantations.filter((p: any) => p.client_id && dashboardClientIds.has(p.client_id));
      let plantedHa = scopedPlantations.reduce((s: number, p: any) =>
        s + Number(p.surface_reellement_plantee ?? p.superficie_activee ?? 0), 0);
      let remainingHa = Math.max(0, engagedHa - plantedHa);
      const productionRows = plantations.filter((p: any) => p.statut_global === "en_production");
      const productionHa = sumPlantedArea(productionRows);
      const pipelineLeads = leads.filter((l: any) => (l.etape_pipeline || "lead") === "lead");
      const pipelineProspects = leads.filter((l: any) => l.etape_pipeline === "prospect");
      const convertedRows = leads.filter((l: any) => l.etape_pipeline === "converti" || l.statut === "converti" || Boolean(l.converti_at));
      const convertedLeads = convertedRows.filter((l: any) => l.etape_conversion !== "prospect").length;
      const convertedProspects = convertedRows.filter((l: any) => l.etape_conversion === "prospect").length;
      const newLeads = pipelineLeads.filter((l: any) => l.statut === "nouveau").length;
      const followupLeads = leads.filter((l: any) =>
        ["lead", "prospect"].includes(l.etape_pipeline || "lead") &&
        l.prochaine_relance_at && new Date(l.prochaine_relance_at) <= new Date()
      ).length;
      const conversionRate = pipelineLeads.length + convertedLeads
        ? Math.round((convertedLeads / (pipelineLeads.length + convertedLeads)) * 100) : 0;
      const prospectsConversionRate = pipelineProspects.length + convertedProspects
        ? Math.round((convertedProspects / (pipelineProspects.length + convertedProspects)) * 100) : 0;
      // Audit foncier : chaque indicateur utilise sa propre surface et sa relation validée.
      // Une surface totale de parcelle ne remplace jamais la quote-part AgriCapital.
      const activeConventionIds = new Set(conventions
        .filter((c: any) => String(c.statut || "").toLowerCase() === "active")
        .map((c: any) => c.id));
      const validatedOwnerIds = new Set(proprietaires
        .filter((owner: any) => ["valide", "validee", "validé", "validée", "actif", "active"].includes(String(owner.validation_statut || owner.statut || "").toLowerCase()))
        .map((owner: any) => owner.id));
      const validatedPartnershipParcels = parcelles.filter((p: any) =>
        Boolean(p.proprietaire_id) && validatedOwnerIds.has(p.proprietaire_id) &&
        (p.plantation_partagee_activee === true || activeConventionIds.has(p.convention_id)) &&
        !["archive", "annulee", "annulée"].includes(String(p.statut || "").toLowerCase())
      );
      const validatedPartnershipParcelIds = new Set(validatedPartnershipParcels.map((p: any) => p.id));
      const activeConventionByParcel = new Map<string, any>();
      conventions.filter((c: any) => String(c.statut || "").toLowerCase() === "active" && c.parcelle_id)
        .forEach((c: any) => activeConventionByParcel.set(c.parcelle_id, c));
      const partnershipAreaFor = (p: any) => {
        const convention = activeConventionByParcel.get(p.id);
        return Number(convention?.part_agricapital_ha ?? p.surface_agricapital_ha ?? 0);
      };
      const partnershipTotalHa = validatedPartnershipParcels.reduce((sum: number, p: any) => sum + Number(p.surface_totale_ha || 0), 0);
      const ownerAreaHa = proprietaires.reduce((sum: number, owner: any) => sum + Number(owner.surface_totale_ha || 0), 0);
      const plantedByPartnershipParcel = new Map<string, number>();
      plantations.filter((p: any) => p.parcelle_id && validatedPartnershipParcelIds.has(p.parcelle_id)).forEach((p: any) => {
        const amount = Number(p.surface_reellement_plantee ?? p.superficie_activee ?? 0);
        plantedByPartnershipParcel.set(p.parcelle_id, (plantedByPartnershipParcel.get(p.parcelle_id) || 0) + amount);
      });
      const partnershipMetrics = validatedPartnershipParcels.reduce((acc: any, p: any) => {
        const convention = activeConventionByParcel.get(p.id);
        const total = Math.max(0, Number(p.surface_totale_ha || 0));
        const agriShare = Math.min(total, Math.max(0, partnershipAreaFor(p)));
        const ownerShare = Math.min(Math.max(0, total - agriShare), Math.max(0, Number(convention?.part_proprietaire_ha ?? p.surface_proprietaire_ha ?? (total - agriShare))));
        const transferred = Math.min(agriShare, Math.max(0, Number(p.surface_attribuee_ha || 0)));
        const planted = Math.min(total, Math.max(0, plantedByPartnershipParcel.get(p.id) || 0));
        const agriPlanted = total > 0 ? Math.min(Math.max(0, agriShare - transferred), planted * agriShare / total) : 0;
        const ownerPlanted = total > 0 ? Math.min(ownerShare, planted * ownerShare / total) : 0;
        acc.planted += planted;
        acc.ownerArea += ownerShare;
        acc.ownerPlanted += ownerPlanted;
        acc.ownerRemaining += Math.max(0, ownerShare - ownerPlanted);
        acc.agriArea += agriShare;
        acc.agriPlanted += agriPlanted;
        acc.agriTransferred += transferred;
        acc.agriRemaining += Math.max(0, agriShare - transferred - agriPlanted);
        return acc;
      }, {planted:0,ownerArea:0,ownerPlanted:0,ownerRemaining:0,agriArea:0,agriPlanted:0,agriTransferred:0,agriRemaining:0});
      const partnershipPlantedHa = partnershipMetrics.planted;
      const partnershipRemainingHa = partnershipMetrics.ownerRemaining + partnershipMetrics.agriRemaining;
      const partnerOwnerAreaHa = partnershipMetrics.ownerArea;
      const partnerOwnerPlantedHa = partnershipMetrics.ownerPlanted;
      const partnerOwnerRemainingHa = partnershipMetrics.ownerRemaining;
      const agriCapitalAreaHa = partnershipMetrics.agriArea;
      const agriCapitalSoldToClientsHa = partnershipMetrics.agriTransferred;
      const foncierPlantedHa = partnershipMetrics.agriPlanted;
      const foncierRemainingHa = partnershipMetrics.agriRemaining;
      const clientParcelIds = new Set(allExternalClients.filter((c: any) => c.parcelle_id).map((c: any) => c.parcelle_id).filter((id: string) => !validatedPartnershipParcelIds.has(id)));
      const clientParcelRows = parcelles.filter((p: any) => clientParcelIds.has(p.id));
      const clientParcelCount = clientParcelRows.length;
      const clientParcelAreaHa = clientParcelRows.reduce((sum: number, p: any) => sum + Number(p.surface_totale_ha || 0), 0);
      const internalClientIds = new Set(clients.filter((c: any) => c.is_internal === true).map((c: any) => c.id));
      const internalPlantationRows = plantations.filter((p: any) => internalClientIds.has(p.client_id) && (!p.parcelle_id || !validatedPartnershipParcelIds.has(p.parcelle_id)));
      const internalPlantedHa = sumPlantedArea(internalPlantationRows);
      const internalAreaHa = internalPlantationRows.reduce((sum: number, p: any) => sum + Number(p.superficie_ha || 0), 0);
      const plantationAcquisitionIds = new Set(plantations.map((p: any) => p.acquisition_id).filter(Boolean));
      const unplantedAcquisitionArea = acquisitions
        .filter((a: any) => activeAcquisitionStatuses.has(String(a.statut || "").toLowerCase()) &&
          !plantationAcquisitionIds.has(a.id) && !a.parcelle_id)
        .reduce((sum: number, a: any) => sum + Number(a.superficie_ha || 0), 0);
      const plantationsWithoutParcelArea = plantations
        .filter((p: any) => !p.parcelle_id && !internalClientIds.has(p.client_id))
        .reduce((sum: number, p: any) => sum + Number(p.superficie_ha || 0), 0);
      engagedHa = partnershipTotalHa + clientParcelAreaHa + internalAreaHa + unplantedAcquisitionArea + plantationsWithoutParcelArea;
      plantedHa = sumPlantedArea(plantations);
      remainingHa = Math.max(0, engagedHa - plantedHa);
      const internalRemainingHa = Math.max(0, internalAreaHa - internalPlantedHa);

      // Prévision fondée uniquement sur les contrats validés et les comptes effectivement activés.
      const activeContracts = commercialClients.filter((c: any) => c.compte_actif === true && c.validation_statut === "valide");
      const contractRows = activeContracts.filter((c: any) => Number(c.montant_total_contrat || 0) > 0);
      const paidByClient = new Map<string, number>();
      commercialValidPayments.forEach((p: any) => paidByClient.set(p.client_id, (paidByClient.get(p.client_id) || 0) + Number(p.montant_paye ?? p.montant ?? 0)));
      const contractProgress = contractRows.map((c: any) => {
        const total = Number(c.montant_total_contrat || 0);
        const paid = paidByClient.get(c.id) || 0;
        const settled = Boolean(c.contrat_solde_at);
        return { client: c, total, paid, remaining: settled ? 0 : Math.max(0, total - paid), pct: settled ? 100 : total > 0 ? Math.min(100, Math.round((paid * 100) / total)) : 0 };
      });
      const avgProgress = contractProgress.length ? Math.round(contractProgress.reduce((s: number, r: any) => s + r.pct, 0) / contractProgress.length) : 0;
      // Un contrat soldé ne conserve que son encaissement réel dans le prévisionnel.
      // Cela évite de compter une seconde fois un solde annulé/abandonné à la clôture.
      const forecastRevenue = contractProgress.reduce((sum: number, row: any) => sum + (row.client.contrat_solde_at ? row.paid : row.total), 0);
      const dueAmount = contractProgress.reduce((s: number, r: any) => s + r.remaining, 0);
      const settledClients = contractProgress.filter((r: any) => r.total > 0 && r.remaining <= 0).length;

      const clientCredit = monnaieRows.filter((row: any) => commercialClients.some((client: any) => client.id === row.client_id)).reduce((sum: number, row: any) => sum + Math.max(0, Number(row.monnaie_client || 0)), 0);
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
        clients: commercialClients.length,
        commercialClients: commercialClients.length,
        clientsActive: commercialClients.filter((c:any)=>(["actif","active"].includes(String(c.statut||"").toLowerCase()) || ["actif","active"].includes(String(c.statut_global||"").toLowerCase()))).length,
        clientsOverdue: commercialClients.filter((c:any)=>( ["en_retard","retard","impaye"].includes(String(c.statut||"").toLowerCase()) || ["en_retard","retard","impaye"].includes(String(c.statut_global||"").toLowerCase()))).length,
        clientsSuspended: commercialClients.filter((c:any)=>["suspendu","suspendue","suspended"].includes(String(c.statut||c.statut_global||"").toLowerCase())).length,
        clientsPendingValidation: commercialClients.filter((c:any)=>["a_valider","modification_demandee"].includes(String(c.validation_statut||""))).length,
        salesPendingValidation: acquisitionsForValidation.filter((a:any)=>["a_valider","modification_demandee"].includes(String(a.validation_statut||""))).length,
        leads: pipelineLeads.length,
        prospects: pipelineProspects.length,
        leadsNew: newLeads,
        leadsConverted: convertedLeads,
        prospectsConverted: convertedProspects,
        leadsFollowup: followupLeads,
        conversionRate,
        prospectsConversionRate,
        ownerAreaHa,
        partnershipTotalHa,
        partnershipPlantedHa,
        partnershipRemainingHa,
        partnerOwnerAreaHa,
        partnerOwnerPlantedHa,
        partnerOwnerRemainingHa,
        agriCapitalAreaHa,
        agriCapitalSoldToClientsHa,
        foncierPlantedHa,
        foncierRemainingHa,
        clientParcelCount,
        clientParcelAreaHa,
        settledClients,
        internalPlantations: internalPlantationRows.length,
        internalAreaHa,
        internalPlantedHa,
        internalRemainingHa,
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
        documentsPending: docs.filter((d: any) => d.statut === "en_attente" && commercialClients.some((client: any) => client.id === d.client_id)).length,
        proprietaires: proprietaires.length,
        ownersPendingValidation: proprietaires.filter((owner: any) => owner.validation_statut === "a_valider").length,
        parcelles: parcelles.length,
        proprietaireParcelles: parcelles.filter((p: any) => Boolean(p.proprietaire_id)).length,
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
        independentCustomers: independentCustomers.length,
        independentProformas: independentProformas.length,
        independentServicePipelineAmount,
      });

      // IMPORTANT: "Clients récents" = ordre de création récent, pas numéro métier.
      setRecentClients(
        [...clients].filter((c: any) => !c.is_internal && String(c.type_client || "").toLowerCase() !== "proprietaire_foncier")
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
      commercialClients.filter((c:any)=>officialOffers.has(c.formule_nom)).forEach((c:any)=>{const row=officialOffers.get(c.formule_nom)!;row.clients+=1;row.hectares+=Number(c.total_hectares||0);});
      setOfferPerformance([...officialOffers.values()].filter((x:any)=>x.clients>0).sort((a,b)=>b.clients-a.clients));

      if (canCommercialTeamPerformance || canTechnicalTeamPerformance) {
        const profileByUser = new Map(directory.map((p: any) => [p.user_id, p]));
        const profileById = new Map(directory.map((p: any) => [p.id, p]));
        const memberRows = (teamMembersRes.data || []) as any[];
        const teamsByMember = new Map<string, Set<string>>();
        const memberIdsByTeam = new Map<string, Set<string>>();
        const teamTypeById = new Map<string, string>(teamRows.map((team: any) => [String(team.id), String(team.type_equipe || "").toLowerCase()]));
        memberRows.forEach((member: any) => {
          if (!member.equipe_id || !member.profile_id) return;
          const profile = (profileById.get(member.profile_id) || profileByUser.get(member.profile_id)) as any;
          const keys = new Set([String(member.profile_id), String(profile?.id || ""), String(profile?.user_id || "")].filter(Boolean));
          const memberSet = memberIdsByTeam.get(String(member.equipe_id)) || new Set<string>();
          memberSet.add(String(member.profile_id));
          memberIdsByTeam.set(String(member.equipe_id), memberSet);
          keys.forEach((id) => {
            if (!teamsByMember.has(id)) teamsByMember.set(id, new Set<string>());
            teamsByMember.get(id)!.add(String(member.equipe_id));
          });
        });
        const membersByTeam = new Map<string, number>([...memberIdsByTeam.entries()].map(([teamId, ids]) => [teamId, ids.size]));
        const teamMap = new Map<string, any>();
        const assignedClientIdsByTeam = new Map<string, Set<string>>();
        if (canCommercialTeamPerformance) commercialClients.forEach((cl: any) => {
          // Un dossier commercial n'est attribué qu'aux équipes commerciales, jamais aux équipes techniques.
          const responsibleId = cl.commercial_id || cl.created_by;
          const profile = (profileByUser.get(responsibleId) || profileById.get(responsibleId)) as any;
          const teamIds = teamsByMember.get(String(responsibleId || "")) || teamsByMember.get(String(profile?.id || "")) || teamsByMember.get(String(profile?.user_id || "")) || new Set<string>();
          teamIds.forEach((teamId) => {
            if (teamTypeById.get(teamId) !== "commercial") return;
            const key="commercial:"+teamId;
            const row=teamMap.get(key)||{key,teamId,type:"commercial",nom:teamNameById.get(teamId)||"Équipe commerciale",clients:0,hectares:0,interventions:0,members:membersByTeam.get(teamId)||0};
            const assigned = assignedClientIdsByTeam.get(teamId) || new Set<string>();
            if (!assigned.has(String(cl.id))) {
              assigned.add(String(cl.id));
              row.clients += 1;
              // Priorité aux hectares des acquisitions actives; repli sur la superficie client enregistrée.
              row.hectares += activeAcquisitionAreaByClient.get(cl.id) || Math.max(0, Number(cl.total_hectares || 0));
            }
            assignedClientIdsByTeam.set(teamId, assigned);
            teamMap.set(key,row);
          });
        });
        if (canTechnicalTeamPerformance) interventions.forEach((i: any) => {
          const profile = (profileById.get(i.agent_technique_id) || profileByUser.get(i.agent_technique_id)) as any;
          const teamIds = teamsByMember.get(String(i.agent_technique_id)) || teamsByMember.get(String(profile?.id || "")) || teamsByMember.get(String(profile?.user_id || "")) || new Set<string>();
          teamIds.forEach((teamId) => {
            if (teamTypeById.get(teamId) !== "technique") return;
            const key="technique:"+teamId;
            const row=teamMap.get(key)||{key,teamId,type:"technique",nom:teamNameById.get(teamId)||"Équipe technique",clients:0,hectares:0,interventions:0,members:membersByTeam.get(teamId)||0};
            row.interventions+=1;
            teamMap.set(key,row);
          });
        });
        setTeamPerformance([...teamMap.values()].sort((a,b)=>(b.clients+b.interventions)-(a.clients+a.interventions)).slice(0,10));
      }

      // Le pilotage technique couvre toutes les plantations et tous les parcours visibles,
      // y compris les bénéficiaires particuliers ayant une intervention enregistrée.
      const technicalClients = allExternalClients.filter((c: any) =>
        /^(AC_C|AC_B)/i.test(String(c.id_unique || "").trim()) &&
        c.compte_actif === true &&
        !["archive", "supprime", "supprimé"].includes(String(c.statut_global || "").toLowerCase()) &&
        Boolean(c.paiement_initial_paye_at || c.pi_paye_at)
      );
      const technicalClientIds = new Set([
        ...technicalClients.map((c: any) => c.id).filter(Boolean),
        ...interventions.map((i: any) => i.client_id).filter(Boolean),
      ]);

      const cycleTypes = [
        ["validation_parcelle", "Parcelles validées"],
        ["defrichage", "Défrichage réalisé"],
        ["piquetage", "Piquetage réalisé"],
        ["trouaison", "Trouaison réalisée"],
        ["mise_en_terre", "Mise en terre réalisée"],
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
      scopedPlantations.forEach((p: any) => {
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
        const mPlant = scopedPlantations.filter((p: any) => {
          const dt = new Date(p.date_plantation || p.date_activation || p.created_at);
          return dt >= d && dt <= end;
        }).reduce((s: number, p: any) => s + Number(p.surface_reellement_plantee ?? p.superficie_activee ?? 0), 0);
        const mPay = commercialValidPayments.filter((p: any) => {
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
      const technicalAlerts = scopedPlantations.filter((p: any) => p.statut_global !== "en_production" && (p.alerte_non_paiement || p.alerte_visite_retard));
      if (canTechnical && technicalAlerts.length) newAlerts.push({ type: "warning", message: `${technicalAlerts.length} plantation(s) nécessitent une intervention`, href: "/plantations" });
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
          count: commercialClients.filter((client: any) => {
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
  }, [canClients, canLeads, canOwners, canParcelles, canPlantations, canPayments, canFinance, canTechnical, canCommissions, canPortfolios, globalAdmin, canCommercialTeamPerformance, canTechnicalTeamPerformance]);

  useEffect(() => { void fetchStats(false); }, [fetchStats]);
  const refreshSilently = useCallback(() => { void fetchStats(true); }, [fetchStats]);
  useRealtime({ table: "clients", onChange: refreshSilently });
  useRealtime({ table: "plantations", onChange: refreshSilently });
  useRealtime({ table: "paiements", onChange: refreshSilently });
  useRealtime({ table: "interventions_techniques", onChange: refreshSilently });
  useRealtime({ table: "commissions", onChange: refreshSilently });
  useRealtime({ table: "portefeuilles", onChange: refreshSilently });
  useRealtime({ table: "leads", onChange: refreshSilently });
  useRealtime({ table: "promotions", onChange: refreshSilently });
  useRealtime({ table: "documents_acquisition", onChange: refreshSilently });
  useRealtime({ table: "parcelles", onChange: refreshSilently });
  useRealtime({ table: "proprietaires_terres", onChange: refreshSilently });
  useRealtime({ table: "conventions_foncieres", onChange: refreshSilently });
  useRealtime({ table: "independent_service_customers", onChange: refreshSilently });
  useRealtime({ table: "independent_service_proformas", onChange: refreshSilently });

  const progress = stats.engagedHa > 0 ? Math.min(100, Math.round((stats.plantedHa / stats.engagedHa) * 100)) : 0;
  const roleLabel = userRoles.map((r) => ROLE_SHORT_LABELS[r] || r).join(" / ");

  const kpis: any[] = [
    { label:"Pilotage financier", icon:Wallet, href:"/finance", show:canDashboardExecutiveFinance, metrics:[
      {label:"CA prévisionnel",value:money(stats.forecastRevenue),href:"/finance"},
      {label:"Encaissé",value:money(stats.collected),href:"/finance"},
      {label:"À encaisser",value:money(stats.dueAmount),href:"/finance"},
      {label:"Clients soldés",value:stats.settledClients,href:"/finance"},
      {label:"Monnaie client",value:money(stats.clientCredit),href:"/finance"},
      ...(canViewIndependentServiceProformas ? [{label:"Prestations indépendantes engagées",value:money(stats.independentServicePipelineAmount),href:"/acquisitions/prestations-independantes"}] : []),
      {label:"Échéances en retard",value:stats.overdueCount,href:"/finance"},
    ]},
    { label:"Développement commercial", icon:Target, href:canLeads ? "/leads" : "/acquisitions", show:canClients || canLeads, metrics:[
      ...(canClients ? [
        {group:"Clients",label:"Clients",shortLabel:"Clients",value:stats.clients,href:"/acquisitions"},
        {group:"Clients",label:"Clients actifs (sur "+stats.clients+" clients)",shortLabel:"Actifs / "+stats.clients,value:stats.clientsActive,href:"/clients"},
        {group:"Clients",label:"Clients en retard",shortLabel:"En retard",value:stats.clientsOverdue,href:canPayments ? "/paiements" : "/clients"},
        {group:"Clients",label:"Clients suspendus",shortLabel:"Suspendus",value:stats.clientsSuspended,href:"/clients"},
        {group:"Clients",label:"Clients soldés",shortLabel:"Soldés",value:stats.settledClients,href:canPayments ? "/paiements" : "/clients"},
        ...(canViewIndependentServiceCustomers ? [{group:"Clients",label:"Client indépendant",shortLabel:"Indépendants",value:stats.independentCustomers,href:"/acquisitions/prestations-independantes"}] : [])
      ] : []),
    ]},
    { label:"Domaine foncier et partenariat", icon:LandPlot, href:"/proprietaires-terres", show:canOwners || canParcelles || canPlantations, metrics:[
      ...(canOwners ? [{label:"Propriétaires",value:stats.proprietaires,href:"/proprietaires-terres"}] : []),
      ...(canParcelles || canPlantations ? [
        {label:"Parcelles partenaires",value:stats.proprietaireParcelles,href:"/parcelles"},
        {label:"Surface partenaire",value:num(stats.partnershipTotalHa)+" ha",href:"/parcelles"},
        {label:"Surface plantée",value:num(stats.partnershipPlantedHa)+" ha",href:"/plantations"},
        {label:"Surface restante",value:num(stats.partnershipRemainingHa)+" ha",href:"/parcelles"},
      ] : []),
    ]},
    { label:"Exploitation agricole", icon:Sprout, href:"/plantations", show:canPlantations, metrics:[
      {label:"Plantations",value:stats.plantations,href:"/plantations"},
      {label:"Surface engagée",value:num(stats.engagedHa)+" ha",href:"/acquisitions"},
      {label:"Surface plantée",value:num(stats.plantedHa)+" ha",href:"/plantations"},
      {label:"Surface restante",value:num(stats.remainingHa)+" ha",href:"/plantations"},
      ...(canViewIndependentServiceProformas ? [{label:"Prestations indépendantes",value:stats.independentProformas,href:"/acquisitions/prestations-independantes"}] : []),
    ]},
  ];

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="min-w-0 space-y-5 animate-fade-in">
          <div className="rounded-2xl bg-gradient-to-r from-primary to-primary/80 p-2.5 sm:p-6 text-primary-foreground shadow-lg">
            <div className="flex flex-row items-center gap-2 sm:gap-4">
              <div className="relative shrink-0">
                <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full p-0.5 bg-gradient-to-br from-amber-400 via-transparent to-primary">
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
                <h1 className="text-sm leading-tight font-bold sm:text-2xl lg:text-3xl sm:leading-normal">Bienvenue, <span className="text-accent font-extrabold drop-shadow-sm">{formatWelcomeName(profile?.nom_complet)}</span></h1>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] sm:mt-2 sm:gap-2 sm:text-sm text-primary-foreground/90">
                  <Badge variant="secondary" className="max-w-full truncate px-2 py-0.5 text-[10px] sm:text-xs">{roleLabel || "Utilisateur"}</Badge>
                  <span className="whitespace-nowrap">Connecté à {connectionTime}</span>
                  <span className="hidden opacity-70 sm:inline">•</span>
                  <Button variant="secondary" size="icon" className="ml-auto h-7 w-7 shrink-0 sm:hidden" aria-label="Actualiser le tableau de bord" title="Actualiser" onClick={() => void fetchStats(false)} disabled={loading}>
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
              <Button variant="secondary" size="sm" className="hidden sm:inline-flex" onClick={() => void fetchStats(false)} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
              </Button>
            </div>
          </div>

          {!isClientOnly && (
            <div className="grid w-full min-w-0 grid-cols-2 items-stretch gap-2 md:grid-cols-6">
              {canCreateAcquisition && <Button asChild className="h-auto min-h-11 w-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs sm:text-sm"><Link className="flex min-w-0 w-full items-center justify-center gap-1.5 whitespace-normal break-words text-center leading-tight" to="/nouvelle-acquisition"><Plus className="h-4 w-4 shrink-0" /><span>Nouveau client</span></Link></Button>}
              <Button asChild variant="outline" className="h-auto min-h-11 w-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs sm:text-sm"><Link className="flex min-w-0 w-full items-center justify-center gap-1.5 whitespace-normal break-words text-center leading-tight" to="/leads?new=1&type=prospect"><Plus className="h-4 w-4 shrink-0" /><span>Nouveau prospect</span></Link></Button>
              {canLeads && <Button asChild variant="outline" className="h-auto min-h-11 w-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs sm:text-sm"><Link className="flex min-w-0 w-full items-center justify-center gap-1.5 whitespace-normal break-words text-center leading-tight" to="/leads?new=1"><Plus className="h-4 w-4 shrink-0" /><span>Nouveau lead</span></Link></Button>}
              {canPayments && <Button asChild variant="outline" className="h-auto min-h-11 w-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs sm:text-sm"><Link className="flex min-w-0 w-full items-center justify-center gap-1.5 whitespace-normal break-words text-center leading-tight" to="/paiements"><CreditCard className="h-4 w-4 shrink-0" /><span>Paiement</span></Link></Button>}
              {canPlantations && <Button asChild variant="outline" className="h-auto min-h-11 w-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs sm:text-sm"><Link className="flex min-w-0 w-full items-center justify-center gap-1.5 whitespace-normal break-words text-center leading-tight" to="/plantations"><Sprout className="h-4 w-4 shrink-0" /><span>Plantations</span></Link></Button>}
              {canValidateDocuments && <Button asChild variant="outline" className="h-auto min-h-11 w-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs sm:text-sm"><Link className="flex min-w-0 w-full items-center justify-center gap-1.5 whitespace-normal break-words text-center leading-tight" to="/acquisitions/validation"><FileCheck className="h-4 w-4 shrink-0" /><span>Dossier à valider</span></Link></Button>}
            </div>
          )}

          {!isClientOnly && (
            <>
              <section aria-label="Indicateurs de pilotage" className="min-w-0 space-y-5">
                {kpis.filter((k) => k.show && k.metrics.length > 0).map((k) => {
                  const Icon = k.icon;
                  return (
                    <div key={k.label} className={`min-w-0 rounded-2xl border-2 p-2.5 sm:p-3 ${k.label === "Pilotage financier" ? "border-amber-500/70 bg-amber-50/20 dark:bg-amber-950/10" : k.label === "Développement commercial" ? "border-orange-500/70 bg-orange-50/20 dark:bg-orange-950/10" : k.label === "Domaine foncier et partenariat" ? "border-emerald-600/70 bg-emerald-50/20 dark:bg-emerald-950/10" : "border-violet-500/70 bg-violet-50/20 dark:bg-violet-950/10"}`}>
                      <h2 className="mb-3 flex items-center gap-2.5 text-base font-extrabold uppercase tracking-wide text-foreground sm:text-lg">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/80 text-primary shadow-sm">
                          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                        </span>
                        {k.label}
                      </h2>
                      {k.label === "Développement commercial" ? (
                        <div className="crm-compact-kpi-grid crm-compact-kpi-grid--commercial grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,92px),1fr))] gap-1.5 sm:gap-2 lg:grid-cols-[repeat(auto-fit,minmax(min(100%,112px),1fr))]">
                          {k.metrics.map((metric: any) => (
                            <Link key={metric.label} to={metric.href || k.href} className="group flex min-h-[64px] min-w-0 flex-col justify-between rounded-lg border border-border/70 bg-card/95 p-1.5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-2">
                              <span title={metric.label} className="block min-w-0 truncate whitespace-nowrap text-[9px] leading-tight text-muted-foreground sm:text-[10px]">{metric.shortLabel || metric.label}</span>
                              <span className="mt-1 block min-w-0 whitespace-nowrap text-xs font-bold leading-tight tabular-nums text-foreground sm:text-sm">{loading ? "…" : metric.value}</span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,92px),1fr))] gap-1.5 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,112px),1fr))] sm:gap-2 xl:grid-cols-[repeat(auto-fit,minmax(min(100%,124px),1fr))]">
                          {k.metrics.map((metric: any) => (
                            <div key={metric.label} className="flex min-h-[56px] min-w-0 flex-col justify-between rounded-lg border border-border/70 bg-card/95 p-1.5 shadow-sm sm:p-2">
                              <span className={`min-w-0 text-[9px] leading-tight text-muted-foreground sm:text-[11px] ${k.label === "Pilotage financier" ? "whitespace-nowrap" : ""}`}>{k.label === "Pilotage financier" && metric.label === "CA prévisionnel" ? <><span className="sm:hidden">CA prév.</span><span className="hidden sm:inline">{metric.label}</span></> : metric.label}</span>
                              <span className={`mt-1 block min-w-0 text-xs font-bold leading-tight tabular-nums text-foreground sm:text-base ${k.label === "Pilotage financier" ? "whitespace-nowrap text-[10px] sm:text-sm" : "break-words"}`}>{loading ? "…" : metric.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>

              {canPlantations && stats.plantations > 0 && cycle.some((c: any) => c.total > 0) && (
                <section aria-labelledby="dashboard-operations" className="space-y-3 rounded-2xl border-2 border-sky-500/60 bg-sky-50/20 p-3 sm:p-4 dark:bg-sky-950/10">
                  <div><h2 id="dashboard-operations" className="text-lg font-extrabold uppercase tracking-wide">Opérations et suivi technique</h2></div>
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Tractor className="h-5 w-5 text-primary" />Parcours de plantation</CardTitle></CardHeader>
                    <CardContent className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 sm:gap-x-4 md:grid-cols-1">
                      {cycle.map((c, index) => (
                        <div key={c.label} className={`min-w-0 ${index === cycle.length - 1 ? "col-span-2 md:col-span-1" : ""}`}>
                          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 text-sm"><span className="min-w-0">{c.label}</span><span className="font-medium tabular-nums whitespace-nowrap">{c.done} / {c.total} dossiers · {c.pct}%</span></div>
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
                </section>
              )}

              <section aria-labelledby="dashboard-performance" className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border-2 border-violet-500/60 bg-violet-50/20 p-3 md:grid-cols-2 xl:grid-cols-3 sm:p-4 dark:bg-violet-950/10">
                <div className="md:col-span-2 xl:col-span-3"><h2 id="dashboard-performance" className="text-lg font-extrabold uppercase tracking-wide">Performance et répartition</h2></div>
{teamPerformance.length > 0 && (
                <Card>
                  <CardHeader className="px-3 pb-1 pt-3"><CardTitle className="text-sm flex items-center gap-2"><Award className="h-4 w-4 text-primary" />Équipes</CardTitle></CardHeader>
                  <CardContent className="p-3 pt-1"><div className="responsive-auto-grid">{teamPerformance.map((team) => (
                    <div key={team.key} className="rounded-lg border p-2"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{team.nom}</p><p className="text-xs text-muted-foreground">{team.type === "commercial" ? "Équipe commerciale" : "Équipe technique"}</p></div><Badge variant="secondary">{team.type === "commercial" ? team.clients+" client(s)" : team.interventions+" intervention(s)"}</Badge></div>{team.type === "commercial" && <p className="mt-1 text-xs text-muted-foreground">{num(team.hectares)} ha</p>}<div className="my-2 border-t border-border" role="separator" /><div className="flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">Membres de l’équipe</span><span className="font-semibold tabular-nums">{team.members}</span></div></div>
                  ))}</div></CardContent>
                </Card>
              )}

              {offerPerformance.length > 0 && canClients && <Card>
                <CardHeader className="px-3 pb-1 pt-3"><CardTitle className="text-sm flex items-center gap-2"><Award className="h-4 w-4 text-primary" />Par offre</CardTitle></CardHeader>
                <CardContent className="px-2 pb-2 pt-0"><ResponsiveContainer width="100%" height={Math.max(105, Math.min(155, offerPerformance.length * 25))}><BarChart data={offerPerformance} layout="vertical" margin={{ left: 0, right: 4, top: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={74} tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="clients" name="Clients" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></CardContent>
              </Card>}

              {(canClients || canFinance) && stats.activeContracts > 0 && (
                <Card>
                  <CardHeader className="px-3 pb-1 pt-3"><CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" />État des dossiers</CardTitle></CardHeader>
                  <CardContent className="p-3 pt-1">
                    <div className={canFinance ? "grid grid-cols-2 md:grid-cols-4 gap-2" : "grid grid-cols-3 gap-2"}>
                      {canClients && <>
                        <div className="rounded-lg bg-muted/50 p-2"><p className="text-[11px] leading-tight text-muted-foreground">Actifs</p><p className="mt-1 text-lg font-bold leading-tight">{stats.activeContracts}</p></div>
                        <div className="rounded-lg bg-muted/50 p-2"><p className="text-[11px] leading-tight text-muted-foreground">En installation</p><p className="mt-1 text-lg font-bold leading-tight">{stats.installationContracts}</p></div>
                        <div className="rounded-lg bg-muted/50 p-2"><p className="text-[11px] leading-tight text-muted-foreground">En production</p><p className="mt-1 text-lg font-bold leading-tight">{stats.productionContracts}</p></div>
                      </>}
                      {canFinance && <>
                        
                        <div className="rounded-lg bg-muted/50 p-2"><p className="text-[11px] leading-tight text-muted-foreground">Paiement moyen</p><p className="mt-1 text-lg font-bold leading-tight">{stats.avgDaysRemaining == null && stats.avgProgress === 0 ? "—" : stats.avgProgress + "%"}</p></div>
                      </>}
                    </div>
                  </CardContent>
                </Card>
              )}

              </section>

              {(canPlantations || canClients || canPayments || canTechnical || canLeads) && (
              <section aria-labelledby="dashboard-activity" className="space-y-3 rounded-2xl border-2 border-amber-500/60 bg-amber-50/20 p-3 sm:p-4 dark:bg-amber-950/10">
                <div><h2 id="dashboard-activity" className="text-lg font-extrabold uppercase tracking-wide">Activités récentes et carte interactive</h2></div>
              {canPlantations && <PlantationsMap />}

              {((canClients && recentClients.length > 0) || (canPayments && recentPayments.length > 0)) && (
              <div className="rounded-xl border border-orange-500/50 p-2.5 sm:p-3">
                <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide">Clients et paiements récents</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {canClients && recentClients.length > 0 && (
                  <Card>
                    <CardHeader className="px-3 py-2"><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"><CardTitle className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm sm:text-base"><Users className="h-4 w-4 shrink-0 text-primary" />Clients récents</CardTitle><div className="w-full min-w-0 sm:w-44 sm:shrink sm:max-w-[11rem]"><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher un client" /></div></div></CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="h-8 px-2 py-1.5">Nom</TableHead><TableHead className="h-8 px-2 py-1.5">Plantations</TableHead><TableHead className="h-8 px-2 py-1.5">Statut</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {filteredRecentClients.length ? filteredRecentClients.map((c) => (
                            <TableRow key={c.id_unique}>
                              <TableCell className="px-2 py-1.5 text-xs font-medium sm:text-sm">{c.nom_complet}</TableCell>
                              <TableCell className="px-2 py-1.5 text-xs sm:text-sm">{c.nombre_plantations || 0}</TableCell>
                              <TableCell className="px-2 py-1.5">{(() => { const status = String(c.statut || "actif").toLowerCase(); const label = status === "actif" ? "Actif" : status === "suspendu" ? "Suspendu" : status === "archive" ? "Archivé" : status === "inactif" ? "Inactif" : status; const display = c.contrat_solde_at ? "Soldé" : label; const className = c.contrat_solde_at ? "whitespace-nowrap border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50" : status === "actif" ? "whitespace-nowrap border-emerald-200 bg-emerald-100/70 text-emerald-800 hover:bg-emerald-100/70" : status === "en_retard" || status === "retard" ? "whitespace-nowrap border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100" : "whitespace-nowrap"; return <Badge variant={c.contrat_solde_at || status === "actif" ? "outline" : status === "suspendu" ? "destructive" : "secondary"} className={className}>{display}</Badge>; })()}</TableCell>
                            </TableRow>
                          )) : <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Aucun client accessible.</TableCell></TableRow>}
                        </TableBody></Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {canPayments && recentPayments.length > 0 && (
                  <Card>
                    <CardHeader className="px-3 py-2"><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"><CardTitle className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm sm:text-base"><CreditCard className="h-4 w-4 shrink-0 text-primary" />Paiements récents</CardTitle><div className="w-full min-w-0 sm:w-44 sm:shrink sm:max-w-[11rem]"><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher un paiement" /></div></div></CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="h-8 px-2 py-1.5">Client</TableHead><TableHead className="h-8 px-2 py-1.5">Montant</TableHead><TableHead className="h-8 px-2 py-1.5">Mode</TableHead><TableHead className="h-8 px-2 py-1.5">Statut</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {filteredRecentPayments.length ? filteredRecentPayments.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="px-2 py-1.5 text-xs font-medium sm:text-sm">{p.client_nom}</TableCell>
                              <TableCell className="whitespace-nowrap px-2 py-1.5 text-xs sm:text-sm">{money(Number(p.montant_paye ?? p.montant ?? 0))}</TableCell>
                              <TableCell className="whitespace-nowrap px-2 py-1.5 text-xs">{(["content", "comptant", "cash", "espèces", "especes"].includes(String(p.mode_paiement || "").trim().toLowerCase()) ? "Cash" : p.mode_paiement || "—")}</TableCell>
                              <TableCell className="px-2 py-1.5"><Badge variant="outline" className="whitespace-nowrap border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Validé</Badge></TableCell>
                            </TableRow>
                          )) : <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Aucun paiement validé dans votre périmètre.</TableCell></TableRow>}
                        </TableBody></Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
              </div>
              )}

              {((canPayments || canTechnical || canLeads || canClients) || (canPlantations && regional.length > 0)) && (
              <div className="rounded-xl border border-emerald-600/50 p-2.5 sm:p-3">
                <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide">À traiter et indicateurs terrain</h3>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
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


              </div>

              {canTechnical && cycle.some((c: any) => c.total > 0) && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Tractor className="h-5 w-5 text-primary" />Pilotage technique</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-3">
                      {cycle.map((c) => <div key={c.label} className="min-w-0 rounded-xl border p-2 sm:p-3"><p className="text-[10px] leading-tight text-muted-foreground sm:text-xs">{c.label}</p><p className="mt-1 text-base font-bold sm:text-lg">{c.pct}%</p><p className="text-[10px] leading-tight text-muted-foreground sm:text-xs">{c.done}/{c.total} terminées</p></div>)}
                    </div>
                  </CardContent>
                </Card>
              )}
              </div>
              )}
              </section>
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
