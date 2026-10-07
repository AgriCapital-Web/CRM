import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, ArrowDownLeft, ArrowUpRight, Users, Banknote, RefreshCw, Plus, PlayCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import TableSearchInput from "@/components/common/TableSearchInput";

const money=(n:any)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"XOF",maximumFractionDigits:0}).format(Number(n||0));
const today=()=>new Date().toISOString().slice(0,10);

export default function Finance(){
  const { can } = usePermissions();
  const { toast } = useToast();
  const [transactions,setTransactions]=useState<any[]>([]);
  const [expenses,setExpenses]=useState<any[]>([]);
  const [associates,setAssociates]=useState<any[]>([]);
  const [tableSearch,setTableSearch]=useState("");
  const [profiles,setProfiles]=useState<any[]>([]);
  const [salaryProfiles,setSalaryProfiles]=useState<any[]>([]);
  const [payrollRuns,setPayrollRuns]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [expense,setExpense]=useState({category:"AUTRE",amount:"",description:"",supplier:"",clientId:"",plantationId:"",direct:false});
  const [associateForm,setAssociateForm]=useState({associateId:"",amount:"",type:"apport",reference:"",notes:""});
  const [salaryForm,setSalaryForm]=useState({profileId:"",baseSalary:"",payDay:"28"});
  const [period,setPeriod]=useState(new Date().toISOString().slice(0,7));

  const canView=can("finance.view");
  const canManage=can("finance.manage");

  const reportSources=useMemo(()=>{
    const map=new Map<string,{source:string;entrees:number;sorties:number;count:number}>();
    transactions.filter((t:any)=>t.status==="valide").forEach((t:any)=>{
      const source=String(t.source_type||"MANUEL").toUpperCase();
      const row=map.get(source)||{source,entrees:0,sorties:0,count:0};
      const amount=Number(t.amount||0);
      if(t.direction==="entree") row.entrees+=amount; else row.sorties+=amount;
      row.count+=1; map.set(source,row);
    });
    return Array.from(map.values()).sort((a,b)=>(b.entrees-b.sorties)-(a.entrees-a.sorties));
  },[transactions]);

  const recentValidTransactions=useMemo(
    ()=>transactions.filter((t:any)=>t.status==="valide").slice(0,12),
    [transactions]
  );

  const load=async()=>{
    setLoading(true);
    const [t,e,a,p,s,r]=await Promise.all([
      (supabase as any).from("finance_transactions").select("*").order("transaction_date",{ascending:false}).limit(100),
      (supabase as any).from("finance_expenses").select("*").order("created_at",{ascending:false}).limit(100),
      (supabase as any).from("finance_associates").select("*").order("full_name"),
      (supabase as any).from("profiles").select("id,nom_complet,poste,relation_rh,actif").eq("actif",true).order("nom_complet"),
      (supabase as any).from("finance_salary_profiles").select("*").order("created_at",{ascending:false}),
      (supabase as any).from("finance_payroll_runs").select("*").order("period_start",{ascending:false}).limit(24)
    ]);
    setTransactions(t.data||[]);setExpenses(e.data||[]);setAssociates(a.data||[]);setProfiles(p.data||[]);setSalaryProfiles(s.data||[]);setPayrollRuns(r.data||[]);
    setLoading(false);
  };
  useEffect(()=>{if(canView)void load();},[canView]);

  const totals=useMemo(()=>{
    const valid=transactions.filter(t=>t.status==="valide");
    const income=valid.filter(t=>t.direction==="entree").reduce((s,t)=>s+Number(t.amount||0),0);
    const out=valid.filter(t=>t.direction==="sortie").reduce((s,t)=>s+Number(t.amount||0),0);
    return {income,out,balance:income-out};
  },[transactions]);

  const saveExpense=async()=>{
    if(!expense.category||Number(expense.amount)<=0)return;
    setSaving(true);
    const {data,error}=await (supabase as any).from("finance_transactions").insert({
      direction:"sortie",category:"DEPENSE",label:expense.category,amount:Number(expense.amount),
      status:"valide",client_id:expense.clientId||null,plantation_id:expense.plantationId||null,notes:expense.description||null
    }).select("id").single();
    if(!error&&data){
      await (supabase as any).from("finance_expenses").insert({
        transaction_id:data.id,expense_category:expense.category,supplier_name:expense.supplier||null,
        description:expense.description||null,client_id:expense.clientId||null,plantation_id:expense.plantationId||null,
        is_direct_cost:expense.direct
      });
      toast({title:"Dépense enregistrée"});
      setExpense({category:"AUTRE",amount:"",description:"",supplier:"",clientId:"",plantationId:"",direct:false});
      await load();
    }else toast({title:"Erreur",description:error?.message||"Impossible d'enregistrer",variant:"destructive"});
    setSaving(false);
  };

  const saveAssociateMovement=async()=>{
    if(!associateForm.associateId||Number(associateForm.amount)<=0)return;
    setSaving(true);
    const direction=associateForm.type==="apport"?"entree":"sortie";
    const {data,error}=await (supabase as any).from("finance_transactions").insert({
      direction,category:"ASSOCIE",label:associateForm.type==="apport"?"APPORT ASSOCIÉ":"REMBOURSEMENT ASSOCIÉ",
      amount:Number(associateForm.amount),reference:associateForm.reference||null,status:"valide",notes:associateForm.notes||null
    }).select("id").single();
    if(!error&&data){
      await (supabase as any).from("finance_associate_transactions").insert({
        associate_id:associateForm.associateId,transaction_id:data.id,movement_type:associateForm.type,notes:associateForm.notes||null
      });
      toast({title:"Mouvement associé enregistré"});setAssociateForm({associateId:"",amount:"",type:"apport",reference:"",notes:""});await load();
    }else toast({title:"Erreur",description:error?.message||"Impossible d'enregistrer",variant:"destructive"});
    setSaving(false);
  };

  const saveSalary=async()=>{
    if(!salaryForm.profileId||Number(salaryForm.baseSalary)<0)return;
    setSaving(true);
    const {error}=await (supabase as any).from("finance_salary_profiles").upsert({
      profile_id:salaryForm.profileId,base_salary:Number(salaryForm.baseSalary),pay_day:Number(salaryForm.payDay||28),active:true
    },{onConflict:"profile_id"});
    toast(error?{title:"Erreur",description:error.message,variant:"destructive"}:{title:"Paramétrage salaire enregistré"});
    if(!error){setSalaryForm({profileId:"",baseSalary:"",payDay:"28"});await load();}
    setSaving(false);
  };

  const generatePayroll=async()=>{
    const [year,month]=period.split("-").map(Number);
    const start=`${period}-01`;
    const end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    setSaving(true);
    const {data:run,error}=await (supabase as any).from("finance_payroll_runs").upsert({period_start:start,period_end:end,status:"brouillon"},{onConflict:"period_start,period_end"}).select("id").single();
    if(error||!run){toast({title:"Erreur",description:error?.message||"Paie impossible",variant:"destructive"});setSaving(false);return;}
    for(const sp of salaryProfiles.filter(s=>s.active)){
      const commissions=(await (supabase as any).from("commissions").select("montant_commission").eq("profile_id",sp.profile_id).gte("periode",start).lte("periode",end).in("statut",["calculee","validee"])).data||[];
      const totalCommissions=commissions.reduce((s:any,c:any)=>s+Number(c.montant_commission||0),0);
      await (supabase as any).from("finance_payroll_items").upsert({
        payroll_run_id:run.id,profile_id:sp.profile_id,base_salary:Number(sp.base_salary||0),commissions:totalCommissions,status:"calcule"
      },{onConflict:"payroll_run_id,profile_id"});
    }
    toast({title:"Paie générée",description:`Période ${period.toUpperCase()} prête à validation.`});await load();setSaving(false);
  };

  const payRun=async(run:any)=>{
    setSaving(true);
    await (supabase as any).from("finance_payroll_runs").update({status:"paye",paid_at:new Date().toISOString()}).eq("id",run.id);
    await (supabase as any).from("finance_payroll_items").update({status:"paye"}).eq("payroll_run_id",run.id);
    await load();setSaving(false);toast({title:"Paie déclenchée"});
  };

  if(!canView)return null;

  return <ProtectedRoute><MainLayout><div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-bold">Finance & Comptabilité</h1><p className="text-sm text-muted-foreground">Les encaissements CRM et commissions sont synchronisés automatiquement. Aucune double saisie commerciale.</p></div>
      <Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">ENTRÉES VALIDÉES</p><p className="mt-2 text-2xl font-bold">{money(totals.income)}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">SORTIES VALIDÉES</p><p className="mt-2 text-2xl font-bold">{money(totals.out)}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">SOLDE FINANCIER</p><p className="mt-2 text-2xl font-bold">{money(totals.balance)}</p></CardContent></Card>
    </div>
    <Tabs defaultValue="journal">
      <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
        <TabsTrigger value="journal">Journal</TabsTrigger>
        <TabsTrigger value="depenses">Dépenses</TabsTrigger>
        <TabsTrigger value="salaires">Salaires</TabsTrigger>
        <TabsTrigger value="associes">Associés</TabsTrigger>
        <TabsTrigger value="rapports">Rapports</TabsTrigger>
      </TabsList>
      <TabsContent value="journal">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Journal financier</CardTitle>
              <TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher une écriture…" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b"><th className="p-2 text-left">DATE</th><th className="p-2 text-left">TYPE</th><th className="p-2 text-left">LIBELLÉ</th><th className="p-2 text-right">MONTANT</th><th className="p-2 text-left">SOURCE</th></tr>
                </thead>
                <tbody>
                  {transactions.filter((t:any)=>JSON.stringify(t).toLowerCase().includes(tableSearch.trim().toLowerCase())).map((t:any)=>(
                    <tr key={t.id} className="border-b">
                      <td className="p-2">{new Date(t.transaction_date).toLocaleDateString("fr-FR")}</td>
                      <td className="p-2">
                        <Badge variant="outline" className="gap-1">
                          {t.direction==="entree" ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                          {t.direction.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="p-2">{t.label}</td>
                      <td className="p-2 text-right font-semibold">{money(t.amount)}</td>
                      <td className="p-2 text-muted-foreground">{t.source_type||"MANUEL"}</td>
                    </tr>
                  ))}
                  {!transactions.filter((t:any)=>JSON.stringify(t).toLowerCase().includes(tableSearch.trim().toLowerCase())).length&&!loading&&(
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Aucune écriture.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="depenses"><div className="grid lg:grid-cols-[1fr_1.5fr] gap-4">
        {can("finance.expenses")&&<Card><CardHeader><CardTitle>Nouvelle dépense</CardTitle></CardHeader><CardContent className="space-y-3">
          <div><Label>CATÉGORIE</Label><Select value={expense.category} onValueChange={v=>setExpense({...expense,category:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["SALAIRES","CARBURANT","TRANSPORT","FOURNITURES","COMMUNICATION","PRESTATION","LOYER","BANQUE","IMPÔTS","AUTRE"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>MONTANT</Label><Input type="number" value={expense.amount} onChange={e=>setExpense({...expense,amount:e.target.value})}/></div>
          <div><Label>FOURNISSEUR / BÉNÉFICIAIRE</Label><Input value={expense.supplier} onChange={e=>setExpense({...expense,supplier:e.target.value})}/></div>
          <div><Label>DESCRIPTION</Label><Textarea value={expense.description} onChange={e=>setExpense({...expense,description:e.target.value})}/></div>
          <Button className="w-full" onClick={()=>void saveExpense()} disabled={saving}><Plus className="mr-2 h-4 w-4"/>ENREGISTRER</Button>
        </CardContent></Card>}
        <Card><CardHeader><CardTitle>Dépenses enregistrées</CardTitle></CardHeader><CardContent><div className="space-y-2">{expenses.map(e=><div key={e.id} className="rounded-lg border p-3"><div className="flex justify-between"><b>{e.expense_category}</b><b>{money(e.transaction_id?transactions.find(t=>t.id===e.transaction_id)?.amount:0)}</b></div><p className="text-xs text-muted-foreground">{e.description||"—"} {e.is_direct_cost&&"• COÛT DIRECT"}</p></div>)}</div></CardContent></Card>
      </div></TabsContent>
      <TabsContent value="salaires"><div className="grid lg:grid-cols-2 gap-4">
        {can("finance.payroll")&&<Card><CardHeader><CardTitle>Paramétrer un salaire</CardTitle></CardHeader><CardContent className="space-y-3">
          <Select value={salaryForm.profileId} onValueChange={v=>setSalaryForm({...salaryForm,profileId:v})}><SelectTrigger><SelectValue placeholder="CHOISIR UN COLLABORATEUR"/></SelectTrigger><SelectContent>{profiles.map(p=><SelectItem key={p.id} value={p.id}>{p.nom_complet}</SelectItem>)}</SelectContent></Select>
          <Input type="number" placeholder="SALAIRE DE BASE" value={salaryForm.baseSalary} onChange={e=>setSalaryForm({...salaryForm,baseSalary:e.target.value})}/>
          <Input type="number" min="1" max="31" placeholder="JOUR DE PAIE" value={salaryForm.payDay} onChange={e=>setSalaryForm({...salaryForm,payDay:e.target.value})}/>
          <Button className="w-full" onClick={()=>void saveSalary()} disabled={saving}><Banknote className="mr-2 h-4 w-4"/>ENREGISTRER LE SALAIRE</Button>
        </CardContent></Card>}
        {can("finance.payroll")&&<Card><CardHeader><CardTitle>Générer la paie</CardTitle></CardHeader><CardContent className="space-y-3"><Input type="month" value={period} onChange={e=>setPeriod(e.target.value)}/><Button className="w-full" onClick={()=>void generatePayroll()} disabled={saving}><PlayCircle className="mr-2 h-4 w-4"/>GÉNÉRER AUTOMATIQUEMENT</Button><div className="space-y-2">{payrollRuns.map(r=><div key={r.id} className="rounded-lg border p-3 flex items-center justify-between"><div><b>{r.period_start.slice(0,7)}</b><p className="text-xs text-muted-foreground">{r.status.toUpperCase()}</p></div>{r.status!=="paye"&&<Button size="sm" onClick={()=>void payRun(r)} disabled={saving}><CheckCircle2 className="mr-1 h-4 w-4"/>DÉCLENCHER</Button>}</div>)}</div></CardContent></Card>}
      </div></TabsContent>
      <TabsContent value="associes"><div className="grid lg:grid-cols-2 gap-4">
        {can("finance.associates")&&<Card><CardHeader><CardTitle>Mouvement associé</CardTitle></CardHeader><CardContent className="space-y-3">
          <Select value={associateForm.associateId} onValueChange={v=>setAssociateForm({...associateForm,associateId:v})}><SelectTrigger><SelectValue placeholder="CHOISIR L'ASSOCIÉ"/></SelectTrigger><SelectContent>{associates.map(a=><SelectItem key={a.id} value={a.id}>{a.full_name} — {a.role_label}</SelectItem>)}</SelectContent></Select>
          <Select value={associateForm.type} onValueChange={v=>setAssociateForm({...associateForm,type:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="apport">APPORT</SelectItem><SelectItem value="remboursement">REMBOURSEMENT</SelectItem><SelectItem value="autre">AUTRE</SelectItem></SelectContent></Select>
          <Input type="number" placeholder="MONTANT" value={associateForm.amount} onChange={e=>setAssociateForm({...associateForm,amount:e.target.value})}/>
          <Input placeholder="RÉFÉRENCE" value={associateForm.reference} onChange={e=>setAssociateForm({...associateForm,reference:e.target.value})}/>
          <Textarea placeholder="NOTE" value={associateForm.notes} onChange={e=>setAssociateForm({...associateForm,notes:e.target.value})}/>
          <Button className="w-full" onClick={()=>void saveAssociateMovement()} disabled={saving}><Plus className="mr-2 h-4 w-4"/>ENREGISTRER</Button>
        </CardContent></Card>}
        <Card><CardHeader><CardTitle>Associés enregistrés</CardTitle></CardHeader><CardContent className="space-y-2">{associates.map(a=><div key={a.id} className="rounded-lg border p-3 flex items-center justify-between"><div><b>{a.full_name}</b><p className="text-xs text-muted-foreground">{a.role_label}</p></div><Badge variant={a.active?"default":"secondary"}>{a.active?"ACTIF":"INACTIF"}</Badge></div>)}</CardContent></Card>
      </div></TabsContent>
      <TabsContent value="rapports" className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">ENCAISSEMENTS VALIDÉS</p><p className="text-2xl font-bold">{money(totals.income)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">SORTIES VALIDÉES</p><p className="text-2xl font-bold">{money(totals.out)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">SOLDE</p><p className="text-2xl font-bold">{money(totals.balance)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">OPÉRATIONS VALIDÉES</p><p className="text-2xl font-bold">{transactions.filter((t:any)=>t.status==="valide").length}</p></CardContent></Card></div><Card><CardHeader><CardTitle>Répartition par source</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Source</th><th className="p-2 text-right">Entrées</th><th className="p-2 text-right">Sorties</th><th className="p-2 text-right">Opérations</th></tr></thead><tbody>{reportSources.map(r=><tr key={r.source} className="border-b last:border-0"><td className="p-2 font-medium">{r.source}</td><td className="p-2 text-right">{money(r.entrees)}</td><td className="p-2 text-right">{money(r.sorties)}</td><td className="p-2 text-right">{r.count}</td></tr>)}{!reportSources.length&&<tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Aucune opération validée</td></tr>}</tbody></table></div></CardContent></Card><Card><CardHeader><CardTitle>Dernières opérations validées</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Date</th><th className="p-2">Libellé</th><th className="p-2">Source</th><th className="p-2 text-right">Montant</th></tr></thead><tbody>{recentValidTransactions.map((t:any)=><tr key={t.id} className="border-b last:border-0"><td className="p-2">{t.transaction_date?new Date(t.transaction_date).toLocaleDateString("fr-FR"):"—"}</td><td className="p-2">{t.label||"—"}</td><td className="p-2">{String(t.source_type||"MANUEL").toUpperCase()}</td><td className={`p-2 text-right font-semibold ${t.direction==="sortie"?"text-destructive":"text-primary"}`}>{t.direction==="sortie"?"−":"+"}{money(t.amount)}</td></tr>)}{!recentValidTransactions.length&&<tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Aucune opération validée</td></tr>}</tbody></table></div></CardContent></Card></TabsContent>
    </Tabs>
  </div></MainLayout></ProtectedRoute>;
}
