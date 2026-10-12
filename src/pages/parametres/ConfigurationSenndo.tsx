import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, RefreshCw, Save, Webhook, MessageSquare, Mail, PhoneCall, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Status = { apiKey: boolean; webhookSecret: boolean };

const webhookUrl = "https://rfzfsmpsuempafhkqhra.supabase.co/functions/v1/senndo-webhook";

export default function ConfigurationSenndo() {
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [status, setStatus] = useState<Status>({ apiKey: false, webhookSecret: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("senndo-config", { body: { mode: "status" } });
    if (error || !data?.ok) {
      toast.error("Impossible de vérifier la configuration Senndo. Vérifiez vos droits administrateur.");
    } else {
      setStatus({ apiKey: Boolean(data.configured?.apiKey), webhookSecret: Boolean(data.configured?.webhookSecret) });
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  const save = async () => {
    if (!apiKey.trim() && !webhookSecret.trim()) {
      toast.error("Saisissez au moins une valeur à enregistrer.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = { mode: "save" };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      if (webhookSecret.trim()) payload.webhookSecret = webhookSecret.trim();
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
          Les valeurs saisies sont transmises à une fonction serveur authentifiée, puis conservées dans Supabase Vault. Elles ne sont jamais renvoyées à l'interface, enregistrées dans le navigateur ou affichées dans les journaux. Les champs sont vidés après l'enregistrement.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>SMS</CardDescription><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />AgriCapital</CardTitle></CardHeader><CardContent><Badge variant={status.apiKey ? "default" : "secondary"}>{status.apiKey ? "Clé présente" : "À configurer"}</Badge><p className="mt-2 text-xs text-muted-foreground">Sender ID : AgriCapital</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>E-mail</CardDescription><CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" />Senndo</CardTitle></CardHeader><CardContent><Badge variant={status.apiKey ? "default" : "secondary"}>{status.apiKey ? "Clé présente" : "À configurer"}</Badge><p className="mt-2 text-xs text-muted-foreground">Expéditeur à valider dans Senndo</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>WhatsApp appairé</CardDescription><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />Business AgriCapital</CardTitle></CardHeader><CardContent><Badge variant={status.apiKey ? "default" : "secondary"}>{status.apiKey ? "Clé présente" : "À configurer"}</Badge><p className="mt-2 text-xs text-muted-foreground">+225 05 64 55 17 17 · pas WhatsApp Cloud</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Appels vocaux</CardDescription><CardTitle className="flex items-center gap-2 text-base"><PhoneCall className="h-4 w-4" />Senndo Voice</CardTitle></CardHeader><CardContent><Badge variant={status.apiKey ? "default" : "secondary"}>{status.apiKey ? "Clé présente" : "À configurer"}</Badge><p className="mt-2 text-xs text-muted-foreground">Disponibilité à confirmer sur le compte</p></CardContent></Card>
      </div>

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
            <Label htmlFor="senndo-webhook-secret">Secret de signature du webhook Senndo</Label>
            <Input id="senndo-webhook-secret" type="password" autoComplete="new-password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={status.webhookSecret ? "Secret déjà enregistré · saisir uniquement pour remplacer" : "Secret communiqué à la création du webhook"} spellCheck={false} autoCapitalize="none" />
            <p className="text-xs text-muted-foreground">Ce n'est pas l'URL du webhook : c'est le secret signé communiqué par Senndo. Il est nécessaire pour vérifier l'authenticité des événements.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={saving || loading}><Save className="mr-2 h-4 w-4" />{saving ? "Enregistrement sécurisé…" : "Enregistrer côté serveur"}</Button>
            <Button variant="outline" onClick={() => void refreshStatus()} disabled={loading || saving}><RefreshCw className="mr-2 h-4 w-4" />Vérifier l'état</Button>
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-2 font-medium"><Webhook className="h-4 w-4" />URL de réception webhook</div>
            <code className="block break-all text-xs">{webhookUrl}</code>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(webhookUrl).then(() => toast.success("URL copiée")).catch(() => toast.error("Copie impossible sur cet appareil")); }}>Copier l'URL</Button>
            <p className="mt-2 text-xs text-muted-foreground">Configurez cette URL dans la console Senndo avec les événements de statut de message et d'appel disponibles pour votre compte. Le secret de signature se saisit ci-dessus.</p>
          </div>
          <Alert variant="default">
            {status.apiKey && status.webhookSecret ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <AlertTitle>{status.apiKey && status.webhookSecret ? "Secrets enregistrés" : "Configuration incomplète"}</AlertTitle>
            <AlertDescription>{loading ? "Vérification…" : status.apiKey && status.webhookSecret ? "La clé API et le secret webhook sont présents dans le coffre-fort serveur. Un test réel de chaque canal reste nécessaire avant la mise en production des envois." : "Les secrets manquants peuvent être ajoutés séparément. Aucun envoi externe ne doit être considéré comme validé avant les tests."}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
