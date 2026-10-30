import { useCallback, useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, RefreshCw, FileText, Send, Search, Eye } from "lucide-react";
import { toast } from "sonner";

type Client = { id: string; nom_complet?: string; nom?: string; prenoms?: string; telephone: string; email?: string | null; localite?: string | null; type_compte?: string | null };
type Line = { designation: string; quantity: string; unit: string; unit_price: string; hectares: string };
type Proforma = { id: string; reference: string; client_id: string; client_name: string; client_phone: string; status: string; version: number; total_amount: number; issued_at: string | null; valid_until: string | null; created_at: string };

const money = (v: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(v || 0);
const canWriteRoles = ["pdg", "dg", "service_client", "chef_equipe_service_client"];
const statusLabels: Record<string, string> = { brouillon: "Brouillon", emise: "Émise", acceptee: "Acceptée", modification_demandee: "Modification demandée", refusee: "Refusée", en_cours: "En cours", terminee: "Terminée", annulee: "Annulée", expiree: "Expirée" };
const emptyLine = (): Line => ({ designation: "Fourniture de plants", quantity: "1", unit: "plant", unit_price: "0", hectares: "" });

export default function PrestationsIndependantes() {
  const { user, userRoles } = useAuth();
  const canWrite = userRoles.some(role => canWriteRoles.includes(role));
  const [rows, setRows] = useState<Proforma[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientType, setClientType] = useState("personne");
  const [observations, setObservations] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [selected, setSelected] = useState<Proforma | null>(null);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, c] = await Promise.all([
      (supabase as any).from("independent_service_proformas").select("*").is("archived_at", null).order("created_at", { ascending: false }).limit(300),
      (supabase as any).from("clients").select("id,nom_complet,nom,prenoms,telephone,email,localite,type_compte").order("nom_complet").limit(3000),
    ]);
    if (p.error) toast.error("Impossible de charger les proformas : " + p.error.message);
    if (c.error) toast.error("Impossible de charger les clients : " + c.error.message);
    setRows((p.data || []) as Proforma[]);
    setClients((c.data || []) as Client[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("fr");
    return rows.filter(r => !q || [r.reference, r.client_name, r.client_phone, r.status].some(v => String(v || "").toLocaleLowerCase("fr").includes(q)));
  }, [rows, search]);
  const total = useMemo(() => lines.reduce((s, l) => s + Math.max(0, Number(l.quantity) || 0) * Math.max(0, Number(l.unit_price) || 0), 0), [lines]);
  const client = clients.find(c => c.id === clientId);

  const createProforma = async () => {
    if (!canWrite || !user?.id) return;
    if (!client) { toast.error("Sélectionnez un client."); return; }
    if (!lines.length || lines.some(l => !l.designation.trim() || Number(l.quantity) <= 0 || Number(l.unit_price) < 0 || !l.unit)) {
      toast.error("Vérifiez les désignations, quantités, unités et prix unitaires."); return;
    }
    setSaving(true);
    try {
      const reference = "PS-" + new Date().toISOString().slice(0,10).replaceAll("-", "") + "-" + crypto.randomUUID().slice(0,8).toUpperCase();
      const name = client.nom_complet || [client.prenoms, client.nom].filter(Boolean).join(" ") || client.nom || "Client";
      const { data, error } = await (supabase as any).from("independent_service_proformas").insert({
        reference, client_id: client.id, client_type: clientType, client_name: name,
        client_phone: client.telephone, client_email: client.email || null, client_locality: client.localite || null,
        status: "brouillon", subtotal: total, tax_amount: 0, total_amount: total,
        observations: observations || null, created_by: user.id, updated_by: user.id,
      }).select("*").single();
      if (error) throw error;
      const itemRows = lines.map((l, i) => ({
        proforma_id: data.id, designation: l.designation.trim(), quantity: Number(l.quantity),
        unit: l.unit, unit_price: Number(l.unit_price), amount: Number(l.quantity) * Number(l.unit_price),
        hectares: l.hectares.trim() ? Number(l.hectares) : null, sort_order: i,
      }));
      const { error: itemError } = await (supabase as any).from("independent_service_items").insert(itemRows);
      if (itemError) {
        await (supabase as any).from("independent_service_proformas").delete().eq("id", data.id);
        throw itemError;
      }
      await (supabase as any).from("independent_service_events").insert({ proforma_id: data.id, event_code: "created", actor_type: "staff", actor_id: user.id });
      toast.success("Proforma créée en brouillon.");
      setDialogOpen(false); setClientId(""); setObservations(""); setLines([emptyLine()]);
      await load();
    } catch (e: any) { toast.error(e?.message || "La création a échoué."); }
    finally { setSaving(false); }
  };

  const issueProforma = async (row: Proforma) => {
    if (!canWrite || !user?.id) return;
    const issued = new Date();
    const valid = new Date(issued); valid.setDate(valid.getDate() + 15);
    const { error } = await (supabase as any).from("independent_service_proformas").update({
      status: "emise", issued_at: issued.toISOString(), valid_until: valid.toISOString().slice(0,10), updated_by: user.id,
    }).eq("id", row.id).eq("status", "brouillon");
    if (error) { toast.error(error.message); return; }
    await (supabase as any).from("independent_service_events").insert({ proforma_id: row.id, event_code: "issued", actor_type: "staff", actor_id: user.id });
    toast.success("Proforma émise. Validité : 15 jours.");
    await load();
  };

  const openDetails = async (row: Proforma) => {
    const { data, error } = await (supabase as any).from("independent_service_items").select("*").eq("proforma_id", row.id).order("sort_order");
    if (error) { toast.error(error.message); return; }
    setSelected(row); setSelectedItems(data || []);
  };

  return <MainLayout>
    <div className="mx-auto max-w-7xl space-y-6 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Prestations indépendantes</h1><p className="text-sm text-muted-foreground">Gestion des prestations, devis et proformas hors offres d’acquisition.</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button>
          {canWrite && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4"/>Nouvelle proforma</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
              <DialogHeader><DialogTitle>Créer une proforma indépendante</DialogTitle></DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2"><Label>Client</Label><Select value={clientId} onValueChange={setClientId}><SelectTrigger><SelectValue placeholder="Sélectionner un client existant"/></SelectTrigger><SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nom_complet || [c.prenoms,c.nom].filter(Boolean).join(" ") || c.nom} · {c.telephone}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Type de client</Label><Select value={clientType} onValueChange={setClientType}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="personne">Particulier</SelectItem><SelectItem value="entreprise">Entreprise</SelectItem><SelectItem value="groupe_familial">Groupe familial</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>Observations</Label><Input value={observations} onChange={e=>setObservations(e.target.value)} placeholder="Facultatif"/></div>
              </div>
              <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Détail des prestations</h3><Button size="sm" variant="outline" onClick={()=>setLines(v=>[...v,emptyLine()])}><Plus className="mr-1 h-4 w-4"/>Ajouter une ligne</Button></div>
                {lines.map((line,i)=><div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12">
                  <div className="space-y-1 sm:col-span-4"><Label>Désignation</Label><Input value={line.designation} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,designation:e.target.value}:x))}/></div>
                  <div className="space-y-1 sm:col-span-2"><Label>Quantité</Label><Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,quantity:e.target.value}:x))}/></div>
                  <div className="space-y-1 sm:col-span-2"><Label>Unité</Label><Select value={line.unit} onValueChange={value=>setLines(v=>v.map((x,j)=>j===i?{...x,unit:value}:x))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["ha","plant","u","j","h","forfait"].map(u=><SelectItem key={u} value={u}>{u==="plant"?"Plant":u==="u"?"Unité":u==="j"?"Jour":u==="h"?"Heure":u==="ha"?"Hectare":"Forfait"}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1 sm:col-span-2"><Label>Prix unitaire</Label><Input type="number" min="0" value={line.unit_price} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,unit_price:e.target.value}:x))}/></div>
                  <div className="space-y-1 sm:col-span-2"><Label>Superficie (ha)</Label><Input type="number" min="0" step="0.001" value={line.hectares} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,hectares:e.target.value}:x))} placeholder="Optionnel"/></div>
                  <div className="flex items-center justify-between sm:col-span-12"><span className="text-sm text-muted-foreground">Montant : {money((Number(line.quantity)||0)*(Number(line.unit_price)||0))}</span>{lines.length>1&&<Button size="sm" variant="ghost" onClick={()=>setLines(v=>v.filter((_,j)=>j!==i))}>Retirer</Button>}</div>
                </div>)}
              </div>
              <div className="flex items-center justify-between border-t pt-3"><span className="font-semibold">Total HT / Total</span><span className="text-xl font-bold">{money(total)}</span></div>
              <p className="text-xs text-muted-foreground">Aucun taux de taxe n’est appliqué automatiquement. La proforma sera créée en brouillon et ne constitue ni une facture ni un encaissement.</p>
              <Button onClick={()=>void createProforma()} disabled={saving}>{saving?"Enregistrement…":"Créer le brouillon"}</Button>
            </DialogContent>
          </Dialog>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Proformas</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{rows.length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Proformas émises</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{rows.filter(r=>r.status!=="brouillon").length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Montant des proformas</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{money(rows.filter(r=>r.status!=="brouillon").reduce((s,r)=>s+Number(r.total_amount||0),0))}</CardContent></Card>
      </div>
      <div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher une référence, un client ou un statut…" className="max-w-md"/></div>
      <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Référence</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead><TableHead>Validité</TableHead><TableHead>Montant</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
        {loading?<TableRow><TableCell colSpan={7} className="py-8 text-center">Chargement…</TableCell></TableRow>:filtered.length===0?<TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Aucune proforma indépendante.</TableCell></TableRow>:filtered.map(r=><TableRow key={r.id}><TableCell className="font-medium">{r.reference} <span className="text-xs text-muted-foreground">v{r.version}</span></TableCell><TableCell>{r.client_name}<div className="text-xs text-muted-foreground">{r.client_phone}</div></TableCell><TableCell>{new Date(r.issued_at||r.created_at).toLocaleDateString("fr-FR")}</TableCell><TableCell>{r.valid_until?new Date(r.valid_until+"T00:00:00").toLocaleDateString("fr-FR"):"—"}</TableCell><TableCell>{money(Number(r.total_amount))}</TableCell><TableCell><Badge variant="outline">{statusLabels[r.status]||r.status}</Badge></TableCell><TableCell className="space-x-1 text-right"><Button size="sm" variant="ghost" onClick={()=>void openDetails(r)}><Eye className="h-4 w-4"/></Button>{canWrite&&r.status==="brouillon"&&<Button size="sm" onClick={()=>void issueProforma(r)}><Send className="mr-1 h-3 w-3"/>Émettre</Button>}</TableCell></TableRow>)}
      </TableBody></Table></CardContent></Card>
      <Dialog open={!!selected} onOpenChange={open=>!open&&setSelected(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Proforma {selected?.reference}</DialogTitle></DialogHeader>{selected&&<div className="space-y-4"><div className="flex justify-between"><div><p className="font-semibold">{selected.client_name}</p><p className="text-sm text-muted-foreground">{selected.client_phone}</p></div><Badge>{statusLabels[selected.status]||selected.status}</Badge></div><Table><TableHeader><TableRow><TableHead>Désignation</TableHead><TableHead>Qté</TableHead><TableHead>Unité</TableHead><TableHead>Prix unitaire</TableHead><TableHead>Montant</TableHead></TableRow></TableHeader><TableBody>{selectedItems.map(item=><TableRow key={item.id}><TableCell>{item.designation}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>{item.unit}</TableCell><TableCell>{money(Number(item.unit_price))}</TableCell><TableCell>{money(Number(item.amount))}</TableCell></TableRow>)}</TableBody></Table><div className="text-right text-lg font-bold">Total : {money(Number(selected.total_amount))}</div><p className="text-xs text-muted-foreground">Document de consultation interne. L’émission PDF officielle, la validation client sécurisée et les paiements en ligne seront activés avec les services dédiés.</p></div>}</DialogContent></Dialog>
    </div>
  </MainLayout>;
}
