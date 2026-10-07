import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, MapPin, Layers, Ruler, Upload } from "lucide-react";
import GeographieCascade from "@/components/common/GeographieCascade";
import { offlineInsert } from "@/lib/offlineWrite";
import { getSafeErrorMessage } from "@/lib/safeError";
import { uploadFile } from "@/utils/storage";

const ProprietaireTerreDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [owner, setOwner] = useState<any>(null);
  const [parcelles, setParcelles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ownerDocuments,setOwnerDocuments]=useState<any[]>([]);
  const [ownerDocumentFile,setOwnerDocumentFile]=useState<File|null>(null);
  const [ownerDocumentLabel,setOwnerDocumentLabel]=useState("");
  const [form, setForm] = useState({
    nom: "", surface_totale_ha: "", district_id: "", region_id: "", departement_id: "",
    sous_prefecture_id: "", village: "", date_convention: "", notes: "",
  });

  const uploadOwnerDocument=async()=>{if(!id||!ownerDocumentFile)return;try{const uploaded=await uploadFile("documents-fonciers",ownerDocumentFile,`proprietaires/${id}/${Date.now()}-${ownerDocumentFile.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`);if(!uploaded)throw new Error("Téléversement impossible");const {error}=await (supabase as any).from("documents_convention").insert({proprietaire_id:id,type_document:"annexe_libre",designation:ownerDocumentLabel.trim()||ownerDocumentFile.name,statut:"en_attente",fichier_url:uploaded.url,notes:null,uploaded_by:null});if(error)throw error;toast({title:"Document foncier ajouté"});setOwnerDocumentFile(null);setOwnerDocumentLabel("");await load();}catch(e:any){toast({variant:"destructive",title:"Téléversement impossible",description:getSafeErrorMessage(e)});}};

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [ownerRes, parcelRes, docRes] = await Promise.all([
        (supabase as any).from("proprietaires_terres").select("*").eq("id", id).maybeSingle(),
        (supabase as any).from("parcelles")
          .select("*, districts(nom), regions(nom), departements(nom), sous_prefectures(nom)")
          .eq("proprietaire_id", id)
          .order("created_at", { ascending: true }),
        (supabase as any).from("documents_convention").select("*").eq("proprietaire_id",id).order("created_at",{ascending:true}),
      ]);
      if (ownerRes.error) throw ownerRes.error;
      if (parcelRes.error) throw parcelRes.error;
      setOwner(ownerRes.data);
      setParcelles(parcelRes.data || []);
      setOwnerDocuments(docRes.data || []);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id]);

  const totals = useMemo(() => ({
    count: parcelles.length,
    total: parcelles.reduce((s, p) => s + Number(p.surface_totale_ha || 0), 0),
    available: parcelles.reduce((s, p) => {
      const ac = Number(p.surface_agricapital_ha ?? p.surface_totale_ha ?? 0);
      const used = Number(p.surface_attribuee_ha || 0);
      return s + Math.max(0, ac - used);
    }, 0),
  }), [parcelles]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const surface = Number(form.surface_totale_ha);
    if (!Number.isFinite(surface) || surface < 2) {
      toast({ variant: "destructive", title: "Surface invalide", description: "La surface doit être d’au moins 2 hectares." });
      return;
    }
    setSaving(true);
    try {
      const { error } = await offlineInsert("parcelles", {
        proprietaire_id: id,
        nom: form.nom || `Parcelle — ${owner?.nom_complet || "Propriétaire"}`,
        surface_totale_ha: surface,
        surface_proprietaire_ha: surface / 2,
        surface_agricapital_ha: surface / 2,
        surface_attribuee_ha: 0,
        surface_disponible_ha: surface / 2,
        district_id: form.district_id || null,
        region_id: form.region_id || null,
        departement_id: form.departement_id || null,
        sous_prefecture_id: form.sous_prefecture_id || null,
        village: form.village || null,
        date_convention: form.date_convention || null,
        notes: form.notes || null,
        statut: "disponible",
      });
      if (error) throw error;
      toast({ title: "Parcelle enregistrée" });
      setOpen(false);
      setForm({ nom: "", surface_totale_ha: "", district_id: "", region_id: "", departement_id: "", sous_prefecture_id: "", village: "", date_convention: "", notes: "" });
      await load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Enregistrement impossible", description: getSafeErrorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><MainLayout><div className="py-20 text-center">Chargement…</div></MainLayout></ProtectedRoute>;
  if (!owner) return <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><MainLayout><Card><CardContent className="py-10 text-center">Propriétaire introuvable.</CardContent></Card></MainLayout></ProtectedRoute>;

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}>
      <MainLayout>
        <div className="min-w-0 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate("/proprietaires-terres")}><ArrowLeft className="mr-2 h-4 w-4" />Retour</Button>
              <div>
                <p className="text-xs font-mono text-muted-foreground">{owner.id_unique}</p>
                <h1 className="text-2xl font-bold">{owner.nom_complet}</h1>
              </div>
            </div>
            <Badge>{owner.statut === "actif" ? "Actif" : owner.statut}</Badge>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Parcelles</p><p className="mt-1 text-2xl font-bold">{totals.count}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Surface totale</p><p className="mt-1 text-2xl font-bold">{totals.total.toFixed(2)} ha</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Surface disponible</p><p className="mt-1 text-2xl font-bold">{totals.available.toFixed(2)} ha</p></CardContent></Card>
          </div>

          <Card><CardHeader><CardTitle className="flex items-center justify-between gap-3"><span>Documents fonciers</span><label className="inline-flex"><input type="file" className="hidden" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={e=>setOwnerDocumentFile(e.target.files?.[0]||null)}/><Button variant="outline" size="sm" asChild><span><Upload className="mr-2 h-4 w-4"/>Ajouter</span></Button></label></CardTitle></CardHeader><CardContent><div className="mb-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2"><Input placeholder="Libellé du document (convention, annexe…)" value={ownerDocumentLabel} onChange={e=>setOwnerDocumentLabel(e.target.value)}/>{ownerDocumentFile&&<Button onClick={()=>void uploadOwnerDocument()}>Enregistrer</Button>}</div><div className="space-y-2">{ownerDocuments.length?ownerDocuments.map((doc:any)=><div key={doc.id} className="flex items-center justify-between gap-3 border rounded-lg p-3"><div><p className="font-medium">{doc.designation||doc.type_document}</p><p className="text-xs text-muted-foreground">{doc.statut||"en_attente"}</p></div>{doc.fichier_url&&<Button variant="outline" size="sm" asChild><a href={doc.fichier_url} target="_blank" rel="noreferrer">Ouvrir</a></Button>}</div>):<p className="text-sm text-muted-foreground">Aucun document enregistré.</p>}</div></CardContent></Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div><CardTitle>Parcelles</CardTitle><p className="mt-1 text-sm text-muted-foreground">Parcelles rattachées à ce propriétaire.</p></div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nouvelle parcelle</Button></DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                  <DialogHeader><DialogTitle>Nouvelle parcelle</DialogTitle></DialogHeader>
                  <form onSubmit={submit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2"><Label>Nom</Label><Input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>Surface totale (ha)</Label><Input type="number" min="2" step="0.1" required value={form.surface_totale_ha} onChange={e => setForm(f => ({ ...f, surface_totale_ha: e.target.value }))} /></div>
                    </div>
                    <GeographieCascade districtId={form.district_id} regionId={form.region_id} departementId={form.departement_id} sousPrefectureId={form.sous_prefecture_id} onChange={g => setForm(f => ({ ...f, district_id: g.districtId || "", region_id: g.regionId || "", departement_id: g.departementId || "", sous_prefecture_id: g.sousPrefectureId || "", village: g.villageName || "" }))} />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2"><Label>Date de convention</Label><Input type="date" value={form.date_convention} onChange={e => setForm(f => ({ ...f, date_convention: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>Village</Label><Input value={form.village} onChange={e => setForm(f => ({ ...f, village: e.target.value }))} /></div>
                    </div>
                    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button></div>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[820px]">
                  <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Localisation</TableHead><TableHead>Total</TableHead><TableHead>Part AgriCapital</TableHead><TableHead>Attribuée</TableHead><TableHead>Disponible</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parcelles.length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Aucune parcelle.</TableCell></TableRow> :
                      parcelles.map(p => {
                        const ac = Number(p.surface_agricapital_ha ?? p.surface_totale_ha ?? 0);
                        const used = Number(p.surface_attribuee_ha || 0);
                        const available = Math.max(0, ac - used);
                        return <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.id_unique}</TableCell>
                          <TableCell><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /><span>{[p.village,p.departements?.nom,p.regions?.nom].filter(Boolean).join(", ") || "—"}</span></div></TableCell>
                          <TableCell>{Number(p.surface_totale_ha || 0).toFixed(2)} ha</TableCell>
                          <TableCell>{ac.toFixed(2)} ha</TableCell>
                          <TableCell>{used.toFixed(2)} ha</TableCell>
                          <TableCell>{available.toFixed(2)} ha</TableCell>
                          <TableCell><Badge>{p.statut === "partiellement_attribuee" ? "Partiellement attribuée" : p.statut === "saturee" ? "Saturée" : "Disponible"}</Badge></TableCell>
                        </TableRow>;
                      })
                    }
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline"><Ruler className="mr-1 h-3 w-3" />{Number(owner.surface_totale_ha ?? totals.total).toFixed(2)} ha déclarés</Badge>
            <Badge variant="outline"><Layers className="mr-1 h-3 w-3" />{totals.count} parcelle(s)</Badge>
          </div>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default ProprietaireTerreDetail;
