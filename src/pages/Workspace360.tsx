import { useCallback, useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { formatUserShortName } from "@/lib/utils";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarDays, CheckSquare, BriefcaseBusiness, Network, Bell, RefreshCw, Plus, Clock, Users } from "lucide-react";
import { toast } from "sonner";

type Tab = "agenda" | "tasks" | "projects" | "job" | "org" | "notifications";
type Row = Record<string, any>;
const tabs: {id:Tab; label:string; icon:any}[] = [
 {id:"job",label:"Fiches de poste",icon:Users},
 {id:"org",label:"Organigramme",icon:Network}
];
const fmt=(value:string|null|undefined)=>value?new Date(value).toLocaleString("fr-FR",{dateStyle:"medium",timeStyle:"short"}):"Non défini";
const ROLE_LABEL: Record<string,string> = {
 pdg:"Fondateur / PDG", dg:"DG", associe_actionnaire:"Associé", manager_commercial_national:"RCN",
 manager_technique_national:"RTN", responsable_operations:"RON", responsable_district:"RD",
 responsable_commercial:"RCZ", responsable_technique_zone:"RTZ",
 chef_equipe_commercial:"CEC", chef_equipe_technique:"CET",
 chef_equipe_service_client:"CE Support", ressources_humaines:"RH",
 comptable:"Comptable", assistant_administratif:"Assistant", service_client:"Support",
 commercial:"Commercial", technicien:"Technicien", mobilisateur_foncier:"Mobilisateur",
 superviseur_mobilisation_fonciere:"SMF",
};
const ROLE_COLOR: Record<string,string> = {
 pdg:"border-l-slate-800", dg:"border-l-slate-700", associe_actionnaire:"border-l-violet-600",
 manager_commercial_national:"border-l-blue-700", manager_technique_national:"border-l-emerald-700",
 responsable_operations:"border-l-amber-700", responsable_district:"border-l-indigo-700",
 responsable_commercial:"border-l-blue-500", responsable_technique_zone:"border-l-emerald-500",
 chef_equipe_commercial:"border-l-sky-500", chef_equipe_technique:"border-l-teal-500",
 ressources_humaines:"border-l-fuchsia-600", comptable:"border-l-orange-600",
 assistant_administratif:"border-l-slate-500", service_client:"border-l-cyan-600",
 commercial:"border-l-sky-400", technicien:"border-l-teal-400", mobilisateur_foncier:"border-l-lime-600",
 superviseur_mobilisation_fonciere:"border-l-lime-700",
};
function roleLabel(node:Row) {
 const code=String(node.role_code||"");
 return ROLE_LABEL[code] || (node.role_name && node.role_name.length<=22 ? node.role_name : "Collaborateur");
}
function OrganizationCard({node}:{node:Row}) {
 const role=String(node.role_code||"");
 const zone=[node.district_name,node.region_name].filter(Boolean).join(" · ");
 const name=String(node.employee_name||"Collaborateur");
 return <div className={`min-w-0 rounded-md border border-l-4 bg-card px-3 py-2.5 shadow-sm ${ROLE_COLOR[role]||"border-l-muted-foreground"}`}>
  <div className="flex min-w-0 items-center gap-2.5">
   {node.employee_photo_url ? <Avatar className="h-9 w-9 shrink-0"><AvatarImage src={node.employee_photo_url}/><AvatarFallback>{name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar> : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{name.split(/\\s+/).slice(-1)[0]?.slice(0,2).toUpperCase()}</div>}
   <div className="min-w-0 flex-1">
    <p className="truncate text-xs font-semibold leading-4">{roleLabel(node)}</p>
    <p className="truncate text-[11px] leading-4 text-muted-foreground">{name}</p>
    {zone&&<p className="truncate text-[10px] leading-3 text-muted-foreground">{zone}</p>}
    {node.relation_rh&&<p className="text-[9px] leading-3 text-muted-foreground">{String(node.relation_rh).toLowerCase().includes("prestataire")?"Prestataire":String(node.relation_rh).toLowerCase().includes("employ")?"Employé":""}</p>}
   </div>
  </div>
 </div>;
}
function OrganizationTree({items}:{items:Row[]}) {
 const role=(n:Row)=>String(n.role_code||"");
 const isAssociate=(n:Row)=>role(n)==="associe_actionnaire"||/associ[eé].*actionnaire/i.test(String(n.poste||""));
 const unique=(arr:Row[])=>Array.from(new Map(arr.map(x=>[String(x.profile_id||x.id),x])).values());
 const associates=unique(items.filter(isAssociate));
 const founder=unique(items.filter(n=>role(n)==="pdg"||/fondateur/i.test(String(n.poste||""))));
 const leadership=unique(items.filter(n=>["dg","manager_commercial_national","manager_technique_national","responsable_operations"].includes(role(n))&&!isAssociate(n)&&!founder.some(f=>f.id===n.id)));
 const districts=unique(items.filter(n=>role(n)==="responsable_district"));
 const zoneLeads=unique(items.filter(n=>["responsable_commercial","responsable_technique_zone","superviseur_mobilisation_fonciere"].includes(role(n))));
 const teams=unique(items.filter(n=>["chef_equipe_commercial","chef_equipe_technique","chef_equipe_service_client"].includes(role(n))));
 const heads=new Set([...founder,...associates,...leadership,...districts,...zoneLeads,...teams].map(n=>String(n.profile_id||n.id)));
 const departments=[
  {id:"commercial",title:"Commercial",codes:["commercial","mobilisateur_foncier"],terms:["commercial"]},
  {id:"technique",title:"Technique & foncier",codes:["technicien","superviseur_mobilisation_fonciere"],terms:["technique","foncier"]},
  {id:"support",title:"Support & relation client",codes:["service_client","assistant_administratif"],terms:["support","relation client"]},
  {id:"finance",title:"Finance",codes:["comptable"],terms:["finance","comptab"]},
  {id:"rh",title:"Ressources humaines",codes:["ressources_humaines"],terms:["rh","ressources humaines"]},
 ];
 const departmentItems=departments.map(d=>({ ...d, people:unique(items.filter(n=>{
  if(heads.has(String(n.profile_id||n.id))) return false;
  const code=role(n), dept=String(n.departement||"").toLowerCase();
  return d.codes.includes(code)||d.terms.some(t=>dept.includes(t));
 }))})).filter(d=>d.people.length>0);
 const other=unique(items.filter(n=>!heads.has(String(n.profile_id||n.id))&&!departmentItems.some(d=>d.people.some(p=>(p.profile_id||p.id)===(n.profile_id||n.id)))));
 const Section=({title,people,compact=false}:{title:string;people:Row[];compact?:boolean})=>people.length?<section className="min-w-0 space-y-2"><h3 className="border-b pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3><div className={compact?"grid grid-cols-1 gap-2 sm:grid-cols-2":"grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3"}>{people.map(n=><OrganizationCard key={String(n.profile_id||n.id)} node={n}/>)}</div></section>:null;
 return <div className="space-y-4">
  {founder.length>0&&<Section title="Fondateur & direction" people={founder} compact/>}
  {associates.length>0&&<Section title="Associés" people={associates} compact/>}
  {leadership.length>0&&<Section title="Direction & pilotage national" people={leadership} compact/>}
  {districts.length>0&&<Section title="Coordination des districts" people={districts} compact/>}
  {zoneLeads.length>0&&<Section title="Responsables de zone" people={zoneLeads} compact/>}
  {teams.length>0&&<Section title="Encadrement des équipes" people={teams} compact/>}
  {departmentItems.length>0&&<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">{departmentItems.map(d=><Section key={d.id} title={d.title} people={d.people}/>)}</div>}
  {other.length>0&&<Section title="Autres fonctions" people={other}/>}
 </div>;
}

export default function Workspace360({ embedded = false }: { embedded?: boolean } = {}) {
 const {user,profile}=useAuth();
 const {capabilities}=usePermissions();
 const [tab,setTab]=useState<Tab>("org");
 const [eventOpen,setEventOpen]=useState(false);
 const [taskOpen,setTaskOpen]=useState(false);
 const [jobOpen,setJobOpen]=useState(false);
 const [assignJobOpen,setAssignJobOpen]=useState(false);
 const [loading,setLoading]=useState(false);
 const [profileId,setProfileId]=useState<string|null>(profile?.id||null);
 const [events,setEvents]=useState<Row[]>([]);
 const [tasks,setTasks]=useState<Row[]>([]);
 const [projects,setProjects]=useState<Row[]>([]);
 const [jobs,setJobs]=useState<Row[]>([]);
 const [assignments,setAssignments]=useState<Row[]>([]);
 const [org,setOrg]=useState<Row[]>([]);
 const [notifications,setNotifications]=useState<Row[]>([]);
 const [title,setTitle]=useState("");
 const [description,setDescription]=useState("");
 const [start,setStart]=useState("");
 const [end,setEnd]=useState("");
 const [eventType,setEventType]=useState("occupation");
 const [priority,setPriority]=useState("normal");
 const [due,setDue]=useState("");
 const [jobTitle,setJobTitle]=useState("");
 const [jobDepartment,setJobDepartment]=useState("");
 const [jobPurpose,setJobPurpose]=useState("");
 const [jobResponsibilities,setJobResponsibilities]=useState("");
 const [jobSkills,setJobSkills]=useState("");
 const [jobObjectives,setJobObjectives]=useState("");
 const [jobAccess,setJobAccess]=useState("private");
 const [staff,setStaff]=useState<Row[]>([]);
 const [assignProfile,setAssignProfile]=useState("");
 const [assignJob,setAssignJob]=useState("");
 const canManageHR=capabilities.manageHR;
 const load=useCallback(async()=>{
   if(!user?.id)return;
   setLoading(true);
   try {
    let pid=profile?.id as string|undefined;
    if(!pid){const {data}=await (supabase as any).from("profiles").select("id").eq("user_id",user.id).maybeSingle();pid=data?.id;}
    if(!pid)throw new Error("Profil collaborateur introuvable.");
    setProfileId(pid);
    const [e,t,p,j,a,o,n,s,argumentsMeta]=await Promise.all([
      (supabase as any).from("workspace_events").select("*").order("starts_at",{ascending:true}).limit(200),
      (supabase as any).from("workspace_tasks").select("*").order("due_at",{ascending:true}).limit(200),
      (supabase as any).from("workspace_projects").select("*").order("updated_at",{ascending:false}).limit(100),
      (supabase as any).from("workspace_job_descriptions").select("*").order("updated_at",{ascending:false}).limit(200),
      (supabase as any).from("workspace_job_assignments").select("*,workspace_job_descriptions(*)").eq("profile_id",pid).is("effective_to",null),
      (supabase as any).from("v_workspace_organization_chart").select("*").order("role_level",{ascending:true}).order("employee_name",{ascending:true}).limit(500),
      (supabase as any).from("workspace_notifications").select("*").eq("recipient_profile_id",pid).order("created_at",{ascending:false}).limit(100),
      canManageHR ? (supabase as any).from("profiles").select("id,nom_complet,email,equipe_id").eq("actif",true).order("nom_complet") : Promise.resolve({data:[]}),
      canManageHR ? (supabase as any).from("profiles").select("id,poste,departement,relation_rh,type_compte").eq("actif",true).eq("type_compte","interne") : Promise.resolve({data:[]})
    ]);
    for(const [name,result] of [["agenda",e],["tâches",t],["projets",p],["fiches de poste",j],["affectations",a],["organigramme",o],["notifications",n],["collaborateurs",s],["métadonnées RH",argumentsMeta]] as any){
      if(result.error)throw new Error("Chargement "+name+" : "+result.error.message);
    }
    const orgMetaById = new Map((argumentsMeta.data||[]).map((row:Row)=>[String(row.id),row]));
    const enrichedOrg = (o.data||[]).map((row:Row)=>({...row,...(orgMetaById.get(String(row.profile_id||row.id))||{})}));
    setEvents(e.data||[]);setTasks(t.data||[]);setProjects(p.data||[]);setJobs(j.data||[]);setAssignments(a.data||[]);setOrg(enrichedOrg);setNotifications(n.data||[]);setStaff(s.data||[]);
   }catch(err:any){toast.error(err?.message||"Impossible de charger l’espace de travail.");}
   finally{setLoading(false);}
 },[user?.id,profile?.id,canManageHR]);
 useEffect(()=>{void load();},[load]);
 const saveEvent=async()=>{
  if(!title.trim()||!start||!end||new Date(end)<=new Date(start)){toast.error("Renseignez un titre et une période valide.");return;}
  const {error}=await (supabase as any).from("workspace_events").insert({title:title.trim(),description:description||null,event_type:eventType,starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString(),created_by_profile_id:profileId,visibility:"private"});
  if(error){toast.error("Événement non enregistré : "+error.message);return;}setTitle("");setDescription("");setEventOpen(false);toast.success("Événement enregistré dans la base.");await load();
 };
 const saveTask=async()=>{
  if(!title.trim()){toast.error("Le titre de la tâche est obligatoire.");return;}
  const {error}=await (supabase as any).from("workspace_tasks").insert({title:title.trim(),description:description||null,priority,due_at:due?new Date(due).toISOString():null,created_by_profile_id:profileId,assigned_to_profile_id:profileId});
  if(error){toast.error("Tâche non enregistrée : "+error.message);return;}setTitle("");setDescription("");setDue("");setTaskOpen(false);toast.success("Tâche créée.");await load();
 };
 const updateTask=async(task:Row,status:string)=>{
  const {error}=await (supabase as any).from("workspace_tasks").update({status,completed_at:status==="done"?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",task.id);
  if(error){toast.error("Mise à jour refusée : "+error.message);return;}await load();
 };
 const saveJob=async()=>{
  if(!canManageHR){toast.error("La gestion des fiches de poste est réservée aux RH et aux utilisateurs autorisés.");return;}
  if(!jobTitle.trim()||!jobPurpose.trim()){toast.error("Le titre et la mission principale sont obligatoires.");return;}
  const asArray=(v:string)=>v.split("\n").map(x=>x.trim()).filter(Boolean);
  const {data,error}=await (supabase as any).from("workspace_job_descriptions").insert({title:jobTitle.trim(),department:jobDepartment||null,purpose:jobPurpose.trim(),responsibilities:asArray(jobResponsibilities),required_skills:asArray(jobSkills),objectives:asArray(jobObjectives),access_profile:jobAccess,status:"draft",created_by_profile_id:profileId,updated_by_profile_id:profileId}).select().single();
  if(error){toast.error("Fiche non enregistrée : "+error.message);return;}setJobTitle("");setJobDepartment("");setJobPurpose("");setJobResponsibilities("");setJobSkills("");setJobObjectives("");setJobOpen(false);toast.success("Fiche de poste créée en brouillon.");await load();
 };
 const publishJob=async(job:Row)=>{
  if(!canManageHR)return;
  const {error}=await (supabase as any).from("workspace_job_descriptions").update({status:"published",published_at:new Date().toISOString(),updated_by_profile_id:profileId,updated_at:new Date().toISOString(),version:(job.version||1)+1,access_profile:job.access_profile==="private"?"employee":job.access_profile}).eq("id",job.id);
  if(error){toast.error("Publication impossible : "+error.message);return;}toast.success("Fiche publiée.");await load();
 };
 const assignJobToStaff=async()=>{
  if(!canManageHR||!assignProfile||!assignJob||!profileId)return;
  const {error:closeError}=await (supabase as any).from("workspace_job_assignments").update({effective_to:new Date().toISOString().slice(0,10)}).eq("profile_id",assignProfile).is("effective_to",null);
  if(closeError){toast.error(closeError.message);return;}
  const {error}=await (supabase as any).from("workspace_job_assignments").insert({profile_id:assignProfile,job_description_id:assignJob,assigned_by_profile_id:profileId});
  if(error){toast.error("Affectation impossible : "+error.message);return;}setAssignJobOpen(false);toast.success("Fiche affectée au collaborateur.");await load();
 };
 const acknowledge=async(a:Row,response:"acknowledged"|"questions")=>{
  const {error}=await (supabase as any).from("workspace_job_assignments").update({acknowledgement:response,acknowledged_at:new Date().toISOString()}).eq("id",a.id).eq("profile_id",profileId);
  if(error){toast.error("Action non enregistrée : "+error.message);return;}toast.success(response==="acknowledged"?"Prise de connaissance enregistrée.":"Demande de clarification enregistrée.");await load();
 };
  const markRead=async(n:Row)=>{
  const {error}=await (supabase as any).from("workspace_notifications").update({read_at:new Date().toISOString()}).eq("id",n.id).eq("recipient_profile_id",profileId);
  if(error){toast.error(error.message);return;}await load();
 };
 const workspaceContent = <div className="mx-auto w-full min-w-0 max-w-7xl space-y-5 overflow-x-hidden p-3 pt-16 sm:p-4 md:p-6 md:pt-6">
  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-sm text-muted-foreground">AgriCapital 360</p><h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">Organisation & fiches de poste</h1></div><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?"mr-2 h-4 w-4 animate-spin":"mr-2 h-4 w-4"}/>Actualiser</Button></div>
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{tabs.map(t=><Button key={t.id} variant={tab===t.id?"default":"outline"} className="h-auto min-h-12 justify-start whitespace-normal px-3 py-2 text-left" onClick={()=>setTab(t.id)}><t.icon className="mr-2 h-4 w-4 shrink-0"/>{t.label}</Button>)}</div>
  {tab==="agenda"&&<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]"><div className="min-w-0"><Dialog open={eventOpen} onOpenChange={setEventOpen}><DialogTrigger asChild><Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4"/>Créer un événement ou une occupation</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Créer un événement ou une occupation</DialogTitle></DialogHeader><Card><CardContent className="space-y-3 pt-5"><div className="space-y-1"><Label>Titre</Label><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Visite terrain, absence, formation…"/></div><div className="space-y-1"><Label>Type</Label><Select value={eventType} onValueChange={setEventType}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["occupation","appointment","field_visit","training","travel","leave","absence","meeting","other"].map(x=><SelectItem key={x} value={x}>{({occupation:"Occupation",appointment:"Rendez-vous",field_visit:"Visite terrain",training:"Formation",travel:"Déplacement",leave:"Congé",absence:"Absence",meeting:"Réunion",other:"Autre"} as any)[x]}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Début</Label><Input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></div><div className="space-y-1"><Label>Fin</Label><Input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></div></div><div className="space-y-1"><Label>Description / lieu</Label><Textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3}/></div><Button className="w-full sm:w-auto" onClick={()=>void saveEvent()}><Plus className="mr-2 h-4 w-4"/>Enregistrer dans l’agenda</Button></CardContent></Card></DialogContent></Dialog></div><Card className="min-w-0"><CardHeader><CardTitle>Mes prochains événements</CardTitle></CardHeader><CardContent className="space-y-3">{events.filter(e=>e.created_by_profile_id===profileId||e.visibility==="team").filter(e=>e.status==="scheduled").map(e=><div key={e.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-2"><p className="font-medium">{e.title}</p><Badge variant="outline">{e.event_type}</Badge></div><p className="mt-1 text-sm text-muted-foreground"><Clock className="mr-1 inline h-3.5 w-3.5"/>{fmt(e.starts_at)} → {fmt(e.ends_at)}</p>{e.description&&<p className="mt-2 text-sm">{e.description}</p>}</div>)}{!events.length&&<p className="text-sm text-muted-foreground">Aucun événement chargé. Créez votre première occupation.</p>}</CardContent></Card></div>}
  {tab==="tasks"&&<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]"><div className="min-w-0"><Dialog open={taskOpen} onOpenChange={setTaskOpen}><DialogTrigger asChild><Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4"/>Nouvelle tâche</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Nouvelle tâche</DialogTitle></DialogHeader><Card><CardContent className="space-y-3 pt-5"><Label>Titre</Label><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Action à réaliser"/><Label>Description</Label><Textarea value={description} onChange={e=>setDescription(e.target.value)}/><Label>Priorité</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["low","normal","high","urgent"].map(x=><SelectItem key={x} value={x}>{({low:"Basse",normal:"Normale",high:"Haute",urgent:"Urgente"} as any)[x]}</SelectItem>)}</SelectContent></Select><Label>Échéance</Label><Input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/><Button className="w-full sm:w-auto" onClick={()=>void saveTask()}><Plus className="mr-2 h-4 w-4"/>Créer la tâche</Button></CardContent></Card></DialogContent></Dialog></div><Card className="min-w-0"><CardHeader><CardTitle>Tâches assignées ou créées</CardTitle></CardHeader><CardContent className="space-y-2">{tasks.filter(t=>t.created_by_profile_id===profileId||t.assigned_to_profile_id===profileId).map(t=><div key={t.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{t.title}</p><p className="text-sm text-muted-foreground">{t.description||"Sans description"} · Échéance : {fmt(t.due_at)}</p><Badge variant="outline">{t.priority} · {t.status}</Badge></div><Select value={t.status} onValueChange={v=>void updateTask(t,v)}><SelectTrigger className="w-full sm:w-40"><SelectValue/></SelectTrigger><SelectContent>{["todo","in_progress","blocked","done","cancelled"].map(x=><SelectItem key={x} value={x}>{({todo:"À faire",in_progress:"En cours",blocked:"Bloquée",done:"Terminée",cancelled:"Annulée"} as any)[x]}</SelectItem>)}</SelectContent></Select></div>)}{!tasks.length&&<p className="text-sm text-muted-foreground">Aucune tâche.</p>}</CardContent></Card></div>}
  {tab==="projects"&&<Card><CardHeader><CardTitle>Projets et espaces de collaboration</CardTitle></CardHeader><CardContent className="space-y-3">{projects.map(p=><div key={p.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="font-medium">{p.name}</p><Badge>{p.status}</Badge></div><p className="text-sm text-muted-foreground">{p.description||"Aucune description"} · Échéance : {p.due_on||"non définie"}</p></div>)}{!projects.length&&<p className="text-sm text-muted-foreground">Aucun projet enregistré.</p>}</CardContent></Card>}
  {tab==="job"&&<div className="space-y-4">{assignments.map(a=><Card key={a.id}><CardHeader><CardTitle>Ma fiche de poste : {a.workspace_job_descriptions?.title||"Fiche affectée"}</CardTitle></CardHeader><CardContent className="space-y-2"><p>{a.workspace_job_descriptions?.purpose}</p><p className="text-sm text-muted-foreground">Prise de connaissance : {a.acknowledgement} · Depuis le {a.effective_from}</p><div className="grid gap-3 sm:grid-cols-3"><div><p className="font-medium">Responsabilités</p><ul className="list-disc pl-5 text-sm">{(a.workspace_job_descriptions?.responsibilities||[]).map((v:string,i:number)=><li key={i}>{v}</li>)}</ul></div><div><p className="font-medium">Compétences</p><ul className="list-disc pl-5 text-sm">{(a.workspace_job_descriptions?.required_skills||[]).map((v:string,i:number)=><li key={i}>{v}</li>)}</ul></div><div><p className="font-medium">Objectifs</p><ul className="list-disc pl-5 text-sm">{(a.workspace_job_descriptions?.objectives||[]).map((v:string,i:number)=><li key={i}>{v}</li>)}</ul></div></div>{a.acknowledgement!=="acknowledged"&&<div className="flex flex-wrap gap-2 pt-2"><Button onClick={()=>void acknowledge(a,"acknowledged")}>J’ai pris connaissance</Button><Button variant="outline" onClick={()=>void acknowledge(a,"questions")}>Demander une clarification</Button></div>}</CardContent></Card>)}{!assignments.length&&<p className="rounded-lg border p-4 text-sm text-muted-foreground">Aucune fiche de poste affectée.</p>}
  {canManageHR&&<div><Dialog open={jobOpen} onOpenChange={setJobOpen}><DialogTrigger asChild><Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4"/>Créer une fiche de poste</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Créer une fiche de poste</DialogTitle></DialogHeader><Card><CardContent className="grid gap-3 pt-5 sm:grid-cols-2"><div><Label>Intitulé du poste</Label><Input value={jobTitle} onChange={e=>setJobTitle(e.target.value)} placeholder="Ex. Responsable commercial"/></div><div><Label>Département / service</Label><Input value={jobDepartment} onChange={e=>setJobDepartment(e.target.value)}/></div><div className="sm:col-span-2"><Label>Mission principale</Label><Textarea value={jobPurpose} onChange={e=>setJobPurpose(e.target.value)}/></div><div><Label>Responsabilités (une par ligne)</Label><Textarea value={jobResponsibilities} onChange={e=>setJobResponsibilities(e.target.value)}/></div><div><Label>Compétences requises (une par ligne)</Label><Textarea value={jobSkills} onChange={e=>setJobSkills(e.target.value)}/></div><div><Label>Objectifs / indicateurs (un par ligne)</Label><Textarea value={jobObjectives} onChange={e=>setJobObjectives(e.target.value)}/></div><div><Label>Visibilité après publication</Label><Select value={jobAccess} onValueChange={setJobAccess}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="private">Privée / affectation uniquement</SelectItem><SelectItem value="employee">Tous les collaborateurs</SelectItem><SelectItem value="manager">Managers</SelectItem><SelectItem value="hr">RH uniquement</SelectItem></SelectContent></Select></div><div className="sm:col-span-2"><Button onClick={()=>void saveJob()}><Plus className="mr-2 h-4 w-4"/>Enregistrer le brouillon</Button></div></CardContent></Card></DialogContent></Dialog></div>}
  {canManageHR&&<Card><CardHeader><CardTitle>Fiches de poste et publication</CardTitle></CardHeader><CardContent className="space-y-2">{jobs.map(j=><div key={j.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{j.title}</p><p className="text-sm text-muted-foreground">{j.department||"Service non défini"} · v{j.version} · {j.status}</p></div>{j.status!=="published"&&<Button variant="outline" onClick={()=>void publishJob(j)}>Publier</Button>}</div>)}</CardContent></Card>}
  {canManageHR&&<Dialog open={assignJobOpen} onOpenChange={setAssignJobOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4"/>Affecter une fiche de poste</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><Card><CardHeader><CardTitle>Affecter une fiche à un collaborateur</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><div><Label>Collaborateur</Label><Select value={assignProfile} onValueChange={setAssignProfile}><SelectTrigger><SelectValue placeholder="Choisir"/></SelectTrigger><SelectContent>{staff.map(s=><SelectItem key={s.id} value={s.id}>{formatUserShortName(s.nom_complet)}</SelectItem>)}</SelectContent></Select></div><div><Label>Fiche publiée ou brouillon</Label><Select value={assignJob} onValueChange={setAssignJob}><SelectTrigger><SelectValue placeholder="Choisir une fiche"/></SelectTrigger><SelectContent>{jobs.map(j=><SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}</SelectContent></Select></div><div className="flex items-end"><Button onClick={()=>void assignJobToStaff()} disabled={!assignProfile||!assignJob}>Affecter la fiche</Button></div></CardContent></Card></DialogContent></Dialog>}</div>}
  {tab==="org"&&<div className="space-y-4"><Card><CardHeader><CardTitle>Organigramme automatique</CardTitle></CardHeader><CardContent>{loading?<p className="py-6 text-center text-sm text-muted-foreground">Chargement de l’organigramme…</p>:<OrganizationTree items={org.filter(o=>canManageHR||o.profile_id===profileId||o.manager_profile_id===profileId)} />}{!loading&&!org.length&&<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun collaborateur actif ne correspond aux données disponibles.</p>}</CardContent></Card></div>}

  {tab==="notifications"&&<Card><CardHeader><CardTitle>Centre de notifications</CardTitle></CardHeader><CardContent className="space-y-2">{notifications.map(n=><div key={n.id} className="flex items-start justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{n.title}</p><p className="text-sm text-muted-foreground">{n.body||n.notification_type} · {fmt(n.created_at)}</p>{n.read_at&&<Badge variant="outline">Lue</Badge>}</div>{!n.read_at&&<Button size="sm" variant="outline" onClick={()=>void markRead(n)}>Marquer comme lue</Button>}</div>)}{!notifications.length&&<p className="text-sm text-muted-foreground">Aucune notification.</p>}</CardContent></Card>}
 </div>;
  return embedded ? workspaceContent : <ProtectedRoute><MainLayout>{workspaceContent}</MainLayout></ProtectedRoute>;
}
