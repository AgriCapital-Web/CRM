import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/lib/safeError";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CreditCard, LandPlot, UserRound, Wrench } from "lucide-react";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(Number(value || 0));

const formatStatus = (value: string | null | undefined) =>
  value === "active" ? "Actif" : (value || "—").replace(/_/g, " ");

const PlantationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [plantation, setPlantation] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [parcelle, setParcelle] = useState<any>(null);
  const [proprietaire, setProprietaire] = useState<any>(null);
  const [attributions, setAttributions] = useState<any[]>([]);
  const [paiements, setPaiements] = useState<any[]>([]);
  const [interventions, setInterventions] = useState<any[]>([]);
  const [paymentPage, setPaymentPage] = useState(1);
  const [interventionPage, setInterventionPage] = useState(1);
  const pageSize = useResponsivePageSize();

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: p, error: pError } = await (supabase as any)
        .from("plantations")
        .select("*, regions(nom), departements(nom), sous_prefectures(nom), lots_hectares(id,reference,numero_h,surface_ha,client_id,parcelle_id,convention_id)")
        .eq("id", id)
        .maybeSingle();
      if (pError) throw pError;
      if (!p) { setPlantation(null); return; }
      setPlantation(p);

      const [clientRes, parcelRes, paymentRes, interventionRes] = await Promise.all([
        p.client_id ? (supabase as any).from("clients").select("*").eq("id", p.client_id).maybeSingle() : Promise.resolve({ data: null }),
        p.parcelle_id ? (supabase as any).from("parcelles").select("*").eq("id", p.parcelle_id).maybeSingle() : Promise.resolve({ data: null }),
        (supabase as any).from("paiements").select("*").eq("plantation_id", id).neq("statut", "planifie").order("created_at", { ascending: false }),
        (supabase as any).from("interventions_techniques").select("*, agent:profiles!interventions_techniques_agent_technique_id_fkey(nom_complet)").eq("plantation_id", id).order("date_intervention", { ascending: false }),
      ]);
      if (clientRes.error) throw clientRes.error;
      if (parcelRes.error) throw parcelRes.error;
      setClient(clientRes.data || null);
      setParcelle(parcelRes.data || null);
      setPaiements(paymentRes.data || []);
      setInterventions(interventionRes.data || []);

      if (parcelRes.data?.proprietaire_id) {
        const { data: owner, error: ownerError } = await (supabase as any)
          .from("proprietaires_terres").select("id,id_unique,nom_complet,telephone").eq("id", parcelRes.data.proprietaire_id).maybeSingle();
        if (ownerError) throw ownerError;
        setProprietaire(owner || null);
      } else setProprietaire(null);

      if (p.parcelle_id && clientRes.data?.type_client === "beneficiaire_particulier") {
        const { data: attrs, error: attrError } = await (supabase as any)
          .from("beneficiaire_attributions")
          .select("id,surface_attribuee_ha,role_attribution,statut,clients(id,id_unique,nom_complet),plantations(id,id_unique)")
          .eq("parcelle_id", p.parcelle_id)
          .eq("statut", "active")
          .order("created_at", { ascending: true });
        if (attrError) throw attrError;
        setAttributions(attrs || []);
      } else setAttributions([]);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id]);

  const isBeneficiaire = client?.type_client === "beneficiaire_particulier";
  const isOwnLand = client?.type_client_foncier === "OWN";
  const isExternalLand = client?.type_client_foncier === "EXT";
  const offerFamily = String(client?.famille_offre || client?.parcours_code || "").toUpperCase();
  const isPalmTerroir = offerFamily.includes("PALMTERROIR");
  const isPalmInvest = offerFamily.includes("PALMINVEST");
  const isTerraPalm = offerFamily.includes("TERRAPALM");

  const paidTotal = useMemo(
    () => paiements.filter((p) => p.statut === "valide").reduce((s, p) => s + Number(p.montant_paye ?? p.montant ?? 0), 0),
    [paiements]
  );

  useEffect(() => { setPaymentPage(1); setInterventionPage(1); }, [pageSize, id]);

  if (loading) return <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PLANTATIONS}><MainLayout><div className="py-20 text-center">Chargement…</div></MainLayout></ProtectedRoute>;
  if (!plantation) return <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PLANTATIONS}><MainLayout><Card><CardContent className="py-10 text-center">Plantation introuvable.</CardContent></Card></MainLayout></ProtectedRoute>;


  const paginatedPayments = paiements.slice((paymentPage - 1) * pageSize, paymentPage * pageSize);
  const paginatedInterventions = interventions.slice((interventionPage - 1) * pageSize, interventionPage * pageSize);

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PLANTATIONS}>
      <MainLayout>
        <div className="min-w-0 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate("/plantations")}><ArrowLeft className="mr-2 h-4 w-4" />Retour</Button>
              <div className="min-w-0">
                <p className="text-xs font-mono text-muted-foreground">{plantation.id_unique}</p>
                <h1 className="truncate text-2xl font-bold">{plantation.nom_plantation || plantation.nom}</h1>
              </div>
            </div>
            <Badge>{formatStatus(plantation.statut_global || plantation.statut)}</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Superficie</p><p className="mt-1 text-xl font-bold">{Number(plantation.superficie_ha || 0).toFixed(2)} ha</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Offre</p><p className="mt-1 font-semibold">{client?.famille_offre || client?.parcours_code || "—"}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Formule</p><p className="mt-1 font-semibold">{client?.formule_nom || client?.formule_code || "—"}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Paiements réalisés</p><p className="mt-1 text-xl font-bold">{formatMoney(paidTotal)}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-4 w-4" />Client</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><span className="text-muted-foreground">Nom : </span>{client ? <Link to={`/acquisitions/${client.id}`} className="font-semibold hover:underline">{client.nom_complet}</Link> : "—"}</div>
              <div><span className="text-muted-foreground">Type : </span>{isBeneficiaire ? "Bénéficiaire particulier" : client?.type_client === "avec_terre" ? "Client — parcelle propre" : client?.type_client || "—"}</div>
              <div><span className="text-muted-foreground">Offre : </span>{client?.famille_offre || client?.offre_id || "—"}</div>
              <div><span className="text-muted-foreground">Formule : </span>{client?.formule_nom || client?.formule_code || "—"}</div>
            </CardContent>
          </Card>

          {isOwnLand ? (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><LandPlot className="h-4 w-4" />Foncier</CardTitle></CardHeader>
              <CardContent className="text-sm"><p className="font-medium">Parcelle propre</p><p className="mt-1 text-muted-foreground">{client?.localite || plantation.village || "Localisation enregistrée dans le dossier Client."}</p></CardContent>
            </Card>
          ) : isExternalLand ? (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><LandPlot className="h-4 w-4" />Foncier</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">Propriétaire : </span>{proprietaire?.nom_complet || "—"}</div>
                <div><span className="text-muted-foreground">Lot : </span>{plantation?.lots_hectares?.reference || (plantation?.lots_hectares?.numero_h ? `H${String(plantation.lots_hectares.numero_h).padStart(2,"0")}` : "—")}</div>
                <div><span className="text-muted-foreground">Parcelle : </span>{parcelle?.id_unique || "—"}</div>
                <div><span className="text-muted-foreground">Village : </span>{parcelle?.village || plantation.village || "—"}</div>
                <div><span className="text-muted-foreground">Surface : </span>{parcelle?.surface_totale_ha ? `${Number(parcelle.surface_totale_ha).toFixed(2)} ha` : "—"}</div>
              </CardContent>
            </Card>
          ) : null}

          {isBeneficiaire && attributions.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Attribution</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div><p className="text-xs text-muted-foreground">Surface attribuée</p><p className="font-semibold">{Number(attributions.find(a => a.clients?.id === client?.id)?.surface_attribuee_ha || plantation.superficie_ha || 0).toFixed(2)} ha</p></div>
                  <div><p className="text-xs text-muted-foreground">Rôle</p><p className="font-semibold">Bénéficiaire</p></div>
                  <div><p className="text-xs text-muted-foreground">Parcelle</p><p className="font-semibold">{parcelle?.id_unique || "—"}</p></div>
                </div>
              </CardContent>
            </Card>
          )}

          {(isPalmTerroir || isPalmInvest || isTerraPalm) && (
            <Card>
              <CardHeader><CardTitle>Suivi de l’offre</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div><span className="text-muted-foreground">Offre : </span>{client?.famille_offre || client?.parcours_code}</div>
                <div><span className="text-muted-foreground">Formule : </span>{client?.formule_nom || client?.formule_code || "—"}</div>
                <div><span className="text-muted-foreground">Hectares : </span>{Number(client?.total_hectares || plantation.superficie_ha || 0).toFixed(2)}</div>
              </CardContent>
            </Card>
          )}

          {paiements.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" />Paiements réalisés</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[650px]"><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Montant</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                    <TableBody>{paginatedPayments.map((p: any) => <TableRow key={p.id}><TableCell>{p.date_paiement ? new Date(p.date_paiement).toLocaleDateString("fr-FR") : new Date(p.created_at).toLocaleDateString("fr-FR")}</TableCell><TableCell>{p.type_paiement || "—"}</TableCell><TableCell>{formatMoney(p.montant_paye ?? p.montant)}</TableCell><TableCell><Badge>{formatStatus(p.statut)}</Badge></TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {interventions.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" />Suivi technique</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {paginatedInterventions.map((i: any) => (
                  <div key={i.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{i.type_intervention?.replace(/_/g, " ") || "Opération"}</span><Badge variant="outline">{formatStatus(i.statut)}</Badge></div>
                    <p className="mt-1 text-xs text-muted-foreground">{i.date_intervention ? new Date(i.date_intervention).toLocaleDateString("fr-FR") : "—"} · {i.agent?.nom_complet || "Équipe technique"}</p>
                    {i.observations && <p className="mt-1 text-sm">{i.observations}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default PlantationDetail;
