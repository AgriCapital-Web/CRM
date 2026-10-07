import { useEffect, useMemo, useState } from "react";
import { Building, ChevronRight, Home, Loader2, Map, MapPin, RefreshCw, TentTree, TreePine } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Geo = any;
const NODE = [
  { table: "districts", active: "est_actif", icon: Map },
  { table: "regions", active: "est_active", icon: MapPin },
  { table: "departements", active: "est_actif", icon: Building },
  { table: "sous_prefectures", active: "est_active", icon: Home },
  { table: "villages", active: "est_actif", icon: TreePine },
];

export default function GestionGeographie() {
  const { toast } = useToast();
  const [data, setData] = useState<Record<string, Geo[]>>({ districts: [], regions: [], departements: [], sous: [], villages: [], campements: [] });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [d,r,de,sp,v,c] = await Promise.all([
        (supabase as any).from("districts").select("id,nom,est_actif").order("nom"),
        (supabase as any).from("regions").select("id,nom,district_id,est_active").order("nom"),
        (supabase as any).from("departements").select("id,nom,region_id,est_actif").order("nom"),
        (supabase as any).from("sous_prefectures").select("id,nom,departement_id,est_active").order("nom"),
        (supabase as any).from("villages").select("id,nom,sous_prefecture_id,est_actif").order("nom"),
        (supabase as any).from("campements").select("id,nom,sous_prefecture_id,village_noyau_id,est_actif").order("nom"),
      ]);
      const error = d.error || r.error || de.error || sp.error || v.error || c.error;
      if (error) throw error;
      setData({ districts:d.data||[], regions:r.data||[], departements:de.data||[], sous:sp.data||[], villages:v.data||[], campements:c.data||[] });
    } catch(e:any) {
      toast({variant:"destructive",title:"Géographie indisponible",description:e?.message||"Impossible de charger le référentiel."});
    } finally { setLoading(false); }
  };
  useEffect(()=>{ void load(); },[]);

  const toggle = async (table:string, activeColumn:string, id:string, value:boolean) => {
    try {
      const {error}=await (supabase as any).from(table).update({[activeColumn]:value}).eq("id",id);
      if(error) throw error;
      await load();
      toast({title:value?"Élément activé":"Élément désactivé"});
    } catch(e:any) {
      toast({variant:"destructive",title:"Modification impossible",description:e?.message||"Erreur."});
    }
  };

  const tree = useMemo(()=>data.districts.map((d:any)=>({
    ...d,
    regions:data.regions.filter((r:any)=>r.district_id===d.id).map((r:any)=>({
      ...r,
      departements:data.departements.filter((de:any)=>de.region_id===r.id).map((de:any)=>({
        ...de,
        sous:data.sous.filter((sp:any)=>sp.departement_id===de.id).map((sp:any)=>({
          ...sp,
          villages:data.villages.filter((v:any)=>v.sous_prefecture_id===sp.id),
          campements:data.campements.filter((c:any)=>c.sous_prefecture_id===sp.id),
        })),
      })),
    })),
  })),[data]);

  const Status=({active}:{active:boolean})=><Badge variant={active?"default":"secondary"} className="shrink-0 text-[10px]">{active?"Actif":"Désactivé"}</Badge>;
  const Header=({node,level,count,disabled=false}:{node:any;level:number;count?:number;disabled?:boolean})=>{
    const meta=NODE[level]; const Icon=meta.icon;
    return <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
      <ChevronRight className="h-4 w-4 shrink-0 transition-transform [details[open]>&]:rotate-90"/>
      <Icon className="h-4 w-4 shrink-0 text-primary"/>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.nom}</span>
      {count!==undefined&&<span className="text-[10px] text-muted-foreground">{count}</span>}
      <Status active={!!node[meta.active]}/>
      <Switch checked={!!node[meta.active]} disabled={disabled} onClick={e=>e.stopPropagation()} onCheckedChange={v=>void toggle(meta.table,meta.active,node.id,v)}/>
    </summary>;
  };

  if(loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin"/></div>;

  return <div className="space-y-4">
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><CardTitle className="flex items-center gap-2"><Map className="h-5 w-5"/>Référentiel géographique</CardTitle><p className="mt-1 text-sm text-muted-foreground">District → Région → Département → Sous-préfecture → Village / localité → Campement.</p></div>
        <Button variant="outline" size="sm" onClick={()=>void load()}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {tree.length===0?<p className="py-8 text-center text-sm text-muted-foreground">Aucun district enregistré.</p>:tree.map((d:any)=>
          <details key={d.id} className="rounded-xl border bg-card">
            <Header node={d} level={0} count={d.regions.length}/>
            <div className="space-y-1 border-t p-2 sm:p-3">
              {d.regions.map((r:any)=><details key={r.id} className="ml-2 border-l pl-3">
                <Header node={r} level={1} count={r.departements.length} disabled={!d.est_actif}/>
                <div className="space-y-1 pb-2 pl-2">
                  {r.departements.map((de:any)=><details key={de.id} className="ml-2 border-l pl-3">
                    <Header node={de} level={2} count={de.sous.length} disabled={!d.est_actif||!r.est_active}/>
                    <div className="space-y-1 pb-2 pl-2">
                      {de.sous.map((sp:any)=><details key={sp.id} className="ml-2 border-l pl-3">
                        <Header node={sp} level={3} count={sp.villages.length+sp.campements.length} disabled={!d.est_actif||!r.est_active||!de.est_actif}/>
                        <div className="space-y-1 pb-2 pl-2">
                          {sp.villages.map((v:any)=><details key={v.id} className="ml-3 border-l pl-3">
                            <Header node={v} level={4} count={data.campements.filter((c:any)=>c.village_noyau_id===v.id).length} disabled={!d.est_actif||!r.est_active||!de.est_actif||!sp.est_active}/>
                            <div className="space-y-1 pb-2 pl-2">{data.campements.filter((c:any)=>c.village_noyau_id===v.id).map((c:any)=><div key={c.id} className="flex items-center gap-2 rounded-md bg-muted/20 px-2 py-1.5 text-xs"><TentTree className="h-3.5 w-3.5 text-muted-foreground"/><span className="min-w-0 flex-1 truncate">{c.nom}</span><Status active={!!c.est_actif}/></div>)}</div>
                          </details>)}
                          {sp.campements.filter((c:any)=>!c.village_noyau_id).map((c:any)=><div key={c.id} className="flex items-center gap-2 rounded-md bg-muted/20 px-2 py-1.5 text-xs"><TentTree className="h-3.5 w-3.5 text-muted-foreground"/><span className="min-w-0 flex-1 truncate">{c.nom}</span><Status active={!!c.est_actif}/></div>)}
                        </div>
                      </details>)}
                    </div>
                  </details>)}
                </div>
              </details>)}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
    <p className="text-xs text-muted-foreground">Les éléments désactivés restent visibles uniquement dans ce référentiel d'administration. Les formulaires opérationnels utilisent la cascade active et ne doivent jamais proposer un élément désactivé.</p>
  </div>;
}
