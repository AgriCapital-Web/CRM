import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import ClientForm from "@/components/forms/ClientForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import TableSearchInput from "@/components/common/TableSearchInput";
import { CheckCircle2, Eye, RefreshCw, ShieldAlert } from "lucide-react";

const money=(n:any)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"XOF",maximumFractionDigits:0}).format(Number(n||0));
export default function ValidationDossiers(){
  const [params,setParams]=useSearchParams();
  const type=params.get("type")==="ventes"?"ventes":"clients";
  const {can}=usePermissions();
  const {toast}=useToast();
  const canValidateClients=can("clients.validate");
  const canValidateSales=can("acquisitions.validate");
  const [clients,setClients]=useState<any[]>([]);
  const [sales,setSales]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [search,setSearch]=useState("");
  const [selectedSale,setSelectedSale]=useState<any|null>(null);
  const [selectedClient,setSelectedClient]=useState<any|null>(null);
  const [viewClient,setViewClient]=useState<any|null>(null);
  const [comment,setComment]=useState("");
  const [saving,setSaving]=useState(false);
  const load=async()=>{
    setLoading(true);
    try{
      const [clientRes,saleRes]=await Promise.all([
        canValidateClients?(supabase as any).from("clients").select("id,id_unique,nom_complet,telephone,email,created_at,created_by,validation_statut,validation_commentaire,offre_id,formule_nom,formule_code,total_hectares").in("validation_statut",["a_valider","modification_demandee"]).order("created_at",{ascending:false}):Promise.resolve({data:[]}),
        canValidateSales?(supabase as any).from("acquisitions").select("id,client_id,offre_nom,offre_code,formule_nom,formule_code,superficie_ha,montant_total_contrat,statut,created_at,created_by,validation_statut,validation_commentaire,client:clients(id,id_unique,nom_complet,telephone)").in("validation_statut",["a_valider","modification_demandee"]).order("created_at",{ascending:false}):Promise.resolve({data:[]})
      ]);
      if(clientRes.error)throw clientRes.error;
      if(saleRes.error)throw saleRes.error;
      setClients(clientRes.data||[]);setSales(saleRes.data||[]);
    }catch(e:any){toast({variant:"destructive",title:"Dossiers indisponibles",description:e?.message||"Impossible de charger la file de validation."});}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[canValidateClients,canValidateSales]);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void loadRef.current();
    };
    const channel = supabase.channel("validation-dossiers-live-refresh")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "acquisitions" }, refresh)
      .subscribe();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      void supabase.removeChannel(channel);
    };
  }, []);
  const openClientDetails = async (clientRow: any) => {
    try {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("*")
        .eq("id", clientRow.id)
        .single();
      if (error) throw error;
      setViewClient(data);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Fiche client indisponible", description: error?.message || "Impossible de charger le formulaire complet du client." });
    }
  };

  const reviewClient=async(action:"valider"|"demander_modification")=>{
    if(!selectedClient||saving)return;
    if(action==="demander_modification"&&!comment.trim()){toast({variant:"destructive",title:"Commentaire requis",description:"Décrivez les corrections à effectuer."});return;}
    setSaving(true);
    try{
      const {error}=await (supabase as any).rpc("review_client_validation",{p_client_id:selectedClient.id,p_action:action,p_comment:comment.trim()||null});
      if(error)throw error;
      toast({title:action==="valider"?"Client validé":"Demande de modification envoyée",description:action==="valider"?"La validation est enregistrée en base.":"Une notification a été créée pour le créateur du dossier."});
      setSelectedClient(null);setComment("");await load();
    }catch(e:any){toast({variant:"destructive",title:"Action impossible",description:e?.message||"Le dossier n’a pas été mis à jour."});}
    finally{setSaving(false);}
  };
  const reviewSale=async(action:"valider"|"demander_modification")=>{
    if(!selectedSale||saving)return;
    if(action==="demander_modification"&&!comment.trim()){toast({variant:"destructive",title:"Commentaire requis",description:"Décrivez précisément les corrections à effectuer."});return;}
    setSaving(true);
    try{
      const {error}=await (supabase as any).rpc("review_acquisition_validation",{p_acquisition_id:selectedSale.id,p_action:action,p_comment:comment.trim()||null});
      if(error)throw error;
      toast({title:action==="valider"?"Vente validée":"Demande de modification envoyée",description:action==="valider"?"La validation est enregistrée en base.":"Une notification a été créée pour le créateur du dossier."});
      setSelectedSale(null);setComment("");await load();
    }catch(e:any){toast({variant:"destructive",title:"Action impossible",description:e?.message||"La validation n’a pas été enregistrée."});}
    finally{setSaving(false);}
  };
  const filteredClients=clients.filter((c:any)=>JSON.stringify(c).toLowerCase().includes(search.trim().toLowerCase()));
  const filteredSales=sales.filter((s:any)=>JSON.stringify(s).toLowerCase().includes(search.trim().toLowerCase()));
  return <ProtectedRoute><MainLayout><div className="mx-auto w-full max-w-7xl min-w-0 space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold">Validation des dossiers</h1></div><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={"mr-2 h-4 w-4 "+(loading?"animate-spin":"")}/>Actualiser</Button></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><button onClick={()=>setParams({type:"clients"})} className={"rounded-xl border p-4 text-left "+(type==="clients"?"border-primary bg-primary/5":"")}><p className="text-sm text-muted-foreground">Clients à valider</p><p className="text-2xl font-bold">{clients.length}</p></button><button onClick={()=>setParams({type:"ventes"})} className={"rounded-xl border p-4 text-left "+(type==="ventes"?"border-primary bg-primary/5":"")}><p className="text-sm text-muted-foreground">Ventes à valider</p><p className="text-2xl font-bold">{sales.length}</p></button></div>
    <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>{type==="clients"?"Clients en attente de validation":"Ventes en attente de validation"}</CardTitle><TableSearchInput value={search} onChange={setSearch} placeholder="Rechercher dans les dossiers…"/></div></CardHeader><CardContent><div className="space-y-2 md:hidden">{type==="clients" ? filteredClients.map((c:any)=><div key={c.id} className="rounded-xl border p-3"><button type="button" onClick={()=>void openClientDetails(c)} className="block min-w-0 text-left"><p className="break-words font-semibold">{c.nom_complet||"Client sans nom"}</p><p className="break-all text-xs text-muted-foreground">{c.id_unique||c.id}</p></button><div className="mt-2 grid grid-cols-2 gap-2 text-sm"><div><p className="text-xs text-muted-foreground">Téléphone</p><p className="break-words">{c.telephone||"—"}</p></div><div><p className="text-xs text-muted-foreground">Offre</p><p className="break-words">{c.formule_nom||c.formule_code||"—"}</p></div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><Badge variant={c.validation_statut==="modification_demandee"?"destructive":"secondary"}>{c.validation_statut==="modification_demandee"?"Correction demandée":"À valider"}</Badge><Button size="sm" onClick={()=>void openClientDetails(c)}><Eye className="mr-1 h-4 w-4"/>Ouvrir le dossier</Button></div></div>) : filteredSales.map((sale:any)=><div key={sale.id} className="rounded-xl border p-3"><p className="break-words font-semibold">{sale.client?.nom_complet||"Client non renseigné"}</p><p className="mt-1 text-xs text-muted-foreground">{sale.offre_nom||sale.formule_nom||sale.offre_code||sale.formule_code||"—"}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><Badge variant={sale.validation_statut==="modification_demandee"?"destructive":"secondary"}>{sale.validation_statut==="modification_demandee"?"Correction demandée":"À valider"}</Badge><Button size="sm" onClick={()=>{setSelectedSale(sale);setComment(sale.validation_commentaire||"");}}><Eye className="mr-1 h-4 w-4"/>Examiner</Button></div></div>)}</div><div className="hidden overflow-x-auto md:block"><Table className="min-w-[760px]"><TableHeader><TableRow>{type==="clients"?<><TableHead>Client</TableHead><TableHead>Téléphone</TableHead><TableHead>Offre</TableHead><TableHead>Créé le</TableHead><TableHead>État</TableHead><TableHead>Action</TableHead></>:<><TableHead>Client</TableHead><TableHead>Offre / formule</TableHead><TableHead>Surface</TableHead><TableHead>Montant</TableHead><TableHead>État</TableHead><TableHead>Action</TableHead></>}</TableRow></TableHeader><TableBody>
    {loading?<TableRow><TableCell colSpan={6} className="py-8 text-center">Chargement…</TableCell></TableRow>:type==="clients"?filteredClients.length===0?<TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Aucun client en attente.</TableCell></TableRow>:filteredClients.map((c:any)=><TableRow key={c.id}><TableCell><span className="font-medium">{c.nom_complet||"Client sans nom"}</span><span className="block text-xs text-muted-foreground">{c.id_unique||c.id}</span></TableCell><TableCell>{c.telephone||"—"}</TableCell><TableCell>{c.formule_nom||c.formule_code||"—"}</TableCell><TableCell>{c.created_at?new Date(c.created_at).toLocaleDateString("fr-FR"):"—"}</TableCell><TableCell><Badge variant={c.validation_statut==="modification_demandee"?"destructive":"secondary"}>{c.validation_statut==="modification_demandee"?"Correction demandée":"À valider"}</Badge></TableCell><TableCell><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>void openClientDetails(c)}><Eye className="mr-1 h-4 w-4"/>Voir</Button><Button size="sm" onClick={()=>{setSelectedClient(c);setComment(c.validation_commentaire||"");}}>Décider</Button></div></TableCell></TableRow>):filteredSales.length===0?<TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Aucune vente en attente.</TableCell></TableRow>:filteredSales.map((s:any)=><TableRow key={s.id}><TableCell><span className="font-medium">{s.client?.nom_complet||"Client non renseigné"}</span><span className="block text-xs text-muted-foreground">{s.client?.id_unique||s.client_id}</span></TableCell><TableCell>{s.offre_nom||s.formule_nom||s.offre_code||s.formule_code||"—"}</TableCell><TableCell>{Number(s.superficie_ha||0).toLocaleString("fr-FR")} ha</TableCell><TableCell>{money(s.montant_total_contrat)}</TableCell><TableCell><Badge variant={s.validation_statut==="modification_demandee"?"destructive":"secondary"}>{s.validation_statut==="modification_demandee"?"Correction demandée":"À valider"}</Badge></TableCell><TableCell><Button size="sm" onClick={()=>{setSelectedSale(s);setComment(s.validation_commentaire||"");}}><Eye className="mr-1 h-4 w-4"/>Voir</Button></TableCell></TableRow>)}
    </TableBody></Table></div></CardContent></Card>
    <Dialog open={!!selectedClient} onOpenChange={open=>{if(!open&&!saving){setSelectedClient(null);setComment("");}}}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Validation du client — {selectedClient?.nom_complet||"Dossier client"}</DialogTitle></DialogHeader>{selectedClient&&<div className="space-y-4"><p className="text-sm text-muted-foreground">Pour un contrôle détaillé, ouvrez « Voir » afin de consulter le formulaire complet.</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Téléphone</p><p>{selectedClient.telephone||"—"}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Offre / formule</p><p>{selectedClient.formule_nom||selectedClient.formule_code||"—"}</p></div></div><div className="space-y-1"><Label>Corrections à demander</Label><Input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Obligatoire pour demander une modification"/></div><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={()=>void reviewClient("demander_modification")} disabled={saving}>Demander une modification</Button><Button onClick={()=>void reviewClient("valider")} disabled={saving}><CheckCircle2 className="mr-2 h-4 w-4"/>Valider</Button></div></div>}</DialogContent></Dialog>
    <Dialog open={!!viewClient} onOpenChange={open=>{if(!open)setViewClient(null);}}><DialogContent className="max-h-[92dvh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Détails client — {viewClient?.nom_complet||"Client"}</DialogTitle></DialogHeader>{viewClient&&<ClientForm client={viewClient} readOnly onCancel={()=>setViewClient(null)} onSuccess={()=>{setViewClient(null);void load();}}/>}</DialogContent></Dialog>
    <Dialog open={!!selectedSale} onOpenChange={open=>{if(!open&&!saving){setSelectedSale(null);setComment("");}}}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Vérifier la vente</DialogTitle></DialogHeader>{selectedSale&&<div className="space-y-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[["Client",selectedSale.client?.nom_complet],["Identifiant client",selectedSale.client?.id_unique],["Offre",selectedSale.offre_nom],["Formule",selectedSale.formule_nom],["Superficie",String(selectedSale.superficie_ha||0)+" ha"],["Montant du contrat",money(selectedSale.montant_total_contrat)],["Statut de vente",selectedSale.statut],["Statut de validation",selectedSale.validation_statut]].map(([label,value])=><div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value||"—"}</p></div>)}</div><div className="space-y-1"><Label>Commentaire de contrôle / corrections</Label><Input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Obligatoire si une modification est demandée"/></div><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={()=>void reviewSale("demander_modification")} disabled={saving}><ShieldAlert className="mr-2 h-4 w-4"/>Demander une modification</Button><Button onClick={()=>void reviewSale("valider")} disabled={saving}><CheckCircle2 className="mr-2 h-4 w-4"/>Valider la vente</Button></div></div>}</DialogContent></Dialog>
  </div></MainLayout></ProtectedRoute>;
}
