import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatRecipientName, formatUserShortName, matchesAccentInsensitive } from "@/lib/utils";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Bell, Mail, MessageSquare, Send, Users, Zap, RefreshCw, Plus, Eye, Smartphone, CheckCircle2, AlertTriangle, PhoneCall, Paperclip, FileText, Image as ImageIcon, Video, X, MoreHorizontal, Pencil, Play, Pause, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ConfigurationSenndo from "@/pages/parametres/ConfigurationSenndo";

type Segment = { id: string; code: string; nom: string; description: string | null; criteres: Record<string, unknown>; actif: boolean };
type Campaign = {
  id: string; nom: string; description: string | null; canal: string; sujet: string | null; contenu: string;
  segment_id: string | null; criteres: Record<string, unknown>; statut: string; programme_le: string | null;
  total_destinataires: number; total_envoyes: number; total_echecs: number; media_attachments?: MediaAttachment[];
};
type MediaAttachment = { bucket: string; path: string; name: string; mimeType: string; size: number };
type NotificationTemplate = { id: string; code: string; nom: string; canal: string; evenement: string; sujet: string | null; contenu: string; actif: boolean; parcours: string | null; media_attachments?: MediaAttachment[] };
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

const recipientMatchesType = (r: any, types: string[]) => { if (!types.length) return true; const type = String(r.source_type || ""); return types.some((t) => t === "proprietaire_foncier" ? type.includes("proprietaire_foncier") : t === "beneficiaire_particulier" ? type.includes("beneficiaire_particulier") : t === "autre" ? !["client","lead","prospect","equipe"].includes(type) && !type.includes("proprietaire_foncier") && !type.includes("beneficiaire_particulier") : type === t); };
const normalizeSms = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const smsLength = (value: string) => Array.from(normalizeSms(value)).length
async function convertToSenndoImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`« ${file.name} » ignoré : seules les images sont acceptées. Les vidéos et documents ne peuvent pas être joints aux notifications WhatsApp.`);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Impossible de lire « ${file.name} » dans ce navigateur. Convertissez cette image en JPG, PNG ou WebP puis réessayez.`);
  }
  try {
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Conversion d’image indisponible dans ce navigateur.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error("Conversion WebP impossible.")),
      "image/webp", 0.88,
    ));
    if (!blob.size) throw new Error("L’image convertie est vide.");
    const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_") || "image";
    return new File([blob], baseName + ".webp", { type: "image/webp", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

const GestionNotifications = () => {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [campaignMedia, setCampaignMedia] = useState<MediaAttachment[]>([]);
  const [automationMedia, setAutomationMedia] = useState<MediaAttachment[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignRecipientCounts, setCampaignRecipientCounts] = useState<Record<string, number | null>>({});
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [deliveryCampaignFilter, setDeliveryCampaignFilter] = useState("all");
  const [deliveryChannelFilter, setDeliveryChannelFilter] = useState("all");
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("all");
  const [deliveryTypeFilter, setDeliveryTypeFilter] = useState("all");
  const [deliveryDateFilter, setDeliveryDateFilter] = useState("");
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
  const [recipientDirectory, setRecipientDirectory] = useState<any[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<Array<{source_type:string;source_id:string}>>([]);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [recipientTypes, setRecipientTypes] = useState<string[]>([]);
  const [campaignPendingFiles, setCampaignPendingFiles] = useState<File[]>([]);
  const [automationPendingFiles, setAutomationPendingFiles] = useState<File[]>([]);

  const smsCount = useMemo(() => smsLength(campaign.contenu), [campaign.contenu]);
  const automationSmsCount = useMemo(() => smsLength(automation.contenu), [automation.contenu]);
  const whatsappCount = useMemo(() => Array.from(campaign.contenu).length, [campaign.contenu]);
  const automationWhatsappCount = useMemo(() => Array.from(automation.contenu).length, [automation.contenu]);

  const load = async () => {
    setLoading(true);
    const [s, c, a, t, d] = await Promise.all([
      supabase.from("notification_segments").select("*").order("nom"),
      (supabase as any).from("notification_campaigns").select("*").order("created_at", { ascending: false }).limit(100),
      (supabase as any).from("notification_automations").select("*").order("nom"),
      (supabase as any).from("notification_templates").select("id,code,nom,canal,evenement,sujet,contenu,actif,parcours,media_attachments").order("evenement").order("canal"),
      (supabase as any).from("notification_deliveries").select("id,campaign_id,automation_id,recipient_name,recipient_phone,recipient_email,canal,statut,fournisseur,provider_message_id,erreur,sent_at,created_at,source_type,contenu").order("created_at", {ascending:false}).limit(1000),
    ]);
    if (s.error || c.error || a.error) toast.error("Impossible de charger la communication");
    setSegments((s.data || []) as Segment[]);
    const loadedCampaigns = (c.data || []) as Campaign[];
    setCampaigns(loadedCampaigns);
    // Resolve audience counts independently: a directory failure must not blank every campaign count.
    const details: Record<string, number> = {};
    let directoryByKey = new Map<string, any>();
    try {
      const directoryResponse = await callDispatch({ mode: "recipient_directory" });
      const directory = Array.isArray(directoryResponse.contacts) ? directoryResponse.contacts : [];
      directoryByKey = new Map(directory.map((r: any) => [String(r.source_type) + ":" + String(r.source_id), r]));
    } catch (error) {
      console.warn("Annuaire des destinataires indisponible; les audiences seront comptées via l’aperçu.", error);
    }
    await Promise.all(loadedCampaigns.map(async (item) => {
      const criteria: any = item.criteres || {};
      const selected = Array.isArray(criteria.selected_recipients) ? criteria.selected_recipients : null;
      if (selected) {
        const resolved = selected.filter((r: any) => directoryByKey.has(String(r.source_type) + ":" + String(r.source_id)));
        // Keep the persisted selection count visible even if the directory endpoint is temporarily unavailable.
        details[item.id] = directoryByKey.size ? resolved.length : null;
        return;
      }
      const audience = String(criteria.audience || "tous");
      try {
        const preview = await callDispatch({ mode: "preview", criteria });
        details[item.id] = Number(preview.count) || 0;
      } catch (error) {
        console.error("Impossible de prévisualiser l’audience de la campagne", item.id, error);
        details[item.id] = null;
      }
    }));
    setCampaignRecipientCounts(details);
    if (d.error) toast.error("Impossible de charger le journal des envois: " + d.error.message);
    setDeliveries(d.data || []);
    setAutomations((a.data || []) as Automation[]);
    setTemplates((t.data || []) as NotificationTemplate[]);
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

  const openRecipientPicker = async () => {
    setRecipientPickerOpen(true);
    if (recipientDirectory.length) return;
    setRecipientLoading(true);
    try { const data = await callDispatch({ mode: "recipient_directory" }); setRecipientDirectory(data.contacts || []); }
    catch (error: any) { toast.error(error.message || "Impossible de charger les destinataires"); }
    finally { setRecipientLoading(false); }
  };

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
    if (submittedCampaign.audience === "selection" && !selectedRecipients.some((r) => r?.source_type && r?.source_id)) return toast.error("Coche au moins un destinataire valide.");
    if ((submittedCampaign.canal === "sms" || submittedCampaign.canal === "email_sms") && smsCount > 155) return toast.error(`Le SMS fait ${smsCount} caractères : limite 155, espaces et signes compris.`);
    if (submittedCampaign.canal === "whatsapp" && whatsappCount > 4096) return toast.error(`Le message WhatsApp fait ${whatsappCount} caractères : limite 4096.`);
    const selected = submittedCampaign.segment_id || segments.find((s) => s.code === submittedCampaign.audience)?.id || null;
    let recipientCount = selectedRecipients.length;
    if (submittedCampaign.audience !== "selection") {
      try {
        const recipientPreview = await callDispatch({ mode: "preview", criteria: { audience: submittedCampaign.audience } });
        recipientCount = Number(recipientPreview.count) || 0;
      } catch (error: any) {
        return toast.error("Impossible de vérifier les destinataires : " + (error?.message || "erreur inconnue"));
      }
    }
    const manualSelection = submittedCampaign.audience === "selection";
    const normalizedSelectedRecipients = manualSelection
      ? Array.from(new Map(selectedRecipients.filter((r) => r?.source_type && r?.source_id).map((r) => [r.source_type + ":" + r.source_id, { source_type: r.source_type, source_id: r.source_id }])).values())
      : [];
    recipientCount = manualSelection ? normalizedSelectedRecipients.length : recipientCount;
    if (manualSelection && normalizedSelectedRecipients.length === 0) return toast.error("La sélection ne contient aucun destinataire valide. Ouvre le sélecteur, choisis au moins un contact et confirme la sélection.");
    const payload = {
      nom: submittedCampaign.nom.trim(), description: submittedCampaign.description || null, canal: submittedCampaign.canal,
      sujet: submittedCampaign.sujet || null, contenu: submittedCampaign.canal.includes("sms") ? normalizeSms(submittedCampaign.contenu) : submittedCampaign.contenu,
      media_attachments: submittedMedia, segment_id: manualSelection ? null : selected, criteres: manualSelection ? { audience: "tous", selected_recipients: normalizedSelectedRecipients } : { audience: submittedCampaign.audience },
      total_destinataires: recipientCount,
      statut: submittedCampaign.programme_le ? "programme" : "brouillon",
      programme_le: submittedCampaign.programme_le ? new Date(submittedCampaign.programme_le).toISOString() : null,
    };
    const saveQuery = editingCampaignId
      ? await (supabase as any).from("notification_campaigns").update(payload).eq("id", editingCampaignId)
      : await (supabase as any).from("notification_campaigns").insert(payload);
    if (saveQuery.error) return toast.error(saveQuery.error.message);
    toast.success(submittedCampaign.programme_le ? "Campagne programmée" : editingCampaignId ? "Campagne modifiée" : "Campagne enregistrée");
    setEditingCampaignId(null);
    setCampaignDialogOpen(false);
    setCampaign((current) => JSON.stringify(current) === JSON.stringify(submittedCampaign) ? { nom: "", description: "", canal: "app", sujet: "", contenu: "", segment_id: "", audience: "tous", programme_le: "" } : current);
    setCampaignMedia((current) => JSON.stringify(current) === JSON.stringify(submittedMedia) ? [] : current);
    setSelectedRecipients([]);
    setPreview(null);
    await load();
  };

  const sendCampaign = async (id: string) => {
    try {
      const data = await callDispatch({ mode: "campaign", campaign_id: id });
      const result = data.result || {};
      if (result.skipped) {
        toast.warning(`Campagne non envoyée : ${result.reason || "état non autorisé"}`);
      } else if (Number(result.failed || 0) > 0) {
        const detail = Array.isArray(result.errors) && result.errors.length ? ` Détail : ${result.errors[0]}` : "";
        toast.error(`Campagne : ${Number(result.sent || 0)} envoyé(s), ${Number(result.failed || 0)} échec(s).${detail}`);
      } else {
        toast.success(`Campagne terminée : ${Number(result.sent || 0)} envoi(s)`);
      }
      await load();
    } catch (error: any) { toast.error(error.message || "Envoi impossible"); }
  };

  const editCampaign = (item: Campaign) => {
    const criteria: any = item.criteres || {};
    setEditingCampaignId(item.id);
    setCampaign({
      nom: item.nom || "", description: item.description || "", canal: item.canal || "app", sujet: item.sujet || "",
      contenu: item.contenu || "", segment_id: item.segment_id || "", audience: Array.isArray(criteria.selected_recipients) ? "selection" : String(criteria.audience || "tous"),
      programme_le: item.programme_le ? new Date(item.programme_le).toISOString().slice(0,16) : "",
    });
    setSelectedRecipients(Array.isArray(criteria.selected_recipients) ? criteria.selected_recipients : []);
    setCampaignMedia([]);
    setCampaignDialogOpen(true);
    setUploadingMedia(true);
    void normalizeSavedImages(Array.isArray(item.media_attachments) ? item.media_attachments : [])\n      .then(setCampaignMedia).catch((error) => toast.error(error instanceof Error ? error.message : "Impossible de préparer les images."))\n      .finally(() => setUploadingMedia(false));
  };

  const updateCampaignStatus = async (item: Campaign, statut: string) => {
    const allowed = ["brouillon", "programme", "active", "suspendue", "en_cours", "termine", "partiel", "echoue", "annule"];
    if (!allowed.includes(statut)) return toast.error("Statut de campagne non reconnu.");
    const { error } = await (supabase as any).from("notification_campaigns").update({ statut, updated_at: new Date().toISOString() }).eq("id", item.id);
    if (error) return toast.error("Impossible de modifier la campagne : " + error.message);
    toast.success(statut === "suspendue" ? "Campagne suspendue" : statut === "active" ? "Campagne activée" : "Campagne mise à jour");
    await load();
  };

  const deleteCampaign = async (item: Campaign) => {
    if (!confirm("Supprimer la campagne « " + item.nom + " » ? Le journal d’envoi conservé ne sera pas supprimé.")) return;
    const { error } = await (supabase as any).from("notification_campaigns").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Campagne supprimée");
    await load();
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

  const toggleAutomation = async (item: Automation) => {
    const { error } = await (supabase as any).from("notification_automations").update({ actif: !item.actif }).eq("id", item.id);
    if (error) toast.error(error.message); else await load();
  };
  const uploadMedia = async (files: FileList | null, target: "campaign" | "automation") => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    if (selectedFiles.some(file => !file.type.startsWith("image/"))) {
      toast.error("Seules les images sont autorisées. Les vidéos et les documents sont ignorés.");
    }
    const imageFiles = selectedFiles.filter(file => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      if (target === "campaign") setCampaignPendingFiles([]); else setAutomationPendingFiles([]);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Connexion requise.");
    setUploadingMedia(true);
    const uploaded: MediaAttachment[] = [];
    try {
      // Convertir toutes les images avant l’aperçu et avant le téléversement.
      const convertedFiles: File[] = [];
      for (const original of imageFiles) convertedFiles.push(await convertToSenndoImage(original));
      if (target === "campaign") setCampaignPendingFiles(convertedFiles); else setAutomationPendingFiles(convertedFiles);
      for (const file of convertedFiles) {
        const name = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${crypto.randomUUID()}-${name}`;
        const { error } = await supabase.storage.from("notification-media").upload(path, file, {
          contentType: "image/webp", upsert: false,
        });
        if (error) throw error;
        uploaded.push({ bucket: "notification-media", path, name: file.name, mimeType: "image/webp", size: file.size });
      }
      if (target === "campaign") setCampaignMedia(v => [...v, ...uploaded]); else setAutomationMedia(v => [...v, ...uploaded]);
      toast.success("Images converties en WebP, prévisualisées et enregistrées.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Conversion ou téléversement impossible.");
    } finally {
      setUploadingMedia(false);
      if (target === "campaign") setCampaignPendingFiles([]); else setAutomationPendingFiles([]);
    }
  };
  const normalizeSavedImages = async (items: MediaAttachment[]): Promise<MediaAttachment[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Connexion requise.");
    const normalized: MediaAttachment[] = [];
    for (const item of items || []) {
      if (!item.mimeType?.startsWith("image/")) {
        toast.warning(`La pièce jointe non-image « ${item.name} » a été exclue.`);
        continue;
      }
      if (item.mimeType === "image/webp") { normalized.push(item); continue; }
      const { data: blob, error } = await supabase.storage.from(item.bucket || "notification-media").download(item.path);
      if (error || !blob) { toast.warning(`Impossible de convertir « ${item.name} » ; cette pièce jointe a été ignorée.`); continue; }
      try {
        const converted = await convertToSenndoImage(new File([blob], item.name, { type: item.mimeType }));
        const name = converted.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const newPath = `${user.id}/${crypto.randomUUID()}-${name}`;
        const { error: uploadError } = await supabase.storage.from("notification-media").upload(newPath, converted, { contentType: "image/webp", upsert: false });
        if (uploadError) throw uploadError;
        normalized.push({ bucket: "notification-media", path: newPath, name: converted.name, mimeType: "image/webp", size: converted.size });
        void supabase.storage.from(item.bucket || "notification-media").remove([item.path]);
      } catch (error) {
        toast.warning(`L’image « ${item.name} » n’a pas pu être convertie et a été exclue.`);
      }
    }
    return normalized;
  };
  const applyTemplate = async (t: NotificationTemplate) => {
    setCampaign(v=>({...v,canal:t.canal,sujet:t.sujet||"",contenu:t.contenu,nom:v.nom||t.nom}));
    setUploadingMedia(true);
    try { setCampaignMedia(await normalizeSavedImages(t.media_attachments || [])); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Impossible de préparer les images du modèle."); }
    finally { setUploadingMedia(false); }
  };
  const MediaPicker = ({target,items}:{target:"campaign"|"automation";items:MediaAttachment[]}) => <div className="space-y-2"><Label>Pièces jointes</Label><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><Paperclip className="h-4 w-4"/>{uploadingMedia?"Téléversement…":"Ajouter des fichiers"}<input type="file" className="hidden" multiple accept="image/*" disabled={uploadingMedia} onChange={e=>{void uploadMedia(e.target.files,target);e.currentTarget.value="";}}/></label>{(target==="campaign"?campaignPendingFiles:automationPendingFiles).map((file,index)=><div key={file.name+file.size+index} className="flex flex-col gap-2 rounded border border-dashed p-2 text-sm"><div className="font-medium">{file.name} · {(file.size/1048576).toFixed(1)} Mo · Aperçu avant envoi</div><PendingMediaPreview file={file}/></div>)}{items.map(item=><div key={item.path} className="flex flex-col gap-2 rounded border p-2 text-sm sm:flex-row sm:items-start">{<><ImageIcon className="h-4 w-4"/><MediaPreview item={item} kind="image"/></>}<span className="min-w-0 flex-1 truncate">{item.name} · {(item.size/1048576).toFixed(1)} Mo</span><Button size="icon" type="button" variant="ghost" onClick={()=>{if(target==="campaign")setCampaignMedia(v=>v.filter(x=>x.path!==item.path));else setAutomationMedia(v=>v.filter(x=>x.path!==item.path));void supabase.storage.from(item.bucket).remove([item.path]);}}><X className="h-4 w-4"/></Button></div>)}</div>;

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
            <TabsTrigger value="campaigns"><Send className="mr-2 h-4 w-4" />Campagnes</TabsTrigger><TabsTrigger value="deliveries"><CheckCircle2 className="mr-2 h-4 w-4"/>Journal des envois</TabsTrigger>
            <TabsTrigger value="automations"><Zap className="mr-2 h-4 w-4" />Automatisations</TabsTrigger>
            <TabsTrigger value="segments"><Users className="mr-2 h-4 w-4" />Destinataires</TabsTrigger><TabsTrigger value="templates"><FileText className="mr-2 h-4 w-4" />Modèles</TabsTrigger>
            <TabsTrigger value="senndo"><MessageSquare className="mr-2 h-4 w-4" />Passerelle Senndo</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="deliveries" className="space-y-5">
          <Card><CardHeader><CardTitle>Journal des envois et accusés de réception</CardTitle></CardHeader><CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Select value={deliveryCampaignFilter} onValueChange={setDeliveryCampaignFilter}><SelectTrigger><SelectValue placeholder="Toutes les campagnes"/></SelectTrigger><SelectContent><SelectItem value="all">Toutes les campagnes</SelectItem>{campaigns.map(x=><SelectItem key={x.id} value={x.id}>{x.nom}</SelectItem>)}</SelectContent></Select>
              <Select value={deliveryChannelFilter} onValueChange={setDeliveryChannelFilter}><SelectTrigger><SelectValue placeholder="Tous les canaux"/></SelectTrigger><SelectContent><SelectItem value="all">Tous les canaux</SelectItem>{CHANNELS.map(x=><SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select>
              <Select value={deliveryStatusFilter} onValueChange={setDeliveryStatusFilter}><SelectTrigger><SelectValue placeholder="Tous les statuts"/></SelectTrigger><SelectContent><SelectItem value="all">Tous les statuts</SelectItem>{["en_cours","envoye","livre","lu","echoue","en_attente"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
              <Select value={deliveryTypeFilter} onValueChange={setDeliveryTypeFilter}><SelectTrigger><SelectValue placeholder="Tous les types"/></SelectTrigger><SelectContent><SelectItem value="all">Tous les types</SelectItem><SelectItem value="campaign">Campagnes manuelles</SelectItem><SelectItem value="automation">Automatisations</SelectItem></SelectContent></Select>
              <Input type="date" value={deliveryDateFilter} onChange={e=>setDeliveryDateFilter(e.target.value)} aria-label="Filtrer par date"/>
            </div>
            <div className="text-sm text-muted-foreground">{deliveries.filter(d=>(deliveryCampaignFilter==="all"||d.campaign_id===deliveryCampaignFilter)&&(deliveryChannelFilter==="all"||d.canal===deliveryChannelFilter)&&(deliveryStatusFilter==="all"||d.statut===deliveryStatusFilter)&&(deliveryTypeFilter==="all"||(deliveryTypeFilter==="campaign"?Boolean(d.campaign_id):Boolean(d.automation_id)))&&(!deliveryDateFilter||String(d.created_at||"").slice(0,10)===deliveryDateFilter)).length} enregistrement(s) — « envoyé » signifie accepté par le fournisseur, pas nécessairement livré ou lu.</div>
            <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="border-b text-left"><th className="p-2">Date</th><th className="p-2">Destinataire</th><th className="p-2">Type</th><th className="p-2">Canal</th><th className="p-2">Statut</th><th className="p-2">Fournisseur / ID</th><th className="p-2">Erreur</th></tr></thead><tbody>{deliveries.filter(d=>(deliveryCampaignFilter==="all"||d.campaign_id===deliveryCampaignFilter)&&(deliveryChannelFilter==="all"||d.canal===deliveryChannelFilter)&&(deliveryStatusFilter==="all"||d.statut===deliveryStatusFilter)&&(deliveryTypeFilter==="all"||(deliveryTypeFilter==="campaign"?Boolean(d.campaign_id):Boolean(d.automation_id)))&&(!deliveryDateFilter||String(d.created_at||"").slice(0,10)===deliveryDateFilter)).map(d=><tr key={d.id} className="border-b align-top"><td className="p-2 whitespace-nowrap">{d.sent_at?new Date(d.sent_at).toLocaleString("fr-FR"):new Date(d.created_at).toLocaleString("fr-FR")}</td><td className="p-2">{d.recipient_name||"—"}<div className="text-xs text-muted-foreground">{d.recipient_phone||d.recipient_email||""}</div></td><td className="p-2">{d.campaign_id?"Campagne":d.automation_id?"Automatisé":"Manuel"}</td><td className="p-2">{d.canal}</td><td className="p-2"><Badge variant={["envoye","livre","lu"].includes(d.statut)?"default":d.statut==="echoue"?"destructive":"outline"}>{d.statut}</Badge></td><td className="p-2">{d.fournisseur||"—"}<div className="text-xs text-muted-foreground break-all">{d.provider_message_id||""}</div></td><td className="p-2 max-w-64 whitespace-normal text-destructive">{d.erreur||"—"}</td></tr>)}{!deliveries.length&&<tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Aucun envoi enregistré.</td></tr>}</tbody></table></div>
            <Button variant="outline" onClick={()=>void load()}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser le journal</Button>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-5">
          <Dialog open={campaignDialogOpen} onOpenChange={setCampaignDialogOpen}><DialogTrigger asChild><Button className="mb-3"><Plus className="mr-2 h-4 w-4"/>Créer une campagne</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><Card>
            <CardHeader><CardTitle>{editingCampaignId ? "Modifier la campagne" : "Nouvelle campagne"}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Nom"><Input value={campaign.nom} onChange={(e) => setCampaign({ ...campaign, nom: e.target.value })} placeholder="Campagne rentree agricole" /></Field>
                <Field label="Modèle enregistré"><Select value="" onValueChange={id=>{const t=templates.find(x=>x.id===id);if(t)applyTemplate(t);}}><SelectTrigger><SelectValue placeholder="Choisir un modèle"/></SelectTrigger><SelectContent>{templates.filter(t=>t.actif).map(t=><SelectItem key={t.id} value={t.id}>{t.nom} · {t.canal}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Canal"><Select value={campaign.canal} onValueChange={(v) => setCampaign({ ...campaign, canal: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Destinataires"><div className="flex gap-2"><Select value={campaign.audience === "selection" ? "selection" : campaign.audience} onValueChange={(v) => { setCampaign({ ...campaign, audience: v }); if (v !== "selection") void previewAudience(v); else void openRecipientPicker(); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AUDIENCES.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}<SelectItem value="selection">Sélection manuelle…</SelectItem></SelectContent></Select><Button type="button" variant="outline" onClick={() => void openRecipientPicker()}><Users className="mr-2 h-4 w-4"/>Choisir</Button></div>{campaign.audience === "selection" && <p className="text-xs text-muted-foreground">{selectedRecipients.length} destinataire(s) sélectionné(s)</p>}</Field>
                <Field label="Planification"><Input type="datetime-local" value={campaign.programme_le} onChange={(e) => setCampaign({ ...campaign, programme_le: e.target.value })} /></Field>
              </div>
              <Field label="Sujet email"><Input uppercase={false} value={campaign.sujet} onChange={(e) => setCampaign({ ...campaign, sujet: e.target.value })} placeholder="Information AgriCapital" /></Field>
              <Field label="Message"><Textarea uppercase={false} rows={5} value={campaign.contenu} onChange={(e) => setCampaign({ ...campaign, contenu: e.target.value })} placeholder="Bonjour {dernier_prenom_nom}, ..." /><div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">{campaign.canal.includes("sms") && <span className={smsCount > 155 ? "font-semibold text-destructive" : ""}>{smsCount}/155 caractères SMS</span>}{campaign.canal === "whatsapp" && <span className={whatsappCount > 4096 ? "font-semibold text-destructive" : ""}>{whatsappCount}/4096 caractères WhatsApp</span>}</div></Field><MediaPicker target="campaign" items={campaignMedia}/>
              {preview && <Preview count={preview.count} sample={preview.sample} />}
              <div className="flex flex-wrap gap-2"><Button onClick={createCampaign}><Plus className="mr-2 h-4 w-4" />{editingCampaignId ? "Enregistrer les modifications" : "Enregistrer la campagne"}</Button><Button variant="outline" onClick={() => void previewAudience(campaign.audience)} disabled={previewing}><Eye className="mr-2 h-4 w-4" />Apercu</Button></div>
            </CardContent>
          </Card></DialogContent></Dialog>

          <Card>
            <CardHeader><CardTitle>Campagnes recentes</CardTitle></CardHeader>
            <CardContent><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left"><th className="p-3">Campagne</th><th className="p-3">Canal</th><th className="p-3">Etat</th><th className="p-3">Dest.</th><th className="p-3">Envoyes</th><th className="p-3">Actions</th></tr></thead><tbody>{campaigns.map((c) => <tr key={c.id} className="border-b last:border-0"><td className="p-3 font-medium">{c.nom}</td><td className="p-3">{CHANNELS.find(x => x.value === c.canal)?.label || c.canal}</td><td className="p-3"><Badge variant={c.statut === "termine" ? "default" : "outline"}>{c.statut}</Badge></td><td className="p-3">{Object.prototype.hasOwnProperty.call(campaignRecipientCounts, c.id) ? (campaignRecipientCounts[c.id] ?? "—") : (Array.isArray(c.criteres?.selected_recipients) ? c.criteres.selected_recipients.length : (c.total_destinataires || 0))}</td><td className="p-3">{c.total_envoyes}</td><td className="p-3"><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="outline" aria-label={`Actions pour ${c.nom}`} title="Actions de la campagne"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuItem onSelect={() => editCampaign(c)} disabled={["en_cours","termine"].includes(c.statut)}><Pencil className="mr-2 h-4 w-4"/>Modifier</DropdownMenuItem>{["brouillon","suspendue","echoue","partiel"].includes(c.statut) ? <DropdownMenuItem onSelect={() => void updateCampaignStatus(c, "active")}><Play className="mr-2 h-4 w-4"/>Activer</DropdownMenuItem> : <DropdownMenuItem onSelect={() => void updateCampaignStatus(c, "suspendue")} disabled={["termine","annule"].includes(c.statut)}><Pause className="mr-2 h-4 w-4"/>Suspendre</DropdownMenuItem>}<DropdownMenuItem onSelect={() => void sendCampaign(c.id)} disabled={["termine","annule","en_cours"].includes(c.statut)}><Send className="mr-2 h-4 w-4"/>Envoyer</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void deleteCampaign(c)} disabled={c.statut === "en_cours"}><Trash2 className="mr-2 h-4 w-4"/>Supprimer</DropdownMenuItem></DropdownMenuContent></DropdownMenu></td></tr>)}{!loading && campaigns.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Aucune campagne</td></tr>}</tbody></table></div></CardContent>
          </Card>
        <Dialog open={recipientPickerOpen} onOpenChange={setRecipientPickerOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><Card><CardHeader><CardTitle>Choisir les destinataires</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={recipientSearch} onChange={e=>setRecipientSearch(e.target.value)} placeholder="Rechercher un nom, téléphone ou e-mail…"/><div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border p-3 text-sm sm:grid-cols-3">{[["client","Clients"],["proprietaire_foncier","Propriétaires fonciers"],["equipe","Collaborateurs"],["lead","Leads"],["prospect","Prospects"],["beneficiaire_particulier","Bénéficiaires particuliers"],["autre","Autres"]].map(([value,label])=><label key={value} className="flex min-w-0 items-center gap-2"><input type="checkbox" className="h-4 w-4 shrink-0" checked={recipientTypes.includes(value)} onChange={e=>setRecipientTypes(current=>e.target.checked?[...current,value]:current.filter(x=>x!==value))}/><span>{label}</span></label>)}</div><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{selectedRecipients.length} sélectionné(s)</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={()=>setSelectedRecipients(recipientDirectory.filter((r:any)=>recipientMatchesType(r,recipientTypes)).map((r:any)=>({source_type:r.source_type,source_id:r.source_id})))}>Tout cocher</Button><Button type="button" variant="outline" size="sm" onClick={()=>setSelectedRecipients([])}>Tout décocher</Button></div></div><div className="max-h-[42dvh] space-y-1 overflow-y-auto rounded-md border p-2">{recipientLoading ? <p className="p-4 text-sm">Chargement de tous les contacts…</p> : recipientDirectory.filter((r:any)=>recipientMatchesType(r,recipientTypes)&&[r.nom_complet,r.email,r.telephone].some((v:any)=>matchesAccentInsensitive(v, recipientSearch))).length === 0 ? <div className="p-4 text-sm text-muted-foreground">Aucun destinataire dans ce filtre. Décochez les catégories ou choisissez « Tout le monde » pour afficher tous les contacts.</div> : recipientDirectory.filter((r:any)=>recipientMatchesType(r,recipientTypes)&&[r.nom_complet,r.email,r.telephone].some((v:any)=>matchesAccentInsensitive(v, recipientSearch))).map((r:any)=>{const key={source_type:r.source_type,source_id:r.source_id};const checked=selectedRecipients.some(x=>x.source_type===key.source_type&&x.source_id===key.source_id);return <label key={r.source_type+":"+r.source_id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted"><input type="checkbox" checked={checked} onChange={e=>setSelectedRecipients(current=>e.target.checked?[...current.filter(x=>x.source_id!==key.source_id||x.source_type!==key.source_type),key]:current.filter(x=>x.source_id!==key.source_id||x.source_type!==key.source_type))}/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.nom_complet ? formatRecipientName(r.nom_complet, r.source_type) : "Contact sans nom"}</span><span className="block truncate text-xs text-muted-foreground">{r.source_type} · {[r.telephone,r.email].filter(Boolean).join(" · ")}</span></span></label>})}</div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={()=>setRecipientPickerOpen(false)}>Annuler</Button><Button type="button" onClick={()=>{const chosen=recipientDirectory.filter((r:any)=>selectedRecipients.some(x=>x.source_type===r.source_type&&x.source_id===r.source_id));setCampaign(c=>({...c,audience:"selection",segment_id:""}));setRecipientPickerOpen(false);setPreview({count:selectedRecipients.length,sample:chosen.slice(0,20)});}}>Confirmer la sélection</Button></div></CardContent></Card></DialogContent></Dialog>
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
              <Field label="Message"><Textarea uppercase={false} rows={5} value={automation.contenu} onChange={(e) => setAutomation({ ...automation, contenu: e.target.value })} placeholder="Bonjour {dernier_prenom_nom}, votre plantation est activée..." />{automation.canal.includes("sms") && <p className={automationSmsCount > 155 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{automationSmsCount}/155 caractères SMS.</p>}{automation.canal === "whatsapp" && <p className={automationWhatsappCount > 4096 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{automationWhatsappCount}/4096 caractères WhatsApp.</p>}</Field><MediaPicker target="automation" items={automationMedia}/>
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

        <TabsContent value="templates"><Card><CardHeader><CardTitle>Modèles de messages</CardTitle></CardHeader><CardContent className="space-y-3">{templates.map(t=><div key={t.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{t.nom}</span><Badge variant="outline">{t.canal}</Badge><Badge variant={t.actif?"default":"secondary"}>{t.actif?"Actif":"Inactif"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{t.evenement} · {t.code}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{t.contenu.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()}</p></div><Button type="button" variant="outline" onClick={()=>applyTemplate(t)}>Utiliser</Button></div>)}{!templates.length&&<p className="py-8 text-center text-muted-foreground">Aucun modèle enregistré en base.</p>}</CardContent></Card></TabsContent>

        <TabsContent value="segments">
          <Card><CardHeader><CardTitle>Segments disponibles</CardTitle></CardHeader><CardContent><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{segments.map((s) => <div key={s.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{s.nom}</p><p className="text-xs text-muted-foreground">{s.description}</p></div><Badge variant={s.actif ? "default" : "outline"}>{s.actif ? "Actif" : "Inactif"}</Badge></div><Button className="mt-3 w-full" variant="outline" onClick={() => { setCampaign({ ...campaign, audience: String(s.criteres?.audience || "tous"), segment_id: s.id }); void previewAudience(String(s.criteres?.audience || "tous")); }}>Utiliser ce segment</Button></div>)}</div></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const PendingMediaPreview = ({file}:{file:File}) => { const [url,setUrl]=useState(""); useEffect(()=>{const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next)},[file]); if(!url)return null; return <div className="space-y-1"><img src={url} alt={file.name} className="max-h-48 max-w-full rounded object-contain"/><p className="text-xs text-muted-foreground">Aperçu du fichier converti · WebP · prêt pour Senndo</p></div>;};
const MediaPreview = ({item,kind}:{item:MediaAttachment;kind:"image"|"video"|"document"}) => { const [url,setUrl]=useState(""); useEffect(()=>{let active=true;void supabase.storage.from(item.bucket).createSignedUrl(item.path,600).then(({data})=>{if(active&&data?.signedUrl)setUrl(data.signedUrl)});return()=>{active=false}},[item.bucket,item.path]); if(!url)return <span className="text-xs text-muted-foreground">Préparation de l’aperçu…</span>; if(kind==="image")return <img src={url} alt={item.name} className="max-h-48 max-w-full rounded object-contain"/>; if(kind==="video")return <video src={url} controls preload="metadata" className="max-h-56 max-w-full rounded"/>; if(item.mimeType==="application/pdf")return <iframe src={url} title={item.name} className="h-64 w-full rounded border"/>; if(/\.(doc|docx|xls|xlsx|ppt|pptx)$/i.test(item.name))return <iframe src={"https://view.officeapps.live.com/op/embed.aspx?src="+encodeURIComponent(url)} title={item.name} className="h-64 w-full rounded border"/>; if(item.mimeType.startsWith("text/")||/\.(txt|csv)$/i.test(item.name))return <iframe src={url} title={item.name} className="h-48 w-full rounded border"/>; return <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">Prévisualiser / ouvrir le document</a>;};

const Field = ({ label, children }: { label: string; children: ReactNode }) => <div className="min-w-0 space-y-2"><Label>{label}</Label>{children}</div>;
const Status = ({ label, ok }: { label: string; ok: boolean }) => <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">{ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-muted-foreground" />}<span className="min-w-0 truncate">{label}</span><Badge className="ml-auto" variant={ok ? "default" : "outline"}>{ok ? "Pret" : "A configurer"}</Badge></div>;
const Preview = ({ count, sample }: { count: number; sample: any[] }) => <div className="rounded-lg border bg-muted/30 p-3"><p className="text-sm font-medium">{count} destinataire(s)</p><div className="mt-2 flex flex-wrap gap-2">{sample.slice(0, 8).map((x, i) => <Badge key={i} variant="outline">{x.nom_complet ? formatUserShortName(x.nom_complet) : x.email || x.telephone || "Contact"}</Badge>)}</div></div>;

export default GestionNotifications;
