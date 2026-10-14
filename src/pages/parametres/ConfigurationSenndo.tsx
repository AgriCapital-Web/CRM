import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Save, Webhook, MessageSquare, Mail, PhoneCall, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";

type Status = { apiKey: boolean; apiValid: boolean; webhookSecret: boolean; emailSenderId: boolean; whatsappSenderPhone: boolean; whatsappSession: "unknown" | "connected" | "disconnected"; statusErrors?: Record<string, string>; apiError?: string | null };

const webhookUrl = "https://rfzfsmpsuempafhkqhra.supabase.co/functions/v1/senndo-webhook";

export default function ConfigurationSenndo() {
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [emailSenderId, setEmailSenderId] = useState("");
  const [whatsappSenderPhone, setWhatsappSenderPhone] = useState("+22564551717");
  const [status, setStatus] = useState<Status>({ apiKey: false, apiValid: false, webhookSecret: false, emailSenderId: false, whatsappSenderPhone: false, whatsappSession: "unknown" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testChannel, setTestChannel] = useState<"sms" | "email" | "whatsapp" | "voice">("sms");
  const [testDestination, setTestDestination] = useState("");
  const [testSubject, setTestSubject] = useState("Test AgriCapital");
  const [testMessage, setTestMessage] = useState("Ceci est un message de test de la passerelle de notifications AgriCapital.");
  const [sendingTest, setSendingTest] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("senndo-config", { body: { mode: "status" } });
    if (error || !data?.ok) {
      toast.error("Impossible de vérifier la configuration Senndo. Vérifiez vos droits administrateur.");
    } else {
      setStatus({ apiKey: Boolean(data.configured?.apiKey), apiValid: Boolean(data.configured?.apiValid), webhookSecret: Boolean(data.configured?.webhookSecret), emailSenderId: Boolean(data.configured?.emailSenderId), whatsappSenderPhone: Boolean(data.configured?.whatsappSenderPhone), whatsappSession: data.configured?.whatsappSession || "unknown", statusErrors: data.statusErrors || {}, apiError: data.apiError || null });
      setEmailSenderId(typeof data.emailSenderId === "string" ? data.emailSenderId : "");
      setWhatsappSenderPhone(typeof data.whatsappSenderPhone === "string" && data.whatsappSenderPhone ? data.whatsappSenderPhone : "+22564551717");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("senndo-config", { body: { mode: "test" } });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Test de connexion refusé");
      const count = Array.isArray(data.senderIds) ? data.senderIds.length : 0;
      toast.success(`Clé API valide. ${count} expéditeur(s) déclaré(s) par Senndo.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connexion Senndo impossible");
    } finally {
      setTesting(false);
    }
  };

  const sendTest = async () => {
    const destination = testDestination.trim();
    if (!destination) {
      toast.error(testChannel === "email" ? "Saisissez l'adresse e-mail de destination." : "Saisissez le numéro de destination au format international, par exemple +2250700000000.");
      return;
    }
    if (!testMessage.trim()) {
      toast.error("Le message de test ne peut pas être vide.");
      return;
    }
    if (testChannel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
      toast.error("L'adresse e-mail de destination est invalide.");
      return;
    }
    // Do not reject phone destinations in the browser based on a duplicated regex.
    // Normalize formatting and let the server return a precise validation error.
    const normalizedDestination = testChannel === "email"
      ? destination
      : "+" + destination.replace(/\D/g, "");
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("senndo-test-send", {
        body: { channel: testChannel, to: normalizedDestination, subject: testSubject.trim(), text: testMessage.trim() },
      });
      if (error) {
        // Supabase wraps non-2xx responses in FunctionsHttpError and puts the
        // JSON response body on context. Read it so users see the real reason.
        let serverMessage = data?.error;
        try {
          const context = (error as any).context;
          if (context && typeof context.clone === "function") {
            const payload = await context.clone().json();
            if (typeof payload?.error === "string" && payload.error.trim()) serverMessage = payload.error;
          }
        } catch {
          // Fall back to the SDK's safe generic message if no JSON body exists.
        }
        throw new Error(serverMessage || error.message || "Envoi de test refusé");
      }
      if (!data?.ok) throw new Error(data?.error || "Envoi de test refusé");
      toast.success(`Test accepté par Senndo · ${testChannel.toUpperCase()} · Référence : ${data.messageId || "non communiquée"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec de l'envoi de test.");
    } finally {
      setSendingTest(false);
    }
  };

  const save = async () => {
    if (!apiKey.trim() && !webhookSecret.trim() && !emailSenderId.trim() && !whatsappSenderPhone.trim()) {
      toast.error("Saisissez au moins une valeur à enregistrer.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = { mode: "save" };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      if (webhookSecret.trim()) payload.webhookSecret = webhookSecret.trim();
      if (emailSenderId.trim()) payload.emailSenderId = emailSenderId.trim();
      if (whatsappSenderPhone.trim()) payload.whatsappSenderPhone = whatsappSenderPhone.trim();
      const { data, error } = await supabase.functions.invoke("senndo-config", { body: payload });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Enregistrement refusé");
      setApiKey("");
      setWebhookSecret("");
      await refreshStatus();
      toast.success("Configuration enregistrée dans le coffre-fort serveur.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec de l'enregistrement sécurisé.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div><h2 className="text-2xl font-semibold tracking-tight">Passerelle Senndo</h2></div>

      {(status.apiError || Object.keys(status.statusErrors || {}).length > 0) && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"><p className="font-medium">Diagnostic de configuration</p>{status.apiError && <p>{status.apiError}</p>}{Object.entries(status.statusErrors || {}).map(([key, message]) => <p key={key}>{key} : {message}</p>)}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>SMS</CardDescription><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />AgriCapital</CardTitle></CardHeader><CardContent><Badge variant={status.apiValid ? "default" : "secondary"}>{status.apiValid ? "API vérifiée" : status.apiKey ? "Clé enregistrée · test requis" : "Clé à configurer"}</Badge></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>E-mail</CardDescription><CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" />Senndo</CardTitle></CardHeader><CardContent><Badge variant={status.emailSenderId ? "default" : "secondary"}>{status.emailSenderId ? "Expéditeur enregistré" : "Expéditeur à renseigner"}</Badge></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>WhatsApp appairé</CardDescription><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />Business AgriCapital</CardTitle></CardHeader><CardContent><Badge variant={status.whatsappSession === "connected" ? "default" : "secondary"}>{status.whatsappSession === "connected" ? "Session connectée" : status.whatsappSession === "disconnected" ? "Session non connectée" : status.apiKey ? "État à vérifier" : "Clé API requise"}</Badge></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Appels vocaux</CardDescription><CardTitle className="flex items-center gap-2 text-base"><PhoneCall className="h-4 w-4" />Senndo Voice</CardTitle></CardHeader><CardContent><Badge variant={status.apiValid ? "default" : "secondary"}>{status.apiValid ? "API accessible" : status.apiKey ? "Accès à vérifier" : "Clé API requise"}</Badge></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tester les envois en conditions réelles</CardTitle>
          
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="senndo-test-channel">Canal à tester</Label>
              <select id="senndo-test-channel" value={testChannel} onChange={(e) => setTestChannel(e.target.value as typeof testChannel)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="sms">SMS · Sender ID AgriCapital</option>
                <option value="email">E-mail · expéditeur vérifié</option>
                <option value="whatsapp">WhatsApp appairé · +225 05 64 55 17 17</option>
                <option value="voice">Appel vocal · Senndo Voice</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="senndo-test-destination">{testChannel === "email" ? "Adresse e-mail de destination" : "Numéro de destination"}</Label>
              <Input id="senndo-test-destination" type={testChannel === "email" ? "email" : "tel"} value={testDestination} onChange={(e) => setTestDestination(e.target.value)} placeholder={testChannel === "email" ? "votre.adresse@exemple.ci" : "+2250700000000"} autoComplete="off" />

            </div>
          </div>
{testChannel === "email" && <div className="space-y-2">
            <Label htmlFor="senndo-test-subject">Objet de l'e-mail</Label>
            <Input id="senndo-test-subject" value={testSubject} onChange={(e) => setTestSubject(e.target.value)} maxLength={150} />
          </div>}
          <div className="space-y-2">
            <Label htmlFor="senndo-test-message">Contenu du test</Label>
            <Textarea id="senndo-test-message" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={3} maxLength={1000} />
            
          </div>
          <Button onClick={() => void sendTest()} disabled={sendingTest || loading || !testDestination.trim() || !testMessage.trim()}>
            <Send className="mr-2 h-4 w-4" />{sendingTest ? "Envoi du test…" : `Envoyer le test ${testChannel.toUpperCase()}`}
          </Button>
          
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identifiants API</CardTitle>
          
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="senndo-api-key">Clé API Senndo</Label>
            <Input id="senndo-api-key" type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={status.apiKey ? "Clé déjà enregistrée · saisir uniquement pour remplacer" : "sk_live_… ou sk_test_…"} spellCheck={false} autoCapitalize="none" />
            
          </div>
          <div className="space-y-2">
            <Label htmlFor="senndo-whatsapp-sender">Numéro WhatsApp appairé AgriCapital</Label>
            <Input id="senndo-whatsapp-sender" type="tel" value={whatsappSenderPhone} onChange={(e) => setWhatsappSenderPhone(e.target.value)} placeholder="+22564551717" autoComplete="off" spellCheck={false} />
            <p className="text-xs text-muted-foreground">Numéro utilisé pour retrouver automatiquement la session connectée dans Senndo.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="senndo-email-sender">Adresse expéditrice e-mail vérifiée</Label>
            <Input id="senndo-email-sender" type="email" autoComplete="email" value={emailSenderId} onChange={(e) => setEmailSenderId(e.target.value)} placeholder={status.emailSenderId ? "Adresse déjà configurée" : "notifications@votre-domaine.ci"} spellCheck={false} autoCapitalize="none" />
            
          </div>
          <div className="space-y-2">
            <Label htmlFor="senndo-webhook-secret">Secret de signature du webhook Senndo</Label>
            <Input id="senndo-webhook-secret" type="password" autoComplete="new-password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={status.webhookSecret ? "Secret déjà enregistré · saisir uniquement pour remplacer" : "Secret communiqué à la création du webhook"} spellCheck={false} autoCapitalize="none" />
            
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={saving || loading}><Save className="mr-2 h-4 w-4" />{saving ? "Enregistrement sécurisé…" : "Enregistrer côté serveur"}</Button>
            <Button variant="outline" onClick={() => void refreshStatus()} disabled={loading || saving || testing}><RefreshCw className="mr-2 h-4 w-4" />Vérifier l'état</Button>
            <Button variant="outline" onClick={() => void testConnection()} disabled={loading || saving || testing}><CheckCircle2 className="mr-2 h-4 w-4" />{testing ? "Test en cours…" : "Tester la connexion API"}</Button>
            
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-2 font-medium"><Webhook className="h-4 w-4" />URL de réception webhook</div>
            <code className="block break-all text-xs">{webhookUrl}</code>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(webhookUrl).then(() => toast.success("URL copiée")).catch(() => toast.error("Copie impossible sur cet appareil")); }}>Copier l'URL</Button>
            
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
