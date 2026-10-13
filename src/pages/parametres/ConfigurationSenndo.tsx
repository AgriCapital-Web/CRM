import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, RefreshCw, Save, Webhook, MessageSquare, Mail, PhoneCall, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";

type Status = { apiKey: boolean; webhookSecret: boolean; emailSenderId: boolean };

const webhookUrl = "https://rfzfsmpsuempafhkqhra.supabase.co/functions/v1/senndo-webhook";

export default function ConfigurationSenndo() {
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [emailSenderId, setEmailSenderId] = useState("");
  const [status, setStatus] = useState<Status>({ apiKey: false, webhookSecret: false, emailSenderId: false });
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
      setStatus({ apiKey: Boolean(data.configured?.apiKey), webhookSecret: Boolean(data.configured?.webhookSecret), emailSenderId: Boolean(data.configured?.emailSenderId) });
      setEmailSenderId(typeof data.emailSenderId === "string" ? data.emailSenderId : "");
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
    if (testChannel === "email" && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(destination)) {
      toast.error("L'adresse e-mail de destination est invalide.");
      return;
    }
    if (testChannel !== "email" && !/^\\d{8,15}$/.test(destination.replace(/\\D/g, ""))) {
      toast.error("Utilisez un numéro valide au format international, par exemple +2250700000000.");
      return;
    }
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("senndo-test-send", {
        body: { channel: testChannel, to: destination, subject: testSubject.trim(), text: testMessage.trim() },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Envoi de test refusé");
      toast.success(`Test accepté par Senndo · ${testChannel.toUpperCase()} · Référence : ${data.messageId || "non communiquée"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec de l'envoi de test.");
    } finally {
      setSendingTest(false);
    }
  };

  const save = async () => {
    if (!apiKey.trim() && !webhookSecret.trim() && !emailSenderId.trim()) {
      toast.error("Saisissez au moins une valeur à enregistrer.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = { mode: "save" };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      if (webhookSecret.trim()) payload.webhookSecret = webhookSecret.trim();
      if (emailSenderId.trim()) payload.emailSenderId = emailSenderId.trim();
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
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Passerelle Senndo</h2>
        <p className="mt-1 text-sm text-muted-foreground">Configuration serveur des SMS, e-mails, WhatsApp appairé et appels vocaux AgriCapital.</p>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Secrets protégés côté serveur</AlertTitle>
        <AlertDescription>
          La clé API et le secret du webhook sont transmis à une fonction serveur authentifiée puis conservés dans Supabase Vault. Ils ne sont jamais renvoyés à l'interface ni affichés dans les journaux. L'adresse expéditrice vérifiée est conservée côté serveur.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>SMS</CardDescription><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />AgriCapital</CardTitle></CardHeader><CardContent><Badge variant={status.apiKey ? "default" : "secondary"}>{status.apiKey ? "Clé présente" : "À configurer"}</Badge><p className="mt-2 text-xs text-muted-foreground">Sender ID : AgriCapital</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>E-mail</CardDescription><CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" />Senndo</CardTitle></CardHeader><CardContent><Badge variant={status.emailSenderId ? "default" : "secondary"}>{status.emailSenderId ? "Expéditeur configuré" : "À configurer"}</Badge><p className="mt-2 text-xs text-muted-foreground">Adresse vérifiée dans Senndo</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>WhatsApp appairé</CardDescription><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />Business AgriCapital</CardTitle></CardHeader><CardContent><Badge variant={status.apiKey ? "default" : "secondary"}>{status.apiKey ? "Clé présente" : "À configurer"}</Badge><p className="mt-2 text-xs text-muted-foreground">+225 05 64 55 17 17 · pas WhatsApp Cloud</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Appels vocaux</CardDescription><CardTitle className="flex items-center gap-2 text-base"><PhoneCall className="h-4 w-4" />Senndo Voice</CardTitle></CardHeader><CardContent><Badge variant={status.apiKey ? "default" : "secondary"}>{status.apiKey ? "Clé présente" : "À configurer"}</Badge><p className="mt-2 text-xs text-muted-foreground">Disponibilité à confirmer sur le compte</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tester les envois en conditions réelles</CardTitle>
          <CardDescription>Envoyez un message de test uniquement au destinataire choisi. Chaque canal est testé séparément ; aucun client de la base n'est ciblé.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="senndo-test-channel">Canal à tester</Label>
              <select id="senndo-test-channel" value={testChannel} onChange={(e) => setTestChannel(e.target.value as typeof testChannel)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="sms">SMS · Sender ID AgriCapital</option>
                <option value="email">E-mail · expéditeur vérifié</option>
                <option value="whatsapp">WhatsApp · numéro Business appairé</option>
                <option value="voice">Appel vocal · Senndo Voice</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="senndo-test-destination">{testChannel === "email" ? "Adresse e-mail de destination" : "Numéro de destination"}</Label>
              <Input id="senndo-test-destination" type={testChannel === "email" ? "email" : "tel"} value={testDestination} onChange={(e) => setTestDestination(e.target.value)} placeholder={testChannel === "email" ? "votre.adresse@exemple.ci" : "+2250700000000"} autoComplete="off" />
              <p className="text-xs text-muted-foreground">{testChannel === "whatsapp" ? "Le destinataire doit avoir WhatsApp. L'envoi utilise le canal WhatsApp appairé, pas WhatsApp Cloud." : testChannel === "voice" ? "Le destinataire recevra un appel automatisé si la fonction vocale est activée sur votre compte Senndo." : testChannel === "sms" ? "Format international recommandé, par exemple +225 suivi des 10 chiffres." : "Utilisez une boîte que vous pouvez consulter."}</p>
            </div>
          </div>
{testChannel === "email" && <div className="space-y-2">
            <Label htmlFor="senndo-test-subject">Objet de l'e-mail</Label>
            <Input id="senndo-test-subject" value={testSubject} onChange={(e) => setTestSubject(e.target.value)} maxLength={150} />
          </div>}
          <div className="space-y-2">
            <Label htmlFor="senndo-test-message">Contenu du test</Label>
            <Textarea id="senndo-test-message" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={3} maxLength={1000} />
            <p className="text-xs text-muted-foreground">Ce texte sera envoyé réellement au destinataire choisi. Vérifiez le numéro ou l'adresse avant l'envoi.</p>
          </div>
          <Button onClick={() => void sendTest()} disabled={sendingTest || loading || !status.apiKey || !testDestination.trim() || !testMessage.trim()}>
            <Send className="mr-2 h-4 w-4" />{sendingTest ? "Envoi du test…" : `Envoyer le test ${testChannel.toUpperCase()}`}
          </Button>
          <p className="text-xs text-muted-foreground">Le résultat confirme l'acceptation par Senndo, pas nécessairement la livraison finale. Les statuts définitifs dépendent des retours du fournisseur.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identifiants API</CardTitle>
          <CardDescription>Collez les secrets uniquement dans ces champs. Ne les envoyez pas dans un message et ne les ajoutez jamais au code.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="senndo-api-key">Clé API Senndo</Label>
            <Input id="senndo-api-key" type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={status.apiKey ? "Clé déjà enregistrée · saisir uniquement pour remplacer" : "sk_live_… ou sk_test_…"} spellCheck={false} autoCapitalize="none" />
            <p className="text-xs text-muted-foreground">Le serveur ne permet jamais de relire la clé existante. Laissez vide pour la conserver.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="senndo-email-sender">Adresse expéditrice e-mail vérifiée</Label>
            <Input id="senndo-email-sender" type="email" autoComplete="email" value={emailSenderId} onChange={(e) => setEmailSenderId(e.target.value)} placeholder={status.emailSenderId ? "Adresse déjà configurée" : "notifications@votre-domaine.ci"} spellCheck={false} autoCapitalize="none" />
            <p className="text-xs text-muted-foreground">Cette adresse doit déjà être vérifiée dans Senndo. Elle est conservée côté serveur et ne sert qu’aux e-mails sortants.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="senndo-webhook-secret">Secret de signature du webhook Senndo</Label>
            <Input id="senndo-webhook-secret" type="password" autoComplete="new-password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={status.webhookSecret ? "Secret déjà enregistré · saisir uniquement pour remplacer" : "Secret communiqué à la création du webhook"} spellCheck={false} autoCapitalize="none" />
            <p className="text-xs text-muted-foreground">Ce n'est pas l'URL du webhook : c'est le secret signé communiqué par Senndo. Il est nécessaire pour vérifier l'authenticité des événements.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={saving || loading}><Save className="mr-2 h-4 w-4" />{saving ? "Enregistrement sécurisé…" : "Enregistrer côté serveur"}</Button>
            <Button variant="outline" onClick={() => void refreshStatus()} disabled={loading || saving || testing}><RefreshCw className="mr-2 h-4 w-4" />Vérifier l'état</Button>
            <Button variant="outline" onClick={() => void testConnection()} disabled={loading || saving || testing || !status.apiKey}><CheckCircle2 className="mr-2 h-4 w-4" />{testing ? "Test en cours…" : "Tester la connexion API"}</Button>
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-2 font-medium"><Webhook className="h-4 w-4" />URL de réception webhook</div>
            <code className="block break-all text-xs">{webhookUrl}</code>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(webhookUrl).then(() => toast.success("URL copiée")).catch(() => toast.error("Copie impossible sur cet appareil")); }}>Copier l'URL</Button>
            <p className="mt-2 text-xs text-muted-foreground">Configurez cette URL dans la console Senndo avec les événements de statut de message et d'appel disponibles pour votre compte. Le secret de signature se saisit ci-dessus.</p>
          </div>
          <Alert variant="default">
            {status.apiKey && status.webhookSecret && status.emailSenderId ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <AlertTitle>{status.apiKey && status.webhookSecret && status.emailSenderId ? "Configuration enregistrée" : "Configuration incomplète"}</AlertTitle>
            <AlertDescription>{loading ? "Vérification…" : status.apiKey && status.webhookSecret && status.emailSenderId ? "La clé API, le secret webhook et l’expéditeur e-mail sont enregistrés. Un test réel de chaque canal reste nécessaire avant de considérer les envois comme validés." : "La clé API, le secret webhook et l’adresse expéditrice vérifiée peuvent être enregistrés séparément. Aucun envoi externe n’est considéré comme validé avant les tests."}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
