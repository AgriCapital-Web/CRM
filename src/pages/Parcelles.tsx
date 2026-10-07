import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Layers, MapPin, Sprout } from "lucide-react";

const Parcelles = () => {
  const [parcelles, setParcelles] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: p, error: pe }, { data: c, error: ce }, { data: l, error: le }] = await Promise.all([
        (supabase as any).from("parcelles")
          .select("*, proprietaires_terres(id,id_unique,nom_complet), districts(nom), regions(nom), departements(nom), sous_prefectures(nom)")
          .order("id_unique", { ascending: true }),
        (supabase as any).from("clients")
          .select("id,id_unique,nom_complet,parcelle_id,formule_code,formule_nom,total_hectares")
          .not("parcelle_id", "is", null),
        (supabase as any).from("lots_hectares")
          .select("id,reference,parcelle_id,client_id,surface_ha,statut,numero_h")
          .order("reference", { ascending: true }),
      ]);
      if (pe) throw pe;
      if (ce) throw ce;
      if (le) throw le;
      setParcelles(p || []);
      setClients(c || []);
      setLots(l || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const clientsByParcel = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const c of clients) {
      if (!c.parcelle_id) continue;
      const arr = m.get(c.parcelle_id) || [];
      arr.push(c);
      m.set(c.parcelle_id, arr);
    }
    return m;
  }, [clients]);

  const lotsByParcel = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const l of lots) {
      if (!l.parcelle_id) continue;
      const arr = m.get(l.parcelle_id) || [];
      arr.push(l);
      m.set(l.parcelle_id, arr);
    }
    return m;
  }, [lots]);

  const filtered = parcelles.filter((p) => {
    const owner = p.proprietaires_terres?.nom_complet || "";
    const parcelClients = clientsByParcel.get(p.id) || [];
    const haystack = [
      p.id_unique, p.nom, owner, p.village,
      p.districts?.nom, p.regions?.nom, p.departements?.nom,
      ...parcelClients.map(c => c.nom_complet),
      ...parcelClients.map(c => c.id_unique),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  const totalSurface = parcelles.reduce((s, p) => s + Number(p.surface_totale_ha || 0), 0);
  const totalAgri = parcelles.reduce((s, p) => s + Number(p.surface_agricapital_ha || 0), 0);
  const totalLots = lots.length;

  const statusLabel = (s: string) =>
    s === "saturee" ? "Saturée" :
    s === "partiellement_attribuee" ? "Partiellement attribuée" :
    s === "validee" ? "Validée" :
    s === "a_valider" ? "À valider" :
    s === "disponible" ? "Disponible" : (s || "—");

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PLANTATIONS}>
      <MainLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Parcelles</h1>
            <p className="text-muted-foreground mt-1">
              Référentiel automatique des parcelles, de leur propriété et des lots AgriCapital.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card><CardContent className="p-4 flex items-center gap-3"><Layers className="h-5 w-5 text-primary" /><div><div className="text-2xl font-bold">{parcelles.length}</div><div className="text-xs text-muted-foreground">Parcelles</div></div></CardContent></Card>
            <Card><CardContent className="p-4 flex items-center gap-3"><MapPin className="h-5 w-5 text-primary" /><div><div className="text-2xl font-bold">{totalSurface.toFixed(1)}</div><div className="text-xs text-muted-foreground">ha référencés</div></div></CardContent></Card>
            <Card><CardContent className="p-4 flex items-center gap-3"><Sprout className="h-5 w-5 text-primary" /><div><div className="text-2xl font-bold">{totalAgri.toFixed(1)}</div><div className="text-xs text-muted-foreground">ha part AgriCapital</div></div></CardContent></Card>
            <Card><CardContent className="p-4 flex items-center gap-3"><Layers className="h-5 w-5 text-primary" /><div><div className="text-2xl font-bold">{totalLots}</div><div className="text-xs text-muted-foreground">lots AgriCapital</div></div></CardContent></Card>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher une parcelle, un propriétaire, un client ou un village…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table className="responsive-data-table">
              <TableHeader><TableRow>
                <TableHead>Parcelle</TableHead>
                <TableHead>Propriété</TableHead>
                <TableHead>Localisation</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Propriétaire</TableHead>
                <TableHead>Part AgriCapital</TableHead>
                <TableHead>Lots</TableHead>
                <TableHead>Clients / plantations</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={9} className="text-center py-8">Chargement…</TableCell></TableRow> :
                filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-8">Aucune parcelle</TableCell></TableRow> :
                filtered.map((p) => {
                  const parcelClients = clientsByParcel.get(p.id) || [];
                  const parcelLots = lotsByParcel.get(p.id) || [];
                  const ownClient = String(p.mode_surface || "").toLowerCase() === "propriete_client";
                  return <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs font-semibold">{p.id_unique || "—"}</TableCell>
                    <TableCell><Badge variant={ownClient ? "secondary" : "default"}>{ownClient ? "Propriété client" : "Foncier / partagé"}</Badge></TableCell>
                    <TableCell className="text-xs">{[p.departements?.nom, p.sous_prefectures?.nom, p.village].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell>{Number(p.surface_totale_ha || 0).toFixed(2)} ha</TableCell>
                    <TableCell>{p.proprietaires_terres?.nom_complet ? `Propriétaire partenaire — ${p.proprietaires_terres.nom_complet}` : (ownClient ? parcelClients[0]?.nom_complet || "Client" : "—")}</TableCell>
                    <TableCell>{Number(p.surface_agricapital_ha || 0).toFixed(2)} ha</TableCell>
                    <TableCell>{parcelLots.length || "—"}</TableCell>
                    <TableCell className="max-w-[280px] text-xs">
                      {parcelClients.length ? parcelClients.map(c => <div key={c.id}>{c.nom_complet} · {c.total_hectares} ha</div>) : "—"}
                    </TableCell>
                    <TableCell><Badge>{statusLabel(p.statut)}</Badge></TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default Parcelles;
