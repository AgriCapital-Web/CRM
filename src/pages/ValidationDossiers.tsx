import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold">Validation des dossiers</h1><p className="text-sm text-muted-foreground">Contrôle séparé des dossiers clients et des ventes, avec traçabilité en base.</p></div><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={"mr-2 h-4 w-4 "+(loading?"animate-spin":"")}/>Actualiser</Button></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><button onClick={()=>setParams({type:"clients"})} className={"rounded-xl border p-4 text-left "+(type==="clients"?"border-primary bg-primary/5":"")}><p className="text-sm text-muted-foreground">Clients à valider</p><p className="text-2xl font-bold">{clients.length}</p></button><button onClick={()=>setParams({type:"ventes"})} className={"rounded-xl border p-4 text-left "+(type==="ventes"?"border-primary bg-primary/5":"")}><p className="text-sm text-muted-foreground">Ventes à valider</p><p className="text-2xl font-bold">{sales.length}</p></button></div>
    <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>{type==="clients"?"Clients en attente de validation":"Ventes en attente de validation"}</CardTitle><TableSearchInput value={search} onChange={setSearch} placeholder="Rechercher dans les dossiers…"/></div></CardHeader><CardContent><div className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader><TableRow>{type==="clients"?<><TableHead>Client</TableHead><TableHead>Téléphone</TableHead><TableHead>Offre</TableHead><TableHead>Créé le</TableHead><TableHead>État</TableHead><TableHead>Action</TableHead></>:<><TableHead>Client</TableHead><TableHead>Offre / formule</TableHead><TableHead>Surface</TableHead><TableHead>Montant</TableHead><TableHead>État</TableHead><TableHead>Action</TableHead></>}</TableRow></TableHeader><TableBody>
    {loading?<TableRow><TableCell colSpan={6} className="py-8 text-center">Chargement…</TableCell></TableRow>:type==="clients"?filteredClients.length===0?<TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Aucun client en attente.</TableCell></TableRow>:filteredClients.map((c:any)=><TableRow key={c.id}><TableCell><span className="font-medium">{c.nom_complet||"Client sans nom"}</span><span className="block text-xs text-muted-foreground">{c.id_unique||c.id}</span></TableCell><TableCell>{c.telephone||"—"}</TableCell><TableCell>{c.formule_nom||c.formule_code||"—"}</TableCell><TableCell>{c.created_at?new Date(c.created_at).toLocaleDateString("fr-FR"):"—"}</TableCell><TableCell><Badge variant={c.validation_statut==="modification_demandee"?"destructive":"secondary"}>{c.validation_statut==="modification_demandee"?"Correction demandée":"À valider"}</Badge></TableCell><TableCell><Button asChild size="sm"><Link to={"/client/"+c.id+"?validation=1"}><Eye className="mr-1 h-4 w-4"/>Voir</Link></Button></TableCell></TableRow>):filteredSales.length===0?<TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Aucune vente en attente.</TableCell></TableRow>:filteredSales.map((s:any)=><TableRow key={s.id}><TableCell><span className="font-medium">{s.client?.nom_complet||"Client non renseigné"}</span><span className="block text-xs text-muted-foreground">{s.client?.id_unique||s.client_id}</span></TableCell><TableCell>{s.offre_nom||s.formule_nom||s.offre_code||s.formule_code||"—"}</TableCell><TableCell>{Number(s.superficie_ha||0).toLocaleString("fr-FR")} ha</TableCell><TableCell>{money(s.montant_total_contrat)}</TableCell><TableCell><Badge variant={s.validation_statut==="modification_demandee"?"destructive":"secondary"}>{s.validation_statut==="modification_demandee"?"Correction demandée":"À valider"}</Badge></TableCell><TableCell><Button size="sm" onClick={()=>{setSelectedSale(s);setComment(s.validation_commentaire||"");}}><Eye className="mr-1 h-4 w-4"/>Voir</Button></TableCell></TableRow>)}
    </TableBody></Table></div><p className="mt-3 text-xs text-muted-foreground">Les listes sont chargées depuis Supabase. Les actions de validation sont contrôlées côté base de données.</p></CardContent></Card>
    <Dialog open={!!selectedSale} onOpenChange={open=>{if(!open&&!saving){setSelectedSale(null);setComment("");}}}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Vérifier la vente</DialogTitle></DialogHeader>{selectedSale&&<div className="space-y-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[["Client",selectedSale.client?.nom_complet],["Identifiant client",selectedSale.client?.id_unique],["Offre",selectedSale.offre_nom],["Formule",selectedSale.formule_nom],["Superficie",String(selectedSale.superficie_ha||0)+" ha"],["Montant du contrat",money(selectedSale.montant_total_contrat)],["Statut de vente",selectedSale.statut],["Statut de validation",selectedSale.validation_statut]].map(([label,value])=><div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value||"—"}</p></div>)}</div><div className="space-y-1"><Label>Commentaire de contrôle / corrections</Label><Input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Obligatoire si une modification est demandée"/></div><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={()=>void reviewSale("demander_modification")} disabled={saving}><ShieldAlert className="mr-2 h-4 w-4"/>Demander une modification</Button><Button onClick={()=>void reviewSale("valider")} disabled={saving}><CheckCircle2 className="mr-2 h-4 w-4"/>Valider la vente</Button></div></div>}</DialogContent></Dialog>
  </div></MainLayout></ProtectedRoute>;
}
