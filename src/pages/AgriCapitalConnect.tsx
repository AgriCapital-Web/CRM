import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Check, Clock3, Files, Loader2, MessageCircle, Paperclip, Plus, Send, ShieldCheck, Users, Video } from "lucide-react";
import { toast } from "sonner";

type Conversation = { id: string; conversation_type: "direct" | "group" | "channel"; title: string | null; last_message_at: string; created_by_profile_id: string };
type Message = { id: string; conversation_id: string; sender_profile_id: string; body: string; created_at: string; edited_at: string | null; message_type: string };
type Staff = { id: string; nom_complet: string; email: string | null; poste: string | null; role_codes?: string[]; role_names?: string[] };
type StaffRole = { code: string; nom: string; court: string | null };
type Meeting = { id: string; title: string; description: string | null; agenda: string | null; starts_at: string; ends_at: string; status: string; provider: string; join_url: string | null; created_by_profile_id: string };
type MessageAttachment = { id: string; message_id: string; file_name: string; mime_type: string | null; storage_path: string; url?: string };

const dateLabel = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join("").toUpperCase();

export default function AgriCapitalConnect() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { can } = usePermissions();
  const profileId = profile?.id as string | undefined;
  const [tab, setTab] = useState("messages");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageAttachments, setMessageAttachments] = useState<Record<string, MessageAttachment[]>>({});
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffRoles, setStaffRoles] = useState<StaffRole[]>([]);
  const [staffTeams, setStaffTeams] = useState<StaffTeam[]>([]);
  const [newTeams, setNewTeams] = useState<string[]>([]);
  const [meetingTeams, setMeetingTeams] = useState<string[]>([]);
  const [newRoleFilter, setNewRoleFilter] = useState("");
  const [meetingRoleFilter, setMeetingRoleFilter] = useState("");
  const [messageFile, setMessageFile] = useState<File | null>(null);
  const [meetingFiles, setMeetingFiles] = useState<File[]>([]);
  const [meetingAudience, setMeetingAudience] = useState<"selected" | "all">("selected");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<"direct" | "group" | "channel">("direct");
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [newRoles, setNewRoles] = useState<string[]>([]);
  const [meetingRoles, setMeetingRoles] = useState<string[]>([]);
  const [meetingAttachments, setMeetingAttachments] = useState<Record<string, any[]>>({});
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingStart, setMeetingStart] = useState("");
  const [meetingEnd, setMeetingEnd] = useState("");
  const [meetingAgenda, setMeetingAgenda] = useState("");
  const [meetingDescription, setMeetingDescription] = useState("");
  const [meetingMembers, setMeetingMembers] = useState<string[]>([]);

  const loadConversations = useCallback(async () => {
    if (!profileId) return;
    const { data, error } = await (supabase as any).from("internal_conversations")
      .select("id,conversation_type,title,last_message_at,created_by_profile_id,internal_conversation_members!inner(profile_id)")
      .eq("internal_conversation_members.profile_id", profileId)
      .order("last_message_at", { ascending: false });
    if (error) { console.error(error); toast.error("Impossible de charger les conversations."); return; }
    const rows = (data || []).map((row: any) => ({ ...row, internal_conversation_members: undefined })) as Conversation[];
    setConversations(rows);
    if (!selected && rows[0]?.id) setSelected(rows[0].id);
  }, [profileId, selected]);

  const loadStaff = useCallback(async () => {
    const [{ data, error }, { data: roleData, error: roleError }, { data: teamData, error: teamError }] = await Promise.all([
      (supabase as any).rpc("workspace_list_collaborators_with_roles"),
      (supabase as any).rpc("workspace_list_roles"),
      (supabase as any).rpc("workspace_list_teams_with_members"),
    ]);
    if (error) { console.error(error); setStaff([]); } else setStaff((data || []) as Staff[]);
    if (roleError) { console.error(roleError); setStaffRoles([]); } else setStaffRoles((roleData || []) as StaffRole[]);
    if (teamError) { console.error(teamError); setStaffTeams([]); } else setStaffTeams((teamData || []) as StaffTeam[]);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!conversationId) { setMessages([]); return; }
    const { data, error } = await (supabase as any).from("internal_messages")
      .select("id,conversation_id,sender_profile_id,body,created_at,edited_at,message_type")
      .eq("conversation_id", conversationId).is("deleted_at", null).order("created_at", { ascending: true }).limit(500);
    if (error) { console.error(error); setMessages([]); return; }
    const rows = (data || []) as Message[];
    setMessages(rows);
    const messageIds = rows.map(m => m.id);
    if (messageIds.length) {
      const { data: files, error: filesError } = await (supabase as any).from("internal_message_attachments").select("id,message_id,storage_path,file_name,mime_type,file_size").in("message_id", messageIds);
      if (filesError) console.warn("Pièces jointes indisponibles", filesError);
      const grouped: Record<string, any[]> = {};
      for (const file of files || []) {
        const { data: signed } = await supabase.storage.from("workspace-attachments").createSignedUrl(file.storage_path, 3600);
        (grouped[file.message_id] ||= []).push({ ...file, url: signed?.signedUrl || null });
      }
      setMessageAttachments(grouped);
    } else setMessageAttachments({});
    if (profileId) {
      const now = new Date().toISOString();
      const receipts = rows.filter(m => m.sender_profile_id !== profileId).map(m => ({ message_id: m.id, profile_id: profileId, delivered_at: now, read_at: now }));
      if (receipts.length) {
        const { error: receiptError } = await (supabase as any).from("internal_message_receipts").upsert(receipts, { onConflict: "message_id,profile_id" });
        if (receiptError) console.warn("Receipt de lecture non enregistré", receiptError);
      }
      await (supabase as any).from("internal_conversation_members").update({ last_read_at: now }).eq("conversation_id", conversationId).eq("profile_id", profileId);
    }
  }, [profileId]);

  const loadMeetings = useCallback(async () => {
    const { data, error } = await (supabase as any).from("internal_meetings")
      .select("id,title,description,agenda,starts_at,ends_at,status,provider,join_url,created_by_profile_id")
      .order("starts_at", { ascending: true }).limit(100);
    if (error) { console.error(error); setMeetings([]); return; }
    const rows = (data || []) as Meeting[];
    setMeetings(rows);
    const ids = rows.map(m => m.id);
    if (ids.length) {
      const { data: files, error: filesError } = await (supabase as any).from("internal_meeting_attachments").select("id,meeting_id,storage_path,file_name,mime_type,file_size").in("meeting_id", ids);
      if (filesError) console.warn("Documents de réunion indisponibles", filesError);
      const grouped: Record<string, any[]> = {};
      for (const file of files || []) {
        const { data: signed } = await supabase.storage.from("workspace-attachments").createSignedUrl(file.storage_path, 3600);
        (grouped[file.meeting_id] ||= []).push({ ...file, url: signed?.signedUrl || null });
      }
      setMeetingAttachments(grouped);
    } else setMeetingAttachments({});
  }, []);

  useEffect(() => {
    if (!can("messagerie.view") || !profileId) { setLoading(false); return; }
    let alive = true;
    void Promise.all([loadConversations(), loadStaff(), loadMeetings()]).finally(() => { if (alive) setLoading(false); });
    const channel = supabase.channel("agricapital-connect-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_messages" }, (payload: any) => {
        if (payload.new?.conversation_id && payload.new.conversation_id === selected) void loadMessages(selected);
        void loadConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_conversations" }, () => void loadConversations())
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_meetings" }, () => void loadMeetings())
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [can, profileId, selected, loadConversations, loadStaff, loadMeetings, loadMessages]);

  useEffect(() => { if (selected) void loadMessages(selected); else setMessages([]); }, [selected, loadMessages]);

  const visibleConversations = useMemo(() => conversations.filter(c => (c.title || (c.conversation_type === "direct" ? "Conversation privée" : c.conversation_type === "group" ? "Groupe" : "Canal")).toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"))), [conversations, search]);
  const selectedConversation = conversations.find(c => c.id === selected);

  const createConversation = async () => {
    if (!profileId) return;
    const roleMembers = staff.filter(s => (s.role_codes || []).some(role => newRoles.includes(role))).map(s => s.id);
    const teamMembers = staffTeams.filter(team => newTeams.includes(team.id)).flatMap(team => team.member_profile_ids || []);
    const targets = Array.from(new Set([profileId, ...newMembers, ...roleMembers, ...teamMembers]));
    if (newKind === "direct" && targets.length !== 2) { toast.error("Sélectionnez un autre utilisateur."); return; }
    if (newKind !== "direct" && targets.length < 2) { toast.error("Ajoutez au moins un autre utilisateur."); return; }
    const { data, error } = await (supabase as any).rpc("internal_create_conversation", {
      p_conversation_type: newKind,
      p_title: newKind === "direct" ? (staff.find(s => s.id === newMembers[0])?.nom_complet || null) : (newTitle.trim() || null),
      p_member_profile_ids: Array.from(new Set([...newMembers, ...roleMembers])),
    });
    const conv = Array.isArray(data) ? data[0] : data;
    if (error || !conv) { console.error(error); toast.error(error?.message || "Création impossible. Vérifiez les participants sélectionnés."); return; }
    setConversations(current => [conv, ...current.filter(c => c.id !== conv.id)]);
    setSelected(conv.id); setNewTitle(""); setNewMembers([]); setNewRoles([]); setNewRoleFilter(""); setCreateOpen(false);
    toast.success("Conversation créée.");
  };

  const sendMessage = async () => {
    if (!profileId || !selected || (!draft.trim() && !messageFile) || sending) return;
    setSending(true);
    let uploadedPath: string | null = null;
    try {
      if (messageFile) {
        const safeName = messageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        uploadedPath = `${profileId}/messages/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await (supabase as any).storage.from("workspace-attachments").upload(uploadedPath, messageFile, { contentType: messageFile.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;
      }
      const body = draft.trim() || (messageFile ? `Pièce jointe : ${messageFile.name}` : "");
      const { data: msg, error } = await (supabase as any).from("internal_messages").insert({ conversation_id: selected, sender_profile_id: profileId, body, message_type: messageFile ? "file" : "text" }).select("id").single();
      if (error || !msg) throw error || new Error("Message non confirmé.");
      if (messageFile && uploadedPath) {
        const { error: metadataError } = await (supabase as any).from("internal_message_attachments").insert({ message_id: msg.id, conversation_id: selected, uploaded_by_profile_id: profileId, storage_path: uploadedPath, file_name: messageFile.name, mime_type: messageFile.type || null, file_size: messageFile.size });
        if (metadataError) throw metadataError;
      }
      setDraft(""); setMessageFile(null);
      await loadMessages(selected);
    } catch (error) {
      if (uploadedPath) await (supabase as any).storage.from("workspace-attachments").remove([uploadedPath]);
      console.error(error); toast.error("Le message ou le fichier n’a pas pu être envoyé. Vérifiez les droits et le format du fichier.");
    } finally { setSending(false); }
  };

  const startVideoCall = async () => {
    if (!profileId || !selected) { toast.error("Ouvrez une conversation avant de lancer un appel."); return; }
    const roomToken = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    const joinUrl = `https://meet.jit.si/AgriCapital-${roomToken}`;
    window.open(joinUrl, "_blank", "noopener,noreferrer");
    const { error } = await (supabase as any).from("internal_messages").insert({
      conversation_id: selected,
      sender_profile_id: profileId,
      body: `Appel audio/vidéo AgriCapital — rejoignez ici : ${joinUrl}`,
    });
    if (error) {
      toast.error("L'appel s'ouvre, mais le lien n'a pas pu être partagé dans la conversation.");
      console.error(error);
      return;
    }
    await loadMessages(selected);
    toast.success("Appel audio/vidéo lancé et lien partagé.");
  };

  const createMeeting = async () => {
    if (!profileId || !meetingTitle.trim() || !meetingStart || !meetingEnd || new Date(meetingEnd) <= new Date(meetingStart)) {
      toast.error("Renseignez un titre et des horaires valides."); return;
    }
    const roomToken = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    const joinUrl = `https://meet.jit.si/AgriCapital-${roomToken}`;
    const roleMembers = staff.filter(s => (s.role_codes || []).some(role => meetingRoles.includes(role))).map(s => s.id);
    const teamMembers = staffTeams.filter(team => meetingTeams.includes(team.id)).flatMap(team => team.member_profile_ids || []);
    const participantIds = Array.from(new Set([...meetingMembers, ...roleMembers, ...teamMembers]));
    const { data: created, error } = await (supabase as any).rpc("internal_create_meeting", {
      p_title: meetingTitle.trim(),
      p_description: meetingDescription.trim() || null,
      p_agenda: meetingAgenda.trim() || null,
      p_starts_at: new Date(meetingStart).toISOString(),
      p_ends_at: new Date(meetingEnd).toISOString(),
      p_provider_room_id: roomToken,
      p_join_url: joinUrl,
      p_participant_profile_ids: participantIds,
    });
    const meeting = Array.isArray(created) ? created[0] : created;
    if (error || !meeting?.id) { toast.error(error?.message || "Réunion non créée. Vérifiez les horaires et les participants."); console.error(error); return; }
    const meetingId = meeting.id;
    let attachmentsFailed = false;
    for (const file of meetingFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${profileId}/meetings/${meetingId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await (supabase as any).storage.from("workspace-attachments").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploadError) { attachmentsFailed = true; console.error(uploadError); continue; }
      const { error: metadataError } = await (supabase as any).from("internal_meeting_attachments").insert({ meeting_id: meetingId, uploaded_by_profile_id: profileId, storage_path: path, file_name: file.name, mime_type: file.type || null, file_size: file.size });
      if (metadataError) { attachmentsFailed = true; console.error(metadataError); await (supabase as any).storage.from("workspace-attachments").remove([path]); }
    }
    setMeetingOpen(false); setMeetingTitle(""); setMeetingStart(""); setMeetingEnd(""); setMeetingAgenda(""); setMeetingDescription(""); setMeetingMembers([]); setMeetingRoles([]); setMeetingTeams([]); setMeetingFiles([]); setMeetingRoleFilter(""); setMeetingAudience("selected");
    await loadMeetings();
    if (!attachmentsFailed) toast.success("Réunion planifiée avec invitations enregistrées.");
    else if (attachmentsFailed) toast.error("La réunion est planifiée, mais certains fichiers n’ont pas été joints.");

  };

  if (!can("messagerie.view")) {
    return <ProtectedRoute requiredPermission={"messagerie.view" as any}><MainLayout><Card><CardContent className="p-6 text-center">Accès non autorisé.</CardContent></Card></MainLayout></ProtectedRoute>;
  }

  return (
    <ProtectedRoute requiredPermission={"messagerie.view" as any}>
      <MainLayout>
        <main className="mx-auto w-full min-w-0 max-w-[1600px] space-y-4 overflow-x-hidden p-3 pb-8 pt-16 md:p-6 md:pt-6">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><MessageCircle className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold sm:text-3xl">Espace de travail & communication</h1></div>
              <p className="mt-1 text-sm text-muted-foreground">Documents partagés, outils de travail, messagerie interne et réunions d’équipe regroupés ici.</p>
            </div>
            <Badge variant="outline" className="w-fit gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Espace interne sécurisé</Badge>
          </header>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="outline" className="h-auto min-h-12 justify-start whitespace-normal text-left" onClick={() => navigate("/espace-travail")}><Files className="mr-2 h-4 w-4 shrink-0" />Documents, tableurs et présentations</Button>
            <Button variant="outline" className="h-auto min-h-12 justify-start whitespace-normal text-left" onClick={() => setTab("meetings")}><CalendarDays className="mr-2 h-4 w-4 shrink-0" />Agenda et réunions internes</Button>
          </div>
          <Tabs value={tab} onValueChange={setTab} className="min-w-0">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:w-fit">
              <TabsTrigger value="messages" className="gap-2"><MessageCircle className="h-4 w-4" />Messages internes</TabsTrigger>
              <TabsTrigger value="meetings" className="gap-2"><CalendarDays className="h-4 w-4" />Agenda & réunions</TabsTrigger>
            </TabsList>
            <TabsContent value="messages" className="mt-3 min-w-0">
              <div className="grid min-w-0 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
                <Card className={selected ? "hidden min-w-0 lg:block" : "min-w-0"}>
                  <CardHeader className="space-y-3 p-3 sm:p-4"><div className="flex items-center justify-between gap-2"><CardTitle className="text-base">Conversations</CardTitle><Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger asChild><Button size="icon" variant="outline" aria-label="Nouvelle conversation"><Plus className="h-4 w-4" /></Button></DialogTrigger><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Nouvelle conversation</DialogTitle></DialogHeader><div className="space-y-3"><div className="space-y-1"><Label>Type</Label><Select value={newKind} onValueChange={(v: any) => setNewKind(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="direct">Privée</SelectItem><SelectItem value="group">Groupe</SelectItem><SelectItem value="channel">Canal d'équipe</SelectItem></SelectContent></Select></div>{newKind !== "direct" && <div className="space-y-1"><Label>Nom du groupe / canal</Label><Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ex. Direction, Terrain, Finance" /> </div>}{newKind !== "direct" && <div className="space-y-1"><Label>Ajouter une équipe par rôle</Label><Select value={newRoleFilter} onValueChange={value => { setNewRoleFilter(value); const matching = value === "__all__" ? staff.filter(s => s.id !== profileId).map(s => s.id) : staff.filter(s => s.id !== profileId && (s.role_codes || []).some(code => code.toLowerCase() === value.toLowerCase())).map(s => s.id); setNewMembers(current => Array.from(new Set([...current, ...matching]))); }}><SelectTrigger><SelectValue placeholder="Choisir un rôle pour ajouter toute l'équipe" /></SelectTrigger><SelectContent><SelectItem value="__all__">Tous les utilisateurs actifs</SelectItem>{staffRoles.map(role => <SelectItem key={role.code} value={role.code}>{role.nom}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Le choix d’un rôle ajoute automatiquement tous les collaborateurs actifs qui le possèdent. Vous pouvez ensuite ajuster la sélection.</p></div>}{newKind !== "direct" && <div className="space-y-1"><Label>Ajouter une équipe</Label><div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2">{staffTeams.map(team => <label key={team.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"><input type="checkbox" checked={newTeams.includes(team.id)} onChange={e => setNewTeams(current => e.target.checked ? [...current, team.id] : current.filter(id => id !== team.id))} />{team.nom}<span className="ml-auto text-xs text-muted-foreground">{team.member_profile_ids.length} membre(s)</span></label>)}</div></div>}<Label>Participants individuels</Label><div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1.5">{staff.filter(s => s.id !== profileId).map(s => {
  const active = newMembers.includes(s.id);
  return <button key={s.id} type="button" aria-pressed={active} onClick={() => setNewMembers(current => newKind === "direct" ? (active ? [] : [s.id]) : (active ? current.filter(id => id !== s.id) : [...current, s.id]))} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "bg-primary/10 text-foreground" : "hover:bg-muted/70"}`}><span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">{s.nom_complet.split(/\\s+/).map((part: string) => part[0]).slice(0,2).join("").toUpperCase()}{active && <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background"><Check className="h-3 w-3" /></span>}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{s.nom_complet}</span><span className="block truncate text-xs text-muted-foreground">{s.poste || "Collaborateur"}</span></span></button>;
})}</div></div><Button className="w-full" onClick={() => void createConversation()}>Créer la conversation</Button></div></DialogContent></Dialog></div><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une conversation…" /></CardHeader>
                  <CardContent className="space-y-1 p-2">{loading ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : visibleConversations.length ? visibleConversations.map(c => <button key={c.id} onClick={() => setSelected(c.id)} className={`flex w-full min-w-0 items-center gap-3 rounded-lg p-3 text-left transition-colors ${selected === c.id ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted"}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(c.title || (c.conversation_type === "direct" ? "Privé" : c.conversation_type === "group" ? "Groupe" : "Canal"))}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.title || (c.conversation_type === "direct" ? "Conversation privée" : c.conversation_type === "group" ? "Groupe d'équipe" : "Canal")}</span><span className="block text-xs text-muted-foreground">{dateLabel(c.last_message_at)}</span></span></button>) : <p className="p-5 text-center text-sm text-muted-foreground">Aucune conversation. Créez votre première discussion interne.</p>}</CardContent>
                  <div className="border-t p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Collaborateurs — démarrer une discussion</p><div className="max-h-56 space-y-1 overflow-y-auto">{staff.filter(person => person.id !== profileId).map(person => <button key={person.id} type="button" onClick={() => { setNewKind("direct"); setNewMembers([person.id]); setNewRoles([]); setCreateOpen(true); }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{initials(person.nom_complet)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm">{person.nom_complet}</span><span className="block truncate text-xs text-muted-foreground">{(person.role_names || []).join(", ") || person.poste || "Collaborateur"}</span></span><MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" /></button>)}</div></div>
                </Card>
                <Card className={selected ? "flex min-w-0 flex-col overflow-hidden" : "hidden min-w-0 lg:flex lg:flex-col"}>
                  <CardHeader className="border-b p-3 sm:p-4"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><CardTitle className="truncate text-base">{selectedConversation?.title || (selectedConversation?.conversation_type === "direct" ? "Conversation privée" : selectedConversation?.conversation_type === "group" ? "Groupe d'équipe" : "Canal interne")}</CardTitle><p className="text-xs text-muted-foreground">Messages en temps réel · accusés de lecture</p></div><div className="flex shrink-0 gap-1"><Button variant="outline" size="sm" className="gap-1" onClick={() => void startVideoCall()} disabled={!selected}><Video className="h-4 w-4" /><span className="hidden sm:inline">Appel audio/vidéo</span><span className="sm:hidden">Appel</span></Button><Button variant="outline" size="sm" className="gap-1" onClick={() => setTab("meetings")}><CalendarDays className="h-4 w-4" /><span className="hidden sm:inline">Réunions</span></Button></div></div></CardHeader>
                  <CardContent className="flex min-h-[360px] flex-1 flex-col p-3 sm:min-h-[500px] sm:p-4">
                    <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain pb-3">{messages.map(m => <div key={m.id} className={`flex ${m.sender_profile_id === profileId ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] min-w-0 rounded-2xl px-3 py-2 ${m.sender_profile_id === profileId ? "bg-primary text-primary-foreground" : "bg-muted"}`}><div className="whitespace-pre-wrap break-words text-sm">{(() => { const callUrl = m.body.match(/https:\/\/meet\.jit\.si\/[^\s]+/)?.[0]; return callUrl ? <><span>{m.body.replace(callUrl, "").trim()}</span><a href={callUrl} target="_blank" rel="noreferrer" className="mt-2 block font-semibold underline underline-offset-2">Rejoindre l’appel audio/vidéo</a></> : m.body; })()}</div>{(messageAttachments[m.id] || []).map(a => a.url ? <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 break-all text-xs underline"><Paperclip className="h-3 w-3 shrink-0" />{a.file_name}</a> : <p key={a.id} className="mt-2 text-xs">{a.file_name}</p>)}<div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70"><span>{dateLabel(m.created_at)}</span>{m.sender_profile_id === profileId && <Check className="h-3 w-3" />}</div></div></div>)}{selected && !messages.length && <p className="py-12 text-center text-sm text-muted-foreground">Écrivez le premier message de cette conversation.</p>}</div>
                    <form className="flex min-w-0 items-end gap-2 border-t pt-3" onSubmit={e => { e.preventDefault(); void sendMessage(); }}><label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border hover:bg-muted" title="Joindre un fichier"><Paperclip className="h-4 w-4" /><input type="file" className="sr-only" onChange={e => setMessageFile(e.target.files?.[0] || null)} disabled={!selected || sending} /></label><div className="min-w-0 flex-1 space-y-1">{messageFile && <p className="truncate text-xs text-muted-foreground">{messageFile.name}</p>}<Textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Écrire un message…" rows={2} className="min-h-[44px] min-w-0 resize-y" disabled={!selected || sending} /></div><Button type="submit" size="icon" aria-label="Envoyer" disabled={!selected || (!draft.trim() && !messageFile) || sending}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></form>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            <TabsContent value="meetings" className="mt-3 min-w-0 space-y-3">
              <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"><div><h2 className="font-semibold">Agenda et réunions</h2><p className="text-sm text-muted-foreground">Planifiez les réunions, l'ordre du jour et les horaires.</p></div><Dialog open={meetingOpen} onOpenChange={setMeetingOpen}><DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" />Planifier une réunion</Button></DialogTrigger><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Nouvelle réunion</DialogTitle></DialogHeader><div className="space-y-3"><div className="space-y-1"><Label>Titre</Label><Input value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} placeholder="Réunion de coordination" /><p className="text-xs text-muted-foreground">Un lien audio/vidéo Jitsi Meet unique sera créé automatiquement.</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Début</Label><Input type="datetime-local" value={meetingStart} onChange={e => setMeetingStart(e.target.value)} /></div><div className="space-y-1"><Label>Fin</Label><Input type="datetime-local" value={meetingEnd} onChange={e => setMeetingEnd(e.target.value)} /></div></div><div className="space-y-1"><Label>Ordre du jour</Label><Textarea value={meetingAgenda} onChange={e => setMeetingAgenda(e.target.value)} rows={3} /></div><div className="space-y-1"><Label>Description / préparation</Label><Textarea value={meetingDescription} onChange={e => setMeetingDescription(e.target.value)} rows={2} /></div><div className="space-y-1"><Label>Documents à joindre</Label><Input type="file" multiple onChange={e => setMeetingFiles(Array.from(e.target.files || []))} /><p className="text-xs text-muted-foreground">{meetingFiles.length ? `${meetingFiles.length} fichier(s) sélectionné(s)` : "PDF, images, documents Office et fichiers partagés (50 Mo maximum par fichier)."}</p></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { setMeetingAudience("all"); setMeetingMembers(staff.filter(s => s.id !== profileId).map(s => s.id)); }}>Toute l’équipe</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setMeetingAudience("selected"); setMeetingMembers([]); }}>Effacer la sélection</Button></div><div className="space-y-1"><Label>Inviter des équipes</Label><div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2">{staffTeams.map(team => <label key={team.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"><input type="checkbox" checked={meetingTeams.includes(team.id)} onChange={e => setMeetingTeams(current => e.target.checked ? [...current, team.id] : current.filter(id => id !== team.id))} />{team.nom}<span className="ml-auto text-xs text-muted-foreground">{team.member_profile_ids.length} membre(s)</span></label>)}</div></div><div className="space-y-1"><Label>Inviter par rôle</Label><Select value={meetingRoleFilter} onValueChange={value => { setMeetingRoleFilter(value); if (value === "__all__") { setMeetingAudience("all"); setMeetingMembers(staff.filter(s => s.id !== profileId).map(s => s.id)); } else { setMeetingAudience("selected"); const matching = staff.filter(s => s.id !== profileId && (s.role_codes || []).some(code => code.toLowerCase() === value.toLowerCase())).map(s => s.id); setMeetingMembers(current => Array.from(new Set([...current, ...matching]))); } }}><SelectTrigger><SelectValue placeholder="Choisir un rôle" /></SelectTrigger><SelectContent><SelectItem value="__all__">Tous les rôles / toute l’équipe</SelectItem>{staffRoles.map(role => <SelectItem key={role.code} value={role.code}>{role.nom}</SelectItem>)}</SelectContent></Select></div><Label>Inviter des collaborateurs</Label><div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-1.5">{staff.filter(s => s.id !== profileId).map(s => {
  const active = meetingMembers.includes(s.id);
  return <button key={s.id} type="button" aria-pressed={active} onClick={() => setMeetingMembers(current => active ? current.filter(id => id !== s.id) : [...current, s.id])} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "bg-primary/10 text-foreground" : "hover:bg-muted/70"}`}><span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">{s.nom_complet.split(/\\s+/).map((part: string) => part[0]).slice(0,2).join("").toUpperCase()}{active && <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background"><Check className="h-3 w-3" /></span>}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.nom_complet}</span></button>;
})}</div></div><Button className="w-full" onClick={() => void createMeeting()}>Enregistrer la réunion</Button></div></DialogContent></Dialog></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{meetings.map(m => <Card key={m.id} className="min-w-0 overflow-hidden"><CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><CardTitle className="min-w-0 break-words text-base">{m.title}</CardTitle><Badge variant={m.status === "cancelled" ? "destructive" : "outline"}>{m.status === "scheduled" ? "Planifiée" : m.status === "in_progress" ? "En cours" : m.status === "completed" ? "Terminée" : "Annulée"}</Badge></div></CardHeader><CardContent className="space-y-3"><p className="flex items-start gap-2 text-sm"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{dateLabel(m.starts_at)} – {dateLabel(m.ends_at)}</span></p>{m.agenda && <div><p className="text-xs font-semibold text-muted-foreground">ORDRE DU JOUR</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{m.agenda}</p></div>}{(meetingAttachments[m.id] || []).map(file => file.url ? <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 break-all text-xs text-primary underline"><Paperclip className="h-3.5 w-3.5 shrink-0" />{file.file_name}</a> : <p key={file.id} className="text-xs">{file.file_name}</p>)}<div className="flex flex-wrap items-center gap-2"><Badge variant="secondary"><Users className="mr-1 h-3 w-3" />Participants sur invitation</Badge>{m.provider === "unconfigured" ? <Badge variant="outline">Vidéo à configurer</Badge> : m.join_url ? <a href={m.join_url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Rejoindre la réunion</a> : null}</div><p className="text-xs text-muted-foreground">{m.join_url ? "Audio et vidéo disponibles via Jitsi Meet. Les participants doivent disposer du lien de réunion." : "Aucun lien de visioconférence n’est associé à cette réunion."}</p></CardContent></Card>)}</div>
              {meetings.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground"><Clock3 className="mx-auto mb-2 h-6 w-6" />Aucune réunion planifiée.</CardContent></Card>}
            </TabsContent>
          </Tabs>
        </main>
      </MainLayout>
    </ProtectedRoute>
  );
}
