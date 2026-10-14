import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Save } from "lucide-react";

const money=(value:any)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"XOF",maximumFractionDigits:0}).format(Number(value||0));
const roleLabel=(role:string)=>role==="commercial"?"Commercial":role==="mobilisateur_foncier"?"Mobilisateur foncier":role==="equipe_technique"?"Équipe technique":role;
const typeLabel=(type:string)=>type==="acquisition"?"Prime fixe à la vente":type==="recouvrement_mensuel"?"Commission sur mensualité":type==="mobilisation_fonciere"?"Prime foncière par hectare":type==="commission_technique"?"Commission de mise en terre":type;

export default function GestionRemuneration(){
  const {toast}=useToast();
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const load=async()=>{
    setLoading(true);
    const {data,error}=await (supabase as any).from("grille_remuneration").select("*")
      .in("role_cible",["commercial","mobilisateur_foncier","equipe_technique"])
      .in("type_remuneration",["acquisition","recouvrement_mensuel","mobilisation_fonciere","commission_technique"])
      .order("role_cible").order("type_remuneration").order("annee_application");
    if(error)toast({variant:"destructive",title:"Grille indisponible",description:error.message});
    else setRows(data||[]);
    setLoading(false);
  };
  useEffect(()=>{void load();},[]);
  const update=(id:string,patch:any)=>setRows(current=>current.map(row=>row.id===id?{...row,...patch}:row));
  const save=async()=>{
    setSaving(true);
    try{
      for(const row of rows){
        const {error}=await (supabase as any).from("grille_remuneration").update({
          description:row.description,
          montant:row.montant===""||row.montant===null?null:Number(row.montant),
          taux_pourcentage:row.taux_pourcentage===""||row.taux_pourcentage===null?null:Number(row.taux_pourcentage),
          annee_application:Number(row.annee_application||1),
          actif:!!row.actif,
          updated_at:new Date().toISOString()
        }).eq("id",row.id);
        if(error)throw error;
      }
      const {data:recalculation,error:recalculationError}=await (supabase as any).rpc("recalculer_commissions_depuis_grille");
      if(recalculationError)throw recalculationError;
      toast({title:"Règles enregistrées et commissions recalculées",description:`Foncier : ${recalculation?.foncier_recalcule??0} · Technique : ${recalculation?.technique_recalcule??0}. Les commissions déjà payées sont conservées.`});
      await load();
    }catch(error:any){toast({variant:"destructive",title:"Enregistrement impossible",description:error?.message||"Erreur."});}
    finally{setSaving(false);}
  };
  return <Card>
    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><CardTitle>Règles de rémunération et commissions</CardTitle><p className="mt-1 text-xs text-muted-foreground">Les valeurs proviennent de la base de données. Les codes de règle restent stables : modifier le montant, le taux ou la description ne casse pas le calcul automatique.</p></div>
      <div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button><Button size="sm" onClick={()=>void save()} disabled={saving||loading}><Save className="mr-2 h-4 w-4"/>Enregistrer</Button></div>
    </CardHeader>
    <CardContent className="space-y-3">
      {loading?<div className="py-8 text-center text-sm text-muted-foreground">Chargement des règles…</div>:rows.length===0?<div className="py-8 text-center text-sm text-muted-foreground">Aucune règle de commission configurée.</div>:rows.map((row:any)=>
        <div key={row.id} className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(260px,2fr)_110px_130px_95px_auto] xl:items-end">
          <div className="min-w-0"><p className="text-xs text-muted-foreground">{roleLabel(row.role_cible)} · {typeLabel(row.type_remuneration)}</p><p className="mt-1 text-xs text-muted-foreground">Année d’application</p><Input aria-label="Année d’application" type="number" min="1" max="3" value={row.annee_application??1} onChange={event=>update(row.id,{annee_application:event.target.value})}/></div>
          <div><label className="text-xs text-muted-foreground">Description / offre concernée</label><Input value={row.description||""} onChange={event=>update(row.id,{description:event.target.value})}/></div>
          <div><label className="text-xs text-muted-foreground">Montant fixe (FCFA)</label><Input type="number" min="0" value={row.montant??""} onChange={event=>update(row.id,{montant:event.target.value})}/></div>
          <div><label className="text-xs text-muted-foreground">Taux (%)</label><Input type="number" min="0" step="0.1" value={row.taux_pourcentage??""} onChange={event=>update(row.id,{taux_pourcentage:event.target.value})}/></div>
          <div className="flex items-center gap-2"><Checkbox checked={!!row.actif} onCheckedChange={checked=>update(row.id,{actif:checked===true})}/><span className="text-sm">Actif</span></div>
          <div className="flex items-center"><Badge variant={row.actif?"default":"secondary"}>{row.actif?"Actif":"Inactif"}</Badge></div>
        </div>
      )}
    </CardContent>
  </Card>;
}
