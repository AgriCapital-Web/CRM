import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Save } from "lucide-react";

export default function GestionRemuneration(){
  const {toast}=useToast();
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const load=async()=>{
    setLoading(true);
    const {data,error}=await (supabase as any).from("grille_remuneration").select("*").eq("role_cible","commercial").in("type_remuneration",["recouvrement_mensuel","acquisition"]).order("type_remuneration").order("montant");
    if(error)toast({variant:"destructive",title:"Grille indisponible",description:error.message}); else setRows(data||[]);
    setLoading(false);
  };
  useEffect(()=>{void load();},[]);
  const update=(id:string,patch:any)=>setRows(r=>r.map(x=>x.id===id?{...x,...patch}:x));
  const save=async()=>{
    setSaving(true);
    try{
      for(const r of rows){
        const {error}=await (supabase as any).from("grille_remuneration").update({montant:r.montant===null?null:Number(r.montant||0),taux_pourcentage:r.taux_pourcentage===null?null:Number(r.taux_pourcentage||0),actif:!!r.actif,updated_at:new Date().toISOString()}).eq("id",r.id);
        if(error)throw error;
      }
      toast({title:"Grille de rémunération enregistrée"});await load();
    }catch(e:any){toast({variant:"destructive",title:"Enregistrement impossible",description:e?.message||"Erreur."});}
    finally{setSaving(false);}
  };
  return <Card>
    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><CardTitle>Rémunération commerciale</CardTitle><p className="mt-1 text-sm text-muted-foreground">Règles utilisées automatiquement pour le calcul des commissions et des versements.</p></div>
      <div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>void load()}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button><Button size="sm" onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4"/>Enregistrer</Button></div>
    </CardHeader>
    <CardContent className="space-y-3">
      {loading?<div className="py-8 text-center text-sm text-muted-foreground">Chargement…</div>:rows.map((r:any)=>
        <div key={r.id} className="grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_150px_150px_auto] sm:items-center">
          <div className="min-w-0"><p className="font-medium">{r.description||r.type_remuneration}</p><p className="text-xs text-muted-foreground">{r.type_remuneration==="recouvrement_mensuel"?"Commission mensuelle par hectare":"Activation / vente"}</p></div>
          <div><label className="text-xs text-muted-foreground">Montant fixe (F)</label><Input type="number" min="0" value={r.montant??""} disabled={r.type_remuneration!=="acquisition"} onChange={e=>update(r.id,{montant:e.target.value})}/></div>
          <div><label className="text-xs text-muted-foreground">Taux (%)</label><Input type="number" min="0" step="0.01" value={r.taux_pourcentage??""} disabled={r.type_remuneration!=="recouvrement_mensuel"} onChange={e=>update(r.id,{taux_pourcentage:e.target.value})}/></div>
          <Badge variant={r.actif?"default":"secondary"}>{r.actif?"Actif":"Inactif"}</Badge>
        </div>
      )}
    </CardContent>
  </Card>;
}
