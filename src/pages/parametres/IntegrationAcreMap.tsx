import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw, Cable, ShieldCheck, Copy } from "lucide-react";

type Settings = { id: string; api_base_url: string; api_key: string; webhook_secret: string; enabled: boolean; updated_at?: string };
const DEFAULTS: Settings = { id: "default", api_base_url: "", api_key: "", webhook_secret: "", enabled: false };

export default function IntegrationAcreMap() {
 const { toast } = useToast(); const qc = useQueryClient();
 const [draft, setDraft] = useState<Settings>(DEFAULTS);
 const { data, isLoading, error } = useQuery({
  queryKey: ["acremap-integration-settings"],
  queryFn: async () => { const { data, error } = await (supabase as any).from("acremap_integration_settings").select("*").eq("id","default").maybeSingle(); if(error) throw error; const value={...DEFAULTS,...(data??{})} as Settings; setDraft(value); return value; }
 });
 const save = useMutation({
  mutationFn: async () => { const payload={...draft,api_base_url:draft.api_base_url.trim().replace(/\/$/,""),updated_at:new Date().toISOString()}; const {error}=await (supabase as any).from("acremap_integration_settings").upsert(payload,{onConflict:"id"}); if(error) throw error; return payload; },
  onSuccess: async (value) => { setDraft(value); await qc.invalidateQueries({queryKey:["acremap-integration-settings"]}); toast({title:"Configuration enregistrée"}); },
  onError: (e) => toast({title:"Enregistrement impossible",description:e instanceof Error?e.message:"Erreur",variant:"destructive"})
 });
 const { data: syncedPlans } = useQuery({ queryKey: ["acremap-synced-plans"], queryFn: async () => { const { data, error } = await (supabase as any).from("acremap_morcellements").select("id,reference,status,received_at,parcelle_id").order("received_at", { ascending: false }).limit(10); if (error) throw error; return data ?? []; } });
 const sync = useMutation({
  mutationFn: async () => { const {data,error}=await supabase.functions.invoke("acremap-sync",{body:{}}); if(error) throw error; if(data?.error) throw new Error(data.error); return data as {received:number}; },
  onSuccess: (r) => toast({title:"Propriétaires synchronisés",description:String(r.received)+" propriétaire(s) transmis à AcreMap."}),
  onError: (e) => toast({title:"Synchronisation échouée",description:e instanceof Error?e.message:"Vérifiez l’URL et la clé API.",variant:"destructive"})
 });
 const webhookUrl=(import.meta.env.VITE_SUPABASE_URL||"").replace(/\/$/,"")+"/functions/v1/acremap-webhook";
 const set=(key:keyof Settings,value:string|boolean)=>setDraft(prev=>({...prev,[key]:value}));
 return <div className="space-y-4">
  <Card><CardHeader><div className="flex items-center gap-2"><Cable className="h-5 w-5"/><CardTitle>Connexion AcreMap</CardTitle></div><CardDescription>Le CRM est la référence des propriétaires fonciers. AcreMap fournit les levés GPS, géométries, lots et superficies calculées.</CardDescription></CardHeader>
   <CardContent className="space-y-4">
    {isLoading&&<p className="text-sm text-muted-foreground">Chargement de la configuration…</p>}
    {error&&<p className="text-sm text-destructive">Impossible de lire la configuration. Vérifiez vos droits et appliquez la migration CRM.</p>}
    <div className="space-y-2"><Label>URL de base AcreMap</Label><Input placeholder="https://votre-domaine-acremap" value={draft.api_base_url} onChange={e=>set("api_base_url",e.target.value)}/></div>
    <div className="space-y-2"><Label>Clé API AcreMap (Bearer)</Label><Input type="password" autoComplete="new-password" placeholder="Clé secrète serveur AcreMap" value={draft.api_key} onChange={e=>set("api_key",e.target.value)}/><p className="text-xs text-muted-foreground">Clé protégée par les droits de paramètres ; utilisée côté serveur pour synchroniser.</p></div>
    <div className="space-y-2"><Label>Secret HMAC webhook</Label><Input type="password" autoComplete="new-password" placeholder="Secret partagé avec AcreMap" value={draft.webhook_secret} onChange={e=>set("webhook_secret",e.target.value)}/></div>
    <div className="flex items-center justify-between rounded-lg border p-3 gap-3"><div><p className="font-medium text-sm">Activer l’intégration</p><p className="text-xs text-muted-foreground">Autorise les échanges entre les deux applications.</p></div><input aria-label="Activer l’intégration" type="checkbox" checked={draft.enabled} onChange={e=>set("enabled",e.target.checked)} className="h-4 w-4"/></div>
    <div className="flex flex-wrap gap-2"><Button onClick={()=>save.mutate()} disabled={save.isPending||!draft.api_base_url.trim()}><Save className="h-4 w-4 mr-2"/>{save.isPending?"Enregistrement…":"Enregistrer"}</Button><Button variant="outline" onClick={()=>sync.mutate()} disabled={sync.isPending||!draft.enabled||!draft.api_base_url||!draft.api_key}><RefreshCw className={"h-4 w-4 mr-2 "+(sync.isPending?"animate-spin":"")}/>{sync.isPending?"Synchronisation…":"Synchroniser les propriétaires"}</Button><Badge variant={data?.enabled?"default":"secondary"}>{data?.enabled?"Intégration activée":"À configurer"}</Badge></div>
   </CardContent>
  </Card>
  <Card><CardHeader><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5"/><CardTitle>Webhook entrant AcreMap → CRM</CardTitle></div><CardDescription>URL à renseigner dans AcreMap côté serveur. Le secret HMAC doit être identique dans les deux applications.</CardDescription></CardHeader>
   <CardContent className="space-y-3"><div className="space-y-1"><Label>URL du webhook CRM</Label><div className="flex gap-2"><Input readOnly value={webhookUrl}/><Button variant="outline" size="icon" aria-label="Copier URL webhook" onClick={()=>{void navigator.clipboard.writeText(webhookUrl);toast({title:"URL copiée"});}}><Copy className="h-4 w-4"/></Button></div></div><p className="text-xs text-muted-foreground">Événement attendu : morcellement.published. Les événements doivent porter un event_id stable pour empêcher les doublons.</p></CardContent>
  </Card>
  <Card><CardHeader><CardTitle>Derniers morcellements reçus</CardTitle><CardDescription>Les plans reçus par webhook sont conservés ici avec leur identifiant source, pour suivi et déduplication.</CardDescription></CardHeader><CardContent className="space-y-2">
   {(syncedPlans ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucun morcellement reçu pour le moment.</p> : (syncedPlans ?? []).map((plan: any) => <div key={plan.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><div><p className="font-medium text-sm">{plan.reference || plan.id}</p><p className="text-xs text-muted-foreground">Parcelle source : {plan.parcelle_id || "—"} · {plan.received_at ? new Date(plan.received_at).toLocaleString("fr-FR") : "date inconnue"}</p></div><Badge variant="secondary">{plan.status}</Badge></div>)}
  </CardContent></Card>
 </div>;
}
