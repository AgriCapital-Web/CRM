import { useCallback, useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CalendarCheck, Target, ClipboardList, RefreshCw, Plus, Check, X } from "lucide-react";

type Row = Record<string, any>;
type Tab = "leave" | "objectives" | "reviews" | "audit";
const hrRoles = ["rh","responsable_rh","ressources_humaines","admin","administrateur","pdg","dg","directeur_general","directeur général"];
const fmt = (v?: string|null) => v ? new Date(v).toLocaleDateString("fr-FR") : "—";

export default function WorkspacePeople360() {
 const { user, profile, userRoles } = useAuth();
 const roles = userRoles.map(r => r.toLowerCase());
 const canHR = roles.some(r => hrRoles.includes(r));
 const [tab,setTab] = useState<Tab>("leave");
 const [pid,setPid] = useState<string|null>(profile?.id || null);
 const [loading,setLoading] = useState(false);
 const [leave,setLeave] = useState<Row[]>([]);
 const [objectives,setObjectives] = useState<Row[]>([]);
 const [reviews,setReviews] = useState<Row[]>([]);
 const [audit,setAudit] = useState<Row[]>([]);
 const [staff,setStaff] = useState<Row[]>([]);
 const [leaveType,setLeaveType] = useState("annual");
 const [starts,setStarts] = useState("");
 const [ends,setEnds] = useState("");
 const [reason,setReason] = useState("");
 const [targetProfile,setTargetProfile] = useState("");
 const [objectiveTitle,setObjectiveTitle] = useState("");
 const [objectiveDescription,setObjectiveDescription] = useState("");
 const [metric,setMetric] = useState("");
 const [target,setTarget] = useState("");
 const [unit,setUnit] = useState("");
 const [due,setDue] = useState("");

 const load = useCallback(async () => {
  if(!user?.id) return;
  setLoading(true);
  try {
   let current = profile?.id as string|undefined;
   if(!current){const {data,error}=await (supabase as any).from("profiles").select("id").eq("user_id",user.id).maybeSingle();if(error)throw error;current=data?.id;}
   if(!current) throw new Error("Profil collaborateur introuvable.");
   setPid(current);
   const [l,o,r,a,s] = await Promise.all([
    (supabase as any).from("workspace_leave_requests").select("*").order("created_at",{ascending:false}).limit(200),
    (supabase as any).from("workspace_objectives").select("*").order("due_on",{ascending:true}).limit(200),
    (supabase as any).from("workspace_performance_reviews").select("*").order("period_end",{ascending:false}).limit(100),
    canHR ? (supabase as any).from("workspace_decision_audit").select("*").order("created_at",{ascending:false}).limit(100) : Promise.resolve({data:[],error:null}),
    canHR ? (supabase as any).from("profiles").select("id,nom_complet,email").eq("actif",true).order("nom_complet") : Promise.resolve({data:[],error:null})
   ]);
   for(const [label,res] of [["congés",l],["objectifs",o],["évaluations",r],["journal",a],["collaborateurs",s]] as any) if(res.error) throw new Error("Chargement "+label+" : "+res.error.message);
   setLeave(l.data||[]);setObjectives(o.data||[]);setReviews(r.data||[]);setAudit(a.data||[]);setStaff(s.data||[]);
  } catch(e:any){toast.error(e?.message||"Chargement impossible.");}
  finally{setLoading(false);}
 },[user?.id,profile?.id,canHR]);
 useEffect(()=>{void load();},[load]);

 const requestLeave = async () => {
  if(!pid||!starts||!ends||ends<starts){toast.error("Vérifiez les dates du congé.");return;}
  const {error}=await (supabase as any).from("workspace_leave_requests").insert({profile_id:pid,leave_type:leaveType,starts_on:starts,ends_on:ends,reason:reason.trim()||null,status:"pending"});
  if(error){toast.error("Demande non enregistrée : "+error.message);return;}
  setStarts("");setEnds("");setReason("");toast.success("Demande envoyée pour validation.");await load();
 };
 const saveObjective = async () => {
  const assigned=canHR&&targetProfile?targetProfile:pid;
  if(!pid||!assigned||!objectiveTitle.trim()){toast.error("Le titre de l’objectif est obligatoire.");return;}
  const {error}=await (supabase as any).from("workspace_objectives").insert({profile_id:assigned,title:objectiveTitle.trim(),description:objectiveDescription.trim()||null,metric:metric.trim()||null,target_value:target===""?null:Number(target),unit:unit.trim()||null,due_on:due||null,created_by_profile_id:pid,updated_by_profile_id:pid,status:"active"});
  if(error){toast.error("Objectif non enregistré : "+error.message);return;}
  setObjectiveTitle("");setObjectiveDescription("");setMetric("");setTarget("");setUnit("");setDue("");toast.success("Objectif enregistré en base.");await load();
 };
 const reviewLeave = async (item:Row,status:"approved"|"rejected") => {
  if(!canHR||!pid)return;
  const {error}=await (supabase as any).from("workspace_leave_requests").update({status,reviewed_by_profile_id:pid,reviewed_at:new Date().toISOString()}).eq("id",item.id).eq("status","pending");
  if(error){toast.error("Décision non enregistrée : "+error.message);return;}
  const auditRow={actor_profile_id:pid,action:status,entity_type:"leave_request",entity_id:item.id,summary:(status==="approved"?"Validation":"Refus")+" de demande de congé"};
  const auditResult=await (supabase as any).from("workspace_decision_audit").insert(auditRow);
  if(auditResult.error) toast.error("Décision enregistrée, mais journal d’audit indisponible : "+auditResult.error.message);
  else toast.success(status==="approved"?"Congé approuvé.":"Congé refusé.");
  await load();
 };
 const changeObjectiveStatus = async (item:Row,status:string) => {
  const {error}=await (supabase as any).from("workspace_objectives").update({status,updated_by_profile_id:pid,updated_at:new Date().toISOString()}).eq("id",item.id);
  if(error){toast.error("Mise à jour refusée : "+error.message);return;}toast.success("Objectif mis à jour.");await load();
 };

 return <ProtectedRoute><MainLayout><div className="mx-auto max-w-7xl space-y-5">
  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-sm text-muted-foreground">AgriCapital 360 · Ressources humaines</p><h1 className="text-2xl font-bold">Collaborateurs & suivi RH</h1><p className="text-sm text-muted-foreground">Congés, objectifs, évaluations et journal des décisions autorisées.</p></div><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?"mr-2 h-4 w-4 animate-spin":"mr-2 h-4 w-4"}/>Actualiser</Button></div>
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([{id:"leave",label:"Congés",icon:CalendarCheck},{id:"objectives",label:"Objectifs",icon:Target},{id:"reviews",label:"Évaluations",icon:ClipboardList},{id:"audit",label:"Journal d’audit",icon:ClipboardList}] as const).map(t=><Button key={t.id} variant={tab===t.id?"default":"outline"} className="justify-start" onClick={()=>setTab(t.id)}><t.icon className="mr-2 h-4 w-4"/>{t.label}</Button>)}</div>
  {tab==="leave"&&<div className="grid gap-4 lg:grid-cols-[minmax(280px,.8fr)_minmax(0,1.2fr)]"><Card><CardHeader><CardTitle>Demander un congé ou une absence</CardTitle></CardHeader><CardContent className="space-y-3"><div className="space-y-1"><Label>Type</Label><Select value={leaveType} onValueChange={setLeaveType}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[{v:"annual",l:"Congé annuel"},{v:"sick",l:"Congé maladie"},{v:"family",l:"Motif familial"},{v:"unpaid",l:"Congé sans solde"},{v:"permission",l:"Permission"},{v:"other",l:"Autre"}].map(x=><SelectItem key={x.v} value={x.v}>{x.l}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Du</Label><Input type="date" value={starts} onChange={e=>setStarts(e.target.value)}/></div><div className="space-y-1"><Label>Au</Label><Input type="date" value={ends} onChange={e=>setEnds(e.target.value)}/></div></div><div className="space-y-1"><Label>Motif (facultatif)</Label><Textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3}/></div><Button onClick={()=>void requestLeave()}><Plus className="mr-2 h-4 w-4"/>Envoyer la demande</Button></CardContent></Card><Card><CardHeader><CardTitle>{canHR?"Demandes de congé à traiter":"Mes demandes"}</CardTitle></CardHeader><CardContent className="space-y-2">{leave.filter(x=>canHR||x.profile_id===pid).map(x=><div key={x.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{({annual:"Congé annuel",sick:"Maladie",family:"Motif familial",unpaid:"Sans solde",permission:"Permission",other:"Autre"} as any)[x.leave_type]||x.leave_type}</strong><Badge variant={x.status==="approved"?"default":x.status==="rejected"?"destructive":"outline"}>{({pending:"En attente",approved:"Approuvé",rejected:"Refusé",cancelled:"Annulé"} as any)[x.status]||x.status}</Badge></div><p className="text-sm text-muted-foreground">{fmt(x.starts_on)} → {fmt(x.ends_on)} · {x.reason||"Sans motif précisé"}</p>{canHR&&x.status==="pending"&&<div className="mt-2 flex gap-2"><Button size="sm" onClick={()=>void reviewLeave(x,"approved")}><Check className="mr-1 h-4 w-4"/>Approuver</Button><Button size="sm" variant="destructive" onClick={()=>void reviewLeave(x,"rejected")}><X className="mr-1 h-4 w-4"/>Refuser</Button></div>}</div>)}{!leave.filter(x=>canHR||x.profile_id===pid).length&&<p className="text-sm text-muted-foreground">Aucune demande enregistrée.</p>}</CardContent></Card></div>}
  {tab==="objectives"&&<div className="grid gap-4 lg:grid-cols-[minmax(280px,.8fr)_minmax(0,1.2fr)]"><Card><CardHeader><CardTitle>Créer un objectif mesurable</CardTitle></CardHeader><CardContent className="space-y-3">{canHR&&<div className="space-y-1"><Label>Collaborateur</Label><Select value={targetProfile} onValueChange={setTargetProfile}><SelectTrigger><SelectValue placeholder="Moi-même par défaut"/></SelectTrigger><SelectContent>{staff.map(s=><SelectItem key={s.id} value={s.id}>{s.nom_complet||s.email||s.id}</SelectItem>)}</SelectContent></Select>}</div>}<div className="space-y-1"><Label>Objectif</Label><Input value={objectiveTitle} onChange={e=>setObjectiveTitle(e.target.value)} placeholder="Résultat à atteindre"/></div><div className="space-y-1"><Label>Description</Label><Textarea value={objectiveDescription} onChange={e=>setObjectiveDescription(e.target.value)}/></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Indicateur</Label><Input value={metric} onChange={e=>setMetric(e.target.value)}/></div><div className="space-y-1"><Label>Cible chiffrée</Label><Input type="number" value={target} onChange={e=>setTarget(e.target.value)}/></div></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Unité</Label><Input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="FCFA, dossiers…"/></div><div className="space-y-1"><Label>Échéance</Label><Input type="date" value={due} onChange={e=>setDue(e.target.value)}/></div></div><Button onClick={()=>void saveObjective()}><Plus className="mr-2 h-4 w-4"/>Enregistrer l’objectif</Button></CardContent></Card><Card><CardHeader><CardTitle>Objectifs visibles selon vos droits</CardTitle></CardHeader><CardContent className="space-y-2">{objectives.filter(x=>canHR||x.profile_id===pid||x.created_by_profile_id===pid).map(x=><div key={x.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{x.title}</strong><Badge variant="outline">{({active:"Actif",at_risk:"À risque",completed:"Terminé",draft:"Brouillon",cancelled:"Annulé"} as any)[x.status]||x.status}</Badge></div><p className="text-sm text-muted-foreground">{x.description||"Sans description"} · {x.metric||"Indicateur non défini"} {x.target_value??""} {x.unit||""} · Échéance : {fmt(x.due_on)}</p><div className="mt-2 flex flex-wrap gap-2">{(x.status!=="completed"&&x.status!=="cancelled")&&<Button size="sm" variant="outline" onClick={()=>void changeObjectiveStatus(x,"completed")}>Marquer terminé</Button>}{x.status==="active"&&<Button size="sm" variant="outline" onClick={()=>void changeObjectiveStatus(x,"at_risk")}>Signaler à risque</Button>}</div></div>)}{!objectives.length&&<p className="text-sm text-muted-foreground">Aucun objectif enregistré.</p>}</CardContent></Card></div>}
  {tab==="reviews"&&<Card><CardHeader><CardTitle>Évaluations de performance</CardTitle></CardHeader><CardContent className="space-y-2">{reviews.filter(x=>canHR||x.profile_id===pid||x.reviewer_profile_id===pid).map(x=><div key={x.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><strong>Évaluation · {fmt(x.period_start)} – {fmt(x.period_end)}</strong><Badge variant="outline">{x.status}</Badge></div><p className="text-sm">Note : {x.rating??"Non notée"}/5</p><p className="text-sm text-muted-foreground">{x.strengths||""} {x.improvements||""} {x.next_steps||""}</p></div>)}{!reviews.length&&<p className="text-sm text-muted-foreground">Aucune évaluation enregistrée. Les formulaires de création et de validation d’évaluation restent à ajouter.</p>}</CardContent></Card>}
  {tab==="audit"&&<Card><CardHeader><CardTitle>Journal des décisions sensibles</CardTitle></CardHeader><CardContent className="space-y-2">{canHR?audit.map(x=><div key={x.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><strong>{x.summary}</strong><span className="text-xs text-muted-foreground">{fmt(x.created_at)}</span></div><p className="text-xs text-muted-foreground">{x.entity_type} · {x.action} · {x.entity_id||"—"}</p></div>):<p className="text-sm text-muted-foreground">Accès réservé aux RH et à la direction.</p>}{canHR&&!audit.length&&<p className="text-sm text-muted-foreground">Aucune entrée dans le journal.</p>}</CardContent></Card>}
 </div></MainLayout></ProtectedRoute>;
}
