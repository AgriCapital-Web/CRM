import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Mail, MessageSquare, Send, Users, Zap, RefreshCw, Plus, Eye, Smartphone, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Segment = { id: string; code: string; nom: string; description: string | null; criteres: Record<string, unknown>; actif: boolean };
type Campaign = {
  id: string; nom: string; description: string | null; canal: string; sujet: string | null; contenu: string;
  segment_id: string | null; criteres: Record<string, unknown>; statut: string; programme_le: string | null;
  total_destinataires: number; total_envoyes: number; total_echecs: number;
};
type Automation = {
  id: string; code: string; nom: string; description: string | null; evenement: string; canal: string;
  sujet: string | null; contenu: string; criteres: Record<string, unknown>; actif: boolean; cooldown_minutes: number;
};

const CHANNELS = [
  { value: "app", label: "Notification app", icon: Bell },
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: Smartphone },
  { value: "email_sms", label: "Email + SMS", icon: MessageSquare },
  { value: "auto", label: "Automatique (routage AgriCapital)", icon: Zap },
];

const EVENTS = [
  ["paiement_recu", "Paiement recu"],
  ["paiement_echeance", "Echeance de paiement"],
  ["paiement_retard", "Retard de paiement"],
  ["document_valide", "Document valide"],
  ["compte_active", "Compte active"],
  ["visite_technique", "Visite technique"],
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
  ["prospects", "Tous les prospects"],
  ["equipe", "Equipe interne"],
  ["commerciaux", "Commerciaux"],
  ["palminvest", "Clients PalmInvest"],
  ["terrapalm", "Clients TerraPalm"],
  ["palmterroir", "Clients PalmTerroir"],
  ["proprietaires_fonciers", "Propriétaires fonciers"],
  ["beneficiaires_particuliers", "Bénéficiaires particuliers"],
];

const normalizeSms = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim().slice(0, 150);

const GestionNotifications = () => {
  const [segments, setSegments] = useState<Segment[]>([]);
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

  const smsCount = useMemo(() => normalizeSms(campaign.contenu).length, [campaign.contenu]);
  const automationSmsCount = useMemo(() => normalizeSms(automation.contenu).length, [automation.contenu]);

  const load = async () => {
    setLoading(true);
    const [s, c, a] = await Promise.all([
      supabase.from("notification_segments").select("*").order("nom"),
      supabase.from("notification_campaigns").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("notification_automations").select("*").order("nom"),
    ]);
    if (s.error || c.error || a.error) toast.error("Impossible de charger la communication");
    setSegments((s.data || []) as Segment[]);
    setCampaigns((c.data || []) as Campaign[]);
    setAutomations((a.data || []) as Automation[]);
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
    if (!campaign.nom.trim() || !campaign.contenu.trim()) return toast.error("Nom et contenu obligatoires");
    if ((campaign.canal === "sms" || campaign.canal === "email_sms") && smsCount > 150) return toast.error("Le SMS doit faire 150 caracteres maximum");
    const selected = campaign.segment_id || segments.find((s) => s.code === campaign.audience)?.id || null;
    const { error } = await supabase.from("notification_campaigns").insert({
      nom: campaign.nom.trim(), description: campaign.description || null, canal: campaign.canal,
      sujet: campaign.sujet || null, contenu: campaign.canal.includes("sms") ? normalizeSms(campaign.contenu) : campaign.contenu,
      segment_id: selected, criteres: { audience: campaign.audience },
      statut: campaign.programme_le ? "programme" : "brouillon",
      programme_le: campaign.programme_le ? new Date(campaign.programme_le).toISOString() : null,
    });
    if (error) return toast.error(error.message);
    toast.success(campaign.programme_le ? "Campagne programmee" : "Campagne enregistree");
    setCampaign({ nom: "", description: "", canal: "app", sujet: "", contenu: "", segment_id: "", audience: "tous", programme_le: "" });
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
    if (!automation.nom.trim() || !automation.code.trim() || !automation.contenu.trim()) return toast.error("Code, nom et contenu obligatoires");
    if ((automation.canal === "sms" || automation.canal === "email_sms") && automationSmsCount > 150) return toast.error("Le SMS doit faire 150 caracteres maximum");
    const { error } = await supabase.from("notification_automations").upsert({
      code: automation.code.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
      nom: automation.nom.trim(), description: automation.description || null,
      evenement: automation.evenement, canal: automation.canal, sujet: automation.sujet || null,
      contenu: automation.canal.includes("sms") ? normalizeSms(automation.contenu) : automation.contenu,
      criteres: { audience: automation.audience }, actif: automation.actif,
      cooldown_minutes: Math.max(0, Number(automation.cooldown_minutes) || 0),
    }, { onConflict: "code" });
    if (error) return toast.error(error.message);
    toast.success("Automatisation enregistree");
    setAutomation({ ...automation, code: "", nom: "", description: "", sujet: "", contenu: "" });
    await load();
  };

  const toggleAutomation = async (item: Automation) => {
    const { error } = await supabase.from("notification_automations").update({ actif: !item.actif }).eq("id", item.id);
    if (error) toast.error(error.message); else await load();
  };

  return (
    <div className="w-full max-w-full min-w-0 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2"><Bell className="h-5 w-5 shrink-0" /> Communication et notifications</CardTitle>
              <CardDescription className="break-anywhere">
                Notifications app, SMS, emails et routage automatique selon le profil, la situation et le canal disponible. Les propriétaires fonciers et bénéficiaires particuliers ont un parcours distinct des clients payants.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => { void checkProviders(); void load(); }}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Status label="Resend email" ok={Boolean(provider.resend_email)} />
            <Status label="Brevo email" ok={Boolean(provider.brevo_email)} />
            <Status label="Brevo SMS" ok={Boolean(provider.brevo_sms)} />
            <Status label="WhatsApp Cloud" ok={Boolean(provider.whatsapp)} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="campaigns" className="w-full min-w-0">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex min-w-max">
            <TabsTrigger value="campaigns"><Send className="mr-2 h-4 w-4" />Campagnes</TabsTrigger>
            <TabsTrigger value="automations"><Zap className="mr-2 h-4 w-4" />Automatisations</TabsTrigger>
            <TabsTrigger value="segments"><Users className="mr-2 h-4 w-4" />Destinataires</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="campaigns" className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Nouvelle campagne</CardTitle><CardDescription>Choisissez le canal, les destinataires et le moment d'envoi.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Nom"><Input value={campaign.nom} onChange={(e) => setCampaign({ ...campaign, nom: e.target.value })} placeholder="Campagne rentree agricole" /></Field>
                <Field label="Canal"><Select value={campaign.canal} onValueChange={(v) => setCampaign({ ...campaign, canal: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Destinataires"><Select value={campaign.audience} onValueChange={(v) => { setCampaign({ ...campaign, audience: v }); void previewAudience(v); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AUDIENCES.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Planification"><Input type="datetime-local" value={campaign.programme_le} onChange={(e) => setCampaign({ ...campaign, programme_le: e.target.value })} /></Field>
              </div>
              <Field label="Sujet email"><Input uppercase={false} value={campaign.sujet} onChange={(e) => setCampaign({ ...campaign, sujet: e.target.value })} placeholder="Information AgriCapital" /></Field>
              <Field label="Message"><Textarea uppercase={false} rows={5} value={campaign.contenu} onChange={(e) => setCampaign({ ...campaign, contenu: e.target.value })} placeholder="Bonjour {{prenom}}, ..." /><div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>Variables : {"{{prenom}}"}, {"{{nom}}"}, {"{{offre}}"}, {"{{date}}"}</span>{campaign.canal.includes("sms") && <span className={smsCount > 150 ? "font-semibold text-destructive" : ""}>{smsCount}/150 caracteres SMS</span>}</div></Field>
              {preview && <Preview count={preview.count} sample={preview.sample} />}
              <div className="flex flex-wrap gap-2"><Button onClick={createCampaign}><Plus className="mr-2 h-4 w-4" />Enregistrer la campagne</Button><Button variant="outline" onClick={() => void previewAudience(campaign.audience)} disabled={previewing}><Eye className="mr-2 h-4 w-4" />Apercu</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Campagnes recentes</CardTitle></CardHeader>
            <CardContent><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left"><th className="p-3">Campagne</th><th className="p-3">Canal</th><th className="p-3">Etat</th><th className="p-3">Dest.</th><th className="p-3">Envoyes</th><th className="p-3">Actions</th></tr></thead><tbody>{campaigns.map((c) => <tr key={c.id} className="border-b last:border-0"><td className="p-3 font-medium">{c.nom}</td><td className="p-3">{CHANNELS.find(x => x.value === c.canal)?.label || c.canal}</td><td className="p-3"><Badge variant={c.statut === "termine" ? "default" : "outline"}>{c.statut}</Badge></td><td className="p-3">{c.total_destinataires}</td><td className="p-3">{c.total_envoyes}</td><td className="p-3"><Button size="sm" variant="outline" onClick={() => void sendCampaign(c.id)} disabled={c.statut === "termine" || c.statut === "annule"}><Send className="mr-2 h-4 w-4" />Envoyer</Button></td></tr>)}{!loading && campaigns.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Aucune campagne</td></tr>}</tbody></table></div></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automations" className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Automatisation conditionnelle</CardTitle><CardDescription>Un evenement peut declencher automatiquement une notification ciblee.</CardDescription></CardHeader>
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
              <Field label="Message"><Textarea uppercase={false} rows={5} value={automation.contenu} onChange={(e) => setAutomation({ ...automation, contenu: e.target.value })} placeholder="Bonjour {{prenom}}, votre plantation est activée..." />{automation.canal.includes("sms") && <p className={automationSmsCount > 150 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{automationSmsCount}/150 caracteres SMS, accents supprimes automatiquement.</p>}<p className="text-xs text-muted-foreground">Variables disponibles : {"{{prenom}}"}, {"{{nom}}"}, {"{{surface}}"}, {"{{village}}"}, {"{{lot_reference}}"}, {"{{date_activation}}"}. Le canal « Automatique » applique le routage AgriCapital et le fallback email.</p></Field>
              <div className="flex items-center gap-2"><Switch checked={automation.actif} onCheckedChange={(v) => setAutomation({ ...automation, actif: v })} /><Label>Activer automatiquement</Label></div>
              <Button onClick={saveAutomation}><Zap className="mr-2 h-4 w-4" />Enregistrer l'automatisation</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Automatisations actives</CardTitle></CardHeader>
            <CardContent className="space-y-2">{automations.map((a) => <div key={a.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{a.nom}</span><Badge variant="outline">{a.evenement}</Badge></div><p className="mt-1 break-anywhere text-sm text-muted-foreground">{a.canal} · {String(a.criteres?.audience || "tous")} · anti-doublon {a.cooldown_minutes} min</p></div><Switch checked={a.actif} onCheckedChange={() => void toggleAutomation(a)} /></div>)}{!loading && automations.length === 0 && <p className="py-8 text-center text-muted-foreground">Aucune automatisation</p>}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="segments">
          <Card><CardHeader><CardTitle>Segments disponibles</CardTitle><CardDescription>Les destinataires sont resolus au moment de l'envoi. Une campagne reste donc dynamique.</CardDescription></CardHeader><CardContent><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{segments.map((s) => <div key={s.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{s.nom}</p><p className="text-xs text-muted-foreground">{s.description}</p></div><Badge variant={s.actif ? "default" : "outline"}>{s.actif ? "Actif" : "Inactif"}</Badge></div><Button className="mt-3 w-full" variant="outline" onClick={() => { setCampaign({ ...campaign, audience: String(s.criteres?.audience || "tous"), segment_id: s.id }); void previewAudience(String(s.criteres?.audience || "tous")); }}>Utiliser ce segment</Button></div>)}</div></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => <div className="min-w-0 space-y-2"><Label>{label}</Label>{children}</div>;
const Status = ({ label, ok }: { label: string; ok: boolean }) => <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">{ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-muted-foreground" />}<span className="min-w-0 truncate">{label}</span><Badge className="ml-auto" variant={ok ? "default" : "outline"}>{ok ? "Pret" : "A configurer"}</Badge></div>;
const Preview = ({ count, sample }: { count: number; sample: any[] }) => <div className="rounded-lg border bg-muted/30 p-3"><p className="text-sm font-medium">{count} destinataire(s)</p><div className="mt-2 flex flex-wrap gap-2">{sample.slice(0, 8).map((x, i) => <Badge key={i} variant="outline">{x.nom_complet || x.email || x.telephone || "Contact"}</Badge>)}</div></div>;

export default GestionNotifications;
