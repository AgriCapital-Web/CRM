import { useEffect, useMemo, useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Eye, Pencil } from "lucide-react";
import { Search, Layers, MapPin, Sprout } from "lucide-react";

const Parcelles = () => {
  const [parcelles, setParcelles] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [plantations, setPlantations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { can, capabilities } = usePermissions();
  const canEditParcel = can("parcelles.update") && !capabilities.globalAdmin;
  const { toast } = useToast();
  const [selectedParcel, setSelectedParcel] = useState<any | null>(null);
  const [editParcel, setEditParcel] = useState(false);
  const [parcelSaving, setParcelSaving] = useState(false);
  const [parcelForm, setParcelForm] = useState({ nom: "", village: "", surface_totale_ha: "", surface_agricapital_ha: "", statut: "disponible" });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: p, error: pe }, { data: c, error: ce }, { data: l, error: le }, { data: plant, error: ple }] = await Promise.all([
        (supabase as any).from("parcelles")
          .select("*, proprietaires_terres(id,id_unique,nom_complet), districts(nom), regions(nom), departements(nom), sous_prefectures(nom)")
          .order("id_unique", { ascending: true }),
        (supabase as any).from("clients")
          .select("id,id_unique,nom_complet,parcelle_id,formule_code,formule_nom,total_hectares,statut,validation_statut")
          .not("parcelle_id", "is", null),
        (supabase as any).from("lots_hectares")
          .select("id,reference,parcelle_id,client_id,surface_ha,statut,numero_h")
          .order("reference", { ascending: true }),
        (supabase as any).from("plantations").select("id,parcelle_id,client_id,statut,surface_reellement_plantee,superficie_ha"),
      ]);
      if (pe) throw pe;
      if (ce) throw ce;
      if (le) throw le;
      if (ple) throw ple;
      setParcelles(p || []);
      setClients(c || []);
      setLots(l || []);
      setPlantations(plant || []);
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

  const plantationsByParcel = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const planting of plantations) {
      if (!planting.parcelle_id) continue;
      const rows = map.get(planting.parcelle_id) || [];
      rows.push(planting);
      map.set(planting.parcelle_id, rows);
    }
    return map;
  }, [plantations]);

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

  const openParcel = (parcel: any) => {
    setSelectedParcel(parcel);
    setParcelForm({ nom: parcel.nom || "", village: parcel.village || "", surface_totale_ha: String(parcel.surface_totale_ha ?? ""), surface_agricapital_ha: String(parcel.surface_agricapital_ha ?? ""), statut: parcel.statut || "disponible" });
    setEditParcel(false);
  };
  const saveParcel = async () => {
    if (!selectedParcel || !canEditParcel || parcelSaving) return;
    const total = Number(parcelForm.surface_totale_ha), share = Number(parcelForm.surface_agricapital_ha);
    if (!Number.isFinite(total) || total < 0 || !Number.isFinite(share) || share < 0 || share > total) {
      toast({ title: "Surfaces invalides", variant: "destructive" }); return;
    }
    setParcelSaving(true);
    try {
      const { data, error } = await (supabase as any).from("parcelles").update({
        nom: parcelForm.nom.trim() || null, village: parcelForm.village.trim() || null,
        surface_totale_ha: total, surface_agricapital_ha: share, statut: parcelForm.statut,
      }).eq("id", selectedParcel.id).select("*, proprietaires_terres(id,id_unique,nom_complet), districts(nom), regions(nom), departements(nom), sous_prefectures(nom)").single();
      if (error) throw error;
      setParcelles(current => current.map(row => row.id === data.id ? data : row));
      setSelectedParcel(data); setEditParcel(false); toast({ title: "Parcelle modifiée" });
    } catch (error: any) {
      toast({ title: "Modification impossible", description: error?.message || "Erreur d’enregistrement.", variant: "destructive" });
    } finally { setParcelSaving(false); }
  };

  const totalSurface = parcelles.reduce((s, p) => s + Number(p.surface_totale_ha || 0), 0);
  // Part AgriCapital réellement non cédée : part contractuelle moins les hectares déjà attribués.
  // Les parcelles appartenant directement aux clients et les dossiers fonciers non validés sont exclues.
  const totalAgri = parcelles.reduce((sum, p) => {
    const clientOwned = String(p.nom || "").toLowerCase().startsWith("parcelle client") || ["propriete_client","propriete","client"].includes(String(p.mode_surface || "").toLowerCase());
    const unvalidated = ["a_valider", "brouillon", "en_attente"].includes(String(p.statut || "").toLowerCase());
    if (clientOwned || unvalidated) return sum;
    return sum + Math.max(0, Number(p.surface_agricapital_ha || 0) - Number(p.surface_attribuee_ha || 0));
  }, 0);
  const totalLots = lots.filter((lot: any) => !lot.client_id && !["attribue","attribuée","cede","cédé","cedee","cédée"].includes(String(lot.statut || "").toLowerCase())).length;

  const statusLabel = (p: any, parcelClients: any[], parcelPlantations: any[]) => {
    const activePlantation = parcelPlantations.some((planting) => ["actif", "active", "plantee", "plantée", "en_cours"].includes(String(planting.statut || "").toLowerCase()));
    const validatedClient = parcelClients.some((client) => ["valide", "validee", "validé", "validée", "actif", "active"].includes(String(client.validation_statut || client.statut || "").toLowerCase()));
    if (activePlantation && validatedClient && p.statut === "disponible") return "Plantation active";
    return p.statut === "saturee" ? "Saturée" : p.statut === "partiellement_attribuee" ? "Partiellement attribuée" : p.statut === "validee" ? "Validée" : p.statut === "a_valider" ? "À valider" : p.statut === "disponible" ? "Disponible" : (p.statut || "—");
  };

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PLANTATIONS}>
      <MainLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Parcelles</h1>
            
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            <Card><CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3"><Layers className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" /><div className="min-w-0"><div className="text-xl sm:text-2xl font-bold">{parcelles.length}</div><div className="text-[11px] sm:text-xs leading-tight text-muted-foreground">Parcelles</div></div></CardContent></Card>
            <Card><CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3"><MapPin className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" /><div className="min-w-0"><div className="text-xl sm:text-2xl font-bold">{totalSurface.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</div><div className="text-[11px] sm:text-xs leading-tight text-muted-foreground">ha référencés</div></div></CardContent></Card>
            <Card><CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3"><Sprout className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" /><div className="min-w-0"><div className="text-xl sm:text-2xl font-bold">{totalAgri.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</div><div className="text-[11px] sm:text-xs leading-tight text-muted-foreground">ha AgriCapital non cédés</div></div></CardContent></Card>
            <Card><CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3"><Layers className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" /><div className="min-w-0"><div className="text-xl sm:text-2xl font-bold">{totalLots}</div><div className="text-[11px] sm:text-xs leading-tight text-muted-foreground">lots AgriCapital disponibles</div></div></CardContent></Card>
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
                <TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={9} className="text-center py-8">Chargement…</TableCell></TableRow> :
                filtered.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center py-8">Aucune parcelle</TableCell></TableRow> :
                filtered.map((p) => {
                  const parcelClients = clientsByParcel.get(p.id) || [];
                  const parcelLots = lotsByParcel.get(p.id) || [];
                  const parcelPlantations = plantationsByParcel.get(p.id) || [];
                  const ownClient = String(p.mode_surface || "").toLowerCase() === "propriete_client";
                  return <TableRow key={p.id} role="button" tabIndex={0} aria-label={"Consulter la parcelle " + (p.nom || p.id_unique || "")} onClick={() => openParcel(p)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openParcel(p); } }} className="cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <TableCell className="font-medium">{p.nom || p.village || "Parcelle"}</TableCell>
                    <TableCell><Badge variant={ownClient ? "secondary" : "default"} className={ownClient ? "border-[#22a45d]/35 bg-[#22a45d]/12 text-[#168348] dark:bg-[#22a45d]/20 dark:text-[#7be0a2]" : ""}>{ownClient ? "Propriété client" : "Foncier / partagé"}</Badge></TableCell>
                    <TableCell className="text-xs">{[p.departements?.nom, p.sous_prefectures?.nom, p.village].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell>{Number(p.surface_totale_ha || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha</TableCell>
                    <TableCell>{p.proprietaires_terres?.nom_complet ? p.proprietaires_terres.nom_complet : (ownClient ? parcelClients[0]?.nom_complet || "Client" : "—")}</TableCell>
                    <TableCell>{Number(p.surface_agricapital_ha || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha</TableCell>
                    <TableCell>{parcelLots.length || "—"}</TableCell>
                    <TableCell className="max-w-[280px] text-xs">
                      {parcelClients.length ? parcelClients.map(c => <div key={c.id}>{c.nom_complet} · {c.total_hectares} ha</div>) : "—"}
                    </TableCell>
                    <TableCell><Badge>{statusLabel(p, parcelClients, parcelPlantations)}</Badge></TableCell><TableCell className="text-right"><div className="inline-flex gap-1" onClick={event => event.stopPropagation()}><Button type="button" size="icon" variant="ghost" aria-label="Consulter" onClick={() => openParcel(p)}><Eye className="h-4 w-4" /></Button>{canEditParcel && <Button type="button" size="icon" variant="ghost" aria-label="Modifier" onClick={() => { openParcel(p); setEditParcel(true); }}><Pencil className="h-4 w-4" /></Button>}</div></TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table>
          </div>

          <Dialog open={!!selectedParcel} onOpenChange={open => { if (!open && !parcelSaving) { setSelectedParcel(null); setEditParcel(false); } }}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              <DialogHeader><DialogTitle>{editParcel ? "Modifier la parcelle" : selectedParcel?.nom || selectedParcel?.id_unique || "Fiche parcelle"}</DialogTitle></DialogHeader>
              {selectedParcel && <div className="space-y-4">
                {editParcel ? <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label>Nom de la parcelle</Label><Input value={parcelForm.nom} onChange={e => setParcelForm(v => ({ ...v, nom: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Village</Label><Input value={parcelForm.village} onChange={e => setParcelForm(v => ({ ...v, village: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Superficie totale (ha)</Label><Input type="number" min="0" step="0.01" value={parcelForm.surface_totale_ha} onChange={e => setParcelForm(v => ({ ...v, surface_totale_ha: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Part AgriCapital (ha)</Label><Input type="number" min="0" step="0.01" value={parcelForm.surface_agricapital_ha} onChange={e => setParcelForm(v => ({ ...v, surface_agricapital_ha: e.target.value }))} /></div>
                  <div className="space-y-1 sm:col-span-2"><Label>Statut</Label><Select value={parcelForm.statut} onValueChange={statut => setParcelForm(v => ({ ...v, statut }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="disponible">Disponible</SelectItem><SelectItem value="partiellement_attribuee">Partiellement attribuée</SelectItem><SelectItem value="saturee">Saturée</SelectItem><SelectItem value="validee">Validée</SelectItem><SelectItem value="a_valider">À valider</SelectItem></SelectContent></Select></div>
                </div> : <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label>Identifiant</Label><p className="font-medium">{selectedParcel.id_unique || "—"}</p></div>
                  <div><Label>Propriétaire</Label><p className="font-medium">{selectedParcel.proprietaires_terres?.nom_complet || "—"}</p></div>
                  <div><Label>Village</Label><p className="font-medium">{selectedParcel.village || "—"}</p></div>
                  <div><Label>Localisation</Label><p className="font-medium">{[selectedParcel.departements?.nom, selectedParcel.sous_prefectures?.nom, selectedParcel.districts?.nom, selectedParcel.regions?.nom].filter(Boolean).join(" · ") || "—"}</p></div>
                  <div><Label>Superficie totale</Label><p className="font-medium">{Number(selectedParcel.surface_totale_ha || 0).toLocaleString("fr-FR")} ha</p></div>
                  <div><Label>Part AgriCapital</Label><p className="font-medium">{Number(selectedParcel.surface_agricapital_ha || 0).toLocaleString("fr-FR")} ha</p></div>
                  <div><Label>Statut</Label><p className="font-medium">{statusLabel(selectedParcel, clientsByParcel.get(selectedParcel.id) || [], plantationsByParcel.get(selectedParcel.id) || [])}</p></div>
                </div>}
                <div className="flex justify-end gap-2">{editParcel ? <><Button type="button" variant="outline" onClick={() => setEditParcel(false)} disabled={parcelSaving}>Annuler</Button><Button type="button" onClick={() => void saveParcel()} disabled={parcelSaving}>{parcelSaving ? "Enregistrement…" : "Enregistrer"}</Button></> : <><Button type="button" variant="outline" onClick={() => setSelectedParcel(null)}>Fermer</Button>{canEditParcel && <Button type="button" onClick={() => setEditParcel(true)}>Modifier</Button>}</>}</div>
              </div>}
            </DialogContent>
          </Dialog>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default Parcelles;
