import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, CheckCircle2, ClipboardList, FileClock, RefreshCw, ShieldCheck, Sprout, Users, Wallet, Plus, XCircle, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Row = Record<string, any>;
type Proposal = Row & { id: string; title: string; category: string; status: string; summary: string; rationale: string; proposed_action: string; amount: number | null; priority: string; created_at: string; created_by: string };
type Financing = Row & { id: string; provider_name: string; product_name: string; nominal_annual_rate: number; fees: number; insurance_monthly: number; source_url: string | null; observed_at: string; valid_until: string | null; is_active: boolean };
const db = supabase as any;
const money = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(Number(value || 0));
const count = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Number(value || 0));
const labels: Record<string, string> = { draft: "Brouillon", proposed: "Proposée", in_review: "À examiner", approved: "Approuvée", rejected: "Rejetée", modified: "Modifiée", executed: "Exécutée", closed: "Clôturée", cancelled: "Annulée" };
const categories: Record<string, string> = { financing: "Financement", investment: "Investissement", staffing: "Effectifs", training: "Formation", organization: "Organisation", operations: "Opérations", land: "Foncier", commercial: "Commercial", technical: "Technique", other: "Autre" };
const statusColor = (status: string) => status === "approved" || status === "executed" ? "default" : status === "rejected" || status === "cancelled" ? "destructive" : "secondary";

function IntelligenceContent({ embedded = false }: { embedded?: boolean }) {
  const { user, userRoles } = useAuth();
  const navigate = useNavigate();
  const [accessChecked, setAccessChecked] = useState(false);
  const [accessAllowed, setAccessAllowed] = useState(false);
  const executive = userRoles.some(role => /pdg|président|president|directeur général|directeur general|(^|\W)dg($|\W)|admin/i.test(role));
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [financing, setFinancing] = useState<Financing[]>([]);
  const [transactions, setTransactions] = useState<Row[]>([]);
  const [budgets, setBudgets] = useState<Row[]>([]);
  const [clients, setClients] = useState<Row[]>([]);
  const [landOwners, setLandOwners] = useState<Row[]>([]);
  const [parcels, setParcels] = useState<Row[]>([]);
  const [plantations, setPlantations] = useState<Row[]>([]);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [reviews, setReviews] = useState<Row[]>([]);
  const [people, setPeople] = useState<Row[]>([]);
  const [grants, setGrants] = useState<Row[]>([]);
  const [audit, setAudit] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [proposalOpen, setProposalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [grantUser, setGrantUser] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [visibilityScope, setVisibilityScope] = useState("executive");
  const [grantPermissions, setGrantPermissions] = useState("view,create");
  const [saving, setSaving] = useState(false);
  const [loanAmount, setLoanAmount] = useState("10000000");
  const [loanMonths, setLoanMonths] = useState("36");
  const [loanRateId, setLoanRateId] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("operations");
  const [summary, setSummary] = useState("");
  const [rationale, setRationale] = useState("");
  const [action, setAction] = useState("");
  const [amount, setAmount] = useState("");
  const [priority, setPriority] = useState("normal");
  const [reason, setReason] = useState("");
  const [rateProvider, setRateProvider] = useState("");
  const [rateProduct, setRateProduct] = useState("");
  const [rateNominal, setRateNominal] = useState("");
  const [rateEffective, setRateEffective] = useState("");
  const [rateFees, setRateFees] = useState("0");
  const [rateInsurance, setRateInsurance] = useState("0");
  const [rateUrl, setRateUrl] = useState("");
  const [rateValidUntil, setRateValidUntil] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const results = await Promise.all([
      db.from("decision_proposals").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(250),
      db.from("decision_financing_sources").select("*").eq("is_active", true).order("observed_at", { ascending: false }).limit(100),
      db.from("finance_transactions").select("*").limit(5000),
      db.from("department_budgets").select("*").limit(2000),
      db.from("clients").select("id,id_unique,type_client,is_internal,nom_complet,total_hectares,nombre_plantations,parcelle_id,statut,statut_global,created_at").limit(5000),
      db.from("proprietaires_terres").select("*").limit(2000),
      db.from("parcelles").select("*").limit(5000),
      db.from("workspace_tasks").select("*").limit(3000),
      db.from("workspace_projects").select("*").limit(1000),
      db.from("workspace_performance_reviews").select("*").limit(1000),
      db.from("profiles").select("id,user_id,nom_complet,email,poste,departement,region_id,district_id,actif").eq("actif", true).limit(1000),
      db.from("decision_access_grants").select("*").is("revoked_at", null),
      db.from("decision_center_audit").select("*").order("created_at", { ascending: false }).limit(50),
      db.from("plantations").select("id,parcelle_id,superficie_ha,superficie_activee,surface_reellement_plantee,statut_global").limit(10000),
    ]);
    const [p,f,t,b,c,l,pa,ta,pr,re,pe,g,au,pl] = results;
    const critical = [p, f, t, b, c, l, pa, ta, pr, re, pe, g, au, pl].find(x => x.error && !/permission|row-level security|not exist|schema cache/i.test(String(x.error.message)));
    if (critical) setError(critical.error.message);
    setProposals(p.data || []); setFinancing(f.data || []); setTransactions(t.data || []); setBudgets(b.data || []);
    setClients(c.data || []); setLandOwners(l.data || []); setParcels(pa.data || []); setPlantations(pl.data || []); setTasks(ta.data || []);
    setProjects(pr.data || []); setReviews(re.data || []); setPeople(pe.data || []); setGrants(g.data || []); setAudit(au.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const checkAccess = async () => {
      if (!user?.id) return;
      if (executive) { if (active) { setAccessAllowed(true); setAccessChecked(true); void load(); } return; }
      const { data: roleAccess, error: roleAccessError } = await db.rpc("can_access_decision_center", { required_permission: "view" });
      const { data, error: accessError } = await db.from("decision_access_grants").select("permissions").eq("user_id", user.id).is("revoked_at", null).maybeSingle();
      const allowed = (!roleAccessError && roleAccess === true) || (!accessError && Array.isArray(data?.permissions) && (data.permissions.includes("view") || data.permissions.includes("admin")));
      if (active) { setAccessAllowed(allowed); setAccessChecked(true); if (allowed) void load(); else { setLoading(false); navigate("/dashboard", { replace: true }); toast.error("Accès au centre de décision non autorisé. Demande une délégation au PDG/DG."); } }
    };
    void checkAccess();
    return () => { active = false; };
  }, [user?.id, executive, load, navigate]);

  const metrics = useMemo(() => {
    const valid = transactions.filter((r: Row) => !r.status || /valid|confirm|paid|payé|approuv/i.test(String(r.status)));
    const inflow = valid.filter((r: Row) => /entrée|entree|income|in|recette/i.test(String(r.direction || r.type || ""))).reduce((s: number, r: Row) => s + Number(r.amount || r.montant || 0), 0);
    const outflow = valid.filter((r: Row) => /sortie|expense|out|dépense|depense/i.test(String(r.direction || r.type || ""))).reduce((s: number, r: Row) => s + Number(r.amount || r.montant || 0), 0);
    const officialClients = clients.filter((r: Row) => /^AC[-_]C/i.test(String(r.id_unique || "").trim()) && r.is_internal !== true && String(r.type_client || "").toLowerCase() !== "beneficiaire_particulier");
    const hectaresClients = officialClients.filter((r: Row) => Number(r.total_hectares || 0) > 0).reduce((s: number, r: Row) => s + Number(r.total_hectares || 0), 0);
    const plantedByParcel = new Map<string, number>();
    plantations.forEach((r: Row) => {
      if (!r.parcelle_id) return;
      const planted = Math.max(0, Number(r.surface_reellement_plantee ?? r.superficie_activee ?? 0));
      plantedByParcel.set(String(r.parcelle_id), (plantedByParcel.get(String(r.parcelle_id)) || 0) + planted);
    });
    const hectaresLand = (() => {
      // Superficie non plantée de toutes les parcelles, quelle que soit la propriété.
      // Une parcelle est comptée une seule fois ; une attribution ne signifie pas que le sol est planté.
      const parcelAvailable = parcels.reduce((sum: number, r: Row) => {
        const total = Math.max(0, Number(r.surface_totale_ha || 0));
        const planted = Math.min(total, Math.max(0, plantedByParcel.get(String(r.id)) || 0));
        return sum + Math.max(0, total - planted);
      }, 0);
      const linkedParcelIds = new Set(parcels.map((r: Row) => String(r.id)));
      const clientOnlyArea = officialClients
        .filter((r: Row) => !r.parcelle_id && Number(r.total_hectares || 0) > 0)
        .filter((r: Row) => !plantations.some((p: Row) => p.client_id === r.id && p.parcelle_id && linkedParcelIds.has(String(p.parcelle_id))))
        .reduce((sum: number, r: Row) => {
          const planted = plantations.filter((p: Row) => p.client_id === r.id && !p.parcelle_id)
            .reduce((s: number, p: Row) => s + Math.max(0, Number(p.surface_reellement_plantee ?? p.superficie_activee ?? 0)), 0);
          return sum + Math.max(0, Number(r.total_hectares || 0) - planted);
        }, 0);
      return parcelAvailable + clientOnlyArea;
    })();
    return { inflow, outflow, net: inflow - outflow, hectaresClients, hectaresLand, activeClients: officialClients.length, proposalsOpen: proposals.filter(p => ["draft","proposed","in_review"].includes(p.status)).length, tasksOpen: tasks.filter(t => !/termin|clos|done|cancel/i.test(String(t.status || ""))).length, projectsOpen: projects.filter(p => !/termin|clos|done|cancel/i.test(String(p.status || ""))).length };
  }, [transactions, clients, landOwners, parcels, plantations, proposals, tasks, projects]);

  const recommendations = useMemo(() => {
    const items: { title: string; level: "high" | "normal"; rationale: string; action: string }[] = [];
    if (!transactions.length) items.push({ title: "Vérifier la couverture du journal financier", level: "high", rationale: "Aucune écriture financière n’est disponible dans le périmètre chargé ou accessible.", action: "Vérifier les droits, les écritures validées et la période avant toute décision de financement." });
    else if (metrics.net < 0) items.push({ title: "Examiner la pression sur la trésorerie", level: "high", rationale: `Les flux entrants/sortants chargés font apparaître un net de ${money(metrics.net)}.`, action: "Revoir les échéances, engagements, dépenses différables et encaissements confirmés avant tout nouvel emprunt." });
    const overruns = budgets.filter((b: Row) => Number(b.budget_revised ?? b.budget_initial ?? 0) > 0 && Number(b.actual_amount || 0) > Number(b.budget_revised ?? b.budget_initial ?? 0));
    if (overruns.length) items.push({ title: "Contrôler les dépassements budgétaires", level: "high", rationale: `${overruns.length} ligne(s) budgétaire(s) ont un réalisé supérieur au budget révisé ou initial.`, action: "Examiner la cause de l’écart, les engagements restant à payer et la justification de chaque dépassement." });
    const overdue = tasks.filter((t: Row) => t.due_at && new Date(t.due_at).getTime() < Date.now() && !/termin|clos|done|cancel/i.test(String(t.status || "")));
    if (overdue.length) items.push({ title: "Réviser les tâches échues", level: overdue.length > 5 ? "high" : "normal", rationale: `${overdue.length} tâche(s) semblent échues et non terminées selon leur date d’échéance et leur statut.`, action: "Confirmer les échéances, les responsables et les dépendances avant de réaffecter les ressources." });
    if (metrics.hectaresLand > 0) items.push({ title: "Évaluer les parcelles disponibles", level: "normal", rationale: `${count(metrics.hectaresLand)} ha sont déclarés disponibles dans les enregistrements de parcelles chargés.`, action: "Vérifier la situation juridique, l’accessibilité, la disponibilité réelle et les coûts avant de calculer une rentabilité." });
    if (!financing.length) items.push({ title: "Documenter les offres de financement", level: "normal", rationale: "Aucune offre bancaire active avec source n’est enregistrée dans le centre.", action: "Saisir une offre publiée, sa source HTTPS, son taux, ses frais, son assurance et sa date de validité avant de comparer les emprunts." });
    if (!reviews.length && people.length) items.push({ title: "Structurer les revues de performance", level: "normal", rationale: "Aucune revue de performance n’est disponible dans les données chargées pour les collaborateurs actifs.", action: "Organiser des entretiens et documenter les objectifs, moyens, formations et résultats avant toute décision RH." });
    if (budgets.length && budgets.every((b: Row) => Number(b.actual_amount || 0) === 0)) items.push({ title: "Vérifier le rapprochement des budgets et du journal", level: "normal", rationale: "Les lignes budgétaires chargées ne présentent pas de réalisé budgétaire renseigné.", action: "Contrôler les affectations validées entre écritures financières et budgets sans attribuer automatiquement des dépenses non reliées." });
    return items;
  }, [transactions, metrics, budgets, tasks, financing, reviews, people]);

  const selectedRate = financing.find(f => f.id === loanRateId);
  const loan = useMemo(() => {
    const principal = Math.max(0, Number(loanAmount) || 0);
    const months = Math.max(1, Math.min(360, Number(loanMonths) || 1));
    if (!selectedRate) return null;
    const annual = Number(selectedRate.nominal_annual_rate) / 100;
    const monthly = annual / 12;
    const payment = monthly === 0 ? principal / months : principal * monthly / (1 - Math.pow(1 + monthly, -months));
    const totalFees = Number(selectedRate.fees || 0);
    const insurance = Number(selectedRate.insurance_monthly || 0) * months;
    return { payment, total: payment * months + totalFees + insurance, interest: payment * months - principal, fees: totalFees, insurance, months, principal };
  }, [loanAmount, loanMonths, selectedRate]);

  const createProposal = async () => {
    if (!user?.id || !title.trim() || !summary.trim() || !action.trim()) { toast.error("Renseigne le titre, le résumé et l’action proposée."); return; }
    setSaving(true);
    const targetRoleResult = targetUserId ? await db.from("user_roles").select("role").eq("user_id", targetUserId).order("is_primary", { ascending: false }).limit(1) : { data: [] };
    const targetProfile = people.find(p => p.user_id === targetUserId);
    const payload = { title: title.trim(), category, summary: summary.trim(), rationale: rationale.trim(), proposed_action: action.trim(), amount: amount ? Number(amount) : null, priority, status: "proposed", created_by: user.id, updated_by: user.id, source_modules: ["finance","budget","clients","foncier","parcelles","workspace","rh"], target_user_id: targetUserId || null, target_role_code: targetRoleResult.data?.[0]?.role || null, visibility_scope: targetUserId ? visibilityScope : "executive", department_scope: targetProfile?.departement || null, region_scope_id: targetProfile?.region_id || null, district_scope_id: targetProfile?.district_id || null, source_snapshot: { captured_at: new Date().toISOString(), cash_inflows: metrics.inflow, cash_outflows: metrics.outflow, net_cashflow: metrics.net, clients: metrics.activeClients, client_hectares: metrics.hectaresClients, land_hectares_reported: metrics.hectaresLand, tasks_open: metrics.tasksOpen, projects_open: metrics.projectsOpen }, assumptions: { note: "Les données agrégées reflètent uniquement les enregistrements accessibles au compte et chargés dans cette session." }, risks: [], confidence: null };
    if (editingId) {
      const existing = proposals.find(p => p.id === editingId);
      const beforeState = existing || {};
      const editablePayload = { title: payload.title, category: payload.category, summary: payload.summary, rationale: payload.rationale, proposed_action: payload.proposed_action, amount: payload.amount, priority: payload.priority, updated_by: user.id, source_modules: payload.source_modules, source_snapshot: payload.source_snapshot, assumptions: payload.assumptions, risks: payload.risks };
      const { data, error: saveError } = await db.from("decision_proposals").update({ ...editablePayload, status: "modified", decision_reason: "Proposition modifiée par un utilisateur autorisé", updated_at: new Date().toISOString() }).eq("id", editingId).select("*").single();
      if (saveError) { toast.error("Modification refusée : " + saveError.message); setSaving(false); return; }
      await db.from("decision_approvals").insert({ proposal_id: editingId, action: "modified", actor_user_id: user.id, reason: "Mise à jour de la proposition", previous_status: existing?.status || null, new_status: "modified" });
      const { data: versionRows } = await db.from("decision_proposal_versions").select("version_number").eq("proposal_id", editingId).order("version_number", { ascending: false }).limit(1);
      await db.from("decision_proposal_versions").insert({ proposal_id: editingId, version_number: Number(versionRows?.[0]?.version_number || 0) + 1, snapshot: data, changed_by: user.id, change_reason: "Modification de la proposition" });
      await db.from("decision_center_audit").insert({ actor_user_id: user.id, entity_type: "proposal", entity_id: editingId, action: "updated", before_state: beforeState, after_state: data, reason: "Modification de la proposition" });
      toast.success("Modification enregistrée et versionnée.");
    } else {
      const { data, error: saveError } = await db.from("decision_proposals").insert(payload).select("*").single();
      if (saveError) { toast.error("Enregistrement refusé : " + saveError.message); setSaving(false); return; }
      await db.from("decision_approvals").insert({ proposal_id: data.id, action: "submitted", actor_user_id: user.id, reason: "Création de la proposition", new_status: "proposed" });
      await db.from("decision_center_audit").insert({ actor_user_id: user.id, entity_type: "proposal", entity_id: data.id, action: "created", after_state: data, reason: "Création de proposition" });
      await db.from("decision_proposal_versions").insert({ proposal_id: data.id, version_number: 1, snapshot: data, changed_by: user.id, change_reason: "Version initiale" });
      toast.success("Proposition enregistrée dans le registre.");
    }
    setEditingId(null); setTitle(""); setSummary(""); setRationale(""); setAction(""); setAmount(""); setTargetUserId(""); setVisibilityScope("executive"); setProposalOpen(false); setSaving(false); void load();
  };

  const changeStatus = async (proposal: Proposal, status: string) => {
    if (!user?.id) return;
    if (!executive && !grants.some(g => g.user_id === user.id && (g.permissions || []).some((p: string) => ["approve","manage","admin"].includes(p)))) { toast.error("Cette décision nécessite une autorisation d’approbation."); return; }
    const why = reason.trim();
    if (!why) { toast.error("Ajoute un motif obligatoire pour tracer la décision."); return; }
    setSaving(true);
    const before = { status: proposal.status, decision_reason: proposal.decision_reason };
    const patch = { status, updated_by: user.id, decided_by: user.id, decided_at: new Date().toISOString(), decision_reason: why, ...(status === "executed" ? { executed_at: new Date().toISOString() } : {}) };
    const { error: updateError } = await db.from("decision_proposals").update(patch).eq("id", proposal.id);
    if (updateError) { toast.error("Décision non enregistrée : " + updateError.message); setSaving(false); return; }
    const actionName = status === "approved" ? "approved" : status === "rejected" ? "rejected" : status === "modified" ? "modified" : status === "executed" ? "executed" : status === "closed" ? "closed" : "cancelled";
    await db.from("decision_approvals").insert({ proposal_id: proposal.id, action: actionName, actor_user_id: user.id, reason: why, previous_status: proposal.status, new_status: status });
    const { data: versionRows } = await db.from("decision_proposal_versions").select("version_number").eq("proposal_id", proposal.id).order("version_number", { ascending: false }).limit(1);
    await db.from("decision_proposal_versions").insert({ proposal_id: proposal.id, version_number: Number(versionRows?.[0]?.version_number || 0) + 1, snapshot: { ...proposal, ...patch }, changed_by: user.id, change_reason: why });
    await db.from("decision_center_audit").insert({ actor_user_id: user.id, entity_type: "proposal", entity_id: proposal.id, action: actionName, before_state: before, after_state: patch, reason: why });
    setReason(""); toast.success("Décision et historique enregistrés."); setSaving(false); void load();
  };

  const editProposal = (p: Proposal) => {
    setEditingId(p.id); setTitle(p.title); setCategory(p.category); setSummary(p.summary || ""); setRationale(p.rationale || ""); setAction(p.proposed_action || ""); setAmount(p.amount == null ? "" : String(p.amount)); setPriority(p.priority || "normal"); setProposalOpen(true);
  };
  const deleteProposal = async (p: Proposal, reasonOverride?: string) => {
    if (!user?.id || !executive) return;
    const why = (reasonOverride ?? reason).trim();
    if (!why) { toast.error("Indique un motif avant l’archivage traçable."); return; }
    const beforeState = { id: p.id, status: p.status, title: p.title };
    const { error: deleteError } = await db.from("decision_proposals").update({ deleted_at: new Date().toISOString(), updated_by: user.id, updated_at: new Date().toISOString(), decision_reason: why }).eq("id", p.id);
    if (deleteError) { toast.error("Archivage refusé : " + deleteError.message); return; }
    await db.from("decision_center_audit").insert({ actor_user_id: user.id, entity_type: "proposal", entity_id: p.id, action: "soft_deleted", before_state: beforeState, after_state: { deleted_at: new Date().toISOString() }, reason: why });
    await db.from("decision_approvals").insert({ proposal_id: p.id, action: "cancelled", actor_user_id: user.id, reason: why, previous_status: p.status, new_status: "cancelled" });
    setReason(""); toast.success("Proposition archivée ; la trace d’audit est conservée."); void load();
  };

  const saveFinancingSource = async () => {
    if (!user?.id || !rateProvider.trim() || !rateProduct.trim() || rateNominal === "" || !rateUrl.trim()) { toast.error("Le fournisseur, le produit, le taux nominal et la source vérifiable sont obligatoires."); return; }
    const sourceUrl = rateUrl.trim();
    if (!/^https:\/\//i.test(sourceUrl)) { toast.error("La source doit être une URL HTTPS."); return; }
    setSaving(true);
    const { error: e } = await db.from("decision_financing_sources").insert({ provider_name: rateProvider.trim(), product_name: rateProduct.trim(), nominal_annual_rate: Number(rateNominal), effective_annual_rate: rateEffective ? Number(rateEffective) : null, fees: Number(rateFees || 0), insurance_monthly: Number(rateInsurance || 0), source_url: sourceUrl, valid_until: rateValidUntil || null, verified_by: user.id, observed_at: new Date().toISOString(), is_active: true });
    if (e) toast.error("Taux non enregistré : " + e.message);
    else { toast.success("Source de financement enregistrée avec sa référence."); setRateOpen(false); setRateProvider(""); setRateProduct(""); setRateNominal(""); setRateEffective(""); setRateUrl(""); setRateValidUntil(""); void load(); }
    setSaving(false);
  };

  const saveGrant = async () => {
    if (!user?.id || !grantUser) { toast.error("Sélectionne un collaborateur."); return; }
    const permissions = grantPermissions.split(",").map(x => x.trim()).filter(Boolean);
    if (!permissions.length || permissions.some(p => !["view","create","approve","manage","admin"].includes(p))) { toast.error("Permissions autorisées : view, create, approve, manage, admin."); return; }
    const { error: e } = await db.from("decision_access_grants").upsert({ user_id: grantUser, permissions, granted_by: user.id, revoked_at: null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (e) toast.error("Délégation refusée : " + e.message);
    else { toast.success("Droits délégués. La révocation reste disponible au PDG/DG."); setGrantUser(""); void load(); }
  };
  const revokeGrant = async (id: string) => {
    const { error: e } = await db.from("decision_access_grants").update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    if (e) toast.error("Révocation impossible : " + e.message); else { toast.success("Délégation révoquée."); void load(); }
  };

  const Metric = ({ title: metricTitle, value, icon: Icon, detail }: { title: string; value: string; icon: any; detail: string }) => <Card><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">{metricTitle}</p><p className="mt-1 text-xl font-semibold break-words">{value}</p></div><Icon className="h-5 w-5 shrink-0 text-primary" /></div></CardContent></Card>;

  if (!accessChecked || !accessAllowed) return embedded ? <div className="p-6 text-sm text-muted-foreground">Vérification des autorisations…</div> : <MainLayout><div className="p-6 text-sm text-muted-foreground">Vérification des autorisations…</div></MainLayout>;

  const content = <div className="mx-auto w-full max-w-[1500px] space-y-5 p-3 md:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Activity className="h-6 w-6 text-primary"/><h1 className="text-2xl font-bold">AgriCapital Intelligence</h1></div></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}/>Actualiser</Button></div>
    {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Une source n’a pas pu être lue</AlertTitle><AlertDescription>{error}. Les indicateurs concernés peuvent être incomplets.</AlertDescription></Alert>}
    <Alert><ShieldCheck className="h-4 w-4"/><AlertTitle>Décision assistée, jamais automatique</AlertTitle><AlertDescription>Les propositions sont des aides à l’analyse. Aucun emprunt, recrutement, paiement ou engagement n’est exécuté automatiquement. Les taux bancaires sont utilisables seulement s’ils sont saisis avec une source vérifiable et une date de validité.</AlertDescription></Alert>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="Flux entrants validés" value={money(metrics.inflow)} icon={ArrowDownRight} detail=""/>
      <Metric title="Flux sortants validés" value={money(metrics.outflow)} icon={ArrowUpRight} detail=""/>
      <Metric title="Flux net calculé" value={money(metrics.net)} icon={Wallet} detail=""/>
      <Metric title="Décisions à traiter" value={String(metrics.proposalsOpen)} icon={ClipboardList} detail=""/>
      <Metric title="Clients chargés" value={count(metrics.activeClients)} icon={Users} detail=""/>
      <Metric title="Superficies disponibles" value={`${count(metrics.hectaresLand)} ha`} icon={Sprout} detail=""/><Metric title="Propriétaires fonciers" value={count(landOwners.length)} icon={Users} detail=""/>
      <Metric title="Budgets chargés" value={count(budgets.length)} icon={Banknote} detail=""/>
      <Metric title="Revues de performance" value={count(reviews.length)} icon={Activity} detail=""/>
    </div>
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1"><TabsTrigger value="overview">Vue décisionnelle</TabsTrigger><TabsTrigger value="financing">Financement</TabsTrigger><TabsTrigger value="investment">Investissements</TabsTrigger><TabsTrigger value="people">Équipes & compétences</TabsTrigger><TabsTrigger value="scenarios">Simulateur</TabsTrigger><TabsTrigger value="register">Registre des décisions</TabsTrigger>{executive && <TabsTrigger value="governance">Accès & gouvernance</TabsTrigger>}</TabsList>
      <TabsContent value="overview" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Priorités et recommandations</h2><Dialog open={proposalOpen} onOpenChange={(open) => { setProposalOpen(open); if (!open) setEditingId(null); }}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4"/>Nouvelle proposition</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editingId ? "Modifier une proposition de décision" : "Créer une proposition de décision"}</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Titre</Label><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex. sécuriser la trésorerie"/></div><div className="space-y-1"><Label>Catégorie</Label><Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Object.entries(categories).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1 sm:col-span-2"><Label>Résumé</Label><Textarea value={summary} onChange={e=>setSummary(e.target.value)} /></div><div className="space-y-1 sm:col-span-2"><Label>Justification et données à l’appui</Label><Textarea value={rationale} onChange={e=>setRationale(e.target.value)} placeholder="Précise les faits, la période et les incertitudes."/></div><div className="space-y-1 sm:col-span-2"><Label>Action proposée</Label><Textarea value={action} onChange={e=>setAction(e.target.value)} /></div><div className="space-y-1"><Label>Montant estimé (FCFA, facultatif)</Label><Input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></div><div className="space-y-1"><Label>Priorité</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="low">Basse</SelectItem><SelectItem value="normal">Normale</SelectItem><SelectItem value="high">Haute</SelectItem><SelectItem value="critical">Critique</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label>Personne concernée (facultatif)</Label><Select value={targetUserId || "none"} onValueChange={v=>setTargetUserId(v==="none"?"":v)}><SelectTrigger><SelectValue placeholder="Aucune personne ciblée"/></SelectTrigger><SelectContent><SelectItem value="none">Aucune — décision exécutive uniquement</SelectItem>{people.filter(p=>p.user_id).map(p=><SelectItem key={p.user_id} value={p.user_id}>{p.nom_complet}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Périmètre de visibilité</Label><Select value={visibilityScope} onValueChange={setVisibilityScope}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="targeted">Décision ciblée</SelectItem><SelectItem value="team">Équipe / région</SelectItem><SelectItem value="department">Département</SelectItem><SelectItem value="national">National</SelectItem><SelectItem value="executive">Direction exécutive uniquement</SelectItem></SelectContent></Select></div></div><Button disabled={saving} onClick={()=>void createProposal()}>{saving?"Enregistrement…":editingId ? "Enregistrer les modifications" : "Enregistrer et soumettre"}</Button></DialogContent></Dialog></div>
        <div className="space-y-3"><h3 className="text-base font-semibold">Signaux et recommandations calculés depuis les données chargées</h3><p className="text-xs text-muted-foreground">Règles explicites sur les enregistrements CRM accessibles ; chaque signal doit être vérifié par un responsable avant décision.</p><div className="grid gap-3 lg:grid-cols-2">{recommendations.map((r,i)=><Card key={r.title}><CardContent className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><p className="font-medium">{r.title}</p><Badge variant={r.level==="high"?"destructive":"secondary"}>{r.level==="high"?"À traiter en priorité":"À vérifier"}</Badge></div><p className="text-sm text-muted-foreground">{r.rationale}</p><p className="text-sm">{r.action}</p><Button size="sm" variant="outline" onClick={()=>{setCategory("operations");setTitle(r.title);setSummary(r.rationale);setRationale("Signal généré à partir des données CRM chargées ; vérifier la période, les droits et la qualité des données avant validation.");setAction(r.action);setPriority(r.level==="high"?"high":"normal");setAmount("");setProposalOpen(true)}}>Transformer en proposition</Button></CardContent></Card>)}{!recommendations.length && <p className="text-sm text-muted-foreground">Aucun signal ne franchit actuellement les règles de contrôle. Cela ne signifie pas que l’activité est sans risque ; vérifier la couverture et la période des données.</p>}</div></div>
        <div className="grid gap-3 lg:grid-cols-2">{proposals.filter(p=>["draft","proposed","in_review"].includes(p.status)).slice(0,8).map(p=><Card key={p.id}><CardHeader className="pb-2"><div className="flex flex-wrap items-start justify-between gap-2"><CardTitle className="text-base">{p.title}</CardTitle><Badge variant={statusColor(p.status) as any}>{labels[p.status] || p.status}</Badge></div><p className="text-xs text-muted-foreground">{categories[p.category] || p.category} · {new Date(p.created_at).toLocaleDateString("fr-FR")}</p></CardHeader><CardContent className="space-y-2"><p className="text-sm">{p.summary}</p>{p.amount != null && <p className="font-semibold">{money(p.amount)}</p>}<p className="text-sm text-muted-foreground">{p.proposed_action}</p></CardContent></Card>)}
          {!proposals.some(p=>["draft","proposed","in_review"].includes(p.status)) && <Card><CardContent className="p-6 text-sm text-muted-foreground">Aucune proposition ouverte n’est enregistrée. Les recommandations ne sont pas inventées lorsqu’il manque des données validées ; crée une proposition à partir d’un constat vérifié.</CardContent></Card>}</div>
      </TabsContent>
      <TabsContent value="financing" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Financement, emprunts et trésorerie</h2><p className="text-sm text-muted-foreground">Simulation indicative sur taux saisis et sourcés ; ce n’est pas une offre bancaire.</p></div><Dialog open={rateOpen} onOpenChange={setRateOpen}><DialogTrigger asChild><Button variant="outline"><Plus className="mr-2 h-4 w-4"/>Ajouter une source bancaire</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Enregistrer un taux vérifiable</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2">{[[rateProvider,setRateProvider,"Banque / organisme"],[rateProduct,setRateProduct,"Produit de financement"],[rateNominal,setRateNominal,"Taux nominal annuel (%)"],[rateEffective,setRateEffective,"Taux effectif annuel (%)"],[rateFees,setRateFees,"Frais initiaux (FCFA)"],[rateInsurance,setRateInsurance,"Assurance mensuelle (FCFA)"],[rateUrl,setRateUrl,"URL HTTPS source"],[rateValidUntil,setRateValidUntil,"Valide jusqu’au (AAAA-MM-JJ)"]].map(([v,set,l]:any)=><div className="space-y-1" key={l}><Label>{l}</Label><Input value={v} onChange={e=>set(e.target.value)} /></div>)}</div><p className="text-xs text-muted-foreground">Saisir les conditions exactes de l’offre publiée. Une source périmée ou non vérifiée ne doit pas servir à une décision réelle.</p><Button disabled={saving} onClick={()=>void saveFinancingSource()}>Enregistrer la source</Button></DialogContent></Dialog></div>
        <div className="grid gap-3 md:grid-cols-3"><div className="space-y-1"><Label>Capital demandé (FCFA)</Label><Input inputMode="decimal" value={loanAmount} onChange={e=>setLoanAmount(e.target.value)}/></div><div className="space-y-1"><Label>Durée (mois)</Label><Input type="number" min="1" max="360" value={loanMonths} onChange={e=>setLoanMonths(e.target.value)}/></div><div className="space-y-1"><Label>Offre bancaire sourcée</Label><Select value={loanRateId} onValueChange={setLoanRateId}><SelectTrigger><SelectValue placeholder="Choisir une source"/></SelectTrigger><SelectContent>{financing.map(f=><SelectItem key={f.id} value={f.id}>{f.provider_name} — {f.product_name} ({count(Number(f.nominal_annual_rate))} %)</SelectItem>)}</SelectContent></Select></div></div>
        {loan && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric title="Mensualité estimée" value={money(loan.payment)} icon={Wallet} detail="Hors assurance mensuelle affichée séparément"/><Metric title="Intérêts estimés" value={money(loan.interest)} icon={Banknote} detail="Amortissement mensuel constant"/><Metric title="Frais + assurance" value={money(loan.fees+loan.insurance)} icon={Activity} detail="Selon la source saisie"/><Metric title="Coût total estimé" value={money(loan.total)} icon={ArrowUpRight} detail={`${loan.months} mensualités`}/></div>}
        {selectedRate && <Alert><FileClock className="h-4 w-4"/><AlertTitle>{selectedRate.provider_name} — {selectedRate.product_name}</AlertTitle><AlertDescription>Source consultée le {new Date(selectedRate.observed_at).toLocaleDateString("fr-FR")}{selectedRate.valid_until ? `; validité déclarée jusqu’au ${selectedRate.valid_until}` : "; date de validité non renseignée"}. Taux enregistré : {count(Number(selectedRate.nominal_annual_rate))}% nominal annuel. {selectedRate.source_url ? <a className="underline" href={selectedRate.source_url} target="_blank" rel="noreferrer">Consulter la source</a> : "Source URL absente."}</AlertDescription></Alert>}
        <Card><CardHeader><CardTitle className="text-base">Contrôle de prudence</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Le flux net observé est de {money(metrics.net)} sur les écritures accessibles, sans extrapolation automatique en revenu mensuel. Avant de conclure sur la capacité d’emprunt, vérifier la période des flux, les échéances existantes, les engagements, le besoin de fonds de roulement et une réserve de trésorerie. Les données bancaires ne sont pas déduites du journal comptable.</CardContent></Card>
        <div className="flex flex-wrap gap-2"><Button onClick={()=>{setCategory("financing");setTitle("Étudier un financement");setSummary(`Étudier un financement de ${money(Number(loanAmount)||0)} sur ${loanMonths} mois.`);setRationale(selectedRate ? `Offre saisie : ${selectedRate.provider_name} / ${selectedRate.product_name}; taux nominal ${selectedRate.nominal_annual_rate}%; flux net CRM observé ${metrics.net} FCFA. Vérifier la source et les engagements avant décision.` : "Aucune offre bancaire sourcée sélectionnée. Ajouter et vérifier une source avant de recommander un emprunt.");setAction("Comparer les offres, confirmer les flux de trésorerie et les échéances, puis soumettre au PDG pour décision.");setAmount(loanAmount);setProposalOpen(true)}}>Créer une proposition de financement</Button></div>
        <div className="space-y-2"><h3 className="font-semibold">Sources enregistrées</h3>{financing.length ? financing.map(f=><Card key={f.id}><CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{f.provider_name} — {f.product_name}</p><p className="text-sm text-muted-foreground">Taux nominal {count(Number(f.nominal_annual_rate))}% · frais {money(Number(f.fees))} · assurance {money(Number(f.insurance_monthly))}/mois</p></div><Badge variant={f.valid_until && f.valid_until < new Date().toISOString().slice(0,10) ? "destructive" : "secondary"}>{f.valid_until && f.valid_until < new Date().toISOString().slice(0,10) ? "À revalider" : "À vérifier avant usage"}</Badge></CardContent></Card>) : <p className="text-sm text-muted-foreground">Aucune offre bancaire sourcée dans la base. Aucun taux de démonstration n’est proposé comme réel.</p>}</div>
      </TabsContent>
      <TabsContent value="investment" className="space-y-4"><h2 className="text-lg font-semibold">Investissements, foncier et rentabilité</h2><Alert><Sprout className="h-4 w-4"/><AlertTitle>Éviter les faux calculs de rentabilité</AlertTitle><AlertDescription>Les hectares disponibles sont consolidés à partir des parcelles, des parts AgriCapital, des surfaces attribuées et des superficies plantées. Les parcelles partagées sont plafonnées à la part AgriCapital pour éviter de compter deux fois la surface du propriétaire. Le calcul de rentabilité d’un projet nécessite ses coûts, ses recettes datées et son horizon validé.</AlertDescription></Alert><div className="grid gap-3 md:grid-cols-3"><Metric title="Hectares déclarés clients" value={`${count(metrics.hectaresClients)} ha`} icon={Sprout} detail=""/><Metric title="Hectares fonciers repérés" value={`${count(metrics.hectaresLand)} ha`} icon={Sprout} detail=""/><Metric title="Parcelles chargées" value={count(parcels.length)} icon={ClipboardList} detail=""/></div><p className="text-sm text-muted-foreground">Les indicateurs ci-dessus ne constituent pas une évaluation foncière. Les données manquantes ou les champs de superficie dont la signification n’est pas confirmée sont à auditer avant décision d’investissement.</p><Button onClick={()=>{setCategory("investment");setTitle("Étude de rentabilité d’un investissement");setSummary("Évaluer l’investissement à partir des coûts et recettes réels reliés au CRM.");setRationale("Les superficies affichées sont indicatives. Ajouter les coûts, recettes, délais et hypothèses validées avant de calculer la rentabilité.");setAction("Consolider les coûts, recettes datées, superficies réellement disponibles et risques avant approbation.");setAmount("");setProposalOpen(true)}}>Créer une étude d’investissement</Button></TabsContent>
      <TabsContent value="people" className="space-y-4"><h2 className="text-lg font-semibold">Équipes, compétences et organisation</h2><Alert><Users className="h-4 w-4"/><AlertTitle>Évaluation humaine avec contexte</AlertTitle><AlertDescription>Les statistiques de tâches ou de projets ne suffisent pas à conclure qu’une personne est incompétente. Prioriser l’entretien, la clarification des objectifs, l’accompagnement, la formation et la réorganisation avant toute décision RH.</AlertDescription></Alert><div className="grid gap-3 md:grid-cols-3"><Metric title="Collaborateurs actifs chargés" value={count(people.length)} icon={Users} detail="Profils actifs accessibles"/><Metric title="Revues de performance" value={count(reviews.length)} icon={Activity} detail="Évaluations enregistrées"/><Metric title="Tâches ouvertes" value={count(metrics.tasksOpen)} icon={ClipboardList} detail="Tâches hors statut terminé/clos"/></div><div className="flex flex-wrap gap-2"><Button onClick={()=>{setCategory("training");setTitle("Plan de formation et d’accompagnement");setSummary("Définir un plan d’accompagnement lié à des objectifs observables.");setRationale(`Données chargées : ${reviews.length} revues de performance, ${metrics.tasksOpen} tâches ouvertes. Ces volumes seuls ne permettent pas d’évaluer une personne.`);setAction("Organiser un entretien, confirmer les objectifs et besoins de formation, fixer des indicateurs et une date de réévaluation.");setProposalOpen(true)}}>Proposer une formation / accompagnement</Button><Button variant="outline" onClick={()=>{setCategory("organization");setTitle("Étude de réorganisation");setSummary("Examiner la charge, les responsabilités et les besoins opérationnels.");setRationale("Analyser les objectifs, les moyens, les délais et les dépendances avant de proposer une modification organisationnelle.");setAction("Cartographier les responsabilités, comparer les scénarios et soumettre les impacts et coûts à validation.");setProposalOpen(true)}}>Étudier une réorganisation</Button></div></TabsContent>
      <TabsContent value="scenarios" className="space-y-4"><h2 className="text-lg font-semibold">Simulateur et scénarios</h2><p className="text-sm text-muted-foreground">Les calculs de prêt sont disponibles dans l’espace Financement dès qu’une source de taux est saisie. Les scénarios persistés conservent les hypothèses et les données utilisées.</p><div className="grid gap-3 md:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Scénario de trésorerie</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm">Flux net observé sur les écritures accessibles : <strong>{money(metrics.net)}</strong>. Ce montant n’est pas assimilé à une capacité mensuelle.</p><Button variant="outline" onClick={async()=>{if(!user?.id){return}const {error:e}=await db.from("decision_scenarios").insert({title:"Instantané de trésorerie CRM",scenario_type:"financing",inputs:{period:"all_loaded_transactions"},results:{inflows:metrics.inflow,outflows:metrics.outflow,net:metrics.net},source_snapshot:{captured_at:new Date().toISOString(),transactions_loaded:transactions.length,budgets_loaded:budgets.length},assumptions:{warning:"Période et obligations financières à vérifier avant toute décision."},risk_notes:["Le total chargé n'est pas une projection mensuelle."],created_by:user.id});if(e)toast.error("Scénario non enregistré : "+e.message);else toast.success("Scénario et hypothèses enregistrés.")}}>Enregistrer l’instantané</Button></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Scénario opérationnel</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm">{metrics.tasksOpen} tâches ouvertes et {metrics.projectsOpen} projets actifs dans les données accessibles.</p><Button variant="outline" onClick={()=>{setCategory("operations");setTitle("Scénario d’amélioration opérationnelle");setSummary("Évaluer un plan d’action sur les tâches et projets actifs.");setRationale("Confirmer les responsabilités, échéances, dépendances et coûts à partir des données détaillées avant de prioriser.");setAction("Construire un plan d’action avec responsable, échéance, budget, mesure de résultat et point de contrôle.");setProposalOpen(true)}}>Préparer une proposition</Button></CardContent></Card></div></TabsContent>
      <TabsContent value="register" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Registre de décisions et historique</h2><Badge variant="outline">{proposals.length} propositions chargées</Badge></div><div className="space-y-3">{proposals.map(p=><Card key={p.id}><CardHeader className="pb-2"><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle className="text-base">{p.title}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{categories[p.category] || p.category} · créée le {new Date(p.created_at).toLocaleString("fr-FR")}</p></div><Badge variant={statusColor(p.status) as any}>{labels[p.status] || p.status}</Badge></div></CardHeader><CardContent className="space-y-2"><p className="text-sm">{p.summary}</p>{p.rationale && <p className="text-sm text-muted-foreground">{p.rationale}</p>}<p className="text-sm"><strong>Action :</strong> {p.proposed_action}</p><div className="flex flex-wrap gap-2">{p.amount != null && <Badge variant="outline">{money(p.amount)}</Badge>}<Badge variant="outline">Priorité : {p.priority}</Badge></div>{p.decision_reason && <p className="text-sm"><strong>Motif de décision :</strong> {p.decision_reason}</p>}{executive && !["approved","executed","closed","rejected","cancelled"].includes(p.status) && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>editProposal(p)}><Pencil className="mr-1 h-4 w-4"/>Modifier</Button><Button size="sm" variant="destructive" onClick={()=>{const why = window.prompt("Motif obligatoire pour archiver cette proposition :"); if (why?.trim()) void deleteProposal(p, why.trim()); else toast.error("Archivage annulé : motif obligatoire.");}}><Trash2 className="mr-1 h-4 w-4"/>Archiver</Button></div>}{executive && ["proposed","in_review","modified"].includes(p.status) && <div className="space-y-2 border-t pt-3"><Label>Motif obligatoire pour l’action</Label><Textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Justification, conditions et suivi…"/><div className="flex flex-wrap gap-2"><Button size="sm" disabled={saving} onClick={()=>void changeStatus(p,"approved")}><CheckCircle2 className="mr-1 h-4 w-4"/>Approuver</Button><Button size="sm" variant="destructive" disabled={saving} onClick={()=>void changeStatus(p,"rejected")}><XCircle className="mr-1 h-4 w-4"/>Rejeter</Button><Button size="sm" variant="outline" disabled={saving} onClick={()=>void changeStatus(p,"modified")}>À modifier</Button></div></div>}{executive && p.status==="approved" && <div className="space-y-2 border-t pt-3"><Label>Motif / compte rendu d’exécution</Label><Textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Conditions de réalisation et résultat attendu"/><Button size="sm" disabled={saving} onClick={()=>void changeStatus(p,"executed")}>Marquer comme exécutée</Button></div>}</CardContent></Card>)}{!proposals.length && <Card><CardContent className="p-6 text-sm text-muted-foreground">Le registre est vide. Les décisions seront conservées en base avec l’auteur, l’horodatage, les motifs et les transitions de statut.</CardContent></Card>}</div><h3 className="font-semibold">Journal récent des actions</h3><div className="space-y-2">{audit.slice(0,20).map(a=><div key={a.id} className="flex flex-col gap-1 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span>{a.action} · {a.entity_type}{a.reason ? ` — ${a.reason}` : ""}</span><span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("fr-FR")}</span></div>)}{!audit.length && <p className="text-sm text-muted-foreground">Aucune action auditée disponible ou accessible pour le moment.</p>}</div></TabsContent>
      {executive && <TabsContent value="governance" className="space-y-4"><h2 className="text-lg font-semibold">Délégation et gouvernance</h2><Alert><ShieldCheck className="h-4 w-4"/><AlertTitle>Accès délégués révocables</AlertTitle><AlertDescription>Le PDG/DG conserve les droits de gouvernance. Les autres collaborateurs ne reçoivent que les permissions explicitement accordées ; les contrôles sont appliqués côté base de données via RLS.</AlertDescription></Alert><Card><CardHeader><CardTitle className="text-base">Accorder un accès</CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 md:grid-cols-2"><div className="space-y-1"><Label>Collaborateur interne</Label><Select value={grantUser} onValueChange={setGrantUser}><SelectTrigger><SelectValue placeholder="Sélectionner un profil"/></SelectTrigger><SelectContent>{people.filter(p=>p.user_id).map(p=><SelectItem key={p.user_id} value={p.user_id}>{p.nom_complet} {p.email ? `— ${p.email}` : ""}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Permissions séparées par virgule</Label><Input value={grantPermissions} onChange={e=>setGrantPermissions(e.target.value)} placeholder="view,create"/></div></div><p className="text-xs text-muted-foreground">Valeurs autorisées : view, create, approve, manage, admin. La permission admin donne les droits de gestion de module, mais pas le statut exécutif ni le droit de déléguer.</p><Button onClick={()=>void saveGrant()}>Enregistrer la délégation</Button></CardContent></Card><div className="space-y-2"><h3 className="font-semibold">Accès actifs</h3>{grants.map(g=><Card key={g.id}><CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{people.find(p=>p.user_id===g.user_id)?.nom_complet || g.user_id}</p><p className="text-sm text-muted-foreground">{(g.permissions || []).join(", ")}</p></div><Button variant="destructive" size="sm" onClick={()=>void revokeGrant(g.id)}>Révoquer</Button></CardContent></Card>)}{!grants.length && <p className="text-sm text-muted-foreground">Aucune délégation active enregistrée.</p>}</div></TabsContent>}
    </Tabs>
    
  </div>;
  return embedded ? content : <MainLayout>{content}</MainLayout>;
}

export default function AgriCapitalIntelligence({ embedded = false }: { embedded?: boolean }) {
  return <ProtectedRoute><IntelligenceContent embedded={embedded} /></ProtectedRoute>;
}
