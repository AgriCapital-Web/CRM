import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Bell, Mail, MessageSquare, Send, Users, Zap, RefreshCw, Plus, Eye, Smartphone, CheckCircle2, AlertTriangle, PhoneCall, Paperclip, FileText, Image as ImageIcon, Video, X } from "lucide-react";
import { toast } from "sonner";
import ConfigurationSenndo from "@/pages/parametres/ConfigurationSenndo";

type Segment = { id: string; code: string; nom: string; description: string | null; criteres: Record<string, unknown>; actif: boolean };
type Campaign = {
  id: string; nom: string; description: string | null; canal: string; sujet: string | null; contenu: string;
  segment_id: string | null; criteres: Record<string, unknown>; statut: string; programme_le: string | null;
  total_destinataires: number; total_envoyes: number; total_echecs: number;
};
type MediaAttachment = { bucket: string; path: string; name: string; mimeType: string; size: number };
type NotificationTemplate = { id: string; code: string; nom: string; canal: string; evenement: string; sujet: string | null; contenu: string; actif: boolean; parcours: string | null; media_attachments?: MediaAttachment[] };
type ClientPreference = { id: string; nom_complet: string | null; telephone: string | null; whatsapp: string | null; email: string | null; canal_finalisation: string; canal_rappel: string };
type Automation = {
  id: string; code: string; nom: string; description: string | null; evenement: string; canal: string;
  sujet: string | null; contenu: string; criteres: Record<string, unknown>; actif: boolean; cooldown_minutes: number; media_attachments?: MediaAttachment[];
};

const CHANNELS = [
  { value: "app", label: "Notification app", icon: Bell },
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS · Senndo", icon: Smartphone },
  { value: "whatsapp", label: "WhatsApp appairé · Senndo", icon: MessageSquare },
  { value: "voice", label: "Appel vocal · Senndo", icon: PhoneCall },
  { value: "email_sms", label: "E-mail + SMS · Senndo", icon: Mail },
  { value: "auto", label: "Automatique · Senndo", icon: Zap },
];

const EVENTS = [
  ["paiement_recu", "Paiement recu"],
  ["solde_regle", "Solde intégralement réglé"],
  ["paiement_echeance", "Echeance de paiement"],
  ["paiement_retard", "Retard de paiement"],
  ["document_valide", "Document valide"],
  ["compte_active", "Compte active"],
  ["visite_technique", "Visite technique"],
  ["intervention_technique", "Intervention technique"],
  ["recolte", "Recolte"],
  ["nouveau_client", "Nouveau client"],
  ["lot_attribue", "Lot activé sur une parcelle Planté-Partagé"],
  ["plantation_activee", "Plantation activée"],
  ["prospect_relance", "Relance prospect"],
  ["campagne_speciale", "Campagne speciale"],
];

const AUDIENCES = [
  ["tous", "Tout le monde"],
  ["clients", "Tous les clients"],
  ["leads", "Tous les leads"],
  ["prospects", "Tous les prospects"],
  ["equipe", "Equipe interne"],
  ["commerciaux", "Commerciaux"],
  ["palminvest", "Clients PalmInvest"],
  ["terrapalm", "Clients TerraPalm"],
  ["palmterroir", "Clients PalmTerroir"],
  ["proprietaires_fonciers", "Propriétaires fonciers"],
  ["beneficiaires_particuliers", "Bénéficiaires particuliers"],
];

const normalizeSms = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const smsLength = (value: string) => Array.from(normalizeSms(value)).length
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 700 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp", lastModified: Date.now() });
  } catch { return file; }
}
async function compressVideo(file: File): Promise<File> {
  if (!file.type.startsWith("video/") || file.size < 5*1024*1024 || typeof MediaRecorder === "undefined") return file;
  const mime = ["video/mp4","video/webm;codecs=vp9","video/webm"].find((x) => MediaRecorder.isTypeSupported(x)); if (!mime) return file;
  const url=URL.createObjectURL(file), video=document.createElement("video"); video.src=url; video.muted=true; video.playsInline=true;
  try { await new Promise<void>((resolve,reject)=>{video.onloadedmetadata=()=>resolve();video.onerror=()=>reject(new Error("Vidéo illisible"));});
    if(video.duration>30*60)throw new Error("Une vidéo jointe ne peut pas dépasser 30 minutes.");
    const scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight)), canvas=document.createElement("canvas");
    canvas.width=Math.max(2,Math.round(video.videoWidth*scale/2)*2);canvas.height=Math.max(2,Math.round(video.videoHeight*scale/2)*2);
    const ctx=canvas.getContext("2d"), capture=(video as HTMLVideoElement & {captureStream?:()=>MediaStream}).captureStream;
    if(!ctx||!canvas.captureStream||!capture)return file;const stream=canvas.captureStream(24);capture.call(video).getAudioTracks().forEach(t=>stream.addTrack(t));const chunks:BlobPart[]=[];
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1500000});const blob=await new Promise<Blob>((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onerror=()=>reject(new Error("Compression impossible"));recorder.onstop=()=>resolve(new Blob(chunks,{type:mime}));const draw=()=>{if(video.ended||video.paused)return;ctx.drawImage(video,0,0,canvas.width,canvas.height);requestAnimationFrame(draw)};recorder.start(1000);void video.play().then(draw).catch(reject);video.onended=()=>{if(recorder.state!=="inactive")recorder.stop()}});
    if(!blob.size||blob.size>=file.size)return file;return new File([blob],file.name.replace(/\.[^.]+$/,"")+(mime.includes("mp4")?".mp4":".webm"),{type:mime,lastModified:Date.now()});
  } catch { return file; } finally { URL.revokeObjectURL(url);video.src=""; }
}

const GestionNotifications = () => {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [clientPreferences, setClientPreferences] = useState<ClientPreference[]>([]);
  const [preferenceSearch, setPreferenceSearch] = useState("");
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [campaignMedia, setCampaignMedia] = useState<MediaAttachment[]>([]);
  const [automationMedia, setAutomationMedia] = useState<MediaAttachment[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<Record<string, boolean | string | null>>({});
  const [campaign, setCampaign] = useState({
    nom: "", description: "", canal: "app", sujet: "", contenu: "", segment_id: "", audience: "tous", programme_le: "",
  });
  const [automation, setAutomation] = useState({
    code: "", nom: "", description: "", evenement: "paiement_recu", canal: "app", sujet: "", contenu: "",
    audience: "clients", actif: false, cooldown_minutes: 1440,
  });
  const [preview, setPreview] = useState<{ count: number; sample: any[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const smsCount = useMemo(() => smsLength(campaign.contenu), [campaign.contenu]);
  const automationSmsCount = useMemo(() => smsLength(automation.contenu), [automation.contenu]);
  const whatsappCount = useMemo(() => Array.from(campaign.contenu).length, [campaign.contenu]);
  const automationWhatsappCount = useMemo(() => Array.from(automation.contenu).length, [automation.contenu]);

  const load = async () => {
    setLoading(true);
    const [s, c, a, t, cl, prefs] = await Promise.all([
      supabase.from("notification_segments").select("*").order("nom"),
      (supabase as any).from("notification_campaigns").select("*").order("created_at", { ascending: false }).limit(100),
      (supabase as any).from("notification_automations").select("*").order("nom"),
      (supabase as any).from("notification_templates").select("id,code,nom,canal,evenement,sujet,contenu,actif,parcours,media_attachments").order("evenement").order("canal"),
      supabase.from("clients").select("id,nom_complet,telephone,whatsapp,email").order("nom_complet").limit(500),
      (supabase as any).from("notification_client_preferences").select("client_id,canal_finalisation,canal_rappel"),
    ]);
    if (s.error || c.error || a.error) toast.error("Impossible de charger la communication");
    setSegments((s.data || []) as Segment[]);
    setCampaigns((c.data || []) as Campaign[]);
    setAutomations((a.data || []) as Automation[]);
    setTemplates((t.data || []) as NotificationTemplate[]);
    const savedPreferences = prefs.data || [];
    setClientPreferences((cl.data || []).map((client: any) => { const pref = savedPreferences.find((x: any) => x.client_id === client.id); return { ...client, canal_finalisation: pref?.canal_finalisation || "auto", canal_rappel: pref?.canal_rappel || "auto" }; }));
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const callDispatch = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("notification-dispatch", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const checkProviders = async () => {
    try {
      const data = await callDispatch({ mode: "status" });
      setProvider(data.providers || {});
    } catch (error: any) {
      toast.error(error.message || "Etat des services indisponible");
    }
  };

  useEffect(() => { void checkProviders(); }, []);

  const previewAudience = async (audience: string) => {
    setPreviewing(true);
    try {
      const data = await callDispatch({ mode: "preview", criteria: { audience } });
      setPreview({ count: data.count || 0, sample: data.sample || [] });
    } catch (error: any) {
      toast.error(error.message || "Apercu impossible");
    } finally { setPreviewing(false); }
  };

  const createCampaign = async () => {
    const submittedCampaign = { ...campaign };
    const submittedMedia = [...campaignMedia];
    if (!submittedCampaign.nom.trim() || !submittedCampaign.contenu.trim()) return toast.error("Nom et contenu obligatoires");
    if ((submittedCampaign.canal === "sms" || submittedCampaign.canal === "email_sms") && smsCount > 155) return toast.error(`Le SMS fait ${smsCount} caractères : limite 155, espaces et signes compris.`);
    if (submittedCampaign.canal === "whatsapp" && whatsappCount > 4096) return toast.error(`Le message WhatsApp fait ${whatsappCount} caractères : limite 4096.`);
    const selected = submittedCampaign.segment_id || segments.find((s) => s.code === submittedCampaign.audience)?.id || null;
    const { error } = await (supabase as any).from("notification_campaigns").insert({
      nom: submittedCampaign.nom.trim(), description: submittedCampaign.description || null, canal: submittedCampaign.canal,
      sujet: submittedCampaign.sujet || null, contenu: submittedCampaign.canal.includes("sms") ? normalizeSms(submittedCampaign.contenu) : submittedCampaign.contenu,
      media_attachments: submittedMedia, segment_id: selected, criteres: { audience: submittedCampaign.audience },
      statut: submittedCampaign.programme_le ? "programme" : "brouillon",
      programme_le: submittedCampaign.programme_le ? new Date(submittedCampaign.programme_le).toISOString() : null,
    });
    if (error) return toast.error(error.message);
    toast.success(submittedCampaign.programme_le ? "Campagne programmee" : "Campagne enregistree");
    setCampaignDialogOpen(false);
    setCampaign((current) => JSON.stringify(current) === JSON.stringify(submittedCampaign) ? { nom: "", description: "", canal: "app", sujet: "", contenu: "", segment_id: "", audience: "tous", programme_le: "" } : current);
    setCampaignMedia((current) => JSON.stringify(current) === JSON.stringify(submittedMedia) ? [] : current);
    await load();
  };

  const sendCampaign = async (id: string) => {
    try {
      const data = await callDispatch({ mode: "campaign", campaign_id: id });
      toast.success(`Campagne traitee: ${data.result?.sent || 0} envoi(s)`);
      await load();
    } catch (error: any) { toast.error(error.message || "Envoi impossible"); }
  };

  const saveAutomation = async () => {
    const submittedAutomation = { ...automation };
    const submittedMedia = [...automationMedia];
    if (!submittedAutomation.nom.trim() || !submittedAutomation.code.trim() || !submittedAutomation.contenu.trim()) return toast.error("Code, nom et contenu obligatoires");
    if ((submittedAutomation.canal === "sms" || submittedAutomation.canal === "email_sms") && automationSmsCount > 155) return toast.error(`Le SMS fait ${automationSmsCount} caractères : limite 155, espaces et signes compris.`);
    if (submittedAutomation.canal === "whatsapp" && automationWhatsappCount > 4096) return toast.error(`Le message WhatsApp fait ${automationWhatsappCount} caractères : limite 4096.`);
    const { error } = await (supabase as any).from("notification_automations").upsert({
      code: submittedAutomation.code.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
      nom: submittedAutomation.nom.trim(), description: submittedAutomation.description || null,
      evenement: submittedAutomation.evenement, canal: submittedAutomation.canal, sujet: submittedAutomation.sujet || null,
      contenu: submittedAutomation.canal.includes("sms") ? normalizeSms(submittedAutomation.contenu) : submittedAutomation.contenu,
      media_attachments: submittedMedia, criteres: { audience: submittedAutomation.audience }, actif: submittedAutomation.actif,
      cooldown_minutes: Math.max(0, Number(submittedAutomation.cooldown_minutes) || 0),
    }, { onConflict: "code" });
    if (error) return toast.error(error.message);
    toast.success("Automatisation enregistree");
    setAutomationDialogOpen(false);
    setAutomation((current) => JSON.stringify(current) === JSON.stringify(submittedAutomation) ? { ...submittedAutomation, code: "", nom: "", description: "", sujet: "", contenu: "" } : current);
    setAutomationMedia((current) => JSON.stringify(current) === JSON.stringify(submittedMedia) ? [] : current);
    await load();
  };

  const saveClientPreference = async (clientId: string, field: "canal_finalisation" | "canal_rappel", value: string) => {
    setClientPreferences((current) => current.map((item) => item.id === clientId ? { ...item, [field]: value } : item));
    const { data: { user } } = await supabase.auth.getUser();
    const row = clientPreferences.find((item) => item.id === clientId);
    const { error } = await (supabase as any).from("notification_client_preferences").upsert({
      client_id: clientId, canal_finalisation: field === "canal_finalisation" ? value : row?.canal_finalisation || "auto",
      canal_rappel: field === "canal_rappel" ? value : row?.canal_rappel || "auto", updated_by: user?.id || null, updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });
    if (error) { toast.error(error.message); void load(); } else toast.success("Préférence de notification enregistrée.");
  };

  const toggleAutomation = async (item: Automation) => {
    const { error } = await (supabase as any).from("notification_automations").update({ actif: !item.actif }).eq("id", item.id);
    if (error) toast.error(error.message); else await load();
  };
  const uploadMedia = async (files: FileList | null, target: "campaign" | "automation") => {
    if (!files?.length) return;
    // FileList is live and the input is reset immediately after selection; snapshot it before awaiting auth.
    const selectedFiles = Array.from(files);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Connexion requise.");
    setUploadingMedia(true); const uploaded: MediaAttachment[]=[];
    try { for (const original of selectedFiles) {
      if(original.type.startsWith("video/")) { const probeUrl=URL.createObjectURL(original); try { const duration=await new Promise<number>((resolve,reject)=>{const probe=document.createElement("video");probe.preload="metadata";probe.onloadedmetadata=()=>resolve(probe.duration);probe.onerror=()=>reject(new Error("Vidéo illisible : "+original.name));probe.src=probeUrl;}); if(duration>30*60)throw new Error(original.name+" dépasse la durée maximale de 30 minutes."); } finally { URL.revokeObjectURL(probeUrl); } }
      const optimizedImage=await compressImage(original), file=await compressVideo(optimizedImage), name=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"), path=`${user.id}/${crypto.randomUUID()}-${name}`;
      const {error}=await supabase.storage.from("notification-media").upload(path,file,{contentType:file.type||"application/octet-stream"});
      if(error)throw error; uploaded.push({bucket:"notification-media",path,name:file.name,mimeType:file.type||"application/octet-stream",size:file.size});
    } if(target==="campaign")setCampaignMedia(v=>[...v,...uploaded]);else setAutomationMedia(v=>[...v,...uploaded]);toast.success("Pièces jointes enregistrées.");}
    catch(e){toast.error(e instanceof Error?e.message:"Téléversement impossible.");}finally{setUploadingMedia(false);}
  };
  const applyTemplate = (t: NotificationTemplate) => { setCampaign(v=>({...v,canal:t.canal,sujet:t.sujet||"",contenu:t.contenu,nom:v.nom||t.nom}));setCampaignMedia(t.media_attachments||[]); };
  const MediaPicker = ({target,items}:{target:"campaign"|"automation";items:MediaAttachment[]}) => <div className="space-y-2"><Label>Pièces jointes</Label><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><Paperclip className="h-4 w-4"/>{uploadingMedia?"Téléversement…":"Ajouter des fichiers"}<input type="file" className="hidden" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.pptx,.csv,.txt" disabled={uploadingMedia} onChange={e=>{void uploadMedia(e.target.files,target);e.currentTarget.value="";}}/></label>{items.map(item=><div key={item.path} className="flex items-center gap-2 rounded border p-2 text-sm">{item.mimeType.startsWith("image/")?<ImageIcon className="h-4 w-4"/>:item.mimeType.startsWith("video/")?<Video className="h-4 w-4"/>:<FileText className="h-4 w-4"/>}<span className="min-w-0 flex-1 truncate">{item.name}</span><span>{(item.size/1048576).toFixed(1)} Mo</span><Button size="icon" type="button" variant="ghost" onClick={()=>{if(target==="campaign")setCampaignMedia(v=>v.filter(x=>x.path!==item.path));else setAutomationMedia(v=>v.filter(x=>x.path!==item.path));void supabase.storage.from(item.bucket).remove([item.path]);}}><X className="h-4 w-4"/></Button></div>)}</div>;

  return (
    <div className="w-full max-w-full min-w-0 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2"><Bell className="h-5 w-5 shrink-0" /> Communication et notifications</CardTitle>

            </div>
            <Button variant="outline" onClick={() => { void checkProviders(); void load(); }}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Status label="Senndo API" ok={Boolean(provider.senndo)} />
            <Status label="Webhook Senndo" ok={Boolean(provider.webhook)} />
            <Status label="WhatsApp appairé" ok={Boolean(provider.whatsapp_paired)} />
            <Status label="Appels vocaux" ok={Boolean(provider.voice)} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="campaigns" className="w-full min-w-0">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex min-w-max">
            <TabsTrigger value="campaigns"><Send className="mr-2 h-4 w-4" />Campagnes</TabsTrigger>
            <TabsTrigger value="automations"><Zap className="mr-2 h-4 w-4" />Automatisations</TabsTrigger>
            <TabsTrigger value="segments"><Users className="mr-2 h-4 w-4" />Destinataires</TabsTrigger><TabsTrigger value="templates"><FileText className="mr-2 h-4 w-4" />Modèles</TabsTrigger><TabsTrigger value="preferences"><Smartphone className="mr-2 h-4 w-4" />Choix client</TabsTrigger>
            <TabsTrigger value="senndo"><MessageSquare className="mr-2 h-4 w-4" />Passerelle Senndo</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="campaigns" className="space-y-5">
          <Dialog open={campaignDialogOpen} onOpenChange={setCampaignDialogOpen}><DialogTrigger asChild><Button className="mb-3"><Plus className="mr-2 h-4 w-4"/>Créer une campagne</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><Card>
            <CardHeader><CardTitle>Nouvelle campagne</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Nom"><Input value={campaign.nom} onChange={(e) => setCampaign({ ...campaign, nom: e.target.value })} placeholder="Campagne rentree agricole" /></Field>
                <Field label="Modèle enregistré"><Select value="" onValueChange={id=>{const t=templates.find(x=>x.id===id);if(t)applyTemplate(t);}}><SelectTrigger><SelectValue placeholder="Choisir un modèle"/></SelectTrigger><SelectContent>{templates.filter(t=>t.actif).map(t=><SelectItem key={t.id} value={t.id}>{t.nom} · {t.canal}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Canal"><Select value={campaign.canal} onValueChange={(v) => setCampaign({ ...campaign, canal: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Destinataires"><Select value={campaign.audience} onValueChange={(v) => { setCampaign({ ...campaign, audience: v }); void previewAudience(v); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AUDIENCES.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Planification"><Input type="datetime-local" value={campaign.programme_le} onChange={(e) => setCampaign({ ...campaign, programme_le: e.target.value })} /></Field>
              </div>
              <Field label="Sujet email"><Input uppercase={false} value={campaign.sujet} onChange={(e) => setCampaign({ ...campaign, sujet: e.target.value })} placeholder="Information AgriCapital" /></Field>
              <Field label="Message"><Textarea uppercase={false} rows={5} value={campaign.contenu} onChange={(e) => setCampaign({ ...campaign, contenu: e.target.value })} placeholder="Bonjour {{prenom}}, ..." /><div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">{campaign.canal.includes("sms") && <span className={smsCount > 155 ? "font-semibold text-destructive" : ""}>{smsCount}/155 caractères SMS</span>}{campaign.canal === "whatsapp" && <span className={whatsappCount > 4096 ? "font-semibold text-destructive" : ""}>{whatsappCount}/4096 caractères WhatsApp</span>}</div></Field><MediaPicker target="campaign" items={campaignMedia}/>
              {preview && <Preview count={preview.count} sample={preview.sample} />}
              <div className="flex flex-wrap gap-2"><Button onClick={createCampaign}><Plus className="mr-2 h-4 w-4" />Enregistrer la campagne</Button><Button variant="outline" onClick={() => void previewAudience(campaign.audience)} disabled={previewing}><Eye className="mr-2 h-4 w-4" />Apercu</Button></div>
            </CardContent>
          </Card></DialogContent></Dialog>

          <Card>
            <CardHeader><CardTitle>Campagnes recentes</CardTitle></CardHeader>
            <CardContent><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left"><th className="p-3">Campagne</th><th className="p-3">Canal</th><th className="p-3">Etat</th><th className="p-3">Dest.</th><th className="p-3">Envoyes</th><th className="p-3">Actions</th></tr></thead><tbody>{campaigns.map((c) => <tr key={c.id} className="border-b last:border-0"><td className="p-3 font-medium">{c.nom}</td><td className="p-3">{CHANNELS.find(x => x.value === c.canal)?.label || c.canal}</td><td className="p-3"><Badge variant={c.statut === "termine" ? "default" : "outline"}>{c.statut}</Badge></td><td className="p-3">{c.total_destinataires}</td><td className="p-3">{c.total_envoyes}</td><td className="p-3"><Button size="sm" variant="outline" onClick={() => void sendCampaign(c.id)} disabled={c.statut === "termine" || c.statut === "annule"}><Send className="mr-2 h-4 w-4" />Envoyer</Button></td></tr>)}{!loading && campaigns.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Aucune campagne</td></tr>}</tbody></table></div></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automations" className="space-y-5">
          <Dialog open={automationDialogOpen} onOpenChange={setAutomationDialogOpen}><DialogTrigger asChild><Button className="mb-3"><Zap className="mr-2 h-4 w-4"/>Créer une automatisation</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><Card>
            <CardHeader><CardTitle>Automatisation conditionnelle</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Code"><Input value={automation.code} onChange={(e) => setAutomation({ ...automation, code: e.target.value })} placeholder="paiement_recu_client" /></Field>
                <Field label="Nom"><Input value={automation.nom} onChange={(e) => setAutomation({ ...automation, nom: e.target.value })} placeholder="Confirmation de paiement" /></Field>
                <Field label="Evenement"><Select value={automation.evenement} onValueChange={(v) => setAutomation({ ...automation, evenement: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENTS.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Canal"><Select value={automation.canal} onValueChange={(v) => setAutomation({ ...automation, canal: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Audience"><Select value={automation.audience} onValueChange={(v) => setAutomation({ ...automation, audience: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AUDIENCES.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Delai anti-doublon (minutes)"><Input type="number" min={0} value={automation.cooldown_minutes} onChange={(e) => setAutomation({ ...automation, cooldown_minutes: Number(e.target.value) || 0 })} /></Field>
              </div>
              <Field label="Sujet email"><Input uppercase={false} value={automation.sujet} onChange={(e) => setAutomation({ ...automation, sujet: e.target.value })} /></Field>
              <Field label="Message"><Textarea uppercase={false} rows={5} value={automation.contenu} onChange={(e) => setAutomation({ ...automation, contenu: e.target.value })} placeholder="Bonjour {{prenom}}, votre plantation est activée..." />{automation.canal.includes("sms") && <p className={automationSmsCount > 155 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{automationSmsCount}/155 caractères SMS.</p>}{automation.canal === "whatsapp" && <p className={automationWhatsappCount > 4096 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{automationWhatsappCount}/4096 caractères WhatsApp.</p>}</Field><MediaPicker target="automation" items={automationMedia}/>
              <div className="flex items-center gap-2"><Switch checked={automation.actif} onCheckedChange={(v) => setAutomation({ ...automation, actif: v })} /><Label>Activer automatiquement</Label></div>
              <Button onClick={saveAutomation}><Zap className="mr-2 h-4 w-4" />Enregistrer l'automatisation</Button>
            </CardContent>
          </Card></DialogContent></Dialog>

          <Card>
            <CardHeader><CardTitle>Automatisations actives</CardTitle></CardHeader>
            <CardContent className="space-y-2">{automations.map((a) => <div key={a.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{a.nom}</span><Badge variant="outline">{a.evenement}</Badge></div><p className="mt-1 break-anywhere text-sm text-muted-foreground">{a.canal} · {String(a.criteres?.audience || "tous")} · anti-doublon {a.cooldown_minutes} min</p></div><Switch checked={a.actif} onCheckedChange={() => void toggleAutomation(a)} /></div>)}{!loading && automations.length === 0 && <p className="py-8 text-center text-muted-foreground">Aucune automatisation</p>}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="senndo" className="space-y-5"><ConfigurationSenndo /></TabsContent>

        <TabsContent value="preferences"><Card><CardHeader><CardTitle>Canal de notification par client</CardTitle></CardHeader><CardContent className="space-y-3">
          <Input value={preferenceSearch} onChange={(e) => setPreferenceSearch(e.target.value)} placeholder="Rechercher un client" />
          <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left"><th className="p-3">Client</th><th className="p-3">Contact</th><th className="p-3">Finalisation du solde</th><th className="p-3">Rappels</th></tr></thead><tbody>
          {clientPreferences.filter((p) => (p.nom_complet || "").toLowerCase().includes(preferenceSearch.toLowerCase()) || (p.telephone || "").includes(preferenceSearch) || (p.email || "").toLowerCase().includes(preferenceSearch.toLowerCase())).map((p) => <tr key={p.id} className="border-b last:border-0"><td className="p-3 font-medium">{p.nom_complet || "Client"}</td><td className="p-3">{p.whatsapp || p.telephone || p.email || "Aucun contact"}</td><td className="p-3"><Select value={p.canal_finalisation} onValueChange={(v) => void saveClientPreference(p.id,"canal_finalisation",v)}><SelectTrigger className="min-w-[190px]"><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.filter((x) => ["auto","sms","whatsapp","email","email_sms"].includes(x.value)).map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select></td><td className="p-3"><Select value={p.canal_rappel} onValueChange={(v) => void saveClientPreference(p.id,"canal_rappel",v)}><SelectTrigger className="min-w-[190px]"><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.filter((x) => ["auto","sms","whatsapp","email","email_sms"].includes(x.value)).map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select></td></tr>)}
          {!clientPreferences.length && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Aucun client disponible.</td></tr>}
          </tbody></table></div>
        </CardContent></Card></TabsContent>

        <TabsContent value="templates"><Card><CardHeader><CardTitle>Modèles de messages</CardTitle></CardHeader><CardContent className="space-y-3">{templates.map(t=><div key={t.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{t.nom}</span><Badge variant="outline">{t.canal}</Badge><Badge variant={t.actif?"default":"secondary"}>{t.actif?"Actif":"Inactif"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{t.evenement} · {t.code}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{t.contenu.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()}</p></div><Button type="button" variant="outline" onClick={()=>applyTemplate(t)}>Utiliser</Button></div>)}{!templates.length&&<p className="py-8 text-center text-muted-foreground">Aucun modèle enregistré en base.</p>}</CardContent></Card></TabsContent>

        <TabsContent value="segments">
          <Card><CardHeader><CardTitle>Segments disponibles</CardTitle></CardHeader><CardContent><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{segments.map((s) => <div key={s.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{s.nom}</p><p className="text-xs text-muted-foreground">{s.description}</p></div><Badge variant={s.actif ? "default" : "outline"}>{s.actif ? "Actif" : "Inactif"}</Badge></div><Button className="mt-3 w-full" variant="outline" onClick={() => { setCampaign({ ...campaign, audience: String(s.criteres?.audience || "tous"), segment_id: s.id }); void previewAudience(String(s.criteres?.audience || "tous")); }}>Utiliser ce segment</Button></div>)}</div></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => <div className="min-w-0 space-y-2"><Label>{label}</Label>{children}</div>;
const Status = ({ label, ok }: { label: string; ok: boolean }) => <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">{ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-muted-foreground" />}<span className="min-w-0 truncate">{label}</span><Badge className="ml-auto" variant={ok ? "default" : "outline"}>{ok ? "Pret" : "A configurer"}</Badge></div>;
const Preview = ({ count, sample }: { count: number; sample: any[] }) => <div className="rounded-lg border bg-muted/30 p-3"><p className="text-sm font-medium">{count} destinataire(s)</p><div className="mt-2 flex flex-wrap gap-2">{sample.slice(0, 8).map((x, i) => <Badge key={i} variant="outline">{x.nom_complet || x.email || x.telephone || "Contact"}</Badge>)}</div></div>;

export default GestionNotifications;
