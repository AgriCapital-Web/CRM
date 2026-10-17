import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useKkiapay } from "@/hooks/useKkiapay";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/lib/safeError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpFromLine, CreditCard, Loader2, RefreshCw, Search, Wallet } from "lucide-react";

type ClientFinanceRow = {
  id: string;
  id_unique?: string | null;
  nom_complet?: string | null;
  telephone?: string | null;
  type_client?: string | null;
  type_client_foncier?: string | null;
  proprietaire_id?: string | null;
  is_internal?: boolean | null;
  contrat_solde_at?: string | null;
  jours_retard?: number | null;
  jours_payes?: number | null;
  contrat_debut_at?: string | null;
  prochaine_echeance?: string | null;
  compte_actif?: boolean | null;
  statut?: string | null;
  formule_nom?: string | null;
  montant_total_contrat?: number | null;
  total_hectares?: number | null;
  summary: any;
};

type ContractState = {
  id: string;
  label: string;
  acquisitionId: string | null;
  plantationId: string | null;
  surface: number;
  state: any;
};

const money = (value: unknown) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0)) + " F CFA";

export default function ClientPaymentWorkspace({ onTransfer, onRefund }: {
  onTransfer?: (client: ClientFinanceRow) => void;
  onRefund?: (client: ClientFinanceRow) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { openPayment, onSuccess, onFailed, onClose } = useKkiapay();
  const [search, setSearch] = useState("");
  const [activeClient, setActiveClient] = useState<ClientFinanceRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loadingFinance, setLoadingFinance] = useState(false);
  const [paying, setPaying] = useState(false);
  const [contracts, setContracts] = useState<ContractState[]>([]);
  const [selectedContractId, setSelectedContractId] = useState("principal");
  type PaymentType = "PI" | "RATTRAPAGE" | "MENSUALITE" | "AVANCE";
  const [paymentType, setPaymentType] = useState<PaymentType>("MENSUALITE");
  const [amount, setAmount] = useState("");
  const [paymentPhone, setPaymentPhone] = useState("");
  const [selectedPlantationId, setSelectedPlantationId] = useState("");
  const [baseState, setBaseState] = useState<any>(null);
  const [plantations, setPlantations] = useState<any[]>([]);

  const { data: clients = [], isLoading, refetch } = useQuery({
    queryKey: ["gestion-paiements-clients"],
    queryFn: async () => {
      const [{ data: clientRows, error: clientsError }, { data: summaries, error: summaryError }, { data: acquisitions, error: acquisitionsError }] = await Promise.all([
        (supabase as any).from("clients")
          .select("id,id_unique,nom_complet,telephone,type_client,type_client_foncier,proprietaire_id,is_internal,contrat_solde_at,jours_retard,jours_payes,contrat_debut_at,prochaine_echeance,compte_actif,statut,formule_nom,montant_total_contrat,total_hectares")
          .eq("compte_actif", true)
          .order("nom_complet", { ascending: true }),
        (supabase as any).from("v_client_synthese")
          .select("client_id,compte_actif,montant_total_contrat,total_paye,reste_a_payer")
          .eq("compte_actif", true),
        (supabase as any).from("acquisitions")
          .select("client_id,formule_nom,offre_nom,superficie_ha,montant_total_contrat")
          .order("created_at", { ascending: false }),
      ]);
      if (clientsError) throw clientsError;
      if (summaryError) throw summaryError;
      if (acquisitionsError) throw acquisitionsError;
      const byClient = new Map<string, any>((summaries || []).map((s: any) => [s.client_id, s]));
      const acquisitionMap = new Map<string, any[]>();
      (acquisitions || []).forEach((s: any) => { const items = acquisitionMap.get(s.client_id) || []; items.push(s); acquisitionMap.set(s.client_id, items); });
      return (clientRows || []).map((c: any) => {
        const clientAcquisitions = acquisitionMap.get(c.id) || [];
        const acquisitionTotal = clientAcquisitions.reduce((sum: number, s: any) => sum + Number(s.montant_total_contrat || 0), 0);
        const summary = byClient.get(c.id) || null;
        const principalTotal = Number(summary?.montant_total_contrat ?? (Number(c.montant_total_contrat || 0) + acquisitionTotal));
        return {
          ...c,
          summary,
          acquisitionTotal,
          acquisitions: clientAcquisitions,
          formule_nom: c.formule_nom || clientAcquisitions.map((s: any) => s.formule_nom || s.offre_nom).filter(Boolean).join(" · "),
          montant_total_contrat: principalTotal,
        } as ClientFinanceRow;
      })
        .filter((c: ClientFinanceRow) => {
          const total = Number(c.montant_total_contrat ?? c.summary?.montant_total_contrat ?? 0);
          const remaining = Number(c.summary?.reste_a_payer ?? Math.max(0, total - Number(c.summary?.total_paye || 0)));
          const landRole = String(c.type_client_foncier || "").toLowerCase();
          const clientRole = String(c.type_client || "").toLowerCase();
          const isPartner = Boolean(c.proprietaire_id) ||
            ["proprietaire_foncier", "propriétaire_foncier", "partenaire_foncier"].includes(landRole) ||
            ["proprietaire_foncier", "propriétaire_foncier", "partenaire"].includes(clientRole);
          return c.type_client !== "beneficiaire_particulier" && !isPartner && !c.is_internal && total > 0;
        });
    },
    staleTime: 15_000,
  });

  const visibleClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((c: ClientFinanceRow) =>
      [c.nom_complet, c.id_unique, c.telephone, c.formule_nom].some(v => String(v || "").toLowerCase().includes(term))
    );
  }, [clients, search]);

  const activeContract = contracts.find(c => c.id === selectedContractId) || contracts[0] || null;
  const activeState = activeContract?.state || baseState || {};
  const pi = activeState?.paiement_initial || {};
  const monthly = activeState?.mensualite || {};
  const monthlyAmount = Number(monthly.montant || 0);
  const arrearsAmount = Number(monthly.montant_arriere ?? Math.max(0, Number(monthly.montant_a_payer || 0) - monthlyAmount));
  const arrearsMonths = monthlyAmount > 0 ? Math.ceil(arrearsAmount / monthlyAmount) : Number(monthly.mensualites_arrivees || 0);
  const daysLate = Number(monthly.jours_retard ?? (arrearsMonths * 30));
  const remaining = Number(activeState?.reste_contrat ?? activeClient?.summary?.reste_a_payer ?? activeClient?.summary?.montant_total_contrat ?? activeClient?.montant_total_contrat ?? 0);
  const piBalance = Number(pi.solde || 0);
  const availablePlantations = plantations.filter((p: any) => activeContract?.acquisitionId ? p.acquisition_id === activeContract.acquisitionId : !p.acquisition_id);

  const suggestedPaymentType = (state: any): PaymentType => {
    const p = state?.paiement_initial || {};
    const m = state?.mensualite || {};
    const arrears = Number(m.montant_arriere ?? Math.max(0, Number(m.montant_a_payer || 0) - Number(m.montant || 0)));
    const lateDays = Number(m.jours_retard || 0);
    if (arrears > 0 || lateDays > 0) return "RATTRAPAGE";
    if (Number(m.montant_a_payer || 0) > 0) return "MENSUALITE";
    return "AVANCE";
  };

  const amountForPaymentType = (type: PaymentType, state: any) => {
    const p = state?.paiement_initial || {};
    const m = state?.mensualite || {};
    if (type === "PI") return Number(p.solde || 0);
    if (type === "RATTRAPAGE") return Number(m.montant_a_payer || m.montant_arriere || 0);
    if (type === "MENSUALITE") return Number(m.montant_a_payer || m.montant || 0);
    return Number(m.montant || 0);
  };

  const openClientFinance = async (client: ClientFinanceRow) => {
    setActiveClient(client);
    setSheetOpen(true);
    setLoadingFinance(true);
    setContracts([]);
    setBaseState(null);
    setPlantations([]);
    setSelectedContractId("principal");
    setPaymentType("MENSUALITE");
    setAmount("");
    setPaymentPhone(client.telephone || "");
    setSelectedPlantationId("");
    try {
      const [stateRes, subsRes, plantationsRes, basePaymentsRes] = await Promise.all([
        (supabase as any).rpc("portal_current_payment_state", { _client_id: client.id }),
        (supabase as any).from("acquisitions")
          .select("id,formule_nom,offre_nom,superficie_ha,montant_pi_total,montant_total_contrat,mode_paiement,mensualite_montant,duree_paiement_mois,echeancier,created_at")
          .eq("client_id", client.id)
          .order("created_at", { ascending: true }),
        (supabase as any).from("plantations")
          .select("id,id_unique,nom_plantation,superficie_ha,acquisition_id,statut_global")
          .eq("client_id", client.id)
          .order("created_at", { ascending: true }),
        (supabase as any).from("paiements")
          .select("montant,montant_paye")
          .eq("client_id", client.id)
          .is("acquisition_id", null)
          .eq("statut", "valide"),
      ]);
      if (stateRes.error) throw stateRes.error;
      if (subsRes.error) throw subsRes.error;
      if (plantationsRes.error) throw plantationsRes.error;
      if (basePaymentsRes.error) throw basePaymentsRes.error;
      const acquisitionIds = (subsRes.data || []).map((s: any) => s.id).filter(Boolean);
      let allClientPlantations = plantationsRes.data || [];
      if (acquisitionIds.length) {
        const { data: acquisitionPlantations, error: acquisitionPlantationsError } = await (supabase as any).from("plantations").select("id,id_unique,nom_plantation,superficie_ha,acquisition_id,statut_global").in("acquisition_id", acquisitionIds);
        if (acquisitionPlantationsError) throw acquisitionPlantationsError;
        const unique = new Map<string, any>();
        [...allClientPlantations, ...(acquisitionPlantations || [])].forEach((p: any) => unique.set(p.id, p));
        allClientPlantations = [...unique.values()];
      }
      const basePaid = (basePaymentsRes.data || []).reduce((sum: number, p: any) => sum + Number(p.montant_paye ?? p.montant ?? 0), 0);
      const baseTotal = Number(client.montant_total_contrat || 0);
      const normalizedBaseState = {
        ...(stateRes.data || {}),
        reste_contrat: baseTotal > 0 ? Math.max(0, baseTotal - basePaid) : Number(client.summary?.reste_a_payer || 0),
      };
      setBaseState(normalizedBaseState);
      setPlantations(allClientPlantations);
      const nextContracts: ContractState[] = [{
        id: "principal",
        label: "Contrat initial du client",
        acquisitionId: null,
        plantationId: allClientPlantations.find((p: any) => !p.acquisition_id)?.id || null,
        surface: Number(client.total_hectares || 0),
        state: normalizedBaseState,
      }];
      for (const sub of (subsRes.data || [])) {
        const [subStateRes] = await Promise.all([
          (supabase as any).rpc("acquisition_current_payment_state", { _acquisition_id: sub.id }),
        ]);
        if (subStateRes.error) throw subStateRes.error;
        nextContracts.push({
          id: sub.id,
          label: `${sub.formule_nom || sub.offre_nom || "Acquisition"} · ${Number(sub.superficie_ha || 0).toLocaleString("fr-FR")} ha`,
          acquisitionId: sub.id,
          plantationId: allClientPlantations.find((p: any) => p.acquisition_id === sub.id)?.id || null,
          surface: Number(sub.superficie_ha || 0),
          state: subStateRes.data || {},
        });
      }
      setContracts(nextContracts);
      const firstWithPI = nextContracts.find(c => Number(c.state?.paiement_initial?.solde || 0) > 0);
      const firstWithArrears = nextContracts.find(c => Number(c.state?.mensualite?.montant_arriere || 0) > 0);
      const firstWithMonthly = nextContracts.find(c => Number(c.state?.mensualite?.montant_a_payer || 0) > 0);
      const firstWithBalance = nextContracts.find(c => Number(c.state?.reste_contrat || c.state?.montant_total_contrat || 0) > 0);
      const initial = firstWithArrears || firstWithMonthly || firstWithPI || firstWithBalance || nextContracts.find(c => c.acquisitionId) || nextContracts[0];
      if (initial) {
        setSelectedContractId(initial.id);
        const type = suggestedPaymentType(initial.state);
        setPaymentType(type);
        setAmount(String(amountForPaymentType(type, initial.state)));
        setSelectedPlantationId(initial.plantationId || "");
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Fiche financière indisponible", description: getSafeErrorMessage(error, "Impossible de charger les informations financières du client.") });
    } finally {
      setLoadingFinance(false);
    }
  };

  const chooseContract = (id: string) => {
    setSelectedContractId(id);
    const next = contracts.find(c => c.id === id);
    if (!next) return;
    const type = suggestedPaymentType(next.state);
    setPaymentType(type);
    setAmount(String(amountForPaymentType(type, next.state)));
    setSelectedPlantationId(next.plantationId || "");
  };

  const choosePaymentType = (type: PaymentType) => {
    setPaymentType(type);
    setAmount(String(amountForPaymentType(type, activeState)));
  };

  const startKkiapayPayment = async () => {
    if (!activeClient || !activeContract) return;
    const paymentAmount = Math.round(Number(amount));
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      toast({ variant: "destructive", title: "Montant invalide", description: "Saisissez un montant supérieur à zéro." });
      return;
    }
    if (paymentAmount > remaining + 1) {
      toast({ variant: "destructive", title: "Montant trop élevé", description: "Le montant ne peut pas dépasser le solde restant de ce contrat." });
      return;
    }
    if (paymentType === "PI" && Math.abs(paymentAmount - piBalance) > 1) {
      toast({ variant: "destructive", title: "Paiement initial", description: "Le paiement initial doit correspondre au solde exact affiché." });
      return;
    }
    if (paymentType === "MENSUALITE" && Number(monthly.montant_a_payer || 0) <= 0) {
      toast({ variant: "destructive", title: "Mensualité indisponible", description: "Aucune mensualité n’est actuellement exigible pour ce contrat. Le paiement est bloqué pour éviter une mauvaise imputation." });
      return;
    }
    const plantationRequired = paymentType !== "PI" || Boolean(activeContract.acquisitionId);
    if (plantationRequired && !selectedPlantationId) {
      toast({ variant: "destructive", title: "Plantation requise", description: "Une plantation réelle rattachée à ce contrat est nécessaire pour ce type de paiement." });
      return;
    }
    setPaying(true);
    try {
      // Le contrat principal réutilise la validation de couverture de jours du portail.
      // Les acquisitions ont leur propre échéancier et leur propre état financier.
      if ((paymentType === "MENSUALITE" || paymentType === "RATTRAPAGE" || paymentType === "AVANCE") && !activeContract.acquisitionId) {
        const { data: clientContract, error: contractError } = await (supabase as any)
          .from("clients")
          .select("jours_contrat_total,jours_payes")
          .eq("id", activeClient.id)
          .maybeSingle();
        if (contractError) throw contractError;
        const remainingDays = Math.max(0, Number(clientContract?.jours_contrat_total || 0) - Number(clientContract?.jours_payes || 0));
        if (remainingDays > 0) {
          const { data: coveredDays, error: daysError } = await (supabase as any).rpc("portal_days_for_amount", {
            _client_id: activeClient.id,
            _plantation_id: selectedPlantationId,
            _amount: paymentAmount,
          });
          if (daysError) throw daysError;
          if (Number(coveredDays || 0) > remainingDays) {
            throw new Error("Le montant dépasse la couverture restante réelle du contrat.");
          }
        }
      }

      const reference = `CRM-${activeClient.id.slice(0, 8)}-${Date.now()}`;
      const payload = {
        client_id: activeClient.id,
        acquisition_id: activeContract.acquisitionId,
        plantation_id: selectedPlantationId,
        type_paiement: paymentType === "PI" ? "PI" : "MENSUALITE",
        montant: paymentAmount,
        montant_theorique: paymentAmount,
        montant_paye: null,
        est_paiement_initial: paymentType === "PI",
        mode_paiement: null,
        aggregateur_paiement: "KKiaPay",
        statut: "en_attente",
        reference,
        date_paiement: new Date().toISOString(),
        metadata: {
          payment_provider: "kkiapay",
          source: "crm_financial_sheet",
          intention: paymentType === "PI" ? (Number(pi.montant_paye || pi.deja_paye || 0) > 0 ? "solde_paiement_initial" : "paiement_initial") : paymentType === "RATTRAPAGE" ? "rattrapage" : paymentType === "AVANCE" ? "avance" : "mensualite",
          acquisition_id: activeContract.acquisitionId,
          contract_remaining_at_creation: remaining,
        },
      };
      const pendingQuery = (supabase as any).from("paiements").select("id,statut,reference")
        .eq("client_id", activeClient.id).eq("type_paiement", paymentType === "PI" ? "PI" : "MENSUALITE").eq("statut", "en_attente");
      const scopedPending = activeContract.acquisitionId
        ? pendingQuery.eq("acquisition_id", activeContract.acquisitionId)
        : pendingQuery.is("acquisition_id", null);
      const { data: existing, error: existingError } = await scopedPending.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existingError) throw existingError;
      let paiementId = existing?.id;
      if (existing) {
        const { error } = await (supabase as any).from("paiements").update({ ...payload, reference: existing.reference || reference }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: created, error } = await (supabase as any).from("paiements").insert(payload).select("id").single();
        if (error) throw error;
        paiementId = created.id;
      }
      if (!paiementId) throw new Error("Le paiement n’a pas pu être préparé.");

      onSuccess(async (response) => {
        try {
          const { data, error } = await supabase.functions.invoke("kkiapay-verify-transaction", {
            body: { transactionId: response.transactionId, paiementId },
          });
          if (error) throw error;
          if (data?.error || !data?.transaction?.isPaymentSuccessful || !data?.applied) {
            throw new Error(data?.error || data?.transaction?.failureMessage || "La transaction n’a pas été confirmée par le service de paiement en ligne.");
          }
          toast({ title: "Paiement confirmé", description: `${money(paymentAmount)} reçu en ligne. Le dossier financier sera actualisé.` });
          setSheetOpen(false);
          await queryClient.invalidateQueries();
          await refetch();
        } catch (error: any) {
          toast({ variant: "destructive", title: "Vérification impossible", description: getSafeErrorMessage(error, "Le paiement n’est pas confirmé. Vérifiez son statut avant toute nouvelle tentative.") });
        } finally {
          setPaying(false);
        }
      });
      onFailed((error) => {
        toast({ variant: "destructive", title: "Paiement non abouti", description: error.reason || "Le service de paiement en ligne n’a pas confirmé la transaction." });
        setPaying(false);
      });
      onClose(() => setPaying(false));
      const opened = await openPayment({
        amount: paymentAmount,
        name: activeClient.nom_complet || "Client AgriCapital",
        phone: paymentPhone || activeClient.telephone || "",
        paymentMethods: ["momo", "card"],
        data: { paiement_id: paiementId, reference: existing?.reference || reference, type: paymentType === "PI" ? "PI" : "MENSUALITE", intention: paymentType, client_id: activeClient.id, acquisition_id: activeContract.acquisitionId },
      });
      if (!opened) throw new Error("Le module de paiement en ligne ne s’est pas ouvert. Vérifiez la connexion et la configuration du compte marchand.");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Paiement impossible", description: getSafeErrorMessage(error, "Le paiement n’a pas pu être lancé.") });
      setPaying(false);
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un client, un identifiant ou un téléphone…" className="pl-9" />
        </div>
        <Button variant="outline" onClick={() => void refetch()} disabled={isLoading}><RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />Actualiser</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="responsive-data-table">
              <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Offre</TableHead><TableHead>Montant du contrat</TableHead><TableHead>Déjà payé</TableHead><TableHead>Reste à payer</TableHead><TableHead>État</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={7} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                : visibleClients.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Aucun client avec un solde financier restant.</TableCell></TableRow>
                : visibleClients.map((client: ClientFinanceRow) => {
                  const total = Number(client.summary?.montant_total_contrat ?? client.montant_total_contrat ?? 0);
                  const paid = Number(client.summary?.total_paye || 0);
                  const remainingClient = Number(client.summary?.reste_a_payer ?? Math.max(0, total - paid));
                  return <TableRow key={client.id}>
                    <TableCell><div className="font-semibold">{client.nom_complet || "Client sans nom"}</div><div className="text-xs text-muted-foreground">{client.id_unique || "—"} · {client.telephone || "Téléphone non renseigné"}</div></TableCell>
                    <TableCell>{client.formule_nom || "Contrat client"}</TableCell>
                    <TableCell>{money(total)}</TableCell>
                    <TableCell>{money(paid)}</TableCell>
                    <TableCell className="font-semibold text-amber-700">{money(remainingClient)}</TableCell>
                    <TableCell>{(() => { const status = String(client.statut || "").toLowerCase(); const isLate = status.includes("retard") || Number(client.jours_retard || 0) > 0; const isAdvance = status.includes("avance") || Number((client as any).jours_avance || 0) > 0; const label = client.contrat_solde_at || remainingClient <= 0 ? "Soldé" : isLate ? "En retard" : isAdvance ? "En avance" : status.includes("actif") ? "Actif" : "À jour"; return <Badge variant={label === "En retard" ? "destructive" : "outline"} className={label === "Soldé" ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700" : label === "En avance" ? "border-blue-600/30 bg-blue-600/10 text-blue-700" : ""}>{label}</Badge>; })()}</TableCell>
                    <TableCell><div className="flex items-center justify-end gap-1">
                      {remainingClient > 0 && !client.contrat_solde_at && onTransfer && <Button type="button" size="icon" variant="ghost" aria-label={`Transférer pour ${client.nom_complet || "ce client"}`} title="Transférer" onClick={() => onTransfer(client)}><ArrowRightLeft className="h-4 w-4 text-blue-600" /></Button>}
                      {remainingClient > 0 && !client.contrat_solde_at && onRefund && <Button type="button" size="icon" variant="ghost" aria-label={`Rembourser ${client.nom_complet || "ce client"}`} title="Rembourser" onClick={() => onRefund(client)}><ArrowDownLeft className="h-4 w-4 text-red-600" /></Button>}
                      {remainingClient > 0 && !client.contrat_solde_at && <Button type="button" size="icon" variant="ghost" className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700" aria-label={`Nouveau paiement pour ${client.nom_complet || "ce client"}`} title="Nouveau paiement" onClick={() => void openClientFinance(client)}><ArrowUpFromLine className="h-4 w-4" /></Button>}
                    </div></TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" />Fiche financière client</DialogTitle>
            <DialogDescription>{activeClient?.nom_complet || "Client"} · Les règlements sont exclusivement effectués en ligne.</DialogDescription>
          </DialogHeader>
          {loadingFinance ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Chargement de la situation financière…</div>
          : activeClient ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
                <Card><CardContent className="min-w-0 p-2.5"><p className="text-[11px] leading-snug text-muted-foreground">Solde initial</p><p className="mt-1 whitespace-nowrap text-xs font-bold leading-snug sm:text-sm">{money(piBalance)}</p></CardContent></Card>
                <Card><CardContent className="min-w-0 p-2.5"><p className="text-[11px] leading-snug text-muted-foreground">Mensualité</p><p className="mt-1 whitespace-nowrap text-xs font-bold leading-snug sm:text-sm">{money(monthlyAmount)}</p></CardContent></Card>
                <Card><CardContent className="min-w-0 p-2.5"><p className="text-[11px] leading-snug text-muted-foreground">Arriéré</p><p className={`mt-1 whitespace-nowrap text-xs font-bold leading-snug sm:text-sm ${arrearsMonths > 0 ? "text-destructive" : ""}`}>{arrearsMonths} Mois</p></CardContent></Card>
                <Card><CardContent className="min-w-0 p-2.5"><p className="text-[11px] leading-snug text-muted-foreground">Échéance</p><p className="mt-1 whitespace-nowrap text-xs font-bold leading-snug sm:text-sm">{money(Number(monthly.montant_a_payer || 0))}</p></CardContent></Card>
              </div>
              {contracts.length > 1 && <div className="space-y-2"><label className="text-sm font-medium">Contrat / acquisition à régler</label><Select value={selectedContractId} onValueChange={chooseContract}><SelectTrigger><SelectValue placeholder="Choisir le contrat" /></SelectTrigger><SelectContent>{contracts.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></div>}
              <div className="space-y-2">
                  <label className="text-sm font-medium">Plantation concernée</label>
                  {availablePlantations.length > 0 ? (
                    <Select value={selectedPlantationId} onValueChange={setSelectedPlantationId}>
                      <SelectTrigger><SelectValue placeholder="Choisir la plantation" /></SelectTrigger>
                      <SelectContent>{availablePlantations.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nom_plantation || p.id_unique || "Plantation"} · {Number(p.superficie_ha || 0).toLocaleString("fr-FR")} ha</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">Aucune plantation n’est rattachée à ce contrat. Les mensualités et les paiements initiaux d’une acquisition restent bloqués. Le paiement initial du contrat principal peut toutefois être réglé sur le dossier client.</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type de règlement</label>
                <Select value={paymentType} onValueChange={(v) => choosePaymentType(v as PaymentType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{piBalance > 0 && <SelectItem value="PI">{Number(pi.montant_paye || pi.deja_paye || 0) > 0 || Number(pi.montant_total || pi.montant_initial || 0) > piBalance ? "Solde paiement initial" : "Paiement initial"}</SelectItem>}<SelectItem value="RATTRAPAGE" disabled={arrearsAmount <= 0 && daysLate <= 0}>Rattrapage</SelectItem><SelectItem value="MENSUALITE" disabled={Number(monthly.montant_a_payer || 0) <= 0 || arrearsAmount > 0 || daysLate > 0}>Mensualité</SelectItem><SelectItem value="AVANCE" disabled={arrearsAmount > 0 || daysLate > 0 || Number(monthly.montant_a_payer || 0) > 0}>Avance</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Numéro de paiement (Mobile Money / Wave)</label>
                <Input type="tel" inputMode="tel" value={paymentPhone} onChange={e => setPaymentPhone(e.target.value)} placeholder="Numéro à débiter" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Montant à payer (F CFA)</label>
                <Input type="number" min="1" step="1" inputMode="numeric" value={amount} readOnly={paymentType !== "AVANCE"} onChange={e => setAmount(e.target.value)} placeholder="Montant calculé automatiquement" />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>Fermer</Button>
            <Button type="button" className="gap-2" onClick={() => void startKkiapayPayment()} disabled={loadingFinance || paying || !activeClient || !activeContract || Number(amount) <= 0 || ((paymentType !== "PI" || Boolean(activeContract.acquisitionId)) && !selectedPlantationId) || (paymentType === "MENSUALITE" && Number(monthly.montant_a_payer || 0) <= 0) || (paymentType === "RATTRAPAGE" && arrearsAmount <= 0 && daysLate <= 0) || (paymentType === "AVANCE" && (arrearsAmount > 0 || daysLate > 0 || Number(monthly.montant_a_payer || 0) > 0))}>
              {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {paying ? "Ouverture / vérification…" : paymentType === "RATTRAPAGE" ? "Rattraper le paiement" : paymentType === "PI" ? "Payer le solde initial" : paymentType === "AVANCE" ? "Payer en avance" : "Payer la mensualité"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
