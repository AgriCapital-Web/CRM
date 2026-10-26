import { useCallback, useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
function OrganizationAvatar({photoUrl,name}:{photoUrl?:string|null;name:string}) {
 const signedPhoto=useSignedUrl("photos-profils",photoUrl||null);
 return <div className="flex w-16 shrink-0 flex-col items-center gap-1" title={name} aria-label={name}><Avatar className="h-14 w-14 border-2 border-background shadow-sm"><AvatarImage src={signedPhoto||undefined} alt={signedPhoto?name:""}/><AvatarFallback><Network className="h-6 w-6 text-primary"/></AvatarFallback></Avatar>{!signedPhoto&&<span className="w-full text-center text-xs font-medium leading-tight">{name}</span>}</div>
}

function OrganizationTree({items}:{items:Row[]}) {
 const ids=new Set(items.map(item=>String(item.profile_id||item.id)));
 const roots=items.filter(item=>!item.manager_profile_id||!ids.has(String(item.manager_profile_id)));
 const displayRoots=roots.length?roots:items;
 return <div className="space-y-4">{displayRoots.map(node=><OrganizationNode key={String(node.profile_id||node.id)} node={node} items={items} ancestors={[]}/>)}</div>;
}
function OrganizationNode({node,items,ancestors}:{node:Row;items:Row[];ancestors:string[]}) {
 const id=String(node.profile_id||node.id);
 const nextAncestors=[...ancestors,id];
 const children=items.filter(item=>String(item.manager_profile_id||"")===id&&!ancestors.includes(String(item.profile_id||item.id)));
 return <div className="min-w-0">
  <div className="relative min-w-0 overflow-hidden rounded-xl border bg-card p-4 shadow-sm">
   <div className="absolute inset-x-0 top-0 h-1" style={{background:node.role_level<=1?"#166534":node.role_level<=3?"#2563eb":node.role_level===4?"#d97706":"#0f766e"}}/>
   <div className="flex items-start gap-3 pt-1"><OrganizationAvatar photoUrl={node.employee_photo_url} name={node.employee_name||"Collaborateur"}/><div className="min-w-0 flex-1">
    <p className="text-sm font-semibold">{node.role_name||"Rôle non défini"}</p>
    <p className="mt-1 text-xs text-muted-foreground">{node.team_name||"Équipe non définie"}{node.region_name?" · "+node.region_name:""}{node.district_name?" · "+node.district_name:""}</p>
    <div className="mt-2 flex flex-wrap gap-1">{node.rattachement_a_verifier&&<Badge variant="destructive">Rattachement à vérifier</Badge>}</div>
   </div></div>
  </div>
  {children.length>0&&<div className="ml-4 mt-3 space-y-3 border-l-2 border-primary/30 pl-4 sm:ml-8 sm:pl-6">{children.map(child=><OrganizationNode key={String(child.profile_id||child.id)} node={child} items={items} ancestors={nextAncestors}/>)}</div>}
 </div>;
}

export default function Workspace360({ embedded = false }: { embedded?: boolean } = {}) {
 const {user,profile,userRoles}=useAuth();
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
 const roleSet=useMemo(()=>userRoles.map(r=>r.toLowerCase()),[userRoles]);
 const canManageHR=roleSet.some(r=>["rh","responsable_rh","ressources_humaines","admin","administrateur","pdg","dg","directeur_general","directeur général"].includes(r));
 const canManageTasks=canManageHR||roleSet.some(r=>r.includes("manager")||r.includes("responsable")||r.includes("chef"));
 const load=useCallback(async()=>{
   if(!user?.id)return;
   setLoading(true);
   try {
    let pid=profile?.id as string|undefined;
    if(!pid){const {data}=await (supabase as any).from("profiles").select("id").eq("user_id",user.id).maybeSingle();pid=data?.id;}
    if(!pid)throw new Error("Profil collaborateur introuvable.");
    setProfileId(pid);
    const [e,t,p,j,a,o,n,s]=await Promise.all([
      (supabase as any).from("workspace_events").select("*").order("starts_at",{ascending:true}).limit(200),
      (supabase as any).from("workspace_tasks").select("*").order("due_at",{ascending:true}).limit(200),
      (supabase as any).from("workspace_projects").select("*").order("updated_at",{ascending:false}).limit(100),
      (supabase as any).from("workspace_job_descriptions").select("*").order("updated_at",{ascending:false}).limit(200),
      (supabase as any).from("workspace_job_assignments").select("*,workspace_job_descriptions(*)").eq("profile_id",pid).is("effective_to",null),
      (supabase as any).from("v_workspace_organization_chart").select("*").order("role_level",{ascending:true}).order("employee_name",{ascending:true}).limit(500),
      (supabase as any).from("workspace_notifications").select("*").eq("recipient_profile_id",pid).order("created_at",{ascending:false}).limit(100),
      canManageHR ? (supabase as any).from("profiles").select("id,nom_complet,email,equipe_id").eq("actif",true).order("nom_complet") : Promise.resolve({data:[]})
    ]);
    for(const [name,result] of [["agenda",e],["tâches",t],["projets",p],["fiches de poste",j],["affectations",a],["organigramme",o],["notifications",n],["collaborateurs",s]] as any){
      if(result.error)throw new Error("Chargement "+name+" : "+result.error.message);
    }
    setEvents(e.data||[]);setTasks(t.data||[]);setProjects(p.data||[]);setJobs(j.data||[]);setAssignments(a.data||[]);setOrg(o.data||[]);setNotifications(n.data||[]);setStaff(s.data||[]);
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
  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-sm text-muted-foreground">AgriCapital 360</p><h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">Organisation & fiches de poste</h1><p className="text-sm text-muted-foreground">Les événements, tâches, projets et notifications sont centralisés dans Pilotage & agenda. Cette section est réservée à l’organigramme et aux fiches de poste.</p></div><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?"mr-2 h-4 w-4 animate-spin":"mr-2 h-4 w-4"}/>Actualiser</Button></div>
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{tabs.map(t=><Button key={t.id} variant={tab===t.id?"default":"outline"} className="h-auto min-h-12 justify-start whitespace-normal px-3 py-2 text-left" onClick={()=>setTab(t.id)}><t.icon className="mr-2 h-4 w-4 shrink-0"/>{t.label}</Button>)}</div>
  {tab==="agenda"&&<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]"><div className="min-w-0"><Dialog open={eventOpen} onOpenChange={setEventOpen}><DialogTrigger asChild><Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4"/>Créer un événement ou une occupation</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Créer un événement ou une occupation</DialogTitle></DialogHeader><Card><CardContent className="space-y-3 pt-5"><div className="space-y-1"><Label>Titre</Label><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Visite terrain, absence, formation…"/></div><div className="space-y-1"><Label>Type</Label><Select value={eventType} onValueChange={setEventType}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["occupation","appointment","field_visit","training","travel","leave","absence","meeting","other"].map(x=><SelectItem key={x} value={x}>{({occupation:"Occupation",appointment:"Rendez-vous",field_visit:"Visite terrain",training:"Formation",travel:"Déplacement",leave:"Congé",absence:"Absence",meeting:"Réunion",other:"Autre"} as any)[x]}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Début</Label><Input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></div><div className="space-y-1"><Label>Fin</Label><Input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></div></div><div className="space-y-1"><Label>Description / lieu</Label><Textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3}/></div><Button className="w-full sm:w-auto" onClick={()=>void saveEvent()}><Plus className="mr-2 h-4 w-4"/>Enregistrer dans l’agenda</Button></CardContent></Card></DialogContent></Dialog></div><Card className="min-w-0"><CardHeader><CardTitle>Mes prochains événements</CardTitle></CardHeader><CardContent className="space-y-3">{events.filter(e=>e.created_by_profile_id===profileId||e.visibility==="team").filter(e=>e.status==="scheduled").map(e=><div key={e.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-2"><p className="font-medium">{e.title}</p><Badge variant="outline">{e.event_type}</Badge></div><p className="mt-1 text-sm text-muted-foreground"><Clock className="mr-1 inline h-3.5 w-3.5"/>{fmt(e.starts_at)} → {fmt(e.ends_at)}</p>{e.description&&<p className="mt-2 text-sm">{e.description}</p>}</div>)}{!events.length&&<p className="text-sm text-muted-foreground">Aucun événement chargé. Créez votre première occupation.</p>}</CardContent></Card></div>}
  {tab==="tasks"&&<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]"><div className="min-w-0"><Dialog open={taskOpen} onOpenChange={setTaskOpen}><DialogTrigger asChild><Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4"/>Nouvelle tâche</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Nouvelle tâche</DialogTitle></DialogHeader><Card><CardContent className="space-y-3 pt-5"><Label>Titre</Label><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Action à réaliser"/><Label>Description</Label><Textarea value={description} onChange={e=>setDescription(e.target.value)}/><Label>Priorité</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["low","normal","high","urgent"].map(x=><SelectItem key={x} value={x}>{({low:"Basse",normal:"Normale",high:"Haute",urgent:"Urgente"} as any)[x]}</SelectItem>)}</SelectContent></Select><Label>Échéance</Label><Input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/><Button className="w-full sm:w-auto" onClick={()=>void saveTask()}><Plus className="mr-2 h-4 w-4"/>Créer la tâche</Button></CardContent></Card></DialogContent></Dialog></div><Card className="min-w-0"><CardHeader><CardTitle>Tâches assignées ou créées</CardTitle></CardHeader><CardContent className="space-y-2">{tasks.filter(t=>t.created_by_profile_id===profileId||t.assigned_to_profile_id===profileId).map(t=><div key={t.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{t.title}</p><p className="text-sm text-muted-foreground">{t.description||"Sans description"} · Échéance : {fmt(t.due_at)}</p><Badge variant="outline">{t.priority} · {t.status}</Badge></div><Select value={t.status} onValueChange={v=>void updateTask(t,v)}><SelectTrigger className="w-full sm:w-40"><SelectValue/></SelectTrigger><SelectContent>{["todo","in_progress","blocked","done","cancelled"].map(x=><SelectItem key={x} value={x}>{({todo:"À faire",in_progress:"En cours",blocked:"Bloquée",done:"Terminée",cancelled:"Annulée"} as any)[x]}</SelectItem>)}</SelectContent></Select></div>)}{!tasks.length&&<p className="text-sm text-muted-foreground">Aucune tâche.</p>}</CardContent></Card></div>}
  {tab==="projects"&&<Card><CardHeader><CardTitle>Projets et espaces de collaboration</CardTitle></CardHeader><CardContent className="space-y-3">{projects.map(p=><div key={p.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="font-medium">{p.name}</p><Badge>{p.status}</Badge></div><p className="text-sm text-muted-foreground">{p.description||"Aucune description"} · Échéance : {p.due_on||"non définie"}</p></div>)}{!projects.length&&<p className="text-sm text-muted-foreground">Aucun projet n’est encore enregistré. Les projets seront créés ici après l’ajout du formulaire de gestion des espaces et des membres.</p>}</CardContent></Card>}
  {tab==="job"&&<div className="space-y-4">{assignments.map(a=><Card key={a.id}><CardHeader><CardTitle>Ma fiche de poste : {a.workspace_job_descriptions?.title||"Fiche affectée"}</CardTitle></CardHeader><CardContent className="space-y-2"><p>{a.workspace_job_descriptions?.purpose}</p><p className="text-sm text-muted-foreground">Prise de connaissance : {a.acknowledgement} · Depuis le {a.effective_from}</p><div className="grid gap-3 sm:grid-cols-3"><div><p className="font-medium">Responsabilités</p><ul className="list-disc pl-5 text-sm">{(a.workspace_job_descriptions?.responsibilities||[]).map((v:string,i:number)=><li key={i}>{v}</li>)}</ul></div><div><p className="font-medium">Compétences</p><ul className="list-disc pl-5 text-sm">{(a.workspace_job_descriptions?.required_skills||[]).map((v:string,i:number)=><li key={i}>{v}</li>)}</ul></div><div><p className="font-medium">Objectifs</p><ul className="list-disc pl-5 text-sm">{(a.workspace_job_descriptions?.objectives||[]).map((v:string,i:number)=><li key={i}>{v}</li>)}</ul></div></div>{a.acknowledgement!=="acknowledged"&&<div className="flex flex-wrap gap-2 pt-2"><Button onClick={()=>void acknowledge(a,"acknowledged")}>J’ai pris connaissance</Button><Button variant="outline" onClick={()=>void acknowledge(a,"questions")}>Demander une clarification</Button></div>}</CardContent></Card>)}{!assignments.length&&<p className="rounded-lg border p-4 text-sm text-muted-foreground">Aucune fiche de poste ne vous a encore été affectée. Seules les fiches publiées et les fiches explicitement affectées à votre profil seront visibles.</p>}
  {canManageHR&&<div><Dialog open={jobOpen} onOpenChange={setJobOpen}><DialogTrigger asChild><Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4"/>Créer une fiche de poste</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Créer une fiche de poste</DialogTitle></DialogHeader><Card><CardContent className="grid gap-3 pt-5 sm:grid-cols-2"><div><Label>Intitulé du poste</Label><Input value={jobTitle} onChange={e=>setJobTitle(e.target.value)} placeholder="Ex. Responsable commercial"/></div><div><Label>Département / service</Label><Input value={jobDepartment} onChange={e=>setJobDepartment(e.target.value)}/></div><div className="sm:col-span-2"><Label>Mission principale</Label><Textarea value={jobPurpose} onChange={e=>setJobPurpose(e.target.value)}/></div><div><Label>Responsabilités (une par ligne)</Label><Textarea value={jobResponsibilities} onChange={e=>setJobResponsibilities(e.target.value)}/></div><div><Label>Compétences requises (une par ligne)</Label><Textarea value={jobSkills} onChange={e=>setJobSkills(e.target.value)}/></div><div><Label>Objectifs / indicateurs (un par ligne)</Label><Textarea value={jobObjectives} onChange={e=>setJobObjectives(e.target.value)}/></div><div><Label>Visibilité après publication</Label><Select value={jobAccess} onValueChange={setJobAccess}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="private">Privée / affectation uniquement</SelectItem><SelectItem value="employee">Tous les collaborateurs</SelectItem><SelectItem value="manager">Managers</SelectItem><SelectItem value="hr">RH uniquement</SelectItem></SelectContent></Select></div><div className="sm:col-span-2"><Button onClick={()=>void saveJob()}><Plus className="mr-2 h-4 w-4"/>Enregistrer le brouillon</Button></div></CardContent></Card></DialogContent></Dialog></div>}
  {canManageHR&&<Card><CardHeader><CardTitle>Fiches de poste et publication</CardTitle></CardHeader><CardContent className="space-y-2">{jobs.map(j=><div key={j.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{j.title}</p><p className="text-sm text-muted-foreground">{j.department||"Service non défini"} · v{j.version} · {j.status}</p></div>{j.status!=="published"&&<Button variant="outline" onClick={()=>void publishJob(j)}>Publier</Button>}</div>)}</CardContent></Card>}
  {canManageHR&&<Dialog open={assignJobOpen} onOpenChange={setAssignJobOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4"/>Affecter une fiche de poste</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><Card><CardHeader><CardTitle>Affecter une fiche à un collaborateur</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><div><Label>Collaborateur</Label><Select value={assignProfile} onValueChange={setAssignProfile}><SelectTrigger><SelectValue placeholder="Choisir"/></SelectTrigger><SelectContent>{staff.map(s=><SelectItem key={s.id} value={s.id}>{s.nom_complet}</SelectItem>)}</SelectContent></Select></div><div><Label>Fiche publiée ou brouillon</Label><Select value={assignJob} onValueChange={setAssignJob}><SelectTrigger><SelectValue placeholder="Choisir une fiche"/></SelectTrigger><SelectContent>{jobs.map(j=><SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}</SelectContent></Select></div><div className="flex items-end"><Button onClick={()=>void assignJobToStaff()} disabled={!assignProfile||!assignJob}>Affecter la fiche</Button></div></CardContent></Card></DialogContent></Dialog>}</div>}
  {tab==="org"&&<div className="space-y-4"><Card><CardHeader><CardTitle>Organigramme automatique</CardTitle><p className="text-sm text-muted-foreground">Rattachements calculés depuis les rôles principaux, les équipes et les zones configurés dans Paramètres. Aucune liaison manuelle n’est requise ici.</p></CardHeader><CardContent>{loading?<p className="py-6 text-center text-sm text-muted-foreground">Chargement de l’organigramme…</p>:<OrganizationTree items={org.filter(o=>canManageHR||o.profile_id===profileId||o.manager_profile_id===profileId)} />}{!loading&&!org.length&&<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun collaborateur actif ne correspond aux données disponibles.</p>}</CardContent></Card></div>}

  {tab==="notifications"&&<Card><CardHeader><CardTitle>Centre de notifications</CardTitle></CardHeader><CardContent className="space-y-2">{notifications.map(n=><div key={n.id} className="flex items-start justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{n.title}</p><p className="text-sm text-muted-foreground">{n.body||n.notification_type} · {fmt(n.created_at)}</p>{n.read_at&&<Badge variant="outline">Lue</Badge>}</div>{!n.read_at&&<Button size="sm" variant="outline" onClick={()=>void markRead(n)}>Marquer comme lue</Button>}</div>)}{!notifications.length&&<p className="text-sm text-muted-foreground">Aucune notification.</p>}</CardContent></Card>}
 </div>;
  return embedded ? workspaceContent : <ProtectedRoute><MainLayout>{workspaceContent}</MainLayout></ProtectedRoute>;
}
