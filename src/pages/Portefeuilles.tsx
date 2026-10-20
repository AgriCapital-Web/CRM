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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadFile } from "@/utils/storage";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, TrendingUp, CircleDollarSign, CalendarClock, RefreshCw } from "lucide-react";
import { format, endOfMonth } from "date-fns";
import TableSearchInput from "@/components/common/TableSearchInput";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";

const ROLE_LABELS:Record<string,string>={pdg:"PDG",dg:"Directeur général",comptable:"Comptable",responsable_operations:"Responsable opérations",responsable_commercial:"Responsable commercial",chef_equipe_commercial:"Chef d’équipe commerciale",chef_equipe_technique:"Chef d’équipe technique",commercial:"Commercial",technicien:"Technicien",mobilisateur_foncier:"Mobilisateur foncier",superviseur_mobilisation_fonciere:"Superviseur foncier",service_client:"Service client",associe_actionnaire:"Associé actionnaire"};
const fortnight=(d=new Date())=>d.getDate()<=15
  ? {start:new Date(d.getFullYear(),d.getMonth(),1),end:new Date(d.getFullYear(),d.getMonth(),15)}
  : {start:new Date(d.getFullYear(),d.getMonth(),16),end:endOfMonth(d)};
const iso=(d:Date)=>format(d,"yyyy-MM-dd");

async function fetchAllRows<T=any>(makeQuery:()=>any,pageSize=1000):Promise<T[]>{
  const rows:T[]=[];
  for(let offset=0;;offset+=pageSize){
    const {data,error}=await makeQuery().range(offset,offset+pageSize-1);
    if(error)throw error;
    const page=(data||[]) as T[];
    rows.push(...page);
    if(page.length<pageSize)break;
  }
  return rows;
}

const money=(n:any)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"XOF",maximumFractionDigits:0}).format(Number(n||0));

export default function Portefeuilles(){
  const { can,isSuperAdmin,isPdg }=usePermissions();
  const { user }=useAuth();
  const { toast }=useToast();
  const canViewWallet=isSuperAdmin||isPdg||can("portefeuilles.view")||can("portefeuilles.manage_payouts")||can("commissions.manage_payouts");
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
  const [paymentTarget,setPaymentTarget]=useState<any|null>(null);
  const [paymentMethod,setPaymentMethod]=useState("virement");
  const [paymentReference,setPaymentReference]=useState("");
  const [paymentProofFile,setPaymentProofFile]=useState<File|null>(null);
  const [periodStart,setPeriodStart]=useState(iso(q.start));
  const [periodEnd,setPeriodEnd]=useState(iso(q.end));

  const load=async()=>{
    if(!canViewWallet){setProfiles([]);setPortefeuilles([]);setCommissions([]);setVersements([]);setLoading(false);return;}
    setLoading(true);
    try{
      const [visibleProfileRows,walletRows,commissionsData,versementRows,versementLines]=await Promise.all([
        fetchAllRows(()=> (supabase as any).rpc("list_visible_portfolio_profiles")),
        fetchAllRows(()=> (supabase as any).from("portefeuilles").select("*").order("updated_at",{ascending:false})),
        fetchAllRows(()=> (supabase as any).from("commissions").select("id,profile_id,client_id,paiement_id,type_commission,montant_base,taux_commission,montant_commission,periode,statut,date_calcul,client:clients(id,id_unique,nom_complet,famille_offre,formule_code,formule_nom),paiement:paiements(id,reference,date_paiement)").order("periode",{ascending:false})),
        fetchAllRows(()=> (supabase as any).from("portefeuille_versements").select("*").order("periode_debut",{ascending:false})),
        fetchAllRows(()=> (supabase as any).from("portefeuille_versement_lignes").select("commission_id,versement_id")),
      ]);
      const profilesData=visibleProfileRows.map((p:any)=>({...p,roles:p.roles||[],teamMemberships:p.team_memberships||[]}));
      const paidPayoutsByProfile=new Map<string,number>();
      versementRows.filter((v:any)=>v.statut==="paye").forEach((v:any)=>paidPayoutsByProfile.set(v.profile_id,(paidPayoutsByProfile.get(v.profile_id)||0)+Number(v.montant_paye||0)));
      const commissionTotals=new Map<string,{gagne:number,solde:number,verse:number}>();
      commissionsData.forEach((row:any)=>{const totals=commissionTotals.get(row.profile_id)||{gagne:0,solde:0,verse:0};const amount=Number(row.montant_commission||0);if(["calculee","validee","payee"].includes(row.statut))totals.gagne+=amount;if(["calculee","validee"].includes(row.statut))totals.solde+=amount;commissionTotals.set(row.profile_id,totals);});
      const visibleWalletRows=profilesData.map((profile:any)=>{
        const wallet=walletRows.find((x:any)=>x.user_id===profile.user_id);
        const totals=commissionTotals.get(profile.id)||{gagne:0,solde:0,verse:0};
        const totalVerse=paidPayoutsByProfile.get(profile.id) ?? Number(wallet?.total_verse||0);
        const row={...(wallet||{}),id:wallet?.id||profile.id,user_id:profile.user_id,profile_id:profile.id,solde_commissions:totals.solde,total_gagne:totals.gagne,total_verse:totalVerse,user:profile};
        return Number(row.solde_commissions)>0||Number(row.total_gagne)>0||Number(row.total_verse)>0?row:null;
      }).filter(Boolean);
      setProfiles(profilesData);
      setPortefeuilles(visibleWalletRows as any[]);
      setCommissions(commissionsData);
      setVersements(versementRows.map((v:any)=>({...v,lines:versementLines.filter((l:any)=>l.versement_id===v.id)})));
    }catch(e:any){toast({variant:"destructive",title:"Portefeuilles indisponibles",description:e?.message||"Erreur de chargement."});}
    finally{setLoading(false);}
  };
  useEffect(()=>{ void load(); },[canViewWallet]);

  // La RPC applique le périmètre côté base de données; la page ne reconstitue pas les droits côté navigateur.
  const visibleProfiles=useMemo(()=>profiles,[profiles]);

  const filtered=useMemo(()=>portefeuilles.filter((p:any)=>{
    if(!visibleProfiles.some((x:any)=>x.id===p.profile_id||x.user_id===p.user_id))return false;
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
    return commissions.filter((c:any)=>c.profile_id===selected.profile_id||c.profile_id===selected.user?.id||c.profile_id===selected.id)
      .filter((c:any)=>c.periode>=periodStart&&c.periode<=periodEnd)
      .sort((a:any,b:any)=>String(b.periode||"").localeCompare(String(a.periode||"")));
  },[commissions,selected,periodStart,periodEnd]);

  const generate=async()=>{
    if(!canManage||saving)return;
    if(!periodStart||!periodEnd||periodEnd<periodStart){toast({variant:"destructive",title:"Période invalide",description:"La date de fin doit être égale ou postérieure à la date de début."});return;}
    setSaving(true);
    try{
      const {data,error}=await (supabase as any).rpc("finance_generate_commission_payouts",{p_period_start:periodStart,p_period_end:periodEnd});
      if(error)throw error;
      toast({title:"Génération terminée",description:`${Number(data||0)} versement(s) préparé(s) dans la base. Les lignes et les montants ont été créés atomiquement.`});
      await load();
    }catch(e:any){toast({variant:"destructive",title:"Génération impossible",description:e?.message||"Aucun versement confirmé."});}
    finally{setSaving(false);}
  };

  const validatePayout=async(v:any)=>{
    if(!canManage||saving)return;
    setSaving(true);
    try{
      const {error}=await (supabase as any).rpc("finance_validate_commission_payout",{p_versement_id:v.id});
      if(error)throw error;
      toast({title:"Versement validé",description:"Les commissions ont été validées dans la même transaction."});
      await load();
    }catch(e:any){toast({variant:"destructive",title:"Validation impossible",description:e?.message||"Le versement n’a pas été validé."});}
    finally{setSaving(false);}
  };

  const markPaid=(v:any)=>{
    setPaymentTarget(v);
    setPaymentMethod("virement");
    setPaymentReference("");
    setPaymentProofFile(null);
  };

  const confirmMarkPaid=async()=>{
    if(!paymentTarget||saving)return;
    if(paymentMethod!=="especes"&&!paymentReference.trim()){
      toast({variant:"destructive",title:"Référence obligatoire",description:"Saisissez la référence réelle du virement, chèque ou paiement Mobile Money."});return;
    }
    setSaving(true);
    try{
      let proofPath:string|null=null;
      if(paymentProofFile){
        const uploaded=await uploadFile("documents",paymentProofFile,"finance/commissions");
        if(!uploaded?.path)throw new Error("Le justificatif n’a pas pu être téléversé.");
        proofPath=uploaded.path;
      }
      const {error}=await (supabase as any).rpc("finance_mark_commission_payout_paid",{
        p_versement_id:paymentTarget.id,
        p_mode_paiement:paymentMethod,
        p_reference:paymentReference.trim(),
        p_preuve_paiement_url:proofPath
      });
      if(error)throw error;
      toast({title:"Paiement enregistré",description:"Le statut du versement, les commissions et l’écriture comptable ont été enregistrés ensemble."});
      setPaymentTarget(null);setPaymentReference("");setPaymentProofFile(null);
      await load();
    }catch(e:any){toast({variant:"destructive",title:"Paiement non confirmé",description:e?.message||"Le versement n’a pas été marqué comme payé."});}
    finally{setSaving(false);}
  };

  return <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PORTEFEUILLES}>
    <MainLayout>
      <div className="portfolio-page min-w-0 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-2xl font-bold">Portefeuilles</h1></div>
          <Button variant="outline" size="sm" onClick={()=>void load()}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["Solde total disponible",stats.solde,Wallet],["Total des commissions",stats.gagne,TrendingUp],["Total versé",stats.verse,CircleDollarSign],["Versements à traiter",stats.pending,CalendarClock]].map(([label,value,Icon]:any)=>
            <Card key={label as string}><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary"/></div><div className="mt-2 text-xl font-bold">{money(value)}</div></CardContent></Card>
          )}
        </div>

        <Card>
          <CardContent className="grid min-w-0 grid-cols-2 items-end gap-x-2 gap-y-2 p-3 sm:grid-cols-[minmax(180px,1fr)_minmax(125px,150px)_minmax(125px,150px)_auto] sm:gap-2 sm:p-3">
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <label className="text-[11px] font-medium leading-tight text-muted-foreground">Rechercher</label>
              <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nom" className="mt-1 h-8 min-w-0 px-2 text-xs"/>
            </div>
            <div className="min-w-0">
              <label className="text-[11px] font-medium leading-tight text-muted-foreground">Début</label>
              <Input type="date" value={periodStart} onChange={e=>setPeriodStart(e.target.value)} className="mt-1 h-8 min-w-0 px-1.5 text-xs"/>
            </div>
            <div className="min-w-0">
              <label className="text-[11px] font-medium leading-tight text-muted-foreground">Fin</label>
              <Input type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} className="mt-1 h-8 min-w-0 px-1.5 text-xs"/>
            </div>
            {canManage&&<Button onClick={generate} disabled={saving} size="sm" className="col-span-2 h-8 w-full sm:col-span-1 sm:w-auto"><CalendarClock className="mr-1.5 h-3.5 w-3.5"/>Générer</Button>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Portefeuilles</CardTitle><TableSearchInput value={search} onChange={setSearch} placeholder="Rechercher un portefeuille…" /></CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[calc(100vh-18rem)] overflow-auto">
              <Table className="responsive-data-table min-w-[700px]"><TableHeader className="sticky top-0 z-10 bg-background"><TableRow><TableHead>Collaborateur</TableHead><TableHead>Rôle</TableHead><TableHead>Solde</TableHead><TableHead>Total gagné</TableHead><TableHead>Total versé</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading?<TableRow><TableCell colSpan={5} className="py-8 text-center">Chargement…</TableCell></TableRow>:filtered.length===0?<TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Aucun portefeuille.</TableCell></TableRow>:paginatedPortefeuilles.map((p:any)=><TableRow key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={()=>setSelected(p)}>
                  <TableCell className="font-medium">{formatUserShortName(p.user?.nom_complet||"—")}</TableCell>
                  <TableCell><Badge variant="outline">{(p.user?.roles||[]).map((role:string)=>ROLE_LABELS[role]||role).filter(Boolean).slice(0,2).join(" / ")||p.user?.poste||"Rôle non renseigné"}</Badge></TableCell>
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
          <CardContent className="p-0"><div className="overflow-x-auto"><Table className="responsive-data-table min-w-[720px]"><TableHeader><TableRow><TableHead>Collaborateur</TableHead><TableHead>Période</TableHead><TableHead>Brut</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
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
                <Table className="responsive-data-table min-w-[1000px]"><TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Offre / formule</TableHead><TableHead>Type</TableHead><TableHead>Paiement</TableHead><TableHead>Base</TableHead><TableHead>Taux</TableHead><TableHead>Commission</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>{detailRows.filter((c:any)=>JSON.stringify(c).toLowerCase().includes(search.trim().toLowerCase())).length===0?<TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Aucune commission sur cette période.</TableCell></TableRow>:detailRows.filter((c:any)=>JSON.stringify(c).toLowerCase().includes(search.trim().toLowerCase())).map((c:any)=><TableRow key={c.id}>
                  <TableCell>{c.client?.nom_complet||"—"}<span className="block text-xs text-muted-foreground">{c.client?.id_unique ? `ID client : ${c.client.id_unique}` : "—"}</span></TableCell>
                  <TableCell>{c.client?.famille_offre||"—"}{c.client?.formule_nom?` · ${c.client.formule_nom}`:""}</TableCell>
                  <TableCell><Badge variant="outline">{c.type_commission==="acquisition"?"Vente commerciale":c.type_commission==="recouvrement_mensuel"?"Recouvrement mensuel":c.type_commission==="technique"?"Commission technique":c.type_commission==="mobilisation_fonciere"?"Mobilisation foncière":c.type_commission||"—"}</Badge></TableCell>
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
        <Dialog open={!!paymentTarget} onOpenChange={(open)=>{if(!open&&!saving)setPaymentTarget(null);}}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Enregistrer le paiement des commissions</DialogTitle></DialogHeader>
            {paymentTarget&&<div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3"><p className="text-sm text-muted-foreground">Collaborateur</p><p className="font-semibold">{profiles.find((p:any)=>p.id===paymentTarget.profile_id)?.nom_complet||"Collaborateur"}</p><p className="mt-2 text-sm text-muted-foreground">Montant à payer</p><p className="text-xl font-bold">{money(paymentTarget.montant_brut)}</p></div>
              <div className="space-y-1"><Label>Mode de paiement</Label><Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="virement">Virement bancaire</SelectItem><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="cheque">Chèque</SelectItem><SelectItem value="especes">Espèces</SelectItem><SelectItem value="autre">Autre</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Référence réelle {paymentMethod==="especes"?"(facultative)":"(obligatoire)"}</Label><Input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} placeholder="Référence bancaire / Mobile Money / chèque"/></div>
              <div className="space-y-1"><Label>Justificatif (facultatif)</Label><Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>setPaymentProofFile(e.target.files?.[0]||null)}/><p className="text-xs text-muted-foreground">{paymentProofFile?.name||"Joindre le reçu ou la preuve du paiement réel."}</p></div>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setPaymentTarget(null)} disabled={saving}>Annuler</Button><Button onClick={()=>void confirmMarkPaid()} disabled={saving}>{saving?"Enregistrement…":"Confirmer le paiement effectué"}</Button></div>
            </div>}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  </ProtectedRoute>;
}
