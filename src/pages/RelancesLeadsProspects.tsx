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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Search, PhoneCall, CalendarClock, UserRound, RefreshCw } from "lucide-react";
import { format, isValid, parseISO, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";

type RelanceRow = Record<string, any>;
const dateLabel = (value?: string | null) => {
  if (!value) return "Non planifiée";
  const date = parseISO(value);
  return isValid(date) ? format(date, "dd MMM yyyy", { locale: fr }) : "—";
};
const nameOf = (row: RelanceRow) => [row.nom, row.prenoms].filter(Boolean).join(" ").trim() || "Sans nom";

const RelancesLeadsProspects = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"a_faire" | "toutes">("a_faire");
  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["leads-prospects-relances-page"],
    queryFn: async () => {
      const [{ data: leads, error: leadsError }, { data: prospects, error: prospectsError }] = await Promise.all([
        (supabase as any).from("leads").select("id,nom,prenoms,telephone,whatsapp,email,region_residence,statut,etape_pipeline,prochaine_relance_at,assigned_to,created_at").not("etape_pipeline", "eq", "converti").order("prochaine_relance_at", { ascending: true, nullsFirst: false }),
        (supabase as any).from("prospects").select("id,lead_id,nom,prenoms,telephone,whatsapp,email,region_residence,statut,prochaine_relance_at,created_at").order("prochaine_relance_at", { ascending: true, nullsFirst: false }),
      ]);
      if (leadsError) throw leadsError;
      if (prospectsError) throw prospectsError;
      const prospectLeadIds = new Set((prospects || []).map((p: any) => p.lead_id).filter(Boolean));
      const normalizedLeads = (leads || []).filter((l: any) => !prospectLeadIds.has(l.id)).map((l: any) => ({ ...l, _type: l.etape_pipeline === "prospect" ? "Prospect" : "Lead", _key: "lead:"+l.id, _leadId: l.id, prochaine_relance: l.prochaine_relance_at || null }));
      const normalizedProspects = (prospects || []).map((p: any) => ({ ...p, _type: "Prospect", _key: "prospect:"+p.id, _leadId: p.lead_id || null, prochaine_relance: p.prochaine_relance_at || null }));
      const all = [...normalizedLeads, ...normalizedProspects];
      return all.filter((r: any) => Boolean(r.prochaine_relance))
        .sort((a: any,b: any) => new Date(a.prochaine_relance).getTime() - new Date(b.prochaine_relance).getTime());
    },
  });
  const visible = useMemo(() => rows.filter((r: any) => {
    if (scope === "a_faire" && (!r.prochaine_relance || new Date(r.prochaine_relance).getTime() > startOfDay(new Date()).getTime())) return false;
    const needle = search.trim().toLocaleLowerCase("fr-FR");
    return !needle || [nameOf(r), r.telephone, r.whatsapp, r.email, r.region_residence, r._type, r.statut].some(v => String(v || "").toLocaleLowerCase("fr-FR").includes(needle));
  }), [rows, search, scope]);
  return <ProtectedRoute><MainLayout><div className="space-y-5 p-1 sm:p-2">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><Button variant="ghost" size="sm" onClick={() => navigate("/leads")} className="-ml-2 mb-2"><ArrowLeft className="mr-2 h-4 w-4"/>Retour aux leads et prospects</Button><h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarClock className="h-6 w-6 text-primary"/>Relances à effectuer</h1><p className="mt-1 text-sm text-muted-foreground">Vue opérationnelle des leads et prospects dont la date de relance est arrivée ou dépassée.</p></div>
      <Button variant="outline" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Relances à traiter</p><p className="mt-1 text-2xl font-bold">{rows.length}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Leads</p><p className="mt-1 text-2xl font-bold">{rows.filter((r:any)=>r._type==="Lead").length}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Prospects</p><p className="mt-1 text-2xl font-bold">{rows.filter((r:any)=>r._type==="Prospect").length}</p></CardContent></Card>
    </div>
    <Card><CardContent className="space-y-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher nom, téléphone, région…"/></div>
        <div className="flex gap-2"><Button size="sm" variant={scope==="a_faire"?"default":"outline"} onClick={()=>setScope("a_faire")}>À traiter</Button><Button size="sm" variant={scope==="toutes"?"default":"outline"} onClick={()=>setScope("toutes")}>Historique chargé</Button></div>
      </div>
      <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Contact</TableHead><TableHead>Type</TableHead><TableHead>Téléphone</TableHead><TableHead>Région</TableHead><TableHead>Statut</TableHead><TableHead>Échéance</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
        <TableBody>{isLoading?<TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Chargement des relances…</TableCell></TableRow>:isError?<TableRow><TableCell colSpan={7} className="py-10 text-center text-destructive">Impossible de charger les relances. Actualise pour réessayer.</TableCell></TableRow>:visible.length===0?<TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Aucune relance correspondant aux critères.</TableCell></TableRow>:visible.map((r:any)=><TableRow key={r._key} className="cursor-pointer hover:bg-muted/50" onClick={()=>navigate("/leads")}><TableCell><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-muted-foreground"/><div><p className="font-medium">{nameOf(r)}</p><p className="text-xs text-muted-foreground">{r.email||"Aucun e-mail"}</p></div></div></TableCell><TableCell><Badge variant={r._type==="Prospect"?"default":"secondary"}>{r._type}</Badge></TableCell><TableCell className="whitespace-nowrap">{r.telephone||r.whatsapp||"—"}</TableCell><TableCell>{r.region_residence||"—"}</TableCell><TableCell>{r.statut||"—"}</TableCell><TableCell className="whitespace-nowrap"><span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground"/>{dateLabel(r.prochaine_relance)}</span></TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={e=>{e.stopPropagation();navigate("/leads");}}><PhoneCall className="mr-2 h-4 w-4"/>Ouvrir le suivi</Button></TableCell></TableRow>)}</TableBody>
      </Table></div><p className="text-xs text-muted-foreground">{visible.length} résultat(s) affiché(s). Cette vue n’ajoute aucun lien au menu principal.</p>
    </CardContent></Card>
  </div></MainLayout></ProtectedRoute>;
};
export default RelancesLeadsProspects;
