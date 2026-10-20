import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Wallet, ArrowDownLeft, ArrowUpRight, Users, Banknote, RefreshCw, Plus, PlayCircle, CheckCircle2, Trash2, FileText, Paperclip, Upload, ChevronsUpDown, Check } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import TableSearchInput from "@/components/common/TableSearchInput";
import { uploadFile } from "@/utils/storage";

const money=(n:any)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"XOF",maximumFractionDigits:0}).format(Number(n||0));
const today=()=>new Date().toISOString().slice(0,10);

export default function Finance(){
  const { can } = usePermissions();
  const { hasRole } = useAuth();
  const canDeleteDraftPayroll = hasRole("pdg") || hasRole("super_admin") || hasRole("admin") || hasRole("dg");
  const { toast } = useToast();
  const [transactions,setTransactions]=useState<any[]>([]);
  const [expenses,setExpenses]=useState<any[]>([]);
  const [associates,setAssociates]=useState<any[]>([]);
  const [associateMovements,setAssociateMovements]=useState<any[]>([]);
  const [tableSearch,setTableSearch]=useState("");
  const [profiles,setProfiles]=useState<any[]>([]);
  const [salaryProfiles,setSalaryProfiles]=useState<any[]>([]);
  const [payrollRuns,setPayrollRuns]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [expense,setExpense]=useState({category:"AUTRE",amount:"",description:"",profileId:"",clientId:"",plantationId:"",direct:false});
  const [expenseUserPickerOpen,setExpenseUserPickerOpen]=useState(false);
  const [expenseProof,setExpenseProof]=useState<File|null>(null);
  const [expenseFormMode,setExpenseFormMode]=useState<"new"|"view"|null>(null);
  const [selectedExpense,setSelectedExpense]=useState<any|null>(null);
  const [expenseSearch,setExpenseSearch]=useState("");
  const [associateForm,setAssociateForm]=useState({associateId:"",amount:"",type:"apport",reference:"",notes:""});
  const [entryForm,setEntryForm]=useState({type:"financement",source:"",amount:"",date:new Date().toISOString().slice(0,10),method:"virement",reference:"",notes:""});
  const [entryFormOpen,setEntryFormOpen]=useState(false);
  const [salaryFormOpen,setSalaryFormOpen]=useState(false);
  const [payrollGenerateOpen,setPayrollGenerateOpen]=useState(false);
  const [associateFormOpen,setAssociateFormOpen]=useState(false);
  const [salaryForm,setSalaryForm]=useState({profileId:"",baseSalary:"",payDay:"28"});
  const [period,setPeriod]=useState(new Date().toISOString().slice(0,7));
  const [payrollPaymentRunId,setPayrollPaymentRunId]=useState("");
  const [payrollPaymentMethod,setPayrollPaymentMethod]=useState("virement");
  const [payrollPaymentReference,setPayrollPaymentReference]=useState("");
  const [payrollPaymentProofUrl,setPayrollPaymentProofUrl]=useState("");

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
    const [t,e,a,p,s,r,am]=await Promise.all([
      (supabase as any).from("finance_transactions").select("*").order("transaction_date",{ascending:false}),
      (supabase as any).from("finance_expenses").select("*").order("created_at",{ascending:false}),
      (supabase as any).from("finance_associates").select("*").order("full_name"),
      (supabase as any).from("profiles").select("id,nom_complet,email,poste,relation_rh,actif,salaire_base").order("nom_complet"),
      (supabase as any).from("finance_salary_profiles").select("*").order("created_at",{ascending:false}),
      (supabase as any).from("finance_payroll_runs").select("*").order("period_start",{ascending:false}).limit(24),
      (supabase as any).from("finance_associate_transactions").select("id,associate_id,movement_type,notes,created_at,finance_transactions(id,transaction_date,label,amount,direction,status,reference)").order("created_at",{ascending:false})
    ]);
    setTransactions(t.data||[]);setExpenses(e.data||[]);setAssociates(a.data||[]);setProfiles(p.data||[]);setSalaryProfiles(s.data||[]);setPayrollRuns(r.data||[]);setAssociateMovements(am.data||[]);
    setLoading(false);
  };
  useEffect(()=>{if(canView)void load();},[canView]);

  const totals=useMemo(()=>{
    const valid=transactions.filter((t:any)=>t.status==="valide");
    const income=valid.filter(t=>t.direction==="entree").reduce((s,t)=>s+Number(t.amount||0),0);
    const out=valid.filter(t=>t.direction==="sortie").reduce((s,t)=>s+Number(t.amount||0),0);
    return {income,out,balance:income-out};
  },[transactions]);

  const saveEntry=async()=>{
    if(!entryForm.source.trim()||Number(entryForm.amount)<=0){toast({title:"Informations requises",description:"Renseignez la source et un montant positif.",variant:"destructive"});return;}
    setSaving(true);
    try{
      const labels:Record<string,string>={financement:"Financement",pret:"Prêt reçu",don:"Don reçu",apport_associe:"Apport associé",vente:"Vente",autre:"Autre entrée"};
      const {error}=await (supabase as any).from("finance_transactions").insert({
        direction:"entree",category:entryForm.type==="don"?"DON":entryForm.type==="pret"?"PRET":entryForm.type==="apport_associe"?"ASSOCIE":entryForm.type==="financement"?"FINANCEMENT":entryForm.type==="vente"?"VENTE":"AUTRE_ENTREE",
        label:labels[entryForm.type]+" — "+entryForm.source.trim(),amount:Number(entryForm.amount),
        transaction_date:new Date(entryForm.date+"T12:00:00").toISOString(),payment_method:entryForm.method||null,
        reference:entryForm.reference.trim()||null,source_type:entryForm.type,notes:entryForm.notes.trim()||("Source : "+entryForm.source.trim()),status:"valide"
      });
      if(error)throw error;
      toast({title:"Entrée enregistrée",description:"L'opération est intégrée au journal et aux totaux financiers."});
      setEntryForm({type:"financement",source:"",amount:"",date:new Date().toISOString().slice(0,10),method:"virement",reference:"",notes:""});
      setEntryFormOpen(false);
      await load();
    }catch(error:any){toast({title:"Enregistrement impossible",description:error?.message||"Réessayez.",variant:"destructive"});}
    finally{setSaving(false);}
  };

  const saveExpense=async()=>{
    if(!expense.category||Number(expense.amount)<=0)return;
    setSaving(true);
    try {
      let proofPath: string | null = null;
      if (expenseProof) {
        const uploaded = await uploadFile("documents", expenseProof, "finance/depenses");
        if (!uploaded?.path) throw new Error("Le justificatif n’a pas pu être téléversé.");
        proofPath = uploaded.path;
      }
      const {data,error}=await (supabase as any).from("finance_transactions").insert({
        direction:"sortie",category:"DEPENSE",label:expense.category,amount:Number(expense.amount),
        status:"valide",client_id:expense.clientId||null,plantation_id:expense.plantationId||null,
        notes:expense.description||null
      }).select("id").single();
      if(error) throw error;
      const {error: expenseError}=await (supabase as any).from("finance_expenses").insert({
        transaction_id:data.id,expense_category:expense.category,profile_id:expense.profileId||null,supplier_name:profiles.find((p:any)=>p.id===expense.profileId)?.nom_complet||null,
        description:expense.description||null,client_id:expense.clientId||null,plantation_id:expense.plantationId||null,
        is_direct_cost:expense.direct,proof_path:proofPath,proof_name:expenseProof?.name||null,
        proof_mime_type:expenseProof?.type||null
      });
      if(expenseError) {
        const {error:rollbackError}=await (supabase as any).from("finance_transactions").delete().eq("id",data.id);
        if(rollbackError)throw new Error(`Le justificatif de sortie n’a pas pu être enregistré (${expenseError.message}) et la transaction financière ${data.id} n’a pas pu être annulée automatiquement (${rollbackError.message}).`);
        throw expenseError;
      }
      toast({title:"Sortie enregistrée",description:proofPath ? "Justificatif joint à la sortie." : "Sortie enregistrée sans justificatif."});
      setExpense({category:"AUTRE",amount:"",description:"",profileId:"",clientId:"",plantationId:"",direct:false});
      setExpenseUserPickerOpen(false);
      setExpenseProof(null);
      setExpenseFormMode(null);
      setSelectedExpense(null);
      await load();
    } catch(error:any) {
      toast({title:"Erreur",description:error?.message||"Impossible d'enregistrer la sortie",variant:"destructive"});
    } finally { setSaving(false); }
  };

  const saveAssociateMovement=async()=>{
    if(!associateForm.associateId||!Number.isFinite(Number(associateForm.amount))||Number(associateForm.amount)<=0){
      toast({title:"Informations requises",description:"Sélectionnez un associé et renseignez un montant positif.",variant:"destructive"});
      return;
    }
    if(saving)return;
    setSaving(true);
    let transactionId: string | null = null;
    try {
      const direction=associateForm.type==="apport"?"entree":"sortie";
      const {data,error}=await (supabase as any).from("finance_transactions").insert({
        direction,category:"ASSOCIE",label:associateForm.type==="apport"?"APPORT ASSOCIÉ":"REMBOURSEMENT ASSOCIÉ",
        amount:Number(associateForm.amount),reference:associateForm.reference.trim()||null,status:"valide",notes:associateForm.notes.trim()||null
      }).select("id").single();
      if(error)throw error;
      if(!data?.id)throw new Error("La transaction financière n’a pas été confirmée par la base de données.");
      transactionId=data.id;
      const {error:movementError}=await (supabase as any).from("finance_associate_transactions").insert({
        associate_id:associateForm.associateId,transaction_id:transactionId,movement_type:associateForm.type,notes:associateForm.notes.trim()||null
      });
      if(movementError){
        const {error:rollbackError}=await (supabase as any).from("finance_transactions").delete().eq("id",transactionId);
        if(rollbackError)throw new Error(`Le mouvement associé n’a pas été enregistré (${movementError.message}). La transaction financière ${transactionId} n’a pas pu être annulée automatiquement (${rollbackError.message}).`);
        transactionId=null;
        throw movementError;
      }
      toast({title:"Mouvement associé enregistré"});
      setAssociateForm({associateId:"",amount:"",type:"apport",reference:"",notes:""});
      setAssociateFormOpen(false);
      await load();
    } catch(error:any) {
      toast({title:"Enregistrement impossible",description:error?.message||"Le mouvement associé n’a pas été enregistré.",variant:"destructive"});
    } finally {
      setSaving(false);
    }
  };

  const saveSalary=async()=>{
    const baseSalary=Number(salaryForm.baseSalary);
    const payDay=Number(salaryForm.payDay||28);
    if(!salaryForm.profileId||salaryForm.baseSalary.trim()===""||!Number.isFinite(baseSalary)||baseSalary<0||!Number.isInteger(payDay)||payDay<1||payDay>31){
      toast({title:"Informations invalides",description:"Sélectionnez un collaborateur, renseignez un salaire valide et choisissez un jour de paie entre 1 et 31.",variant:"destructive"});
      return;
    }
    if(saving)return;
    setSaving(true);
    try{
      const {error}=await (supabase as any).from("finance_salary_profiles").upsert({
        profile_id:salaryForm.profileId,base_salary:baseSalary,pay_day:payDay,active:true
      },{onConflict:"profile_id"});
      if(error)throw error;
      toast({title:"Paramétrage salaire enregistré"});
      setSalaryForm({profileId:"",baseSalary:"",payDay:"28"});
      setSalaryFormOpen(false);
      await load();
    }catch(error:any){
      toast({title:"Enregistrement impossible",description:error?.message||"Le paramétrage du salaire n’a pas été enregistré.",variant:"destructive"});
    }finally{
      setSaving(false);
    }
  };

  const exportFinancialReport = () => {
    const rows = [
      ["Rapport financier AgriCapital"],
      ["Généré le", new Date().toLocaleString("fr-FR")],
      ["Encaissements validés", totals.income],
      ["Sorties validées", totals.out],
      ["Solde", totals.balance],
      ["Opérations validées", transactions.filter((t:any)=>t.status==="valide").length],
      [],
      ["Source", "Entrées (FCFA)", "Sorties (FCFA)", "Nombre d'opérations"],
      ...reportSources.map((r:any)=>[r.source, r.entrees, r.sorties, r.count]),
      [],
      ["Date", "Libellé", "Source", "Type", "Montant (FCFA)", "Statut", "Référence"],
      ...transactions.filter((t:any)=>t.status==="valide").map((t:any)=>[
        t.transaction_date || t.created_at || "",
        t.description || t.label || "",
        t.source || t.source_type || "",
        t.transaction_type || t.type || "",
        Number(t.amount || 0),
        t.status || "",
        t.reference || ""
      ])
    ];
    const csv = "\\uFEFF" + rows.map((row:any[])=>row.map((cell:any)=>{
      const value = String(cell ?? "");
      return '"' + value.replace(/"/g, '""') + '"';
    }).join(";")).join("\\r\\n");
    const url = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8;"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = "rapport-financier-agricapital-" + new Date().toISOString().slice(0,10) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast({title:"Export prêt",description:"Le rapport financier a été exporté au format CSV."});
  };

  const generatePayroll=async()=>{
    if(!/^\\d{4}-(0[1-9]|1[0-2])$/.test(period)){toast({title:"Période invalide",description:"Choisissez un mois valide.",variant:"destructive"});return;}
    if(saving)return;
    const [year,month]=period.split("-").map(Number);
    const start=`${period}-01`;
    const end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    setSaving(true);
    try {
      const {data,error}=await (supabase as any).rpc("finance_generate_payroll_run",{p_period_start:start,p_period_end:end});
      if(error)throw error;
      if(!data)throw new Error("La base n’a pas confirmé la génération du lot.");
      toast({title:"Brouillon de paie généré",description:`Période ${period.toUpperCase()} : les salaires fixes sont prêts à contrôler. Les commissions restent dans leur circuit distinct pour éviter un double paiement.`});
      setPayrollGenerateOpen(false);
      await load();
    } catch(error:any) {
      toast({title:"Paie non générée",description:error?.message||"Le lot n’a pas été généré.",variant:"destructive"});
    } finally {setSaving(false);}
  };

  const deletePayrollDraft=async(run:any)=>{
    if (!canDeleteDraftPayroll || run.status !== "brouillon") return;
    setSaving(true);
    const { error } = await (supabase as any).rpc("pdg_delete_payroll_draft", { p_run_id: run.id });
    if (error) toast({ title: "Suppression impossible", description: error.message, variant: "destructive" });
    else toast({ title: "Brouillon supprimé", description: "Le brouillon et ses lignes ont été supprimés." });
    await load();
    setSaving(false);
  };

  const validatePayrollRun=async(run:any)=>{
    if(saving)return;
    setSaving(true);
    try {
      const {error}=await (supabase as any).rpc("finance_validate_payroll_run",{p_run_id:run.id});
      if(error)throw error;
      toast({title:"Paie validée",description:"Le lot est maintenant prêt à être payé."});
      await load();
    } catch(error:any) {toast({title:"Validation impossible",description:error?.message||"La paie n’a pas été validée.",variant:"destructive"});}
    finally {setSaving(false);}
  };

  const payRun=async()=>{
    if(!payrollPaymentRunId||saving)return;
    if(payrollPaymentMethod!=="especes"&&!payrollPaymentReference.trim()){
      toast({title:"Référence obligatoire",description:"Saisissez la référence réelle du virement, chèque ou paiement Mobile Money.",variant:"destructive"});return;
    }
    setSaving(true);
    try {
      const {error}=await (supabase as any).rpc("finance_payroll_mark_paid",{
        p_run_id:payrollPaymentRunId,
        p_payment_method:payrollPaymentMethod,
        p_payment_reference:payrollPaymentReference.trim(),
        p_payment_proof_url:payrollPaymentProofUrl.trim()||null
      });
      if(error)throw error;
      toast({title:"Paiement de paie enregistré",description:"Les écritures financières et les lignes de paie ont été mises à jour ensemble."});
      setPayrollPaymentRunId("");setPayrollPaymentReference("");setPayrollPaymentProofUrl("");
      await load();
    } catch(error:any) {toast({title:"Paiement non confirmé",description:error?.message||"Aucune confirmation de paiement n’a été enregistrée.",variant:"destructive"});}
    finally {setSaving(false);}
  };

  if(!canView)return null;

  return <ProtectedRoute><MainLayout><div className="finance-page min-w-0 space-y-3 overflow-x-hidden">
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0"><h1 className="whitespace-nowrap text-lg font-bold leading-tight sm:text-2xl">Finance & Comptabilité</h1></div>
      <Button variant="outline" size="sm" className="shrink-0 px-2 text-xs sm:px-3 sm:text-sm" onClick={()=>void load()} disabled={loading}><RefreshCw className="mr-1 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4"/>Actualiser</Button>
    </div>
    <div className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
      <Card className="min-w-0 overflow-hidden"><CardContent className="min-w-0 p-2 sm:p-3"><p className="whitespace-nowrap text-[clamp(0.48rem,2.2vw,0.7rem)] leading-tight text-muted-foreground">ENTRÉES VALIDÉES</p><p className="mt-1 whitespace-nowrap text-[clamp(0.56rem,2.7vw,1.125rem)] font-bold leading-tight tracking-tight tabular-nums">{money(totals.income)}</p></CardContent></Card>
      <Card className="min-w-0 overflow-hidden"><CardContent className="min-w-0 p-2 sm:p-3"><p className="whitespace-nowrap text-[clamp(0.48rem,2.2vw,0.7rem)] leading-tight text-muted-foreground">SORTIES VALIDÉES</p><p className="mt-1 whitespace-nowrap text-[clamp(0.56rem,2.7vw,1.125rem)] font-bold leading-tight tracking-tight tabular-nums">{money(totals.out)}</p></CardContent></Card>
      <Card className="min-w-0 overflow-hidden"><CardContent className="min-w-0 p-2 sm:p-3"><p className="whitespace-nowrap text-[clamp(0.48rem,2.2vw,0.7rem)] leading-tight text-muted-foreground">SOLDE FINANCIER</p><p className="mt-1 whitespace-nowrap text-[clamp(0.56rem,2.7vw,1.125rem)] font-bold leading-tight tracking-tight tabular-nums">{money(totals.balance)}</p></CardContent></Card>
    </div>
    <Tabs defaultValue="journal">
      <TabsList className="grid h-auto w-full min-w-0 grid-cols-2 gap-1.5 rounded-xl bg-muted/70 p-1.5 sm:grid-cols-3 lg:grid-cols-6">
        <TabsTrigger value="journal" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><Wallet className="mb-1 h-4 w-4 shrink-0" />Journal financier</TabsTrigger>
        <TabsTrigger value="entrees" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><ArrowDownLeft className="mb-1 h-4 w-4 shrink-0" />Entrées</TabsTrigger>
        <TabsTrigger value="depenses" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><ArrowUpRight className="mb-1 h-4 w-4 shrink-0" />Sorties</TabsTrigger>
        <TabsTrigger value="salaires" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><Banknote className="mb-1 h-4 w-4 shrink-0" />Salaires & paie</TabsTrigger>
        <TabsTrigger value="associes" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><Users className="mb-1 h-4 w-4 shrink-0" />Associés</TabsTrigger>
        <TabsTrigger value="rapports" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><RefreshCw className="mb-1 h-4 w-4 shrink-0" />Rapports</TabsTrigger>
      </TabsList>
      <TabsContent value="entrees" className="mt-3 min-w-0 space-y-3">
        <div className="flex flex-col gap-3 rounded-xl border-l-4 border-emerald-600 bg-emerald-600/5 p-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Entrées financières</h2><p className="text-xs text-muted-foreground">Financements, prêts, dons, apports, ventes et autres recettes.</p></div>{canManage&&<Button onClick={()=>setEntryFormOpen(true)}><Plus className="mr-2 h-4 w-4"/>Nouvelle entrée</Button>}</div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {[
            {label:"Entrées validées",value:transactions.filter((t:any)=>t.status==="valide"&&t.direction==="entree").reduce((a,t)=>a+Number(t.amount||0),0)},
            {label:"Financements",value:transactions.filter((t:any)=>t.status==="valide"&&t.direction==="entree"&&t.source_type==="financement").reduce((a,t)=>a+Number(t.amount||0),0)},
            {label:"Dons",value:transactions.filter((t:any)=>t.status==="valide"&&t.direction==="entree"&&t.source_type==="don").reduce((a,t)=>a+Number(t.amount||0),0)},
            {label:"Prêts reçus",value:transactions.filter((t:any)=>t.status==="valide"&&t.direction==="entree"&&t.source_type==="pret").reduce((a,t)=>a+Number(t.amount||0),0)},
            {label:"Apports associés",value:transactions.filter((t:any)=>t.status==="valide"&&t.direction==="entree"&&(t.source_type==="apport_associe"||t.category==="ASSOCIE")).reduce((a,t)=>a+Number(t.amount||0),0)}
          ].map(item=><Card key={item.label}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="whitespace-nowrap text-base font-bold tabular-nums">{money(item.value)}</p></CardContent></Card>)}
        </div>
        <Dialog open={entryFormOpen} onOpenChange={setEntryFormOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Nouvelle entrée financière</DialogTitle></DialogHeader><div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1"><Label>Type d’entrée</Label><Select value={entryForm.type} onValueChange={v=>setEntryForm({...entryForm,type:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="financement">Financement</SelectItem><SelectItem value="pret">Prêt reçu</SelectItem><SelectItem value="don">Don</SelectItem><SelectItem value="apport_associe">Apport associé</SelectItem><SelectItem value="vente">Vente / prestation</SelectItem><SelectItem value="autre">Autre entrée</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Source / raison sociale / nom</Label><Input value={entryForm.source} onChange={e=>setEntryForm({...entryForm,source:e.target.value})} placeholder="Nom du financeur ou organisme"/></div>
          <div className="space-y-1"><Label>Montant (FCFA)</Label><Input type="number" min="1" value={entryForm.amount} onChange={e=>setEntryForm({...entryForm,amount:e.target.value})} placeholder="Montant reçu"/></div>
          <div className="space-y-1"><Label>Date de réception</Label><Input type="date" value={entryForm.date} onChange={e=>setEntryForm({...entryForm,date:e.target.value})}/></div>
          <div className="space-y-1"><Label>Mode de réception</Label><Select value={entryForm.method} onValueChange={v=>setEntryForm({...entryForm,method:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="virement">Virement bancaire</SelectItem><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="especes">Espèces</SelectItem><SelectItem value="cheque">Chèque</SelectItem><SelectItem value="autre">Autre</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Référence</Label><Input value={entryForm.reference} onChange={e=>setEntryForm({...entryForm,reference:e.target.value})} placeholder="N° de pièce ou transaction"/></div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label>Notes / affectation</Label><Textarea rows={2} value={entryForm.notes} onChange={e=>setEntryForm({...entryForm,notes:e.target.value})} placeholder="Objet, conditions du prêt, projet financé…"/></div>
          <div className="sm:col-span-2 lg:col-span-3"><Button className="w-full sm:w-auto" onClick={()=>void saveEntry()} disabled={saving}><Plus className="mr-2 h-4 w-4"/>Enregistrer l’entrée</Button></div>
        </div></DialogContent></Dialog>
        <Card><CardHeader className="pb-2"><CardTitle>Historique des entrées</CardTitle></CardHeader><CardContent><div className="w-full overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Date</th><th className="text-left">Nature / source</th><th className="text-left">Mode</th><th className="text-right">Montant</th></tr></thead><tbody>{transactions.filter(t=>t.direction==="entree").map(t=><tr key={t.id}><td className="whitespace-nowrap">{new Date(t.transaction_date).toLocaleDateString("fr-FR")}</td><td className="min-w-0">{t.label}</td><td>{t.payment_method||"—"}</td><td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(Number(t.amount||0))}</td></tr>)}{!transactions.some(t=>t.direction==="entree")&&<tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Aucune entrée enregistrée</td></tr>}</tbody></table></div></CardContent></Card>
      </TabsContent>
      <TabsContent value="journal" className="mt-4 min-w-0 space-y-4">
        <div className="rounded-xl border-l-4 border-primary bg-primary/5 p-4"><h2 className="font-semibold">Journal financier</h2></div>
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
      <TabsContent value="depenses" className="mt-3 min-w-0 space-y-3">
        <div className="flex flex-col gap-3 rounded-xl border-l-4 border-amber-500 bg-amber-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold">Gestion des sorties</h2><p className="text-sm text-muted-foreground">Consultez les sorties enregistrées et ouvrez le formulaire uniquement lorsque nécessaire.</p></div>
          {can("finance.expenses")&&<Button onClick={()=>{setSelectedExpense(null);setExpenseFormMode("new");}}><Plus className="mr-2 h-4 w-4"/>Nouvelle sortie</Button>}
        </div>
        {expenseFormMode!==null&&<Dialog open={expenseFormMode!==null} onOpenChange={open=>{if(!open&&!saving){setExpenseFormMode(null);setSelectedExpense(null);setExpenseProof(null);}}}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><Card>
          <CardHeader><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><CardTitle>{expenseFormMode==="new"?"Nouvelle sortie":"Détail de la sortie"}</CardTitle>{expenseFormMode==="view"&&<Badge variant="secondary">Lecture seule</Badge>}</div></CardHeader>
          <CardContent className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1"><Label>Catégorie</Label><Select disabled={expenseFormMode==="view"} value={expenseFormMode==="view"?(selectedExpense?.expense_category||"AUTRE"):expense.category} onValueChange={v=>setExpense({...expense,category:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["SALAIRES","ÉLECTRICITÉ","EAU","INTERNET","TÉLÉPHONE","CARBURANT","TRANSPORT","FRAIS DE MISSION","HÉBERGEMENT","RESTAURATION","FOURNITURES DE BUREAU","FOURNITURES AGRICOLES","ENTRETIEN","RÉPARATIONS","LOYER","ASSURANCE","BANQUE","FRAIS BANCAIRES","IMPÔTS ET TAXES","HONORAIRES","PRESTATIONS","COMMUNICATION","MARKETING","FORMATION","RECRUTEMENT","SÉCURITÉ","NETTOYAGE","ÉQUIPEMENTS","LOGICIELS","ABONNEMENTS","DÉPLACEMENTS","DONS","AUTRE"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Montant (FCFA)</Label><Input type="number" min="1" value={expenseFormMode==="view"?String(selectedExpense?.transaction?.amount??transactions.find(t=>t.id===selectedExpense?.transaction_id)?.amount??""):expense.amount} onChange={e=>setExpense({...expense,amount:e.target.value})} readOnly={expenseFormMode==="view"} disabled={expenseFormMode==="view"}/></div>
            <div className="space-y-1"><Label>Utilisateur</Label>
              {expenseFormMode==="view"?<Input value={profiles.find((p:any)=>p.id===selectedExpense?.profile_id)?.nom_complet||selectedExpense?.supplier_name||"Utilisateur non renseigné"} disabled readOnly/>:
                <Popover open={expenseUserPickerOpen} onOpenChange={setExpenseUserPickerOpen}>
                  <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={expenseUserPickerOpen} className="w-full justify-between font-normal"><span className="truncate">{profiles.find((p:any)=>p.id===expense.profileId)?.nom_complet||"Rechercher un utilisateur…"}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/></Button></PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start"><Command><CommandInput placeholder="Rechercher par nom, poste ou e-mail…"/><CommandList><CommandEmpty>Aucun utilisateur trouvé.</CommandEmpty><CommandGroup>{profiles.map((p:any)=><CommandItem key={p.id} value={[p.nom_complet,p.poste,p.email].filter(Boolean).join(" ")} onSelect={()=>{setExpense({...expense,profileId:p.id});setExpenseUserPickerOpen(false);}}><Check className={"mr-2 h-4 w-4 "+(expense.profileId===p.id?"opacity-100":"opacity-0")}/><span className="min-w-0"><span className="block truncate">{p.nom_complet}</span><span className="block truncate text-xs text-muted-foreground">{[p.poste,p.email].filter(Boolean).join(" · ")||"Collaborateur"}</span></span></CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>
                </Popover>}</div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label>Description</Label><Textarea rows={3} value={expenseFormMode==="view"?(selectedExpense?.description||""):expense.description} onChange={e=>setExpense({...expense,description:e.target.value})} readOnly={expenseFormMode==="view"} disabled={expenseFormMode==="view"}/></div>
<div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3"><input id="expense-direct-cost" type="checkbox" checked={expense.direct} onChange={e=>setExpense({...expense,direct:e.target.checked})} className="h-4 w-4 rounded border-input" /><Label htmlFor="expense-direct-cost">Identifier cette sortie comme coût direct</Label></div>
                        {expenseFormMode==="new"?<div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label htmlFor="expense-proof" className="flex items-center gap-2"><Paperclip className="h-4 w-4"/>Justificatif / reçu / facture</Label><Input id="expense-proof" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={e=>setExpenseProof(e.target.files?.[0]||null)} className="text-sm"/>{expenseProof&&<p className="text-xs text-muted-foreground">{expenseProof.name}</p>}</div>:<div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label>Justificatif</Label>{selectedExpense?.proof_path?<Button type="button" variant="outline" size="sm" onClick={async()=>{const {data,error}=await supabase.storage.from("documents").createSignedUrl(selectedExpense.proof_path,3600);if(error||!data?.signedUrl){toast({title:"Justificatif indisponible",description:error?.message||"Impossible d’ouvrir le fichier.",variant:"destructive"});return;}window.open(data.signedUrl,"_blank","noopener,noreferrer");}}><Paperclip className="mr-2 h-4 w-4"/>{selectedExpense.proof_name||"Ouvrir le justificatif"}</Button>:<p className="text-sm text-muted-foreground">Aucun justificatif joint.</p>}</div>}
            {expenseFormMode==="view"&&<div className="space-y-1"><Label>Statut de l’écriture</Label><Input value={selectedExpense?.transaction?.status||transactions.find(t=>t.id===selectedExpense?.transaction_id)?.status||"—"} disabled readOnly/></div>}
            {expenseFormMode==="new"&&<div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3"><Button className="w-full sm:w-auto" onClick={()=>void saveExpense()} disabled={saving}><Plus className="mr-2 h-4 w-4"/>{saving?"Enregistrement…":"Enregistrer la sortie"}</Button><Button type="button" variant="outline" onClick={()=>{setExpenseFormMode(null);setExpenseProof(null);}} disabled={saving}>Annuler</Button></div>}
            {expenseFormMode==="view"&&<div className="sm:col-span-2 lg:col-span-3"><Button type="button" variant="outline" onClick={()=>{setExpenseFormMode(null);setSelectedExpense(null);}}>Fermer le détail</Button></div>}
          </CardContent>
        </Card></DialogContent></Dialog>}
        <Card>
          <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Sorties enregistrées</CardTitle><TableSearchInput value={expenseSearch} onChange={setExpenseSearch} placeholder="Rechercher une sortie…"/></div></CardHeader>
          <CardContent><div className="w-full overflow-x-auto"><table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b text-left"><th className="p-2">Date</th><th className="p-2">Catégorie</th><th className="p-2">Utilisateur</th><th className="p-2 text-right">Montant</th><th className="p-2">Statut</th><th className="p-2">Justificatif</th></tr></thead>
            <tbody>{expenses.filter((e:any)=>{const t=transactions.find((x:any)=>x.id===e.transaction_id);return [e.expense_category,profiles.find((p:any)=>p.id===e.profile_id)?.nom_complet,e.supplier_name,e.description,e.proof_name,t?.label,t?.status].some((v:any)=>String(v||"").toLowerCase().includes(expenseSearch.trim().toLowerCase()));}).map((e:any)=>{const transaction=e.transaction||transactions.find((t:any)=>t.id===e.transaction_id);return <tr key={e.id} role="button" tabIndex={0} onClick={()=>{setSelectedExpense({...e,transaction});setExpenseFormMode("view");}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelectedExpense({...e,transaction});setExpenseFormMode("view");}}} className="cursor-pointer border-b transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <td className="whitespace-nowrap p-2">{transaction?.transaction_date?new Date(transaction.transaction_date).toLocaleDateString("fr-FR"):e.created_at?new Date(e.created_at).toLocaleDateString("fr-FR"):"—"}</td><td className="p-2 font-medium">{e.expense_category||"—"}{e.is_direct_cost&&<p className="text-xs text-muted-foreground">Coût direct</p>}</td><td className="max-w-[220px] truncate p-2">{profiles.find((p:any)=>p.id===e.profile_id)?.nom_complet||e.supplier_name||"—"}</td><td className="whitespace-nowrap p-2 text-right font-semibold tabular-nums">{money(transaction?.amount??0)}</td><td className="p-2"><Badge variant={transaction?.status==="valide"?"default":"secondary"}>{transaction?.status||"—"}</Badge></td><td className="p-2">{e.proof_path?<span className="inline-flex items-center gap-1 text-xs text-primary"><Paperclip className="h-3 w-3"/>{e.proof_name||"Joint"}</span>:"—"}</td>
            </tr>;})}{!expenses.length&&!loading&&<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Aucune sortie enregistrée.</td></tr>}{expenses.length>0&&!expenses.some((e:any)=>[e.expense_category,profiles.find((p:any)=>p.id===e.profile_id)?.nom_complet,e.supplier_name,e.description,e.proof_name,transactions.find((t:any)=>t.id===e.transaction_id)?.label,transactions.find((t:any)=>t.id===e.transaction_id)?.status].some((v:any)=>String(v||"").toLowerCase().includes(expenseSearch.trim().toLowerCase())))&&<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Aucune sortie ne correspond à cette recherche.</td></tr>}</tbody>
          </table></div><p className="mt-2 text-xs text-muted-foreground">Cliquez sur une ligne pour ouvrir sa fiche complète en lecture seule.</p></CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="salaires" className="mt-3 min-w-0 space-y-3"><div className="rounded-xl border-l-4 border-emerald-600 bg-emerald-600/5 p-4"><h2 className="font-semibold">Salaires et préparation de la paie</h2></div><div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {can("finance.payroll")&&<><Button variant="outline" onClick={()=>setSalaryFormOpen(true)}><Plus className="mr-2 h-4 w-4"/>Paramétrer un salaire</Button><Dialog open={salaryFormOpen} onOpenChange={setSalaryFormOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Paramétrer un salaire</DialogTitle></DialogHeader><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2"><Select value={salaryForm.profileId} onValueChange={v=>{const profile=profiles.find((p:any)=>p.id===v);setSalaryForm({...salaryForm,profileId:v,baseSalary:String(profile?.salaire_base ?? "")});}}><SelectTrigger><SelectValue placeholder="CHOISIR UN COLLABORATEUR"/></SelectTrigger><SelectContent>{profiles.filter(p=>p.actif!==false&&Number(p.salaire_base)>0).map(p=><SelectItem key={p.id} value={p.id}>{p.nom_complet} — {money(p.salaire_base)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Salaire de base (synchronisé depuis les RH)</Label><Input type="number" placeholder="Salaire défini dans les RH" value={salaryForm.baseSalary} readOnly disabled/></div>
          <div className="space-y-1"><Label>Jour habituel de paiement (1 à 31)</Label><Input type="number" min="1" max="31" value={salaryForm.payDay} onChange={e=>setSalaryForm({...salaryForm,payDay:e.target.value})}/></div>
          <Button className="w-full sm:col-span-2" onClick={()=>void saveSalary()} disabled={saving}><Banknote className="mr-2 h-4 w-4"/>ENREGISTRER LE SALAIRE</Button>
        </div></DialogContent></Dialog></>}
        {can("finance.payroll")&&<Card><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle>Générer la paie</CardTitle><Button size="sm" onClick={()=>setPayrollGenerateOpen(true)}><PlayCircle className="mr-2 h-4 w-4"/>Préparer une paie</Button></div></CardHeader><CardContent className="space-y-3"><Dialog open={payrollGenerateOpen} onOpenChange={setPayrollGenerateOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Préparer une paie mensuelle</DialogTitle></DialogHeader><div className="space-y-3"><Label>Période</Label><Input type="month" value={period} onChange={e=>setPeriod(e.target.value)}/><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setPayrollGenerateOpen(false)}>Annuler</Button><Button onClick={()=>void generatePayroll()} disabled={saving}><PlayCircle className="mr-2 h-4 w-4"/>Générer le brouillon</Button></div></div></DialogContent></Dialog><div className="space-y-2">{payrollRuns.map(r=><div key={r.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div className="min-w-0"><b>{r.period_start.slice(0,7)}</b><p className="text-xs text-muted-foreground">{r.status.toUpperCase()}</p>{r.payment_reference&&<p className="text-xs text-muted-foreground">Réf. : {r.payment_reference}</p>}</div><div className="flex flex-wrap items-center gap-2">{r.status==="brouillon"&&<Button size="sm" onClick={()=>void validatePayrollRun(r)} disabled={saving}><CheckCircle2 className="mr-1 h-4 w-4"/>Valider</Button>}{r.status==="valide"&&<Button size="sm" onClick={()=>{setPayrollPaymentRunId(r.id);setPayrollPaymentReference("");setPayrollPaymentMethod("virement");}} disabled={saving}><Banknote className="mr-1 h-4 w-4"/>Enregistrer le paiement</Button>}{r.status==="paye"&&<Badge>Payée</Badge>}{canDeleteDraftPayroll && r.status==="brouillon" && <Button size="sm" variant="destructive" onClick={()=>{if(window.confirm("Supprimer définitivement ce brouillon de paie et ses lignes ?")) void deletePayrollDraft(r);}} disabled={saving}><Trash2 className="mr-1 h-4 w-4"/>Supprimer</Button>}</div></div>)}
        {!!payrollPaymentRunId&&<Dialog open={!!payrollPaymentRunId} onOpenChange={open=>{if(!open&&!saving)setPayrollPaymentRunId("");}}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Confirmer le paiement de paie</DialogTitle></DialogHeader><div className="space-y-3"><h3 className="font-semibold">Confirmer le paiement du lot {payrollRuns.find(r=>r.id===payrollPaymentRunId)?.period_start?.slice(0,7)}</h3><p className="text-sm text-muted-foreground">N’enregistrez cette étape qu’après avoir effectué le paiement réel.</p><div className="grid gap-2 sm:grid-cols-2"><div className="space-y-1"><Label>Mode de paiement</Label><Select value={payrollPaymentMethod} onValueChange={setPayrollPaymentMethod}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="virement">Virement bancaire</SelectItem><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="cheque">Chèque</SelectItem><SelectItem value="especes">Espèces</SelectItem><SelectItem value="autre">Autre</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label>Référence réelle {payrollPaymentMethod==="especes"?"(facultative)":"(obligatoire)"}</Label><Input value={payrollPaymentReference} onChange={e=>setPayrollPaymentReference(e.target.value)} placeholder="Référence transaction / chèque"/></div><div className="space-y-1 sm:col-span-2"><Label>URL du justificatif (facultative)</Label><Input value={payrollPaymentProofUrl} onChange={e=>setPayrollPaymentProofUrl(e.target.value)} placeholder="Lien sécurisé vers le justificatif"/></div></div><div className="flex flex-wrap gap-2"><Button onClick={()=>void payRun()} disabled={saving}>{saving?"Enregistrement…":"Confirmer le paiement enregistré"}</Button><Button variant="outline" onClick={()=>setPayrollPaymentRunId("")} disabled={saving}>Annuler</Button></div></div></DialogContent></Dialog>}</div></CardContent></Card>}
      </div></TabsContent>
      <TabsContent value="associes" className="mt-3 min-w-0 space-y-3"><div className="rounded-xl border-l-4 border-violet-600 bg-violet-600/5 p-3"><h2 className="font-semibold">Comptes des associés</h2><p className="text-xs text-muted-foreground">Apports, remboursements et historique financier.</p></div><div className="grid grid-cols-2 gap-2 lg:grid-cols-4"><Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Associés actifs</p><p className="text-base font-bold">{associates.filter(a=>a.active).length}</p></CardContent></Card><Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total des apports</p><p className="whitespace-nowrap text-sm font-bold tabular-nums">{money(associateMovements.filter(m=>m.movement_type==="apport"&&m.finance_transactions?.status==="valide").reduce((sum,m)=>sum+Number(m.finance_transactions?.amount||0),0))}</p></CardContent></Card><Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Remboursements</p><p className="whitespace-nowrap text-sm font-bold tabular-nums">{money(associateMovements.filter(m=>m.movement_type==="remboursement"&&m.finance_transactions?.status==="valide").reduce((sum,m)=>sum+Number(m.finance_transactions?.amount||0),0))}</p></CardContent></Card><Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Solde net</p><p className="whitespace-nowrap text-sm font-bold tabular-nums">{money(associateMovements.filter(m=>m.finance_transactions?.status==="valide").reduce((sum,m)=>sum+(m.movement_type==="apport"?1:m.movement_type==="remboursement"?-1:0)*Number(m.finance_transactions?.amount||0),0))}</p></CardContent></Card></div><Card><CardHeader className="pb-2"><CardTitle className="text-base">Répartition des apports par associé</CardTitle></CardHeader><CardContent className="space-y-3">
          {associates.map(a=>{const amount=associateMovements.filter(m=>m.associate_id===a.id&&m.movement_type==="apport"&&m.finance_transactions?.status==="valide").reduce((sum,m)=>sum+Number(m.finance_transactions?.amount||0),0);const total=associateMovements.filter(m=>m.movement_type==="apport"&&m.finance_transactions?.status==="valide").reduce((sum,m)=>sum+Number(m.finance_transactions?.amount||0),0);const pct=total?Math.round(amount/total*100):0;return <div key={a.id} className="space-y-1"><div className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate">{a.full_name}</span><span className="whitespace-nowrap font-semibold tabular-nums">{money(amount)} · {pct}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-600" style={{width:pct+"%"}}/></div></div>})}
          {!associates.length&&<p className="text-sm text-muted-foreground">Aucun associé enregistré.</p>}
        </CardContent></Card>
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        {can("finance.associates")&&<><Button variant="outline" onClick={()=>setAssociateFormOpen(true)}><Plus className="mr-2 h-4 w-4"/>Nouveau mouvement</Button><Dialog open={associateFormOpen} onOpenChange={setAssociateFormOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Nouveau mouvement associé</DialogTitle></DialogHeader><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select value={associateForm.associateId} onValueChange={v=>setAssociateForm({...associateForm,associateId:v})}><SelectTrigger><SelectValue placeholder="CHOISIR L'ASSOCIÉ"/></SelectTrigger><SelectContent>{associates.map(a=><SelectItem key={a.id} value={a.id}>{a.full_name} — {a.role_label}</SelectItem>)}</SelectContent></Select>
          <Select value={associateForm.type} onValueChange={v=>setAssociateForm({...associateForm,type:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="apport">APPORT</SelectItem><SelectItem value="remboursement">REMBOURSEMENT</SelectItem><SelectItem value="autre">AUTRE</SelectItem></SelectContent></Select>
          <Input type="number" placeholder="MONTANT" value={associateForm.amount} onChange={e=>setAssociateForm({...associateForm,amount:e.target.value})}/>
          <Input placeholder="RÉFÉRENCE" value={associateForm.reference} onChange={e=>setAssociateForm({...associateForm,reference:e.target.value})}/>
          <Textarea className="sm:col-span-2" rows={2} placeholder="NOTE" value={associateForm.notes} onChange={e=>setAssociateForm({...associateForm,notes:e.target.value})}/>
          <Button className="w-full sm:col-span-2" onClick={()=>void saveAssociateMovement()} disabled={saving}><Plus className="mr-2 h-4 w-4"/>ENREGISTRER</Button>
        </div></DialogContent></Dialog></>}
        <Card><CardHeader><CardTitle>Associés enregistrés</CardTitle></CardHeader><CardContent className="space-y-2">{associates.map(a=><div key={a.id} className="flex items-center gap-2 rounded-lg border p-2"><Badge variant={a.active?"default":"secondary"}>{a.active?"ACTIF":"INACTIF"}</Badge><Badge variant="outline">{a.role_label}</Badge><b className="min-w-0 flex-1 truncate">{a.full_name}</b></div>)}</CardContent></Card>
      </div><Card><CardHeader className="pb-2"><CardTitle>Historique des mouvements associés</CardTitle></CardHeader><CardContent><div className="w-full overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Date</th><th className="text-left">Associé</th><th className="text-left">Mouvement</th><th className="text-left">Référence</th><th className="text-right">Montant</th></tr></thead><tbody>{associateMovements.map(m=><tr key={m.id}><td className="whitespace-nowrap">{new Date(m.finance_transactions?.transaction_date||m.created_at).toLocaleDateString("fr-FR")}</td><td>{associates.find(a=>a.id===m.associate_id)?.full_name||"—"}</td><td>{m.movement_type==="apport"?"Apport":m.movement_type==="remboursement"?"Remboursement":"Autre"}</td><td>{m.finance_transactions?.reference||"—"}</td><td className="whitespace-nowrap text-right tabular-nums">{money(Number(m.finance_transactions?.amount||0))}</td></tr>)}{!associateMovements.length&&<tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Aucun mouvement associé enregistré</td></tr>}</tbody></table></div></CardContent></Card>
      </TabsContent>
      <TabsContent value="rapports" className="mt-4 min-w-0 space-y-4"><div className="flex flex-col gap-3 rounded-xl border-l-4 border-sky-600 bg-sky-600/5 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Rapports financiers</h2></div><Button onClick={exportFinancialReport}><FileText className="mr-2 h-4 w-4"/>Exporter le rapport (CSV)</Button></div><div className="responsive-auto-grid gap-3"><Card><CardContent className="min-w-0 p-3 sm:p-4"><p className="text-xs text-muted-foreground">ENCAISSEMENTS VALIDÉS</p><p className="money-value mt-1 text-[clamp(0.78rem,3.2vw,1.5rem)] font-bold leading-tight">{money(totals.income)}</p></CardContent></Card><Card><CardContent className="min-w-0 p-3 sm:p-4"><p className="text-xs text-muted-foreground">SORTIES VALIDÉES</p><p className="money-value mt-1 text-[clamp(0.78rem,3.2vw,1.5rem)] font-bold leading-tight">{money(totals.out)}</p></CardContent></Card><Card><CardContent className="min-w-0 p-3 sm:p-4"><p className="text-xs text-muted-foreground">SOLDE</p><p className="money-value mt-1 text-[clamp(0.78rem,3.2vw,1.5rem)] font-bold leading-tight">{money(totals.balance)}</p></CardContent></Card><Card><CardContent className="p-3 sm:p-4"><p className="text-xs text-muted-foreground">OPÉRATIONS VALIDÉES</p><p className="mt-1 text-2xl font-bold leading-tight">{transactions.filter((t:any)=>t.status==="valide").length}</p></CardContent></Card></div><Card><CardHeader><CardTitle>Répartition par source</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Source</th><th className="p-2 text-right">Entrées</th><th className="p-2 text-right">Sorties</th><th className="p-2 text-right">Opérations</th></tr></thead><tbody>{reportSources.map(r=><tr key={r.source} className="border-b last:border-0"><td className="p-2 font-medium">{r.source}</td><td className="money-value p-2 text-right">{money(r.entrees)}</td><td className="money-value p-2 text-right">{money(r.sorties)}</td><td className="p-2 text-right">{r.count}</td></tr>)}{!reportSources.length&&<tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Aucune opération validée</td></tr>}</tbody></table></div></CardContent></Card><Card><CardHeader><CardTitle>Dernières opérations validées</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Date</th><th className="p-2">Libellé</th><th className="p-2">Source</th><th className="p-2 text-right">Montant</th></tr></thead><tbody>{recentValidTransactions.map((t:any)=><tr key={t.id} className="border-b last:border-0"><td className="p-2 whitespace-nowrap">{t.transaction_date?new Date(t.transaction_date).toLocaleDateString("fr-FR"):"—"}</td><td className="p-2">{t.label||"—"}</td><td className="p-2">{String(t.source_type||"MANUEL").toUpperCase()}</td><td className={`money-value p-2 text-right font-semibold ${t.direction==="sortie"?"text-destructive":"text-primary"}`}>{t.direction==="sortie"?"−":"+"}{money(t.amount)}</td></tr>)}{!recentValidTransactions.length&&<tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Aucune opération validée</td></tr>}</tbody></table></div></CardContent></Card></TabsContent>
    </Tabs>
  </div></MainLayout></ProtectedRoute>;
}
