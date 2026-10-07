import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { formatUserShortName } from "@/lib/utils";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/roles";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, TrendingUp, CircleDollarSign, CalendarClock, RefreshCw } from "lucide-react";
import { format, endOfMonth } from "date-fns";
import TableSearchInput from "@/components/common/TableSearchInput";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";

const TEAM_ROLES=["chef_equipe_commercial","chef_equipe_technique","responsable_commercial","responsable_operations"];
const fortnight=(d=new Date())=>d.getDate()<=15
  ? {start:new Date(d.getFullYear(),d.getMonth(),1),end:new Date(d.getFullYear(),d.getMonth(),15)}
  : {start:new Date(d.getFullYear(),d.getMonth(),16),end:endOfMonth(d)};
const iso=(d:Date)=>format(d,"yyyy-MM-dd");
const money=(n:any)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"XOF",maximumFractionDigits:0}).format(Number(n||0));

export default function Portefeuilles(){
  const { can,isSuperAdmin,isPdg }=usePermissions();
  const { user }=useAuth();
  const { toast }=useToast();
  const canManage=isSuperAdmin||isPdg||can("portefeuilles.manage_payouts")||can("commissions.manage_payouts");
  const q=fortnight();
  const [profiles,setProfiles]=useState<any[]>([]);
  const [portefeuilles,setPortefeuilles]=useState<any[]>([]);
  const [commissions,setCommissions]=useState<any[]>([]);
  const [versements,setVersements]=useState<any[]>([]);
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [portfolioPage,setPortfolioPage]=useState(1);
  const [versementPage,setVersementPage]=useState(1);
  const pageSize=useResponsivePageSize();
  const [selected,setSelected]=useState<any|null>(null);
  const [periodStart,setPeriodStart]=useState(iso(q.start));
  const [periodEnd,setPeriodEnd]=useState(iso(q.end));

  const load=async()=>{
    setLoading(true);
    try{
      const [pr,pf,cm,vp,lines]=await Promise.all([
        (supabase as any).from("profiles").select("id,user_id,nom_complet,telephone,equipe_id,actif").eq("actif",true).ilike("nom_complet", search.trim() ? `%${search.trim()}%` : "%").order("nom_complet").limit(50),
        (supabase as any).from("portefeuilles").select("*").order("updated_at",{ascending:false}).limit(50),
        (supabase as any).from("commissions").select("id,profile_id,client_id,paiement_id,type_commission,montant_base,taux_commission,montant_commission,periode,statut,date_calcul,client:clients(id,id_unique,nom_complet,famille_offre,formule_code,formule_nom),paiement:paiements(id,reference,date_paiement)").order("periode",{ascending:false}).limit(2000),
        (supabase as any).from("portefeuille_versements").select("*").order("periode_debut",{ascending:false}),
        (supabase as any).from("portefeuille_versement_lignes").select("commission_id,versement_id"),
      ]);
      if(pr.error)throw pr.error;if(pf.error)throw pf.error;if(cm.error)throw cm.error;if(vp.error)throw vp.error;if(lines.error)throw lines.error;
      const roleRes=await (supabase as any).from("user_roles").select("user_id,role");
      const roleMap:Record<string,string[]>={};
      (roleRes.data||[]).forEach((r:any)=>(roleMap[r.user_id]||=[]).push(r.role));
      const profilesData=(pr.data||[]).map((p:any)=>({...p,roles:roleMap[p.user_id]||[]}));
      setProfiles(profilesData);
      setPortefeuilles((pf.data||[]).map((x:any)=>({...x,user:profilesData.find((p:any)=>p.user_id===x.user_id)})));
      setCommissions(cm.data||[]);
      setVersements((vp.data||[]).map((v:any)=>({...v,lines:(lines.data||[]).filter((l:any)=>l.versement_id===v.id)})));
    }catch(e:any){toast({variant:"destructive",title:"Portefeuilles indisponibles",description:e?.message||"Erreur de chargement."});}
    finally{setLoading(false);}
  };
  useEffect(()=>{ const t=window.setTimeout(()=>void load(),250); return ()=>window.clearTimeout(t); },[search]);

  const visibleProfiles=useMemo(()=>{
    if(isSuperAdmin||isPdg||can("portefeuilles.manage_payouts"))return profiles;
    const me=profiles.find((p:any)=>p.user_id===user?.id);
    if(!me)return [];
    const manager=me.roles?.some((r:string)=>TEAM_ROLES.includes(r));
    if(manager&&me.equipe_id)return profiles.filter((p:any)=>p.equipe_id===me.equipe_id);
    return profiles.filter((p:any)=>p.user_id===user?.id);
  },[profiles,user,isSuperAdmin,isPdg,can]);

  const filtered=useMemo(()=>portefeuilles.filter((p:any)=>{
    if(!visibleProfiles.some((x:any)=>x.user_id===p.user_id))return false;
    const q=search.trim().toLowerCase();
    return !q||p.user?.nom_complet?.toLowerCase().includes(q);
  }),[portefeuilles,visibleProfiles,search]);

  const paginatedPortefeuilles=filtered.slice((portfolioPage-1)*pageSize,portfolioPage*pageSize);
  const filteredVersements=useMemo(()=>versements.filter((v:any)=>visibleProfiles.some((p:any)=>p.id===v.profile_id) && JSON.stringify(v).toLowerCase().includes(search.trim().toLowerCase())),[versements,visibleProfiles,search]);
  const paginatedVersements=filteredVersements.slice((versementPage-1)*pageSize,versementPage*pageSize);
  useEffect(()=>{setPortfolioPage(1);setVersementPage(1);},[search,pageSize]);

  const stats=useMemo(()=>({
    solde:filtered.reduce((s:any,p:any)=>s+Number(p.solde_commissions||0),0),
    gagne:filtered.reduce((s:any,p:any)=>s+Number(p.total_gagne||0),0),
    verse:filtered.reduce((s:any,p:any)=>s+Number(p.total_verse||0),0),
    pending:commissions.filter((c:any)=>visibleProfiles.some((p:any)=>p.id===c.profile_id)&&c.statut==="calculee").reduce((s:any,c:any)=>s+Number(c.montant_commission||0),0),
  }),[filtered,commissions,visibleProfiles]);

  const commissionIdsAlreadyLinked=new Set(versements.flatMap((v:any)=>v.lines?.map((l:any)=>l.commission_id)||[]));

  const detailRows=useMemo(()=>{
    if(!selected)return [];
    return commissions.filter((c:any)=>c.profile_id===selected.user?.id||c.profile_id===selected.id)
      .filter((c:any)=>c.periode>=periodStart&&c.periode<=periodEnd)
      .sort((a:any,b:any)=>String(b.periode||"").localeCompare(String(a.periode||"")));
  },[commissions,selected,periodStart,periodEnd]);

  const generate=async()=>{
    if(!canManage)return;
    setSaving(true);
    try{
      const { data: userData } = await supabase.auth.getUser();
      const eligible=commissions.filter((c:any)=>(c.statut==="calculee"||c.statut==="validee")&&!commissionIdsAlreadyLinked.has(c.id)&&c.periode>=periodStart&&c.periode<=periodEnd&&visibleProfiles.some((p:any)=>p.id===c.profile_id));
      const groups=new Map<string,any[]>();
      eligible.forEach((c:any)=>{if(!groups.has(c.profile_id))groups.set(c.profile_id,[]);groups.get(c.profile_id)!.push(c);});
      for(const [profileId,items] of groups){
        const amount=items.reduce((s:number,c:any)=>s+Number(c.montant_commission||0),0);
          const {data:v,error}=await (supabase as any).from("portefeuille_versements").upsert({profile_id:profileId,periode_debut:periodStart,periode_fin:periodEnd,montant_brut:amount,montant_paye:amount,statut:"brouillon",created_by:userData.user?.id||null,updated_at:new Date().toISOString()},{onConflict:"profile_id,periode_debut,periode_fin"}).select().single();
        if(error)throw error;
        await (supabase as any).from("portefeuille_versement_lignes").upsert(items.map((c:any)=>({versement_id:v.id,commission_id:c.id,montant:c.montant_commission})),{onConflict:"versement_id,commission_id"});
      }
      toast({title:"Génération terminée"});await load();
    }catch(e:any){toast({variant:"destructive",title:"Génération impossible",description:e?.message||"Erreur."});}
    finally{setSaving(false);}
  };

  const validatePayout=async(v:any)=>{
    if(!canManage)return;
    setSaving(true);
    try{
      const {data:userData}=await supabase.auth.getUser();
      const {error}=await (supabase as any).from("portefeuille_versements").update({statut:"valide",valide_par:profiles.find((p:any)=>p.user_id===user?.id)?.id||null,date_validation:new Date().toISOString()}).eq("id",v.id);
      if(error)throw error;
      const ids=(v.lines||[]).map((x:any)=>x.commission_id);
      if(ids.length)await (supabase as any).from("commissions").update({statut:"validee",date_validation:new Date().toISOString()}).in("id",ids);
      toast({title:"Versement validé"});await load();
    }catch(e:any){toast({variant:"destructive",title:"Validation impossible",description:e?.message||"Erreur."});}
    finally{setSaving(false);}
  };

  const markPaid=async(v:any)=>{
    if(!canManage)return;
    setSaving(true);
    try{
      const {data:userData}=await supabase.auth.getUser();
      const payer=profiles.find((p:any)=>p.user_id===userData.user?.id)?.id||null;
      const {error}=await (supabase as any).from("portefeuille_versements").update({statut:"paye",paye_par:payer,date_paiement:new Date().toISOString(),montant_paye:Number(v.montant_brut||0)}).eq("id",v.id);
      if(error)throw error;
      const ids=(v.lines||[]).map((x:any)=>x.commission_id);
      if(ids.length)await (supabase as any).from("commissions").update({statut:"payee"}).in("id",ids);
      await (supabase as any).rpc("recalculer_portefeuilles_commissions");
      toast({title:"Versement enregistré"});await load();
    }catch(e:any){toast({variant:"destructive",title:"Paiement impossible",description:e?.message||"Erreur."});}
    finally{setSaving(false);}
  };

  return <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PORTEFEUILLES}>
    <MainLayout>
      <div className="min-w-0 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-2xl font-bold">Portefeuilles</h1><p className="text-sm text-muted-foreground">Commissions, soldes et versements.</p></div>
          <Button variant="outline" size="sm" onClick={()=>void load()}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["Solde total disponible",stats.solde,Wallet],["Total des commissions",stats.gagne,TrendingUp],["Total versé",stats.verse,CircleDollarSign],["Versements à traiter",stats.pending,CalendarClock]].map(([label,value,Icon]:any)=>
            <Card key={label as string}><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 text-xl font-bold">{money(value)}</div></CardContent></Card>
          )}
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1"><label className="text-xs font-medium">Rechercher</label><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nom" className="mt-1"/></div>
            <div><label className="text-xs font-medium">Début</label><Input type="date" value={periodStart} onChange={e=>setPeriodStart(e.target.value)} className="mt-1"/></div>
            <div><label className="text-xs font-medium">Fin</label><Input type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} className="mt-1"/></div>
            {canManage&&<Button onClick={generate} disabled={saving}><CalendarClock className="mr-2 h-4 w-4"/>Générer</Button>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Portefeuilles</CardTitle><TableSearchInput value={search} onChange={setSearch} placeholder="Rechercher un portefeuille…" /></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Collaborateur</TableHead><TableHead>Rôle</TableHead><TableHead>Solde</TableHead><TableHead>Total gagné</TableHead><TableHead>Total versé</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading?<TableRow><TableCell colSpan={5} className="py-8 text-center">Chargement…</TableCell></TableRow>:filtered.length===0?<TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Aucun portefeuille.</TableCell></TableRow>:paginatedPortefeuilles.map((p:any)=><TableRow key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={()=>setSelected(p)}>
                  <TableCell className="font-medium">{formatUserShortName(p.user?.nom_complet||"—")}</TableCell>
                  <TableCell><Badge variant="outline">{p.user?.roles?.includes("commercial")?"Commercial":"Technique / Encadrement"}</Badge></TableCell>
                  <TableCell className="font-bold text-primary">{money(p.solde_commissions)}</TableCell>
                  <TableCell>{money(p.total_gagne)}</TableCell>
                  <TableCell>{money(p.total_verse)}</TableCell>
                </TableRow>)}
              </TableBody></Table>
              <ResponsiveTablePagination page={portfolioPage} pageSize={pageSize} total={filtered.length} onPageChange={setPortfolioPage} />
            </div>
          </CardContent>
        </Card>

        {canManage&&<Card>
          <CardHeader><CardTitle className="text-base">Versements</CardTitle><TableSearchInput value={search} onChange={setSearch} placeholder="Rechercher un versement…" /></CardHeader>
          <CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>Collaborateur</TableHead><TableHead>Période</TableHead><TableHead>Brut</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>{paginatedVersements.map((v:any)=>{
              const p=profiles.find((x:any)=>x.id===v.profile_id);
              return <TableRow key={v.id}><TableCell>{p?.nom_complet||"—"}</TableCell><TableCell>{format(new Date(v.periode_debut),"dd/MM/yyyy")} — {format(new Date(v.periode_fin),"dd/MM/yyyy")}</TableCell><TableCell className="font-semibold">{money(v.montant_brut)}</TableCell><TableCell><Badge>{v.statut}</Badge></TableCell><TableCell className="text-right"><div className="flex flex-wrap justify-end gap-2">{v.statut==="brouillon"&&<Button size="sm" onClick={()=>validatePayout(v)} disabled={saving}>Valider</Button>}{v.statut==="valide"&&<Button size="sm" onClick={()=>markPaid(v)} disabled={saving}>Marquer payé</Button>}</div></TableCell></TableRow>
            })}</TableBody></Table><ResponsiveTablePagination page={versementPage} pageSize={pageSize} total={filteredVersements.length} onPageChange={setVersementPage} /></div>
          </CardContent>
        </Card>}

        <Dialog open={!!selected} onOpenChange={open=>!open&&setSelected(null)}>
          <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
            <DialogHeader><DialogTitle>{formatUserShortName(selected?.user?.nom_complet || "Portefeuille")}</DialogTitle></DialogHeader>
            {selected&&<div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Période</p><p className="font-semibold">{periodStart} → {periodEnd}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Sources</p><p className="font-semibold">{detailRows.length}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Commission</p><p className="font-semibold">{money(detailRows.reduce((s:number,c:any)=>s+Number(c.montant_commission||0),0))}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Clients</p><p className="font-semibold">{new Set(detailRows.map((c:any)=>c.client_id).filter(Boolean)).size}</p></CardContent></Card>
              </div>
              <div className="mb-3"><TableSearchInput value={search} onChange={setSearch} placeholder="Rechercher une commission…" /></div>
              <div className="overflow-x-auto">
                <Table className="min-w-[1000px]"><TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Offre / formule</TableHead><TableHead>Type</TableHead><TableHead>Paiement</TableHead><TableHead>Base</TableHead><TableHead>Taux</TableHead><TableHead>Commission</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>{detailRows.filter((c:any)=>JSON.stringify(c).toLowerCase().includes(search.trim().toLowerCase())).length===0?<TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Aucune commission sur cette période.</TableCell></TableRow>:detailRows.filter((c:any)=>JSON.stringify(c).toLowerCase().includes(search.trim().toLowerCase())).map((c:any)=><TableRow key={c.id}>
                  <TableCell>{c.client?.nom_complet||"—"}<span className="block text-xs text-muted-foreground">{c.client?.id_unique||"—"}</span></TableCell>
                  <TableCell>{c.client?.famille_offre||"—"}{c.client?.formule_nom?` · ${c.client.formule_nom}`:""}</TableCell>
                  <TableCell><Badge variant="outline">{c.type_commission==="acquisition"?"Acquisition":"Recouvrement mensuel"}</Badge></TableCell>
                  <TableCell>{c.paiement?.reference||"—"}</TableCell>
                  <TableCell>{money(c.montant_base)}</TableCell>
                  <TableCell>{Number(c.taux_commission||0)>0?`${c.taux_commission}%`:"—"}</TableCell>
                  <TableCell className="font-semibold">{money(c.montant_commission)}</TableCell>
                  <TableCell>{c.periode?format(new Date(c.periode),"dd/MM/yyyy"):"—"}</TableCell>
                </TableRow>)}</TableBody></Table>
              </div>
            </div>}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  </ProtectedRoute>;
}
