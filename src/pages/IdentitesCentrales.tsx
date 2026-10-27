import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useSystemReferences } from "@/hooks/useSystemReferences";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Users, AlertTriangle, Link2 } from "lucide-react";

const MODULE_LABELS: Record<string, string> = {
  leads: "Lead",
  prospects: "Prospect",
  clients: "Client",
  proprietaires_terres: "Propriétaire foncier",
};

export default function IdentitesCentrales() {
  const { can } = usePermissions();
  const canView = can("leads.view") || can("prospects.view") || can("clients.view") || can("proprietaires.view");
  const { byCategory: refs } = useSystemReferences(["type_personne"]);
  const [search, setSearch] = useState("");
  const [showDuplicates, setShowDuplicates] = useState(false);

  const partiesQuery = useQuery({
    queryKey: ["crm-central-identities"],
    enabled: canView && navigator.onLine,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("crm_parties")
        .select("id,type_personne,civilite,nom,prenoms,nom_complet,denomination_sociale,nom_famille,telephone,email,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const linksQuery = useQuery({
    queryKey: ["crm-central-identity-links"],
    enabled: canView && navigator.onLine,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("crm_party_links")
        .select("id,party_id,module_code,record_id,linked_at")
        .order("linked_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const duplicatesQuery = useQuery({
    queryKey: ["crm-central-identity-duplicates"],
    enabled: canView && navigator.onLine && showDuplicates,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("crm_party_duplicate_review")
        .select("party_id_a,party_id_b,nom_a,nom_b,telephone_a,telephone_b,email_a,email_b,motif");
      if (error) throw error;
      return data || [];
    },
  });

  const parties = partiesQuery.data || [];
  const links = linksQuery.data || [];
  const partyIds = useMemo(() => new Set(parties.map((p: any) => p.id)), [parties]);
  const linksByParty = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const link of links) (grouped[link.party_id] ||= []).push(link);
    return grouped;
  }, [links]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("fr-FR");
    if (!term) return parties;
    return parties.filter((p: any) => [p.nom_complet, p.denomination_sociale, p.nom_famille, p.nom, p.prenoms, p.telephone, p.email]
      .some((value) => String(value || "").toLocaleLowerCase("fr-FR").includes(term)));
  }, [parties, search]);
  const typeLabel = (code: string) => refs("type_personne").find((r: any) => r.code === code)?.libelle || code;
  const duplicateRows = (duplicatesQuery.data || []).filter((d: any) => partyIds.has(d.party_id_a) && partyIds.has(d.party_id_b));

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Identités centrales</h1>
              <p className="text-sm text-muted-foreground">Répertoire transversal relié aux leads, prospects, clients et propriétaires fonciers.</p>
            </div>
            <Badge variant="outline">{parties.length} fiche(s)</Badge>
          </div>
          {!canView && <Card><CardContent className="p-5 text-sm text-muted-foreground">Votre rôle ne dispose d’aucune permission de consultation des identités CRM.</CardContent></Card>}
          {canView && <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card><CardContent className="flex items-center gap-3 p-4"><Users className="h-5 w-5 text-primary"/><div><p className="text-xs text-muted-foreground">Fiches centrales</p><p className="text-xl font-bold">{parties.length}</p></div></CardContent></Card>
              <Card><CardContent className="flex items-center gap-3 p-4"><Link2 className="h-5 w-5 text-primary"/><div><p className="text-xs text-muted-foreground">Liens vers les modules</p><p className="text-xl font-bold">{links.length}</p></div></CardContent></Card>
              <Card><CardContent className="flex items-center gap-3 p-4"><AlertTriangle className="h-5 w-5 text-amber-600"/><div><p className="text-xs text-muted-foreground">Doublons à examiner</p><p className="text-xl font-bold">{duplicateRows.length}</p></div></CardContent></Card>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un nom, une organisation, un téléphone ou un e-mail"/></div>
              <Button type="button" variant={showDuplicates ? "default" : "outline"} onClick={()=>setShowDuplicates(v=>!v)}>{showDuplicates ? "Masquer les doublons" : "Examiner les doublons"}</Button>
            </div>
            {showDuplicates && <Card><CardHeader><CardTitle className="text-base">Paires à vérifier avant toute fusion</CardTitle></CardHeader><CardContent className="space-y-2">
              {duplicatesQuery.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
              {duplicateRows.length===0 && !duplicatesQuery.isLoading && <p className="text-sm text-muted-foreground">Aucune paire visible à examiner.</p>}
              {duplicateRows.map((d:any)=><div key={d.party_id_a+d.party_id_b} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                <div><p className="font-medium">{d.nom_a || "Identité sans nom"}</p><p className="text-xs text-muted-foreground">{d.telephone_a || d.email_a || "Aucun contact"}</p></div>
                <div><p className="font-medium">{d.nom_b || "Identité sans nom"}</p><p className="text-xs text-muted-foreground">{d.telephone_b || d.email_b || "Aucun contact"}</p></div>
                <div className="sm:col-span-2"><Badge variant="outline">{d.motif}</Badge><p className="mt-1 text-xs text-muted-foreground">Cette paire est une suggestion de contrôle, pas une fusion automatique.</p></div>
              </div>)}
            </CardContent></Card>}
            <Card><CardHeader><CardTitle className="text-base">Répertoire des identités</CardTitle></CardHeader><CardContent className="space-y-2">
              {partiesQuery.isLoading || linksQuery.isLoading ? <p className="text-sm text-muted-foreground">Chargement des fiches…</p> : null}
              {!partiesQuery.isLoading && filtered.length===0 && <p className="text-sm text-muted-foreground">Aucune identité ne correspond à cette recherche.</p>}
              {filtered.map((p:any)=><div key={p.id} className="rounded-lg border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><p className="font-semibold">{p.denomination_sociale || p.nom_famille || p.nom_complet || [p.prenoms,p.nom].filter(Boolean).join(" ") || "Identité sans nom"}</p>
                    {p.type_personne==="personne_physique" && <p className="text-sm text-muted-foreground">{[p.civilite,p.prenoms,p.nom].filter(Boolean).join(" ")}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{[p.telephone,p.email].filter(Boolean).join(" · ") || "Aucune coordonnée"}</p>
                  </div>
                  <Badge variant="outline">{typeLabel(p.type_personne)}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(linksByParty[p.id] || []).map((l:any)=><Badge key={l.id} variant="secondary">{MODULE_LABELS[l.module_code] || l.module_code}</Badge>)}
                  {!(linksByParty[p.id] || []).length && <Badge variant="outline">Non reliée</Badge>}
                </div>
              </div>)}
            </CardContent></Card>
          </>}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
