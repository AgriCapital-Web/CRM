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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Wallet, ArrowDownLeft, ArrowUpRight, Users, Banknote, RefreshCw, Plus, PlayCircle, CheckCircle2, Trash2, FileText, Paperclip, Upload, ChevronsUpDown, Check, MoreHorizontal, Eye, Pencil } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import TableSearchInput from "@/components/common/TableSearchInput";
import { uploadFile } from "@/utils/storage";
import { matchesAccentInsensitive } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import FinanceAnalytics from "@/pages/FinanceAnalytics";
import FinanceHistoryImport from "@/pages/FinanceHistoryImport";
import { FINANCE_EXPENSE_CATEGORIES } from "@/lib/finance-categories";

const money=(n:any)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"XOF",maximumFractionDigits:0}).format(Number(n||0));
const feeAmountFor=(amount:number)=>Math.round(amount*0.01);

export default function Finance(){
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") || "journal";
  const initialTab = requestedTab === "analytique" || requestedTab === "historique" ? "rapports" : requestedTab;
  const initialReportSection = requestedTab === "analytique" ? "analytique" : requestedTab === "historique" ? "historique" : "rapport";
  const { can } = usePermissions();
  const { hasRole } = useAuth();
  const isPdg = hasRole("pdg");
  const canDeleteDraftPayroll = hasRole("pdg") || hasRole("super_admin") || hasRole("admin") || hasRole("dg");
  const { toast } = useToast();
  const [transactions,setTransactions]=useState<any[]>([]);
  const [independentProformas,setIndependentProformas]=useState<any[]>([]);
  const [independentInvoices,setIndependentInvoices]=useState<any[]>([]);
  const [expenses,setExpenses]=useState<any[]>([]);
  const [associates,setAssociates]=useState<any[]>([]);
  const [associateMovements,setAssociateMovements]=useState<any[]>([]);
  const [associateMovementOpen,setAssociateMovementOpen]=useState(false);
  const [associateMovement,setAssociateMovement]=useState({associateId:"",type:"apport",amount:"",date:new Date().toISOString().slice(0,10),reference:"",notes:"",method:"mobile_money",withoutFees:false});
  const [plannedExpenseOpen,setPlannedExpenseOpen]=useState(false);
  const [plannedInternalUserPickerOpen,setPlannedInternalUserPickerOpen]=useState(false);
  const [tableSearch,setTableSearch]=useState("");
  const [profiles,setProfiles]=useState<any[]>([]);
  const [salaryProfiles,setSalaryProfiles]=useState<any[]>([]);
  const [payrollRuns,setPayrollRuns]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [expense,setExpense]=useState({category:"AUTRE",amount:"",date:new Date().toISOString().slice(0,10),description:"",profileId:"",clientId:"",plantationId:"",direct:false,method:"mobile_money",withFees:false,reference:""});
  const [expenseUserPickerOpen,setExpenseUserPickerOpen]=useState(false);
  const [expenseProof,setExpenseProof]=useState<File|null>(null);
  const expenseProofPreview = useMemo(() => expenseProof && (expenseProof.type.startsWith("image/") || expenseProof.type === "application/pdf") ? URL.createObjectURL(expenseProof) : null, [expenseProof]);
  useEffect(() => () => { if (expenseProofPreview) URL.revokeObjectURL(expenseProofPreview); }, [expenseProofPreview]);
  const [expenseFormMode,setExpenseFormMode]=useState<"new"|"view"|"edit"|null>(null);
  const [selectedExpense,setSelectedExpense]=useState<any|null>(null);
  const [expenseSearch,setExpenseSearch]=useState("");
  const [plannedExpense,setPlannedExpense]=useState({category:"PRESTATIONS",amount:"",description:"",beneficiary:"",beneficiaryPhone:"",profileId:"",isInternalUser:false,expenseDate:new Date().toISOString().slice(0,10),dueDate:"",direct:false,reference:"",referenceAsFile:false});
  const [plannedProof,setPlannedProof]=useState<File|null>(null);
  const [plannedExpenseEditId,setPlannedExpenseEditId]=useState<string|null>(null);
  const [plannedExpenseTarget,setPlannedExpenseTarget]=useState<any|null>(null);
  const [paymentTarget,setPaymentTarget]=useState<any|null>(null);
  const [paymentAmount,setPaymentAmount]=useState("");
  const [paymentDate,setPaymentDate]=useState(new Date().toISOString().slice(0,10));
  const [paymentMethod,setPaymentMethod]=useState("mobile_money");
  const [paymentReference,setPaymentReference]=useState("");
  const [paymentProof,setPaymentProof]=useState<File|null>(null);
  const [paymentPartial,setPaymentPartial]=useState(false);
  const [paymentWithFees,setPaymentWithFees]=useState(false);

  const [entryForm,setEntryForm]=useState({type:"financement",source:"",contactPhone:"",amount:"",date:new Date().toISOString().slice(0,10),method:"mobile_money",reference:"",notes:"",withoutFees:false});
  const [entryProof,setEntryProof]=useState<File|null>(null);
  const entryProofPreview = useMemo(() => entryProof && (entryProof.type.startsWith("image/") || entryProof.type === "application/pdf") ? URL.createObjectURL(entryProof) : null, [entryProof]);
  useEffect(() => () => { if (entryProofPreview) URL.revokeObjectURL(entryProofPreview); }, [entryProofPreview]);
  const [entryFormOpen,setEntryFormOpen]=useState(false);
  const [entryEditId,setEntryEditId]=useState<string|null>(null);
  const [associateMovementEditId,setAssociateMovementEditId]=useState<string|null>(null);
  const [salaryFormOpen,setSalaryFormOpen]=useState(false);
  const [payrollGenerateOpen,setPayrollGenerateOpen]=useState(false);
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
    try {
      const [t,e,a,am,p,s,r,independent,independentInvoiceRows]=await Promise.all([
        (supabase as any).from("finance_transactions").select("*").order("transaction_date",{ascending:false}),
        (supabase as any).from("finance_expenses").select("*,finance_expense_payments(id,status,transaction_id)").order("created_at",{ascending:false}),
        (supabase as any).from("finance_associates").select("*").order("full_name"),
        (supabase as any).from("finance_associate_transactions").select("id,associate_id,transaction_id,movement_type,contribution_status,contribution_description,estimated_value,project_reference,notes,created_at,finance_transactions(id,transaction_date,label,amount,gross_amount,fee_applied,payment_method,notes,direction,status,reference,proof_path,proof_name)").order("created_at",{ascending:false}),
        (async () => {
          const result = await (supabase as any).rpc("workspace_list_finance_users");
          if (result.error) throw result.error;
          return { data: result.data || [], error: null };
        })(),
        (supabase as any).from("finance_salary_profiles").select("*").order("created_at",{ascending:false}),
        (supabase as any).from("finance_payroll_runs").select("*").order("period_start",{ascending:false}).limit(24),
        (supabase as any).from("independent_service_proformas").select("id,reference,client_name,status,total_amount,created_at").is("archived_at",null).order("created_at",{ascending:false}),
        (supabase as any).from("independent_service_invoices").select("id,proforma_id,status,amount_due,amount_paid,issued_at").order("issued_at",{ascending:false}),
      ]);
      for (const result of [t,e,a,am,s,r,independent,independentInvoiceRows]) if(result.error) throw result.error;
      setTransactions(t.data||[]);
      setIndependentProformas(independent.data||[]);
      setIndependentInvoices(independentInvoiceRows.data||[]);
      setExpenses(e.data||[]);
      setAssociates(a.data||[]);
      setAssociateMovements(am.data||[]);
      setProfiles((p.data||[]).filter((profile:any)=>profile.id));
      setSalaryProfiles(s.data||[]);
      setPayrollRuns(r.data||[]);
    } catch(error:any) {
      console.error("[Finance] Chargement des données impossible", error);
      toast({
        title:"Chargement financier indisponible",
        description:error?.message || "Les données n’ont pas pu être chargées. Vérifiez vos droits ou réessayez.",
        variant:"destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(()=>{if(canView)void load();},[canView]);

  const independentForecast=useMemo(()=>independentProformas.filter((p:any)=>["emise","modification_demandee"].includes(String(p.status||"").toLowerCase())).reduce((sum:number,p:any)=>sum+Math.max(0,Number(p.total_amount||0)),0),[independentProformas]);
  const independentPipeline=useMemo(()=>independentProformas.filter((p:any)=>["acceptee","en_cours","terminee"].includes(String(p.status||"").toLowerCase())).reduce((sum:number,p:any)=>sum+Math.max(0,Number(p.total_amount||0)),0),[independentProformas]);
  const independentCollected=useMemo(()=>independentInvoices.reduce((sum:number,i:any)=>sum+Math.max(0,Number(i.amount_paid||0)),0),[independentInvoices]);
  const independentOutstanding=useMemo(()=>independentInvoices.filter((i:any)=>i.status!=="cancelled").reduce((sum:number,i:any)=>sum+Math.max(0,Number(i.amount_due||0)-Number(i.amount_paid||0)),0),[independentInvoices]);

  const totals=useMemo(()=>{
    const valid=transactions.filter((t:any)=>t.status==="valide");
    const income=valid.filter(t=>t.direction==="entree").reduce((s,t)=>s+Number(t.amount||0),0);
    const out=valid.filter(t=>t.direction==="sortie").reduce((s,t)=>s+Number(t.amount||0),0);
    return {income,out,balance:income-out};
  },[transactions]);

  const saveEntry=async()=>{
    if(entryEditId&&!isPdg){toast({title:"Action réservée au PDG",variant:"destructive"});return;}
    const enteredAmount=Number(entryForm.amount);
    const feeApplied=entryForm.method!=="especes"&&entryForm.withoutFees;
    const feeAmount=feeApplied?feeAmountFor(enteredAmount):0;
    const ledgerAmount=enteredAmount-feeAmount;
    if(!entryForm.source.trim()||!Number.isFinite(enteredAmount)||enteredAmount<=0||ledgerAmount<=0){toast({title:"Informations requises",description:"Renseignez la source et un montant positif.",variant:"destructive"});return;}
    setSaving(true);
    let uploadedProofPath:string|null=null;
    try{
      const labels:Record<string,string>={financement:"Financement",pret:"Prêt reçu",don:"Don reçu",vente:"Vente",autre:"Autre entrée"};
      if(entryProof){
        const uploaded=await uploadFile("documents",entryProof,"finance/entrees");
        if(!uploaded?.path)throw new Error("Le justificatif de l’entrée n’a pas pu être téléversé.");
        uploadedProofPath=uploaded.path;
      }
      const existing=entryEditId?transactions.find((t:any)=>t.id===entryEditId):null;
      const payload={
        direction:"entree",category:entryForm.type==="don"?"DON":entryForm.type==="pret"?"PRET":entryForm.type==="financement"?"FINANCEMENT":entryForm.type==="vente"?"VENTE":"AUTRE_ENTREE",
        label:labels[entryForm.type]+" — "+entryForm.source.trim(),amount:ledgerAmount,gross_amount:enteredAmount,
        fee_rate:feeApplied?1:0,fee_amount:feeAmount,fee_applied:feeApplied,
        transaction_date:new Date(entryForm.date+"T12:00:00").toISOString(),payment_method:entryForm.method||null,
        reference:entryForm.reference.trim()||null,contact_phone:entryForm.contactPhone.trim()||null,source_type:entryForm.type,
        notes:entryForm.notes.trim()||("Source : "+entryForm.source.trim()),status:"valide",
        proof_path:uploadedProofPath||existing?.proof_path||null,proof_name:entryProof?.name||existing?.proof_name||null
      };
      const result=entryEditId
        ? await (supabase as any).from("finance_transactions").update(payload).eq("id",entryEditId)
        : await (supabase as any).from("finance_transactions").insert(payload);
      if(result.error)throw result.error;
      toast({title:entryEditId?"Entrée modifiée":"Entrée enregistrée",description:feeApplied?"La déduction de 1 % est intégrée au montant comptabilisé.":undefined});
      setEntryForm({type:"financement",source:"",contactPhone:"",amount:"",date:new Date().toISOString().slice(0,10),method:"mobile_money",reference:"",notes:"",withoutFees:false});
      setEntryProof(null);setEntryEditId(null);setEntryFormOpen(false);
      await load();
    }catch(error:any){
      if(uploadedProofPath) await supabase.storage.from("documents").remove([uploadedProofPath]);
      toast({title:"Enregistrement impossible",description:error?.message||"Réessayez.",variant:"destructive"});
    }finally{setSaving(false);}
  };

  const saveExpense=async()=>{
    if(expenseFormMode==="edit"&&!isPdg){toast({title:"Action réservée au PDG",variant:"destructive"});return;}
    const enteredAmount=Number(expense.amount);
    const feeApplied=expense.method!=="especes"&&expense.withFees;
    const feeAmount=feeApplied?feeAmountFor(enteredAmount):0;
    const ledgerAmount=enteredAmount+feeAmount;
    if(!expense.category||!Number.isFinite(enteredAmount)||enteredAmount<=0){toast({title:"Informations requises",description:"Saisissez un montant positif.",variant:"destructive"});return;}
    setSaving(true);
    let proofPath:string|null=null;
    try {
      if(expenseProof){
        const uploaded=await uploadFile("documents",expenseProof,"finance/depenses");
        if(!uploaded?.path)throw new Error("Le justificatif n’a pas pu être téléversé.");
        proofPath=uploaded.path;
      }
      const existing=expenseFormMode==="edit"?selectedExpense:null;
      const existingTransaction=existing?.transaction||transactions.find((t:any)=>t.id===existing?.transaction_id);
      const txPayload={
        direction:"sortie",category:"DEPENSE",label:expense.category,amount:ledgerAmount,gross_amount:enteredAmount,
        fee_rate:feeApplied?1:0,fee_amount:feeAmount,fee_applied:feeApplied,
        transaction_date:new Date(expense.date+"T12:00:00").toISOString(),payment_method:expense.method,
        reference:expense.reference.trim()||null,status:"valide",client_id:expense.clientId||null,plantation_id:expense.plantationId||null,
        notes:expense.description||null,proof_path:proofPath||existingTransaction?.proof_path||null,
        proof_name:expenseProof?.name||existingTransaction?.proof_name||null
      };
      let transactionId:string;
      if(existing?.transaction_id){
        const {error}=await (supabase as any).from("finance_transactions").update(txPayload).eq("id",existing.transaction_id);
        if(error)throw error;
        transactionId=existing.transaction_id;
      }else{
        const {data,error}=await (supabase as any).from("finance_transactions").insert(txPayload).select("id").single();
        if(error)throw error;
        transactionId=data.id;
      }
      const expensePayload={
        transaction_id:transactionId,expense_category:expense.category,profile_id:expense.profileId||null,
        supplier_name:profiles.find((p:any)=>p.id===expense.profileId)?.nom_complet||null,
        description:expense.description||null,client_id:expense.clientId||null,plantation_id:expense.plantationId||null,
        is_direct_cost:expense.direct,expense_date:expense.date,total_amount:enteredAmount,paid_amount:enteredAmount,status:"paid",
        payment_method:expense.method,reference:expense.reference.trim()||null,
        proof_path:proofPath||existing?.proof_path||null,proof_name:expenseProof?.name||existing?.proof_name||null,
        proof_mime_type:expenseProof?.type||existing?.proof_mime_type||null
      };
      const expenseResult=existing
        ? await (supabase as any).from("finance_expenses").update(expensePayload).eq("id",existing.id)
        : await (supabase as any).from("finance_expenses").insert(expensePayload);
      if(expenseResult.error){
        if(!existing)await (supabase as any).from("finance_transactions").update({status:"annule"}).eq("id",transactionId);
        throw expenseResult.error;
      }
      toast({title:existing?"Sortie modifiée":"Sortie enregistrée",description:feeApplied?"La majoration de 1 % est intégrée à la sortie comptabilisée.":proofPath?"Justificatif joint à la sortie.":undefined});
      setExpense({category:"AUTRE",amount:"",date:new Date().toISOString().slice(0,10),description:"",profileId:"",clientId:"",plantationId:"",direct:false,method:"mobile_money",withFees:false,reference:""});
      setExpenseUserPickerOpen(false);setExpenseProof(null);setExpenseFormMode(null);setSelectedExpense(null);
      await load();
    }catch(error:any){
      if(proofPath)await supabase.storage.from("documents").remove([proofPath]);
      toast({title:"Erreur",description:error?.message||"Impossible d'enregistrer la sortie",variant:"destructive"});
    }finally{setSaving(false);}
  };

  const saveAssociateMovement=async()=>{
    if(associateMovementEditId&&!isPdg){toast({title:"Action réservée au PDG",variant:"destructive"});return;}
    const enteredAmount=Number(associateMovement.amount);
    const feeApplied=associateMovement.method!=="especes"&&associateMovement.withoutFees;
    const feeAmount=feeApplied?feeAmountFor(enteredAmount):0;
    const ledgerAmount=enteredAmount-feeAmount;
    if(!associateMovement.associateId||!Number.isFinite(enteredAmount)||enteredAmount<=0||ledgerAmount<=0){toast({title:"Informations requises",description:"Sélectionnez un associé et saisissez un montant positif.",variant:"destructive"});return;}
    setSaving(true);
    try{
      const isRefund=associateMovement.type==="remboursement";
      const existing=associateMovementEditId?associateMovements.find((m:any)=>m.id===associateMovementEditId):null;
      const txPayload={
        direction:isRefund?"sortie":"entree",category:isRefund?"REMBOURSEMENT_ASSOCIE":"APPORT_ASSOCIE",
        label:(isRefund?"Remboursement associé — ":"Apport associé — ")+(associates.find(a=>a.id===associateMovement.associateId)?.full_name||""),
        amount:ledgerAmount,gross_amount:enteredAmount,fee_rate:feeApplied?1:0,fee_amount:feeAmount,fee_applied:feeApplied,
        transaction_date:new Date(associateMovement.date+"T12:00:00").toISOString(),payment_method:associateMovement.method,
        status:"valide",source_type:"associate",reference:associateMovement.reference.trim()||null,notes:associateMovement.notes.trim()||null
      };
      let txId:string;
      if(existing?.transaction_id){
        const {error}=await (supabase as any).from("finance_transactions").update(txPayload).eq("id",existing.transaction_id);
        if(error)throw error;
        txId=existing.transaction_id;
        const {error:movementError}=await (supabase as any).from("finance_associate_transactions").update({
          associate_id:associateMovement.associateId,movement_type:associateMovement.type,
          contribution_status:"numeraire",estimated_value:ledgerAmount,notes:associateMovement.notes.trim()||null
        }).eq("id",existing.id);
        if(movementError)throw movementError;
      }else{
        const {data:tx,error:txError}=await (supabase as any).from("finance_transactions").insert(txPayload).select("id").single();
        if(txError)throw txError;txId=tx.id;
        const {error}=await (supabase as any).from("finance_associate_transactions").insert({
          associate_id:associateMovement.associateId,movement_type:associateMovement.type,
          contribution_status:"numeraire",estimated_value:ledgerAmount,notes:associateMovement.notes.trim()||null,transaction_id:txId
        });
        if(error){await (supabase as any).from("finance_transactions").update({status:"annule"}).eq("id",txId);throw error;}
      }
      toast({title:existing?"Mouvement associé modifié":"Mouvement associé enregistré",description:feeApplied?"La déduction de 1 % est prise en compte.":undefined});
      setAssociateMovement({associateId:"",type:"apport",amount:"",date:new Date().toISOString().slice(0,10),reference:"",notes:"",method:"mobile_money",withoutFees:false});
      setAssociateMovementEditId(null);setAssociateMovementOpen(false);await load();
    }catch(error:any){toast({title:"Enregistrement impossible",description:error?.message||"Réessayez.",variant:"destructive"});}
    finally{setSaving(false);}
  };

  const savePlannedExpense=async()=>{
    if(plannedExpenseEditId&&!isPdg){toast({title:"Action réservée au PDG",variant:"destructive"});return;}
    const amount=Number(plannedExpense.amount);
    if(plannedExpense.referenceAsFile&&!plannedProof&&!plannedExpenseTarget?.proof_path){toast({title:"Fichier requis",description:"Sélectionnez un fichier ou désactivez l’option fichier pour saisir une référence.",variant:"destructive"});return;}
    if(plannedExpenseEditId&&amount<Number(plannedExpenseTarget?.paid_amount||0)){toast({title:"Montant inférieur au déjà payé",description:"Le montant prévu ne peut pas être inférieur au cumul des paiements déjà enregistrés.",variant:"destructive"});return;}
    if(!plannedExpense.category||!Number.isFinite(amount)||amount<=0||!plannedExpense.expenseDate||(plannedExpense.isInternalUser&&!plannedExpense.profileId)){
      toast({title:"Informations requises",description:plannedExpense.isInternalUser&&!plannedExpense.profileId?"Sélectionnez un utilisateur interne dans la liste.":"Indiquez une catégorie, une date et un montant positif.",variant:"destructive"});return;
    }
    setSaving(true);
    let proofPath:string|null=null;
    try{
      if(plannedExpense.referenceAsFile&&plannedProof){
        const uploaded=await uploadFile("documents",plannedProof,"finance/depenses-a-payer");
        if(!uploaded?.path)throw new Error("Le justificatif n’a pas pu être téléversé.");
        proofPath=uploaded.path;
      }
      const payload={
        transaction_id:plannedExpenseEditId?(plannedExpenseTarget?.transaction_id||null):null,expense_category:plannedExpense.category,description:plannedExpense.description.trim()||null,
        profile_id:plannedExpense.isInternalUser?plannedExpense.profileId||null:null,
        supplier_name:(plannedExpense.isInternalUser?profiles.find((p:any)=>p.id===plannedExpense.profileId)?.nom_complet:plannedExpense.beneficiary.trim())||null,
        beneficiary_name:(plannedExpense.isInternalUser?profiles.find((p:any)=>p.id===plannedExpense.profileId)?.nom_complet:plannedExpense.beneficiary.trim())||null,
        beneficiary_phone:plannedExpense.isInternalUser?null:plannedExpense.beneficiaryPhone.trim()||null,
        is_direct_cost:plannedExpense.direct,expense_date:plannedExpense.expenseDate,due_date:plannedExpense.dueDate||null,
        total_amount:amount,paid_amount:plannedExpenseEditId?Number(plannedExpenseTarget?.paid_amount||0):0,
        status:plannedExpenseEditId?(Number(plannedExpenseTarget?.paid_amount||0)>=amount?"paid":(plannedExpenseTarget?.status||"unpaid")):"unpaid",payment_method:null,notes:null,
        reference:plannedExpense.referenceAsFile?null:plannedExpense.reference.trim()||null,
        proof_path:plannedExpense.referenceAsFile?(proofPath||plannedExpenseTarget?.proof_path||null):null,
        proof_name:plannedExpense.referenceAsFile?(plannedProof?.name||plannedExpenseTarget?.proof_name||null):null,
        proof_mime_type:plannedExpense.referenceAsFile?(plannedProof?.type||plannedExpenseTarget?.proof_mime_type||null):null
      };
      const result=plannedExpenseEditId
        ? await (supabase as any).from("finance_expenses").update(payload).eq("id",plannedExpenseEditId)
        : await (supabase as any).from("finance_expenses").insert(payload);
      if(result.error)throw result.error;
      toast({title:plannedExpenseEditId?"Dépense à payer modifiée":"Dépense à payer enregistrée",description:"Le solde dû est conservé; chaque paiement sera inscrit dans les sorties."});
      setPlannedExpense({category:"PRESTATIONS",amount:"",description:"",beneficiary:"",beneficiaryPhone:"",profileId:"",isInternalUser:false,expenseDate:new Date().toISOString().slice(0,10),dueDate:"",direct:false,reference:"",referenceAsFile:false});
      setPlannedProof(null);setPlannedExpenseEditId(null);setPlannedExpenseTarget(null);setPlannedExpenseOpen(false);await load();
    }catch(error:any){if(proofPath)await supabase.storage.from("documents").remove([proofPath]);toast({title:"Enregistrement impossible",description:error?.message||"Réessayez.",variant:"destructive"});}
    finally{setSaving(false);}
  };

  const registerExpensePayment=async()=>{
    if(!paymentTarget)return;
    const remaining=Number(paymentTarget.total_amount||0)-Number(paymentTarget.paid_amount||0);
    const amount=paymentPartial?Number(paymentAmount):remaining;
    const feeApplied=paymentMethod!=="especes"&&paymentWithFees;
    const feeAmount=feeApplied?feeAmountFor(amount):0;
    const ledgerAmount=amount+feeAmount;
    if(!Number.isFinite(amount)||amount<=0||amount>remaining){toast({title:"Montant invalide",description:"Le paiement doit être positif et ne peut pas dépasser le solde restant.",variant:"destructive"});return;}
    setSaving(true);let proofPath:string|null=null;let transactionId:string|null=null;
    try{
      if(paymentProof){const uploaded=await uploadFile("documents",paymentProof,"finance/depenses-payees");if(!uploaded?.path)throw new Error("Le justificatif du paiement n’a pas pu être téléversé.");proofPath=uploaded.path;}
      const nextPaid=Number(paymentTarget.paid_amount||0)+amount;
      const status=nextPaid>=Number(paymentTarget.total_amount)?"paid":"partial";
      const {data:tx,error:txError}=await (supabase as any).from("finance_transactions").insert({
        direction:"sortie",category:paymentTarget.expense_category,label:paymentTarget.expense_category+(paymentTarget.description?" — "+paymentTarget.description:""),
        amount:ledgerAmount,gross_amount:amount,fee_rate:feeApplied?1:0,fee_amount:feeAmount,fee_applied:feeApplied,
        transaction_date:new Date(paymentDate+"T12:00:00").toISOString(),payment_method:paymentMethod,
        reference:paymentReference.trim()||null,source_type:"finance_expense",source_id:paymentTarget.id,status:"valide",
        notes:paymentTarget.description||("Bénéficiaire : "+(paymentTarget.beneficiary_name||paymentTarget.supplier_name||"—")),
        proof_path:proofPath,proof_name:paymentProof?.name||null
      }).select("id").single();
      if(txError)throw txError;transactionId=tx.id;
      const {error:payError}=await (supabase as any).from("finance_expense_payments").insert({
        expense_id:paymentTarget.id,transaction_id:transactionId,amount,gross_amount:amount,status:"valide",
        fee_rate:feeApplied?1:0,fee_amount:feeAmount,fee_applied:feeApplied,
        paid_at:new Date(paymentDate+"T12:00:00").toISOString(),payment_method:paymentMethod,
        proof_path:proofPath,proof_name:paymentProof?.name||null
      });
      if(payError){await (supabase as any).from("finance_transactions").update({status:"annule"}).eq("id",transactionId);throw payError;}
      const {error:updateError}=await (supabase as any).from("finance_expenses").update({paid_amount:nextPaid,status,transaction_id:transactionId,payment_method:paymentMethod}).eq("id",paymentTarget.id);
      if(updateError){const {error:rollbackError}=await (supabase as any).from("finance_expense_payments").update({status:"annule"}).eq("transaction_id",transactionId);const {data:validPayments}=await (supabase as any).from("finance_expense_payments").select("amount,transaction_id,paid_at").eq("expense_id",paymentTarget.id).eq("status","valide").order("paid_at",{ascending:false});const restoredPaid=(validPayments||[]).reduce((sum:number,p:any)=>sum+Number(p.amount||0),0);const restoredStatus=restoredPaid>=Number(paymentTarget.total_amount)?"paid":restoredPaid>0?"partial":"unpaid";await (supabase as any).from("finance_expenses").update({paid_amount:restoredPaid,status:restoredStatus,transaction_id:validPayments?.[0]?.transaction_id||null}).eq("id",paymentTarget.id);await (supabase as any).from("finance_transactions").update({status:"annule"}).eq("id",transactionId);if(rollbackError)throw new Error(updateError.message+" — annulation du paiement impossible : "+rollbackError.message);throw updateError;}
      toast({title:"Paiement enregistré",description:status==="paid"?"Dépense entièrement payée et inscrite dans les sorties.":"Paiement partiel enregistré dans les sorties; le solde reste à payer."});
      setPaymentTarget(null);setPaymentAmount("");setPaymentReference("");setPaymentProof(null);setPaymentPartial(false);setPaymentWithFees(false);await load();
    }catch(error:any){if(proofPath)await supabase.storage.from("documents").remove([proofPath]);toast({title:"Paiement non confirmé",description:error?.message||"Vérifiez l’écriture avant de réessayer.",variant:"destructive"});}
    finally{setSaving(false);}
  };

  const deleteEntry=async(item:any)=>{if(!isPdg||!window.confirm("Supprimer définitivement cette entrée financière ?"))return;setSaving(true);const {error}=await (supabase as any).from("finance_transactions").delete().eq("id",item.id);if(error)toast({title:"Suppression impossible",description:error.message,variant:"destructive"});else toast({title:"Entrée supprimée"});await load();setSaving(false);};
  const deleteAssociateMovement=async(item:any)=>{if(!isPdg||!window.confirm("Supprimer définitivement ce mouvement associé ?"))return;setSaving(true);try{const {error:movementError}=await (supabase as any).from("finance_associate_transactions").delete().eq("id",item.id);if(movementError)throw movementError;if(item.transaction_id){const {error:txError}=await (supabase as any).from("finance_transactions").delete().eq("id",item.transaction_id);if(txError)throw txError;}toast({title:"Mouvement associé supprimé"});await load();}catch(error:any){toast({title:"Suppression incomplète",description:error?.message||"Vérifiez le mouvement.",variant:"destructive"});await load();}finally{setSaving(false);}};
  const deleteExpense=async(item:any)=>{if(!isPdg||!window.confirm("Supprimer définitivement cette sortie et ses écritures de paiement ?"))return;setSaving(true);try{const {data:payments,error:paymentsError}=await (supabase as any).from("finance_expense_payments").select("transaction_id").eq("expense_id",item.id);if(paymentsError)throw paymentsError;const relatedIds=Array.from(new Set([item.transaction_id,...(payments||[]).map((p:any)=>p.transaction_id)].filter(Boolean)));const {error:expenseError}=await (supabase as any).from("finance_expenses").delete().eq("id",item.id);if(expenseError)throw expenseError;for(const id of relatedIds){const {error:txError}=await (supabase as any).from("finance_transactions").delete().eq("id",id);if(txError)throw txError;}toast({title:"Sortie supprimée"});await load();}catch(error:any){toast({title:"Suppression incomplète",description:error?.message||"Vérifiez les écritures comptables.",variant:"destructive"});await load();}finally{setSaving(false);}};

  const deletePlannedExpense=async(item:any)=>{
    if(!isPdg||item.status!=="unpaid"||Number(item.paid_amount||0)>0)return;
    if(!window.confirm("Supprimer cette dépense à payer ?"))return;
    setSaving(true);const {error}=await (supabase as any).from("finance_expenses").delete().eq("id",item.id).is("transaction_id",null);
    if(error)toast({title:"Suppression impossible",description:error.message,variant:"destructive"});else toast({title:"Dépense supprimée"});
    await load();setSaving(false);
  };

  const manualEntryTypes=["financement","pret","don","vente","autre"];
  const hasFinanceAction=(tx:any)=>manualEntryTypes.includes(tx.source_type) || associateMovements.some((m:any)=>m.transaction_id===tx.id) || expenses.some((e:any)=>e.transaction_id===tx.id||e.finance_expense_payments?.some((p:any)=>p.transaction_id===tx.id));
  const editFinanceTransaction=(tx:any)=>{
    const movement=associateMovements.find((m:any)=>m.transaction_id===tx.id);
    if(movement){setAssociateMovementEditId(movement.id);setAssociateMovement({associateId:movement.associate_id,type:movement.movement_type||"apport",amount:String(tx.gross_amount||tx.amount||movement.estimated_value||""),date:new Date(tx.transaction_date).toISOString().slice(0,10),reference:tx.reference||"",notes:tx.notes||movement.notes||"",method:tx.payment_method||"mobile_money",withoutFees:!!tx.fee_applied});setAssociateMovementOpen(true);return;}
    const expenseRow=expenses.find((e:any)=>e.transaction_id===tx.id||e.finance_expense_payments?.some((p:any)=>p.transaction_id===tx.id));
    if(expenseRow){
      if(expenseRow.finance_expense_payments?.some((p:any)=>p.status==="valide")){setPlannedExpenseTarget(expenseRow);setPlannedExpenseEditId(expenseRow.id);setPlannedExpense({category:expenseRow.expense_category||"PRESTATIONS",amount:String(expenseRow.total_amount||""),description:expenseRow.description||"",beneficiary:expenseRow.beneficiary_name||expenseRow.supplier_name||"",beneficiaryPhone:expenseRow.beneficiary_phone||"",profileId:expenseRow.profile_id||"",isInternalUser:!!expenseRow.profile_id,expenseDate:expenseRow.expense_date||new Date().toISOString().slice(0,10),dueDate:expenseRow.due_date||"",direct:!!expenseRow.is_direct_cost,reference:expenseRow.reference||"",referenceAsFile:!!expenseRow.proof_path});setPlannedProof(null);setPlannedExpenseOpen(true);}
      else{setSelectedExpense({...expenseRow,transaction:tx});setExpense({category:expenseRow.expense_category||"AUTRE",amount:String(tx.gross_amount||tx.amount||""),date:expenseRow.expense_date||new Date().toISOString().slice(0,10),description:expenseRow.description||"",profileId:expenseRow.profile_id||"",clientId:expenseRow.client_id||"",plantationId:expenseRow.plantation_id||"",direct:!!expenseRow.is_direct_cost,method:tx.payment_method||"mobile_money",withFees:!!tx.fee_applied,reference:tx.reference||""});setExpenseFormMode("edit");}
      return;
    }
    if(tx.direction==="entree"&&manualEntryTypes.includes(tx.source_type)){setEntryEditId(tx.id);setEntryForm({type:tx.source_type||"autre",source:String(tx.label||"").split(" — ").slice(1).join(" — "),contactPhone:tx.contact_phone||"",amount:String(tx.gross_amount||tx.amount||""),date:new Date(tx.transaction_date).toISOString().slice(0,10),method:tx.payment_method||"mobile_money",reference:tx.reference||"",notes:tx.notes||"",withoutFees:!!tx.fee_applied});setEntryFormOpen(true);}
  };
  const deleteFinanceTransaction=(tx:any)=>{const movement=associateMovements.find((m:any)=>m.transaction_id===tx.id);if(movement){void deleteAssociateMovement(movement);return;}const expenseRow=expenses.find((e:any)=>e.transaction_id===tx.id||e.finance_expense_payments?.some((p:any)=>p.transaction_id===tx.id));if(expenseRow){void deleteExpense(expenseRow);return;}if(tx.direction==="entree"&&manualEntryTypes.includes(tx.source_type))void deleteEntry(tx);};

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
    const csv = "\uFEFF" + rows.map((row:any[])=>row.map((cell:any)=>{
      const raw = String(cell ?? "");
      const value = typeof cell === "string" && /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
      return '"' + value.replace(/"/g, '""') + '"';
    }).join(";")).join("\r\n");
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
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      <Card className="min-w-0 overflow-hidden"><CardContent className="min-w-0 p-2 sm:p-3"><p className="whitespace-nowrap text-[clamp(0.48rem,2.2vw,0.7rem)] leading-tight text-muted-foreground">ENTRÉES VALIDÉES</p><p className="mt-1 whitespace-nowrap text-[clamp(0.56rem,2.7vw,1.125rem)] font-bold leading-tight tracking-tight tabular-nums">{money(totals.income)}</p></CardContent></Card>
      <Card className="min-w-0 overflow-hidden"><CardContent className="min-w-0 p-2 sm:p-3"><p className="whitespace-nowrap text-[clamp(0.48rem,2.2vw,0.7rem)] leading-tight text-muted-foreground">SORTIES VALIDÉES</p><p className="mt-1 whitespace-nowrap text-[clamp(0.56rem,2.7vw,1.125rem)] font-bold leading-tight tracking-tight tabular-nums">{money(totals.out)}</p></CardContent></Card>
      <Card className="min-w-0 overflow-hidden"><CardContent className="min-w-0 p-2 sm:p-3"><p className="whitespace-nowrap text-[clamp(0.48rem,2.2vw,0.7rem)] leading-tight text-muted-foreground">SOLDE FINANCIER</p><p className="mt-1 whitespace-nowrap text-[clamp(0.56rem,2.7vw,1.125rem)] font-bold leading-tight tracking-tight tabular-nums">{money(totals.balance)}</p></CardContent></Card>
      <Card className="min-w-0 overflow-hidden"><CardContent className="min-w-0 p-2 sm:p-3"><p className="whitespace-nowrap text-[clamp(0.48rem,2.2vw,0.7rem)] leading-tight text-muted-foreground">DEVIS ÉMIS · PRÉVISIONNEL</p><p className="mt-1 whitespace-nowrap text-[clamp(0.56rem,2.7vw,1.125rem)] font-bold leading-tight tracking-tight tabular-nums">{money(independentForecast)}</p></CardContent></Card>
      <Card className="min-w-0 overflow-hidden"><CardContent className="min-w-0 p-2 sm:p-3"><p className="whitespace-nowrap text-[clamp(0.48rem,2.2vw,0.7rem)] leading-tight text-muted-foreground">PRESTATIONS ACCEPTÉES</p><p className="mt-1 whitespace-nowrap text-[clamp(0.56rem,2.7vw,1.125rem)] font-bold leading-tight tracking-tight tabular-nums">{money(independentPipeline)}</p></CardContent></Card>
      <Card className="min-w-0 overflow-hidden"><CardContent className="min-w-0 p-2 sm:p-3"><p className="whitespace-nowrap text-[clamp(0.48rem,2.2vw,0.7rem)] leading-tight text-muted-foreground">ENCAISSÉ · PRESTATIONS</p><p className="mt-1 whitespace-nowrap text-[clamp(0.56rem,2.7vw,1.125rem)] font-bold leading-tight tracking-tight tabular-nums">{money(independentCollected)}</p></CardContent></Card>
      <Card className="min-w-0 overflow-hidden"><CardContent className="min-w-0 p-2 sm:p-3"><p className="whitespace-nowrap text-[clamp(0.48rem,2.2vw,0.7rem)] leading-tight text-muted-foreground">RESTE À ENCAISSER</p><p className="mt-1 whitespace-nowrap text-[clamp(0.56rem,2.7vw,1.125rem)] font-bold leading-tight tracking-tight tabular-nums">{money(independentOutstanding)}</p></CardContent></Card>
    </div>
    <Tabs key={initialTab} defaultValue={initialTab}>
      <TabsList className="grid h-auto w-full min-w-0 grid-cols-2 gap-1.5 rounded-xl bg-muted/70 p-1.5 sm:grid-cols-4 xl:grid-cols-8">
        <TabsTrigger value="journal" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><Wallet className="mb-1 h-4 w-4 shrink-0" />Journal financier</TabsTrigger>
        <TabsTrigger value="entrees" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><ArrowDownLeft className="mb-1 h-4 w-4 shrink-0" />Entrées</TabsTrigger>
        <TabsTrigger value="a-payer" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><Banknote className="mb-1 h-4 w-4 shrink-0" />Dépenses à payer</TabsTrigger>
        <TabsTrigger value="depenses" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><ArrowUpRight className="mb-1 h-4 w-4 shrink-0" />Sorties</TabsTrigger>
        <TabsTrigger value="salaires" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><Banknote className="mb-1 h-4 w-4 shrink-0" />Salaires & paie</TabsTrigger>
        
        <TabsTrigger value="associes" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><Users className="mb-1 h-4 w-4 shrink-0" />Associés</TabsTrigger>
        <TabsTrigger value="rapports" className="min-w-0 flex-col whitespace-normal rounded-lg border border-transparent px-2 py-3 text-center text-xs font-semibold leading-tight data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"><RefreshCw className="mb-1 h-4 w-4 shrink-0" />Rapports & Analytique</TabsTrigger>
      </TabsList>
      <TabsContent value="entrees" className="mt-3 min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Entrées financières</h2>{canManage&&<Button onClick={()=>setEntryFormOpen(true)}><Plus className="mr-2 h-4 w-4"/>Nouvelle entrée</Button>}</div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {[
            {label:"Entrées validées",value:transactions.filter((t:any)=>t.status==="valide"&&t.direction==="entree").reduce((a,t)=>a+Number(t.amount||0),0)},
            {label:"Financements",value:transactions.filter((t:any)=>t.status==="valide"&&t.direction==="entree"&&t.source_type==="financement").reduce((a,t)=>a+Number(t.amount||0),0)},
            {label:"Dons",value:transactions.filter((t:any)=>t.status==="valide"&&t.direction==="entree"&&t.source_type==="don").reduce((a,t)=>a+Number(t.amount||0),0)},
            {label:"Prêts reçus",value:transactions.filter((t:any)=>t.status==="valide"&&t.direction==="entree"&&t.source_type==="pret").reduce((a,t)=>a+Number(t.amount||0),0)},
            {label:"Apports associés",value:transactions.filter((t:any)=>t.status==="valide"&&t.direction==="entree"&&(t.source_type==="apport_associe"||t.category==="ASSOCIE")).reduce((a,t)=>a+Number(t.amount||0),0)}
          ].map(item=><Card key={item.label}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="whitespace-nowrap text-base font-bold tabular-nums">{money(item.value)}</p></CardContent></Card>)}
        </div>
        <Dialog open={entryFormOpen} onOpenChange={open=>{if(!open&&!saving){setEntryFormOpen(false);setEntryEditId(null);setEntryProof(null);}}}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{entryEditId?"Modifier l’entrée financière":"Nouvelle entrée financière"}</DialogTitle></DialogHeader><div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1"><Label>Type d’entrée</Label><Select value={entryForm.type} onValueChange={v=>setEntryForm({...entryForm,type:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="financement">Financement</SelectItem><SelectItem value="pret">Prêt reçu</SelectItem><SelectItem value="don">Don</SelectItem><SelectItem value="vente">Vente / prestation</SelectItem><SelectItem value="autre">Autre entrée</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Source / raison sociale / nom</Label><Input value={entryForm.source} onChange={e=>setEntryForm({...entryForm,source:e.target.value})} placeholder="Nom du financeur ou organisme"/></div><div className="space-y-1"><Label>Téléphone du contact</Label><Input type="tel" value={entryForm.contactPhone} onChange={e=>setEntryForm({...entryForm,contactPhone:e.target.value})} placeholder="+225 07 00 00 00 00"/></div>
          <div className="space-y-1"><Label>Montant (FCFA)</Label><Input type="number" min="1" value={entryForm.amount} onChange={e=>setEntryForm({...entryForm,amount:e.target.value})} placeholder="Montant reçu"/></div>
          <div className="space-y-1"><Label>Date de réception</Label><Input type="date" value={entryForm.date} onChange={e=>setEntryForm({...entryForm,date:e.target.value})}/></div>
          <div className="space-y-1"><Label>Moyen de paiement</Label><Select value={entryForm.method} onValueChange={v=>setEntryForm({...entryForm,method:v,withoutFees:v==="especes"?false:entryForm.withoutFees})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="especes">Espèces</SelectItem><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="virement">Bancaire</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Référence</Label><Input value={entryForm.reference} onChange={e=>setEntryForm({...entryForm,reference:e.target.value})} placeholder="N° de pièce ou transaction"/></div>
          {entryForm.method!=="especes"&&<div className="flex items-center gap-2 rounded-md border p-3"><input id="entry-without-fees" type="checkbox" checked={entryForm.withoutFees} onChange={e=>setEntryForm({...entryForm,withoutFees:e.target.checked})} className="h-4 w-4"/><Label htmlFor="entry-without-fees" className="cursor-pointer">Sans les frais (déduction de 1 %)</Label></div>}
          <div className="rounded-md bg-muted p-3 text-sm sm:col-span-2 lg:col-span-3"><div className="flex justify-between"><span>Montant saisi</span><b>{money(Number(entryForm.amount)||0)}</b></div><div className="flex justify-between"><span>Déduction 1 %</span><b>{money(entryForm.method!=="especes"&&entryForm.withoutFees?feeAmountFor(Number(entryForm.amount)||0):0)}</b></div><div className="mt-1 flex justify-between border-t pt-2"><span>Montant comptabilisé</span><b>{money(Math.max(0,(Number(entryForm.amount)||0)-(entryForm.method!=="especes"&&entryForm.withoutFees?feeAmountFor(Number(entryForm.amount)||0):0)))}</b></div></div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label htmlFor="entry-proof" className="flex items-center gap-2"><Paperclip className="h-4 w-4"/>Justificatif / reçu / facture</Label><Input id="entry-proof" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={e=>setEntryProof(e.target.files?.[0]||null)} className="text-sm"/>{entryProof&&<p className="text-xs text-muted-foreground">{entryProof.name}</p>}</div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label>Notes / affectation</Label><Textarea rows={2} value={entryForm.notes} onChange={e=>setEntryForm({...entryForm,notes:e.target.value})} placeholder="Objet, conditions du prêt, projet financé…"/></div>
          <div className="sm:col-span-2 lg:col-span-3"><Button className="w-full sm:w-auto" onClick={()=>void saveEntry()} disabled={saving}><Plus className="mr-2 h-4 w-4"/>{entryEditId?"Enregistrer les modifications":"Enregistrer l’entrée"}</Button></div>
        </div></DialogContent></Dialog>
        <Card><CardHeader className="pb-2"><CardTitle>Historique des entrées</CardTitle></CardHeader><CardContent><div className="w-full overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="px-2 py-1.5">Date</th><th className="px-2 py-1.5">Nature / source</th><th className="px-2 py-1.5">Mode</th><th className="px-2 py-1.5">Justificatif</th><th className="px-2 py-1.5 text-right">Montant net</th>{isPdg&&<th className="px-2 py-1.5 text-right">Actions</th>}</tr></thead><tbody>{transactions.filter(t=>t.direction==="entree"&&manualEntryTypes.includes(t.source_type)).map(t=><tr key={t.id} className="border-b last:border-0"><td className="whitespace-nowrap px-2 py-1.5">{new Date(t.transaction_date).toLocaleDateString("fr-FR")}</td><td className="px-2 py-1.5">{t.label}</td><td className="px-2 py-1.5">{t.payment_method||"—"}</td><td className="px-2 py-1.5">{t.proof_path?<Button variant="ghost" size="sm" onClick={async()=>{const {data,error}=await supabase.storage.from("documents").createSignedUrl(t.proof_path,3600);if(error||!data?.signedUrl){toast({title:"Justificatif indisponible",variant:"destructive"});return;}window.open(data.signedUrl,"_blank","noopener,noreferrer");}}><Paperclip className="mr-1 h-3.5 w-3.5"/>{t.proof_name||"Ouvrir"}</Button>:"—"}</td><td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums">{money(Number(t.amount||0))}</td>{isPdg&&<td className="px-2 py-1.5 text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>{setEntryEditId(t.id);setEntryForm({type:t.source_type||"autre",source:String(t.label||"").split(" — ").slice(1).join(" — "),contactPhone:t.contact_phone||"",amount:String(t.gross_amount||t.amount||""),date:new Date(t.transaction_date).toISOString().slice(0,10),method:t.payment_method||"mobile_money",reference:t.reference||"",notes:t.notes||"",withoutFees:!!t.fee_applied});setEntryFormOpen(true);}}><Pencil className="mr-2 h-4 w-4"/>Modifier</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive" onClick={()=>void deleteEntry(t)}><Trash2 className="mr-2 h-4 w-4"/>Supprimer</DropdownMenuItem></DropdownMenuContent></DropdownMenu></td>}</tr>)}{!transactions.some(t=>t.direction==="entree"&&manualEntryTypes.includes(t.source_type))&&<tr><td colSpan={isPdg?6:5} className="p-4 text-center text-muted-foreground">Aucune entrée enregistrée</td></tr>}</tbody></table></div></CardContent></Card>
      </TabsContent>
      <TabsContent value="journal" className="mt-4 min-w-0 space-y-4">
        
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
                  <tr className="border-b"><th className="px-2 py-1.5 text-left">DATE</th><th className="px-2 py-1.5 text-left">TYPE</th><th className="px-2 py-1.5 text-left">LIBELLÉ</th><th className="px-2 py-1.5 text-right">MONTANT</th><th className="px-2 py-1.5 text-left">SOURCE</th>{isPdg&&<th className="px-2 py-1.5 text-right">ACTIONS</th>}</tr>
                </thead>
                <tbody>
                  {transactions.filter((t:any)=>JSON.stringify(t).toLowerCase().includes(tableSearch.trim().toLowerCase())).map((t:any)=>(
                    <tr key={t.id} className="border-b">
                      <td className="px-2 py-1.5">{new Date(t.transaction_date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-2 py-1.5">
                        <Badge variant="outline" className="gap-1">
                          {t.direction==="entree" ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                          {t.direction.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5">{t.label}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{money(t.amount)}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{t.source_type||"MANUEL"}</td>
                      {isPdg&&<td className="px-2 py-1.5 text-right">{hasFinanceAction(t)?<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>editFinanceTransaction(t)}><Pencil className="mr-2 h-4 w-4"/>Modifier</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive" onClick={()=>deleteFinanceTransaction(t)}><Trash2 className="mr-2 h-4 w-4"/>Supprimer</DropdownMenuItem></DropdownMenuContent></DropdownMenu>:"—"}</td>}
                    </tr>
                  ))}
                  {!transactions.filter((t:any)=>JSON.stringify(t).toLowerCase().includes(tableSearch.trim().toLowerCase())).length&&!loading&&(
                    <tr><td colSpan={isPdg?6:5} className="p-8 text-center text-muted-foreground">Aucune écriture.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="a-payer" className="mt-3 min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Dépenses à payer</h2><p className="text-sm text-muted-foreground">Une dépense prévue ne devient une sortie qu’après l’enregistrement d’un paiement.</p></div>{canManage&&<Button onClick={()=>{setPlannedExpenseEditId(null);setPlannedExpenseTarget(null);setPlannedExpense({category:"PRESTATIONS",amount:"",description:"",beneficiary:"",beneficiaryPhone:"",profileId:"",isInternalUser:false,expenseDate:new Date().toISOString().slice(0,10),dueDate:"",direct:false,reference:"",referenceAsFile:false});setPlannedProof(null);setPlannedExpenseOpen(true);}}><Plus className="mr-2 h-4 w-4"/>Nouvelle dépense à payer</Button>}</div>
        <Dialog open={plannedExpenseOpen} onOpenChange={open=>{if(!open&&!saving){setPlannedExpenseOpen(false);setPlannedExpenseEditId(null);setPlannedExpenseTarget(null);setPlannedProof(null);}}}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{plannedExpenseEditId?"Modifier la dépense à payer":"Nouvelle dépense à payer"}</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1"><Label>Motif / catégorie</Label><Select value={plannedExpense.category} onValueChange={v=>setPlannedExpense({...plannedExpense,category:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{FINANCE_EXPENSE_CATEGORIES.map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Montant prévu (FCFA)</Label><Input type="number" min="1" value={plannedExpense.amount} onChange={e=>setPlannedExpense({...plannedExpense,amount:e.target.value})}/></div><div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><Label>Bénéficiaire / fournisseur</Label><label className="flex cursor-pointer items-center gap-2 text-sm font-normal"><input type="checkbox" checked={plannedExpense.isInternalUser} onChange={e=>setPlannedExpense({...plannedExpense,isInternalUser:e.target.checked,profileId:"",beneficiary:"",beneficiaryPhone:""})} className="h-4 w-4 rounded border-input"/>Utilisateur interne</label></div>{plannedExpense.isInternalUser?<Popover open={plannedInternalUserPickerOpen} onOpenChange={setPlannedInternalUserPickerOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={plannedInternalUserPickerOpen} className="w-full justify-between font-normal"><span className="truncate">{profiles.find((p:any)=>p.id===plannedExpense.profileId)?.nom_complet||"Rechercher un utilisateur interne…"}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/></Button></PopoverTrigger><PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start"><Command><CommandInput placeholder="Rechercher par nom, poste ou e-mail…"/><CommandList><CommandEmpty>Aucun utilisateur interne trouvé.</CommandEmpty><CommandGroup>{profiles.map((p:any)=><CommandItem key={p.id} value={[p.nom_complet,p.poste,p.email].filter(Boolean).join(" ")} onSelect={()=>{setPlannedExpense({...plannedExpense,profileId:p.id,beneficiary:p.nom_complet||""});setPlannedInternalUserPickerOpen(false);}}><Check className={"mr-2 h-4 w-4 "+(plannedExpense.profileId===p.id?"opacity-100":"opacity-0")}/><span className="min-w-0"><span className="block truncate">{p.nom_complet}</span><span className="block truncate text-xs text-muted-foreground">{[p.poste,p.email].filter(Boolean).join(" · ")||"Collaborateur"}</span></span></CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>:<Input value={plannedExpense.beneficiary} onChange={e=>setPlannedExpense({...plannedExpense,beneficiary:e.target.value})} placeholder="Nom du bénéficiaire ou fournisseur"/>}</div>{!plannedExpense.isInternalUser&&<div className="space-y-1"><Label>Téléphone du bénéficiaire / fournisseur</Label><Input type="tel" value={plannedExpense.beneficiaryPhone} onChange={e=>setPlannedExpense({...plannedExpense,beneficiaryPhone:e.target.value})} placeholder="+225 07 00 00 00 00"/></div>}
          <div className="space-y-1"><Label>Date de la dépense</Label><Input type="date" value={plannedExpense.expenseDate} onChange={e=>setPlannedExpense({...plannedExpense,expenseDate:e.target.value})}/></div><div className="space-y-1"><Label>Date prévue de paiement</Label><Input type="date" value={plannedExpense.dueDate} onChange={e=>setPlannedExpense({...plannedExpense,dueDate:e.target.value})}/></div><div className="space-y-2"><div className="flex items-center gap-2"><input id="planned-reference-file" type="checkbox" checked={plannedExpense.referenceAsFile} onChange={e=>{setPlannedExpense({...plannedExpense,referenceAsFile:e.target.checked,reference:""});setPlannedProof(null);}} className="h-4 w-4"/><Label htmlFor="planned-reference-file" className="cursor-pointer">Joindre un fichier comme référence</Label></div>{plannedExpense.referenceAsFile?<div className="space-y-1"><Label>Fichier justificatif</Label><Input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={e=>setPlannedProof(e.target.files?.[0]||null)}/><p className="text-xs text-muted-foreground">{plannedProof?.name||plannedExpenseTarget?.proof_name||"Aucun fichier sélectionné"}</p></div>:<div className="space-y-1"><Label>Référence</Label><Input value={plannedExpense.reference} onChange={e=>setPlannedExpense({...plannedExpense,reference:e.target.value})} placeholder="N° facture, devis ou pièce"/></div>}</div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label>Description</Label><Textarea value={plannedExpense.description} onChange={e=>setPlannedExpense({...plannedExpense,description:e.target.value})} rows={2}/></div><div className="flex items-center gap-2"><input type="checkbox" checked={plannedExpense.direct} onChange={e=>setPlannedExpense({...plannedExpense,direct:e.target.checked})} className="h-4 w-4"/><Label>Coût direct</Label></div><div className="flex gap-2 sm:col-span-2 lg:col-span-3"><Button onClick={()=>void savePlannedExpense()} disabled={saving}>{saving?"Enregistrement…":plannedExpenseEditId?"Enregistrer les modifications":"Enregistrer"}</Button><Button variant="outline" onClick={()=>setPlannedExpenseOpen(false)} disabled={saving}>Annuler</Button></div>
        </div></DialogContent></Dialog>
        <Card><CardHeader><CardTitle>Dépenses à payer / soldes en cours</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr className="border-b text-left"><th className="p-2">Date</th><th className="p-2">Motif</th><th className="p-2">Bénéficiaire</th><th className="p-2 text-right">Montant prévu</th><th className="p-2 text-right">Payé</th><th className="p-2 text-right">Reste</th><th className="p-2">Statut / actions</th></tr></thead><tbody>
          {expenses.filter((e:any)=>["unpaid","partial"].includes(String(e.status||""))&&e.status!=="cancelled").map((e:any)=><tr key={e.id} className="border-b"><td className="px-2 py-1.5 whitespace-nowrap">{e.expense_date?new Date(e.expense_date+"T12:00:00").toLocaleDateString("fr-FR"):"—"}{e.due_date&&<p className="text-xs text-muted-foreground">Échéance {new Date(e.due_date+"T12:00:00").toLocaleDateString("fr-FR")}</p>}</td><td className="px-2 py-1.5">{e.expense_category}<p className="text-xs text-muted-foreground">{e.description||""}</p></td><td className="px-2 py-1.5">{e.beneficiary_name||e.supplier_name||"—"}</td><td className="px-2 py-1.5 text-right">{money(e.total_amount)}</td><td className="px-2 py-1.5 text-right">{money(e.paid_amount)}</td><td className="px-2 py-1.5 text-right font-semibold">{money(Number(e.total_amount)-Number(e.paid_amount||0))}</td><td className="px-2 py-1.5"><div className="flex flex-wrap gap-1"><Badge variant="secondary">{e.status==="partial"?"Partiel":"À payer"}</Badge>{isPdg&&<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label="Actions"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>{setPlannedExpenseTarget(e);setPlannedExpenseEditId(e.id);setPlannedExpense({category:e.expense_category||"PRESTATIONS",amount:String(e.total_amount||""),description:e.description||"",beneficiary:e.beneficiary_name||e.supplier_name||"",beneficiaryPhone:e.beneficiary_phone||"",profileId:e.profile_id||"",isInternalUser:!!e.profile_id,expenseDate:e.expense_date||new Date().toISOString().slice(0,10),dueDate:e.due_date||"",direct:!!e.is_direct_cost,reference:e.reference||"",referenceAsFile:!!e.proof_path});setPlannedProof(null);setPlannedExpenseOpen(true);}}><Pencil className="mr-2 h-4 w-4"/>Modifier</DropdownMenuItem>{isPdg&&e.status==="unpaid"&&Number(e.paid_amount||0)===0&&<><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive" onClick={()=>void deletePlannedExpense(e)}><Trash2 className="mr-2 h-4 w-4"/>Supprimer</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>}<Button type="button" size="sm" onClick={()=>{setPaymentTarget(e);setPaymentAmount(String(Math.max(0,Number(e.total_amount)-Number(e.paid_amount||0))));setPaymentPartial(false);setPaymentWithFees(false);setPaymentDate(new Date().toISOString().slice(0,10));setPaymentMethod("mobile_money");setPaymentReference("");setPaymentProof(null);}} disabled={saving||Number(e.total_amount)-Number(e.paid_amount||0)<=0}>Payer</Button></div></td></tr>)}
          {!expenses.some((e:any)=>["unpaid","partial"].includes(String(e.status||""))&&e.status!=="cancelled")&&<tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Aucune dépense à payer en attente.</td></tr>}
        </tbody></table></div></CardContent></Card>
        {paymentTarget&&<Dialog open={!!paymentTarget} onOpenChange={open=>{if(!open&&!saving)setPaymentTarget(null);}}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Enregistrer un paiement</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2 rounded-md bg-muted p-3"><p className="text-sm">{paymentTarget.expense_category} · {paymentTarget.beneficiary_name||paymentTarget.supplier_name||"Bénéficiaire non renseigné"}</p><p className="font-semibold">Solde : {money(Number(paymentTarget.total_amount)-Number(paymentTarget.paid_amount||0))}</p></div><div className="flex items-center gap-2 sm:col-span-2"><input id="payment-partial" type="checkbox" checked={paymentPartial} onChange={e=>{setPaymentPartial(e.target.checked);if(!e.target.checked)setPaymentAmount(String(Math.max(0,Number(paymentTarget.total_amount)-Number(paymentTarget.paid_amount||0))));}} className="h-4 w-4"/><Label htmlFor="payment-partial" className="cursor-pointer">Paiement partiel</Label></div><div className="space-y-1"><Label>Montant payé (FCFA)</Label><Input type="number" min="1" max={Number(paymentTarget.total_amount)-Number(paymentTarget.paid_amount||0)} value={paymentPartial?paymentAmount:String(Math.max(0,Number(paymentTarget.total_amount)-Number(paymentTarget.paid_amount||0)))} readOnly={!paymentPartial} disabled={!paymentPartial} onChange={e=>setPaymentAmount(e.target.value)}/></div><div className="space-y-1"><Label>Date de paiement</Label><Input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></div><div className="space-y-1"><Label>Moyen de paiement</Label><Select value={paymentMethod} onValueChange={v=>{setPaymentMethod(v);if(v==="especes")setPaymentWithFees(false);}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="especes">Espèces</SelectItem><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="virement">Bancaire</SelectItem></SelectContent></Select></div>{paymentMethod!=="especes"&&<div className="flex items-center gap-2 rounded-md border p-3"><input id="payment-with-fees" type="checkbox" checked={paymentWithFees} onChange={e=>setPaymentWithFees(e.target.checked)} className="h-4 w-4"/><Label htmlFor="payment-with-fees" className="cursor-pointer">Avec les frais (+ 1 %)</Label></div>}<div className="rounded-md bg-muted p-3 text-sm sm:col-span-2"><div className="flex justify-between"><span>Montant du règlement</span><b>{money(paymentPartial?Number(paymentAmount)||0:Math.max(0,Number(paymentTarget.total_amount)-Number(paymentTarget.paid_amount||0)))}</b></div><div className="flex justify-between"><span>Frais 1 %</span><b>{money(paymentMethod!=="especes"&&paymentWithFees?feeAmountFor(paymentPartial?Number(paymentAmount)||0:Math.max(0,Number(paymentTarget.total_amount)-Number(paymentTarget.paid_amount||0))):0)}</b></div><div className="mt-1 flex justify-between border-t pt-2"><span>Sortie comptabilisée</span><b>{money((paymentPartial?Number(paymentAmount)||0:Math.max(0,Number(paymentTarget.total_amount)-Number(paymentTarget.paid_amount||0)))+(paymentMethod!=="especes"&&paymentWithFees?feeAmountFor(paymentPartial?Number(paymentAmount)||0:Math.max(0,Number(paymentTarget.total_amount)-Number(paymentTarget.paid_amount||0))):0))}</b></div></div><div className="space-y-1"><Label>Référence (facultative)</Label><Input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)}/></div><div className="space-y-1 sm:col-span-2"><Label>Preuve de paiement / reçu</Label><Input type="file" accept="image/*,.pdf" onChange={e=>setPaymentProof(e.target.files?.[0]||null)}/></div><div className="flex gap-2 sm:col-span-2"><Button onClick={()=>void registerExpensePayment()} disabled={saving}>{saving?"Enregistrement…":"Confirmer le paiement"}</Button><Button variant="outline" onClick={()=>setPaymentTarget(null)} disabled={saving}>Annuler</Button></div></div></DialogContent></Dialog>}
      </TabsContent>
      <TabsContent value="depenses" className="mt-3 min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <h2 className="font-semibold">Sorties enregistrées</h2>
          {can("finance.expenses")&&<Button onClick={()=>{setSelectedExpense(null);setExpense({category:"AUTRE",amount:"",date:new Date().toISOString().slice(0,10),description:"",profileId:"",clientId:"",plantationId:"",direct:false,method:"mobile_money",withFees:false,reference:""});setExpenseProof(null);setExpenseFormMode("new");}}><Plus className="mr-2 h-4 w-4"/>Nouvelle sortie</Button>}
        </div>
        {expenseFormMode!==null&&<Dialog open={expenseFormMode!==null} onOpenChange={open=>{if(!open&&!saving){setExpenseFormMode(null);setSelectedExpense(null);setExpenseProof(null);}}}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><Card>
          <CardHeader><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><CardTitle>{expenseFormMode==="new"?"Nouvelle sortie":expenseFormMode==="edit"?"Modifier la sortie":"Détail de la sortie"}</CardTitle>{expenseFormMode==="view"&&<Badge variant="secondary">Lecture seule</Badge>}</div></CardHeader>
          <CardContent className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1"><Label>Catégorie</Label><Select disabled={expenseFormMode==="view"} value={expense.category} onValueChange={v=>setExpense({...expense,category:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{FINANCE_EXPENSE_CATEGORIES.map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Montant saisi (FCFA)</Label><Input type="number" min="1" value={expenseFormMode==="view"?String(selectedExpense?.transaction?.gross_amount??selectedExpense?.transaction?.amount??""):expense.amount} onChange={e=>setExpense({...expense,amount:e.target.value})} readOnly={expenseFormMode==="view"} disabled={expenseFormMode==="view"}/></div>
            <div className="space-y-1"><Label>Date de sortie</Label><Input type="date" value={expenseFormMode==="view"?(selectedExpense?.expense_date||""):expense.date} onChange={e=>setExpense({...expense,date:e.target.value})} readOnly={expenseFormMode==="view"} disabled={expenseFormMode==="view"}/></div><div className="space-y-1"><Label>Moyen de paiement</Label><Select disabled={expenseFormMode==="view"} value={expense.method} onValueChange={v=>setExpense({...expense,method:v,withFees:v==="especes"?false:expense.withFees})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="especes">Espèces</SelectItem><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="virement">Bancaire</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Utilisateur</Label>
              {expenseFormMode==="view"?<Input value={profiles.find((p:any)=>p.id===selectedExpense?.profile_id)?.nom_complet||selectedExpense?.supplier_name||"Utilisateur non renseigné"} disabled readOnly/>:
                <Popover open={expenseUserPickerOpen} onOpenChange={setExpenseUserPickerOpen}>
                  <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={expenseUserPickerOpen} className="w-full justify-between font-normal"><span className="truncate">{profiles.find((p:any)=>p.id===expense.profileId)?.nom_complet||"Rechercher un utilisateur…"}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/></Button></PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start"><Command><CommandInput placeholder="Rechercher par nom, poste ou e-mail…"/><CommandList><CommandEmpty>Aucun utilisateur trouvé.</CommandEmpty><CommandGroup>{profiles.map((p:any)=><CommandItem key={p.id} value={[p.nom_complet,p.poste,p.email].filter(Boolean).join(" ")} onSelect={()=>{setExpense({...expense,profileId:p.id});setExpenseUserPickerOpen(false);}}><Check className={"mr-2 h-4 w-4 "+(expense.profileId===p.id?"opacity-100":"opacity-0")}/><span className="min-w-0"><span className="block truncate">{p.nom_complet}</span><span className="block truncate text-xs text-muted-foreground">{[p.poste,p.email].filter(Boolean).join(" · ")||"Collaborateur"}</span></span></CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>
                </Popover>}</div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label>Description</Label><Textarea rows={3} value={expenseFormMode==="view"?(selectedExpense?.description||""):expense.description} onChange={e=>setExpense({...expense,description:e.target.value})} readOnly={expenseFormMode==="view"} disabled={expenseFormMode==="view"}/></div>
<div className="flex min-w-0 items-center gap-2 sm:col-span-2 lg:col-span-3"><input id="expense-direct-cost" type="checkbox" checked={expense.direct} disabled={expenseFormMode==="view"} onChange={e=>setExpense({...expense,direct:e.target.checked})} className="h-4 w-4 shrink-0 rounded border-input" /><Label htmlFor="expense-direct-cost" className="cursor-pointer text-sm leading-tight">Coût direct</Label>{expenseFormMode!=="view"&&expense.method!=="especes"&&<label className="ml-4 flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={expense.withFees} onChange={e=>setExpense({...expense,withFees:e.target.checked})} className="h-4 w-4"/>Avec les frais (+ 1 %)</label>}</div>{expenseFormMode!=="view"&&<div className="rounded-md bg-muted p-3 text-sm sm:col-span-2 lg:col-span-3"><div className="flex justify-between"><span>Montant saisi</span><b>{money(Number(expense.amount)||0)}</b></div><div className="flex justify-between"><span>Frais 1 %</span><b>{money(expense.method!=="especes"&&expense.withFees?feeAmountFor(Number(expense.amount)||0):0)}</b></div><div className="mt-1 flex justify-between border-t pt-2"><span>Sortie comptabilisée</span><b>{money((Number(expense.amount)||0)+(expense.method!=="especes"&&expense.withFees?feeAmountFor(Number(expense.amount)||0):0))}</b></div></div>}
                        {expenseFormMode!=="view"?<div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label htmlFor="expense-proof" className="flex items-center gap-2"><Paperclip className="h-4 w-4"/>Justificatif / reçu / facture</Label><Input id="expense-proof" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={e=>setExpenseProof(e.target.files?.[0]||null)} className="text-sm"/>{expenseProof&&<div className="space-y-2 rounded-md border p-2"><p className="break-all text-xs text-muted-foreground">{expenseProof.name} · {Math.max(1,Math.round(expenseProof.size/1024))} Ko</p>{expenseProof.type.startsWith("image/")&&<img src={expenseProofPreview || undefined} alt="Aperçu du justificatif de sortie" className="max-h-64 max-w-full rounded-md border object-contain"/>}{expenseProof.type==="application/pdf"&&expenseProofPreview&&<iframe title="Aperçu PDF du justificatif de sortie" src={expenseProofPreview} className="h-64 w-full rounded-md border"/>}</div>}</div>:<div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label>Justificatif</Label>{selectedExpense?.proof_path?<Button type="button" variant="outline" size="sm" onClick={async()=>{const {data,error}=await supabase.storage.from("documents").createSignedUrl(selectedExpense.proof_path,3600);if(error||!data?.signedUrl){toast({title:"Justificatif indisponible",description:error?.message||"Impossible d’ouvrir le fichier.",variant:"destructive"});return;}window.open(data.signedUrl,"_blank","noopener,noreferrer");}}><Paperclip className="mr-2 h-4 w-4"/>{selectedExpense.proof_name||"Ouvrir le justificatif"}</Button>:<p className="text-sm text-muted-foreground">Aucun justificatif joint.</p>}</div>}
            {expenseFormMode==="view"&&<div className="space-y-1"><Label>Statut de l’écriture</Label><Input value={selectedExpense?.transaction?.status||transactions.find(t=>t.id===selectedExpense?.transaction_id)?.status||"—"} disabled readOnly/></div>}
            {expenseFormMode!=="view"&&<div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3"><Button className="w-full sm:w-auto" onClick={()=>void saveExpense()} disabled={saving}><Plus className="mr-2 h-4 w-4"/>{saving?"Enregistrement…":expenseFormMode==="edit"?"Enregistrer les modifications":"Enregistrer la sortie"}</Button><Button type="button" variant="outline" onClick={()=>{setExpenseFormMode(null);setExpenseProof(null);}} disabled={saving}>Annuler</Button></div>}
            {expenseFormMode==="view"&&<div className="sm:col-span-2 lg:col-span-3"><Button type="button" variant="outline" onClick={()=>{setExpenseFormMode(null);setSelectedExpense(null);}}>Fermer le détail</Button></div>}
          </CardContent>
        </Card></DialogContent></Dialog>}
        <Card>
          <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Sorties enregistrées</CardTitle><TableSearchInput value={expenseSearch} onChange={setExpenseSearch} placeholder="Rechercher une sortie…"/></div></CardHeader>
          <CardContent><div className="w-full overflow-x-auto"><table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b text-left"><th className="px-2 py-1.5">Date</th><th className="px-2 py-1.5">Catégorie</th><th className="px-2 py-1.5">Utilisateur</th><th className="px-2 py-1.5 text-right">Montant</th><th className="px-2 py-1.5">Statut</th><th className="px-2 py-1.5">Justificatif</th>{isPdg&&<th className="px-2 py-1.5 text-right">Actions</th>}</tr></thead>
            <tbody>{expenses.filter((e:any)=>{const t=transactions.find((x:any)=>x.id===e.transaction_id);return [e.expense_category,profiles.find((p:any)=>p.id===e.profile_id)?.nom_complet,e.supplier_name,e.description,e.proof_name,t?.label,t?.status].some((v:any)=>matchesAccentInsensitive(v,expenseSearch));}).map((e:any)=>{const transaction=e.transaction||transactions.find((t:any)=>t.id===e.transaction_id);return <tr key={e.id} className="border-b last:border-0"><td className="whitespace-nowrap px-2 py-1.5">{transaction?.transaction_date?new Date(transaction.transaction_date).toLocaleDateString("fr-FR"):e.created_at?new Date(e.created_at).toLocaleDateString("fr-FR"):"—"}</td><td className="px-2 py-1.5 font-medium">{e.expense_category||"—"}</td><td className="max-w-[220px] truncate px-2 py-1.5">{profiles.find((p:any)=>p.id===e.profile_id)?.nom_complet||e.supplier_name||"—"}</td><td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums">{money(transaction?.amount??0)}</td><td className="px-2 py-1.5"><Badge variant={transaction?.status==="valide"?"default":"secondary"}>{transaction?.status||"—"}</Badge></td><td className="px-2 py-1.5">{e.proof_path?<span className="inline-flex items-center gap-1 text-xs text-primary"><Paperclip className="h-3 w-3"/>{e.proof_name||"Joint"}</span>:"—"}</td>{isPdg&&<td className="px-2 py-1.5 text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{!e.finance_expense_payments?.some((p:any)=>p.status==="valide")&&<DropdownMenuItem onClick={()=>{setSelectedExpense({...e,transaction});setExpense({category:e.expense_category||"AUTRE",amount:String(transaction?.gross_amount||transaction?.amount||""),date:e.expense_date||new Date().toISOString().slice(0,10),description:e.description||"",profileId:e.profile_id||"",clientId:e.client_id||"",plantationId:e.plantation_id||"",direct:!!e.is_direct_cost,method:transaction?.payment_method||"mobile_money",withFees:!!transaction?.fee_applied,reference:transaction?.reference||""});setExpenseFormMode("edit");}}><Pencil className="mr-2 h-4 w-4"/>Modifier</DropdownMenuItem>}<DropdownMenuSeparator/><DropdownMenuItem className="text-destructive" onClick={()=>void deleteExpense(e)}><Trash2 className="mr-2 h-4 w-4"/>Supprimer</DropdownMenuItem></DropdownMenuContent></DropdownMenu></td>}</tr>;})}{!expenses.length&&!loading&&<tr><td colSpan={isPdg?7:6} className="p-8 text-center text-muted-foreground">Aucune sortie enregistrée.</td></tr>}</tbody>


          </table></div></CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="salaires" className="mt-3 min-w-0 space-y-3"><div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {can("finance.payroll")&&<><Button variant="outline" onClick={()=>setSalaryFormOpen(true)}><Plus className="mr-2 h-4 w-4"/>Paramétrer un salaire</Button><Dialog open={salaryFormOpen} onOpenChange={setSalaryFormOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Paramétrer un salaire</DialogTitle></DialogHeader><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2"><Select value={salaryForm.profileId} onValueChange={v=>{const profile=profiles.find((p:any)=>p.id===v);setSalaryForm({...salaryForm,profileId:v,baseSalary:String(profile?.salaire_base ?? "")});}}><SelectTrigger><SelectValue placeholder="CHOISIR UN COLLABORATEUR"/></SelectTrigger><SelectContent>{profiles.filter(p=>p.actif!==false&&Number(p.salaire_base)>0).map(p=><SelectItem key={p.id} value={p.id}>{p.nom_complet} — {money(p.salaire_base)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Salaire de base (synchronisé depuis les RH)</Label><Input type="number" placeholder="Salaire défini dans les RH" value={salaryForm.baseSalary} readOnly disabled/></div>
          <div className="space-y-1"><Label>Jour habituel de paiement (1 à 31)</Label><Input type="number" min="1" max="31" value={salaryForm.payDay} onChange={e=>setSalaryForm({...salaryForm,payDay:e.target.value})}/></div>
          <Button className="w-full sm:col-span-2" onClick={()=>void saveSalary()} disabled={saving}><Banknote className="mr-2 h-4 w-4"/>ENREGISTRER LE SALAIRE</Button>
        </div></DialogContent></Dialog></>}
        {can("finance.payroll")&&<Card><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle>Générer la paie</CardTitle><Button size="sm" onClick={()=>setPayrollGenerateOpen(true)}><PlayCircle className="mr-2 h-4 w-4"/>Préparer une paie</Button></div></CardHeader><CardContent className="space-y-3"><Dialog open={payrollGenerateOpen} onOpenChange={setPayrollGenerateOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Préparer une paie mensuelle</DialogTitle></DialogHeader><div className="space-y-3"><Label>Période</Label><Input type="month" value={period} onChange={e=>setPeriod(e.target.value)}/><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setPayrollGenerateOpen(false)}>Annuler</Button><Button onClick={()=>void generatePayroll()} disabled={saving}><PlayCircle className="mr-2 h-4 w-4"/>Générer le brouillon</Button></div></div></DialogContent></Dialog><div className="space-y-2">{payrollRuns.map(r=><div key={r.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div className="min-w-0"><b>{r.period_start.slice(0,7)}</b><p className="text-xs text-muted-foreground">{r.status.toUpperCase()}</p>{r.payment_reference&&<p className="text-xs text-muted-foreground">Réf. : {r.payment_reference}</p>}</div><div className="flex flex-wrap items-center gap-2">{r.status==="brouillon"&&<Button size="sm" onClick={()=>void validatePayrollRun(r)} disabled={saving}><CheckCircle2 className="mr-1 h-4 w-4"/>Valider</Button>}{r.status==="valide"&&<Button size="sm" onClick={()=>{setPayrollPaymentRunId(r.id);setPayrollPaymentReference("");setPayrollPaymentMethod("virement");}} disabled={saving}><Banknote className="mr-1 h-4 w-4"/>Enregistrer le paiement</Button>}{r.status==="paye"&&<Badge>Payée</Badge>}{canDeleteDraftPayroll && r.status==="brouillon" && <Button size="sm" variant="destructive" onClick={()=>{if(window.confirm("Supprimer définitivement ce brouillon de paie et ses lignes ?")) void deletePayrollDraft(r);}} disabled={saving}><Trash2 className="mr-1 h-4 w-4"/>Supprimer</Button>}</div></div>)}
        {!!payrollPaymentRunId&&<Dialog open={!!payrollPaymentRunId} onOpenChange={open=>{if(!open&&!saving)setPayrollPaymentRunId("");}}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Confirmer le paiement de paie</DialogTitle></DialogHeader><div className="space-y-3"><h3 className="font-semibold">Confirmer le paiement du lot {payrollRuns.find(r=>r.id===payrollPaymentRunId)?.period_start?.slice(0,7)}</h3><div className="grid gap-2 sm:grid-cols-2"><div className="space-y-1"><Label>Mode de paiement</Label><Select value={payrollPaymentMethod} onValueChange={setPayrollPaymentMethod}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="virement">Virement bancaire</SelectItem><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="cheque">Chèque</SelectItem><SelectItem value="especes">Espèces</SelectItem><SelectItem value="autre">Autre</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label>Référence réelle {payrollPaymentMethod==="especes"?"(facultative)":"(obligatoire)"}</Label><Input value={payrollPaymentReference} onChange={e=>setPayrollPaymentReference(e.target.value)} placeholder="Référence transaction / chèque"/></div><div className="space-y-1 sm:col-span-2"><Label>URL du justificatif (facultative)</Label><Input value={payrollPaymentProofUrl} onChange={e=>setPayrollPaymentProofUrl(e.target.value)} placeholder="Lien sécurisé vers le justificatif"/></div></div><div className="flex flex-wrap gap-2"><Button onClick={()=>void payRun()} disabled={saving}>{saving?"Enregistrement…":"Confirmer le paiement enregistré"}</Button><Button variant="outline" onClick={()=>setPayrollPaymentRunId("")} disabled={saving}>Annuler</Button></div></div></DialogContent></Dialog>}</div></CardContent></Card>}
      </div></TabsContent>
      
      <TabsContent value="associes" className="mt-3 min-w-0 space-y-3">
        <Dialog open={associateMovementOpen} onOpenChange={open=>{if(!open&&!saving){setAssociateMovementOpen(false);setAssociateMovementEditId(null);}}}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{associateMovementEditId?"Modifier le mouvement associé":"Nouveau mouvement associé"}</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1 sm:col-span-2"><Label>Associé</Label><Select value={associateMovement.associateId} onValueChange={v=>setAssociateMovement({...associateMovement,associateId:v})}><SelectTrigger><SelectValue placeholder="Sélectionner un associé"/></SelectTrigger><SelectContent>{associates.filter(a=>a.active).map(a=><SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Type de mouvement</Label><Select value={associateMovement.type} onValueChange={v=>setAssociateMovement({...associateMovement,type:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="apport">Apport</SelectItem><SelectItem value="remboursement">Remboursement</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label>Montant saisi (FCFA)</Label><Input type="number" min="1" value={associateMovement.amount} onChange={e=>setAssociateMovement({...associateMovement,amount:e.target.value})}/></div><div className="space-y-1"><Label>Date du mouvement</Label><Input type="date" value={associateMovement.date} onChange={e=>setAssociateMovement({...associateMovement,date:e.target.value})}/></div><div className="space-y-1"><Label>Moyen de paiement</Label><Select value={associateMovement.method} onValueChange={v=>setAssociateMovement({...associateMovement,method:v,withoutFees:v==="especes"?false:associateMovement.withoutFees})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="especes">Espèces</SelectItem><SelectItem value="mobile_money">Mobile Money</SelectItem><SelectItem value="virement">Bancaire</SelectItem></SelectContent></Select></div>{associateMovement.method!=="especes"&&<div className="flex items-center gap-2 rounded-md border p-3 sm:col-span-2"><input id="associate-without-fees" type="checkbox" checked={associateMovement.withoutFees} onChange={e=>setAssociateMovement({...associateMovement,withoutFees:e.target.checked})} className="h-4 w-4"/><Label htmlFor="associate-without-fees" className="cursor-pointer">Sans les frais (déduction de 1 %)</Label></div>}<div className="rounded-md bg-muted p-3 text-sm sm:col-span-2"><div className="flex justify-between"><span>Montant saisi</span><b>{money(Number(associateMovement.amount)||0)}</b></div><div className="flex justify-between"><span>Déduction 1 %</span><b>{money(associateMovement.method!=="especes"&&associateMovement.withoutFees?feeAmountFor(Number(associateMovement.amount)||0):0)}</b></div><div className="mt-1 flex justify-between border-t pt-2"><span>Montant comptabilisé</span><b>{money(Math.max(0,(Number(associateMovement.amount)||0)-(associateMovement.method!=="especes"&&associateMovement.withoutFees?feeAmountFor(Number(associateMovement.amount)||0):0)))}</b></div></div><div className="space-y-1"><Label>Référence</Label><Input value={associateMovement.reference} onChange={e=>setAssociateMovement({...associateMovement,reference:e.target.value})}/></div><div className="space-y-1 sm:col-span-2"><Label>Notes</Label><Textarea value={associateMovement.notes} onChange={e=>setAssociateMovement({...associateMovement,notes:e.target.value})}/></div><div className="flex gap-2 sm:col-span-2"><Button onClick={()=>void saveAssociateMovement()} disabled={saving}>{saving?"Enregistrement…":associateMovementEditId?"Enregistrer les modifications":"Enregistrer le mouvement"}</Button><Button variant="outline" onClick={()=>setAssociateMovementOpen(false)} disabled={saving}>Annuler</Button></div></div></DialogContent></Dialog>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
            <div><CardTitle className="text-base">Associés et répartition des apports</CardTitle></div>{canManage&&<Button size="sm" onClick={()=>{setAssociateMovementEditId(null);setAssociateMovement({associateId:"",type:"apport",amount:"",date:new Date().toISOString().slice(0,10),reference:"",notes:"",method:"mobile_money",withoutFees:false});setAssociateMovementOpen(true);}}><Plus className="mr-2 h-4 w-4"/>Nouveau mouvement</Button>}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Associés actifs</p><p className="text-lg font-bold">{associates.filter(a=>a.active).length}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Apports cumulés</p><p className="text-sm font-bold tabular-nums">{money(associateMovements.filter(m=>m.movement_type==="apport"&&m.finance_transactions?.status==="valide").reduce((s,m)=>s+Number(m.finance_transactions?.amount||0),0))}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Remboursements</p><p className="text-sm font-bold tabular-nums">{money(associateMovements.filter(m=>m.movement_type==="remboursement"&&m.finance_transactions?.status==="valide").reduce((s,m)=>s+Number(m.finance_transactions?.amount||0),0))}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Solde net des apports</p><p className="text-sm font-bold tabular-nums">{money(associateMovements.filter(m=>m.finance_transactions?.status==="valide").reduce((s,m)=>s+(m.movement_type==="apport"?1:m.movement_type==="remboursement"?-1:0)*Number(m.finance_transactions?.amount||0),0))}</p></div>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] table-fixed text-sm">
                <colgroup><col className="w-[22%]"/><col className="w-[14%]"/><col className="w-[12%]"/><col className="w-[16%]"/><col className="w-[36%]"/></colgroup>
                <thead className="bg-muted/50"><tr className="border-b text-left"><th className="p-2">Associé</th><th className="p-2">Rôle</th><th className="p-2">Statut</th><th className="p-2 text-right">Apports cumulés</th><th className="p-2 text-right">Part des apports</th></tr></thead>
                <tbody>{associates.map(a=>{const amount=associateMovements.filter(m=>m.associate_id===a.id&&m.movement_type==="apport"&&m.finance_transactions?.status==="valide").reduce((s,m)=>s+Number(m.finance_transactions?.amount||0),0);const total=associateMovements.filter(m=>m.movement_type==="apport"&&m.finance_transactions?.status==="valide").reduce((s,m)=>s+Number(m.finance_transactions?.amount||0),0);const pct=total?amount/total*100:0;const barStyle=pct>0?{backgroundColor:`hsl(${Math.round(120*Math.max(0,Math.min(100,pct))/100)} 78% 43%)`}:undefined;return <tr key={a.id} className="border-b last:border-0"><td className="p-2 font-medium">{a.full_name}</td><td className="p-2"><Badge variant="outline">{a.role_label||"Associé"}</Badge></td><td className="p-2"><Badge variant={a.active?"default":"secondary"}>{a.active?"Actif":"Inactif"}</Badge></td><td className="p-2 text-right font-semibold tabular-nums">{money(amount)}</td><td className="p-2"><div className="flex min-w-0 items-center gap-3"><div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full min-w-[3px] rounded-full" style={{...barStyle,width:Math.max(pct>0?1:0,Math.min(100,pct))+"%"}}/></div><span className="w-14 shrink-0 text-right font-semibold tabular-nums">{pct.toLocaleString("fr-FR",{maximumFractionDigits:1})}%</span></div></td></tr>})}
                  {!associates.length&&<tr><td colSpan={5} className="p-5 text-center text-muted-foreground">Aucun associé enregistré.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Historique des mouvements associés</CardTitle></CardHeader><CardContent><div className="w-full overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="bg-muted/50"><tr className="border-b text-left"><th className="px-2 py-1.5">Date</th><th className="px-2 py-1.5">Associé</th><th className="px-2 py-1.5">Mouvement</th><th className="px-2 py-1.5">Référence / pièce</th><th className="px-2 py-1.5 text-right">Montant net</th>{isPdg&&<th className="px-2 py-1.5 text-right">Actions</th>}</tr></thead><tbody>{associateMovements.map(m=><tr key={m.id} className="border-b last:border-0"><td className="whitespace-nowrap px-2 py-1.5">{new Date(m.finance_transactions?.transaction_date||m.created_at).toLocaleDateString("fr-FR")}</td><td className="px-2 py-1.5">{associates.find(a=>a.id===m.associate_id)?.full_name||"—"}</td><td className="px-2 py-1.5">{m.movement_type==="apport"?(m.contribution_status==="nature"?"Apport en nature":m.contribution_status==="prestation"?"Prestation apportée":"Apport en numéraire"):m.movement_type==="remboursement"?"Remboursement":m.finance_transactions?.label||"Autre"}</td><td className="px-2 py-1.5">{m.finance_transactions?.proof_path?<Button variant="ghost" size="sm" onClick={async()=>{const {data,error}=await supabase.storage.from("documents").createSignedUrl(m.finance_transactions.proof_path,3600);if(error||!data?.signedUrl){toast({title:"Justificatif indisponible",variant:"destructive"});return;}window.open(data.signedUrl,"_blank","noopener,noreferrer");}}><Paperclip className="mr-1 h-3.5 w-3.5"/>{m.finance_transactions?.proof_name||"Ouvrir"}</Button>:(m.finance_transactions?.reference||"—")}</td><td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums">{money(Number(m.finance_transactions?.amount||m.estimated_value||0))}</td>{isPdg&&<td className="px-2 py-1.5 text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>{const tx=m.finance_transactions||{};setAssociateMovementEditId(m.id);setAssociateMovement({associateId:m.associate_id,type:m.movement_type||"apport",amount:String(tx.gross_amount||tx.amount||m.estimated_value||""),date:tx.transaction_date?new Date(tx.transaction_date).toISOString().slice(0,10):new Date().toISOString().slice(0,10),reference:tx.reference||"",notes:tx.notes||m.notes||"",method:tx.payment_method||"mobile_money",withoutFees:!!tx.fee_applied});setAssociateMovementOpen(true);}}><Pencil className="mr-2 h-4 w-4"/>Modifier</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive" onClick={()=>void deleteAssociateMovement(m)}><Trash2 className="mr-2 h-4 w-4"/>Supprimer</DropdownMenuItem></DropdownMenuContent></DropdownMenu></td>}</tr>)}{!associateMovements.length&&<tr><td colSpan={isPdg?6:5} className="p-5 text-center text-muted-foreground">Aucun mouvement associé enregistré</td></tr>}</tbody></table></div></CardContent></Card>
      </TabsContent>
      
      <TabsContent value="rapports" className="mt-4 min-w-0 space-y-4"><Tabs defaultValue={initialReportSection} key={initialReportSection}><TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3"><TabsTrigger value="rapport">Rapport financier</TabsTrigger><TabsTrigger value="analytique">Analytique</TabsTrigger>{canManage&&<TabsTrigger value="historique">Import historique</TabsTrigger>}</TabsList><TabsContent value="rapport" className="mt-3 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Rapports financiers</h2><Button onClick={exportFinancialReport}><FileText className="mr-2 h-4 w-4"/>Exporter le rapport (CSV)</Button></div><div className="responsive-auto-grid gap-3"><Card><CardContent className="min-w-0 p-3 sm:p-4"><p className="text-xs text-muted-foreground">ENCAISSEMENTS VALIDÉS</p><p className="money-value mt-1 text-[clamp(0.78rem,3.2vw,1.5rem)] font-bold leading-tight">{money(totals.income)}</p></CardContent></Card><Card><CardContent className="min-w-0 p-3 sm:p-4"><p className="text-xs text-muted-foreground">SORTIES VALIDÉES</p><p className="money-value mt-1 text-[clamp(0.78rem,3.2vw,1.5rem)] font-bold leading-tight">{money(totals.out)}</p></CardContent></Card><Card><CardContent className="min-w-0 p-3 sm:p-4"><p className="text-xs text-muted-foreground">SOLDE</p><p className="money-value mt-1 text-[clamp(0.78rem,3.2vw,1.5rem)] font-bold leading-tight">{money(totals.balance)}</p></CardContent></Card><Card><CardContent className="p-3 sm:p-4"><p className="text-xs text-muted-foreground">OPÉRATIONS VALIDÉES</p><p className="mt-1 text-2xl font-bold leading-tight">{transactions.filter((t:any)=>t.status==="valide").length}</p></CardContent></Card></div><Card><CardHeader><CardTitle>Répartition par source</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Source</th><th className="p-2 text-right">Entrées</th><th className="p-2 text-right">Sorties</th><th className="p-2 text-right">Opérations</th></tr></thead><tbody>{reportSources.map(r=><tr key={r.source} className="border-b last:border-0"><td className="p-2 font-medium">{r.source}</td><td className="money-value p-2 text-right">{money(r.entrees)}</td><td className="money-value p-2 text-right">{money(r.sorties)}</td><td className="p-2 text-right">{r.count}</td></tr>)}{!reportSources.length&&<tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Aucune opération validée</td></tr>}</tbody></table></div></CardContent></Card><Card><CardHeader><CardTitle>Dernières opérations validées</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Date</th><th className="p-2">Libellé</th><th className="p-2">Source</th><th className="p-2 text-right">Montant</th></tr></thead><tbody>{recentValidTransactions.map((t:any)=><tr key={t.id} className="border-b last:border-0"><td className="p-2 whitespace-nowrap">{t.transaction_date?new Date(t.transaction_date).toLocaleDateString("fr-FR"):"—"}</td><td className="p-2">{t.label||"—"}</td><td className="p-2">{String(t.source_type||"MANUEL").toUpperCase()}</td><td className={`money-value p-2 text-right font-semibold ${t.direction==="sortie"?"text-destructive":"text-primary"}`}>{t.direction==="sortie"?"−":"+"}{money(t.amount)}</td></tr>)}{!recentValidTransactions.length&&<tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Aucune opération validée</td></tr>}</tbody></table></div></CardContent></Card></TabsContent><TabsContent value="analytique" className="mt-3 min-w-0"><FinanceAnalytics embedded /></TabsContent>{canManage&&<TabsContent value="historique" className="mt-3 min-w-0"><FinanceHistoryImport embedded /></TabsContent>}</Tabs></TabsContent>
    </Tabs>
  </div></MainLayout></ProtectedRoute>;
}
