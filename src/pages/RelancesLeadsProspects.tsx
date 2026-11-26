import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Search, PhoneCall, CalendarClock, UserRound, RefreshCw } from "lucide-react";
import { format, isValid, parseISO, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { formatStructuredPersonName } from "@/lib/utils";

type RelanceRow = Record<string, any>;
const dateLabel = (value?: string | null) => {
  if (!value) return "À planifier";
  const date = parseISO(value);
  return isValid(date) ? format(date, "dd MMM yyyy", { locale: fr }) : "—";
};
const nameOf = (row: RelanceRow) => row.nom || row.prenoms ? formatStructuredPersonName(row.nom, row.prenoms) : "Sans nom";
const prospectStatuses = ["qualifie", "interesse", "tres_interesse", "en_discussion", "preparation_dossier", "pret_souscrire"];
const legacyStage = (row: RelanceRow) => row.etape_pipeline || (prospectStatuses.includes(row.statut) ? "prospect" : row.statut === "converti" ? "converti" : "lead");

const RelancesLeadsProspects = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"a_faire" | "retard">("a_faire");
  const [selected, setSelected] = useState<RelanceRow | null>(null);
  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["leads-prospects-relances-page"],
    queryFn: async () => {
      const [{ data: leads, error: leadsError }, { data: prospects, error: prospectsError }] = await Promise.all([
        (supabase as any).from("leads").select("id,nom,prenoms,telephone,whatsapp,email,region_residence,statut,etape_pipeline,prochaine_relance_at,assigned_to,created_at,type_lead").or("etape_pipeline.is.null,etape_pipeline.neq.converti").order("prochaine_relance_at", { ascending: true, nullsFirst: true }),
        (supabase as any).from("prospects").select("id,lead_id,nom,prenoms,telephone,whatsapp,email,region_residence,statut,prochaine_relance_at,created_at,type_lead").order("prochaine_relance_at", { ascending: true, nullsFirst: true }),
      ]);
      if (leadsError) throw leadsError;
      if (prospectsError) throw prospectsError;
      const activeProspects = (prospects || []).filter((prospect: any) => prospect.statut !== "abandonne" && prospect.statut !== "converti");
      const prospectLeadIds = new Set(activeProspects.map((p: any) => p.lead_id).filter(Boolean));
      const normalizedLeads = (leads || [])
        .filter((lead: any) => !prospectLeadIds.has(lead.id) && legacyStage(lead) !== "converti" && lead.statut !== "converti" && lead.statut !== "abandonne")
        .map((lead: any) => ({
          ...lead,
          _type: legacyStage(lead) === "prospect" ? "Prospect" : "Lead",
          _key: "lead:" + lead.id,
          _leadId: lead.id,
          prochaine_relance: lead.prochaine_relance_at || null,
        }));
      const normalizedProspects = activeProspects
        .map((prospect: any) => {
          const linkedLead = (leads || []).find((lead: any) => lead.id === prospect.lead_id);
          return {
            ...linkedLead,
            ...prospect,
            nom: prospect.nom || linkedLead?.nom,
            prenoms: prospect.prenoms || linkedLead?.prenoms,
            telephone: prospect.telephone || linkedLead?.telephone,
            whatsapp: prospect.whatsapp || linkedLead?.whatsapp,
            email: prospect.email || linkedLead?.email,
            region_residence: prospect.region_residence || linkedLead?.region_residence,
            statut: prospect.statut || linkedLead?.statut,
            _type: "Prospect",
            _key: "prospect:" + prospect.id,
            _leadId: prospect.lead_id || null,
            prochaine_relance: prospect.prochaine_relance_at || linkedLead?.prochaine_relance_at || null,
          };
        });
      return [...normalizedLeads, ...normalizedProspects].sort((a: any, b: any) => {
        if (!a.prochaine_relance && !b.prochaine_relance) return nameOf(a).localeCompare(nameOf(b), "fr");
        if (!a.prochaine_relance) return -1;
        if (!b.prochaine_relance) return 1;
        return new Date(a.prochaine_relance).getTime() - new Date(b.prochaine_relance).getTime();
      });
    },
  });
  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["lead_relances", selected?._leadId],
    enabled: !!selected?._leadId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lead_relances")
        .select("*")
        .eq("lead_id", selected?._leadId)
        .order("date_relance", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const visible = useMemo(() => rows.filter((row: any) => {
    if (scope === "retard" && (!row.prochaine_relance || new Date(row.prochaine_relance).getTime() > startOfDay(new Date()).getTime())) return false;
    const needle = search.trim().toLocaleLowerCase("fr-FR");
    return !needle || [nameOf(row), row.telephone, row.whatsapp, row.email, row.region_residence, row._type, row.statut].some(value => String(value || "").toLocaleLowerCase("fr-FR").includes(needle));
  }), [rows, search, scope]);
  const overdueCount = rows.filter((row: any) => row.prochaine_relance && new Date(row.prochaine_relance).getTime() <= startOfDay(new Date()).getTime()).length;
  const unplannedCount = rows.filter((row: any) => !row.prochaine_relance).length;

  return <ProtectedRoute><MainLayout><div className="space-y-5 p-1 sm:p-2">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><Button variant="ghost" size="sm" onClick={() => navigate("/leads")} className="-ml-2 mb-2"><ArrowLeft className="mr-2 h-4 w-4"/>Retour aux leads et prospects</Button><h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarClock className="h-6 w-6 text-primary"/>Suivi des leads et prospects</h1><p className="mt-1 text-sm text-muted-foreground">Toutes les fiches actives, avec leur prochaine échéance ou la mention « À planifier ».</p></div>
      <Button variant="outline" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Dossiers actifs</p><p className="mt-1 text-2xl font-bold">{rows.length}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Leads</p><p className="mt-1 text-2xl font-bold">{rows.filter((row:any)=>row._type==="Lead").length}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Prospects</p><p className="mt-1 text-2xl font-bold">{rows.filter((row:any)=>row._type==="Prospect").length}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Sans échéance</p><p className="mt-1 text-2xl font-bold">{unplannedCount}</p></CardContent></Card>
    </div>
    <Card><CardContent className="space-y-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Rechercher nom, téléphone, région…"/></div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant={scope==="a_faire"?"default":"outline"} onClick={()=>setScope("a_faire")}>Tous les dossiers</Button><Button size="sm" variant={scope==="retard"?"default":"outline"} onClick={()=>setScope("retard")}>En retard / à traiter ({overdueCount})</Button></div>
      </div>
      <div className="overflow-x-auto rounded-md border"><Table searchable={false}><TableHeader><TableRow><TableHead>Contact</TableHead><TableHead>Type</TableHead><TableHead>Téléphone</TableHead><TableHead>Région</TableHead><TableHead>Statut</TableHead><TableHead>Prochaine relance</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
        <TableBody>{isLoading?<TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Chargement des dossiers…</TableCell></TableRow>:isError?<TableRow><TableCell colSpan={7} className="py-10 text-center text-destructive">Impossible de charger les dossiers. Actualise pour réessayer.</TableCell></TableRow>:visible.length===0?<TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Aucun dossier correspondant aux critères.</TableCell></TableRow>:visible.map((row:any)=><TableRow key={row._key} className="cursor-pointer hover:bg-muted/50" onClick={()=>setSelected(row)}><TableCell><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-muted-foreground"/><div><p className="font-medium">{nameOf(row)}</p><p className="text-xs text-muted-foreground">{row.email||"Aucun e-mail"}</p></div></div></TableCell><TableCell><Badge variant={row._type==="Prospect"?"default":"secondary"}>{row._type}</Badge></TableCell><TableCell className="whitespace-nowrap">{row.telephone||row.whatsapp||"—"}</TableCell><TableCell>{row.region_residence||"—"}</TableCell><TableCell>{row.statut||"—"}</TableCell><TableCell className="whitespace-nowrap"><div className="flex flex-col gap-1"><span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground"/>{dateLabel(row.prochaine_relance)}</span>{row.prochaine_relance && <Badge variant={new Date(row.prochaine_relance).getTime() <= startOfDay(new Date()).getTime() ? "destructive" : "outline"} className="w-fit">{new Date(row.prochaine_relance).getTime() <= startOfDay(new Date()).getTime() ? "À traiter" : "À venir"}</Badge>}</div></TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={event=>{event.stopPropagation();setSelected(row);}}><PhoneCall className="mr-2 h-4 w-4"/>Ouvrir le suivi</Button></TableCell></TableRow>)}</TableBody>
      </Table></div><p className="text-xs text-muted-foreground">{visible.length} dossier(s) affiché(s).</p>
    </CardContent></Card>

    <Dialog open={!!selected} onOpenChange={open=>!open&&setSelected(null)}>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
        {selected && <>
          <DialogHeader><DialogTitle>Suivi de {nameOf(selected)}</DialogTitle></DialogHeader>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Type de dossier</p><p className="font-medium">{selected._type}</p></div>
            <div><p className="text-xs text-muted-foreground">Statut</p><p className="font-medium">{selected.statut || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Téléphone</p><p className="font-medium">{selected.telephone || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">E-mail</p><p className="font-medium">{selected.email || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Région</p><p className="font-medium">{selected.region_residence || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Prochaine relance</p><p className="font-medium">{dateLabel(selected.prochaine_relance)}</p></div>
          </div>
          <div className="space-y-3 border-t pt-3">
            <h3 className="text-base font-semibold">Historique des relances</h3>
            {historyLoading ? <p className="text-sm text-muted-foreground">Chargement de l’historique…</p> : history.length === 0 ? <p className="text-sm text-muted-foreground">Aucune relance enregistrée pour ce dossier.</p> : history.map((item:any)=><div key={item.id} className="rounded-md border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><Badge>{item.canal || "Relance"}</Badge><span className="text-xs text-muted-foreground">{item.date_relance ? format(new Date(item.date_relance),"dd/MM/yyyy HH:mm",{locale:fr}) : "Date inconnue"}</span></div><p className="mt-2">{item.commentaire || "Aucun commentaire"}</p>{item.prochaine_relance && <p className="mt-1 text-xs text-muted-foreground">Prochaine échéance : {dateLabel(item.prochaine_relance)}</p>}</div>)}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </div></MainLayout></ProtectedRoute>;
};
export default RelancesLeadsProspects;
