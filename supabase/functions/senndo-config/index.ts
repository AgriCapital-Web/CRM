import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { SenndoClient } from "npm:@senndo/sdk@1.5.0";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL, SERVICE_KEY);
const cors = (req:Request) => {
 const origin = req.headers.get("origin") || "";
 const h:Record<string,string> = { "Content-Type":"application/json", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"no-referrer", "Vary":"Origin", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST,OPTIONS" };
 if (origin && /^https:\/\/([a-z0-9-]+\.)*agricapital\.ci$/i.test(origin)) h["Access-Control-Allow-Origin"] = origin;
 return h;
};
const reply = (req:Request, body: unknown, status=200) => new Response(JSON.stringify(body), {status, headers:cors(req)});

async function authorize(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token.length < 20) return false;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: roles, error: rolesError } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
  if (rolesError) return false;
  return (roles || []).some((r) => ["pdg","dg","admin","super_admin"].includes(String(r.role).toLowerCase()));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, {status:204,headers:cors(req)});
  if (req.method !== "POST") return reply(req,{error:"POST requis"},405);
  if (!(await authorize(req))) return reply(req,{error:"Accès réservé aux administrateurs autorisés"},403);
  try {
    const body = await req.json();
    const mode = body?.mode;
    if (mode === "status") {
      const names = ["senndo_api_key","senndo_webhook_secret","senndo_email_sender_id","senndo_whatsapp_sender_phone"] as const;
      const reads = await Promise.all(names.map(async (name) => {
        const result = await admin.rpc("senndo_get_secret", { p_name: name });
        return { name, value: typeof result.data === "string" ? result.data : "", error: result.error ? "Lecture du secret refusée ou indisponible" : null };
      }));
      const values = Object.fromEntries(reads.map((r) => [r.name, r.value])) as Record<string,string>;
      const errors = Object.fromEntries(reads.filter((r) => r.error).map((r) => [r.name, r.error]));
      let apiValid = false;
      let apiError: string | null = null;
      if (values.senndo_api_key) {
        try {
          const client = new SenndoClient({ apiKey: values.senndo_api_key, baseUrl: "https://api.senndo.com", timeoutMs: 12000, maxRetries: 0, userAgent: "AgriCapital-CRM/1.0" });
          await client.listSenderIds();
          apiValid = true;
        } catch {
          apiError = "La clé est enregistrée, mais Senndo n'a pas confirmé son accès API.";
        }
      }
      let whatsappSessionStatus: "unknown" | "connected" | "disconnected" = "unknown";
      if (values.senndo_api_key) {
        try {
          const response = await fetch("https://api.senndo.com/v1/wa/sessions", { headers: { authorization: "Bearer " + values.senndo_api_key, accept: "application/json" }, signal: AbortSignal.timeout(12000) });
          if (response.ok) {
            const payload = await response.json().catch(() => null);
            const list = Array.isArray(payload) ? payload : Array.isArray(payload?.sessions) ? payload.sessions : Array.isArray(payload?.data?.sessions) ? payload.data.sessions : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : [];
            const connected = list.some((s: any) => ["connected","open","ready","authenticated"].includes(String(s?.status ?? s?.state ?? s?.connectionStatus ?? s?.connection_status ?? s?.connection?.status ?? "").toLowerCase()));
            whatsappSessionStatus = connected ? "connected" : "disconnected";
          }
        } catch { /* retain unknown when provider status cannot be queried */ }
      }
      return reply(req, {
        ok: true,
        configured: {
          apiKey: Boolean(values.senndo_api_key),
          apiValid,
          webhookSecret: Boolean(values.senndo_webhook_secret),
          emailSenderId: Boolean(values.senndo_email_sender_id),
          whatsappSenderPhone: Boolean(values.senndo_whatsapp_sender_phone || values.senndo_api_key),
          whatsappSession: whatsappSessionStatus,
        },
        statusErrors: errors,
        apiError,
        emailSenderId: values.senndo_email_sender_id || "",
        whatsappSenderPhone: values.senndo_whatsapp_sender_phone || "+2250564551717",
        senderId: "AgriCapital", whatsappNumber: values.senndo_whatsapp_sender_phone || "+2250564551717", provider: "Senndo",
        webhookUrl: "https://rfzfsmpsuempafhkqhra.supabase.co/functions/v1/senndo-webhook",
      });
    }
    if (mode === "whatsapp_diagnostics") {
      const { data: apiKey, error: keyError } = await admin.rpc("senndo_get_secret", { p_name: "senndo_api_key" });
      if (keyError || typeof apiKey !== "string" || !apiKey) return reply(req, { error: "Clé API Senndo non configurée" }, 400);
      const client = new SenndoClient({ apiKey, baseUrl: "https://api.senndo.com", timeoutMs: 20000, maxRetries: 0, userAgent: "AgriCapital-CRM/1.0" });
      const safeError = (e: any) => ({
        code: typeof e?.code === "string" ? e.code.slice(0, 80) : "UNKNOWN",
        message: typeof e?.apiMessage === "string" ? e.apiMessage.slice(0, 300) : "Lecture indisponible pour ce canal.",
      });
      const results = await Promise.allSettled([
        client.listWaCloudNumbers(),
        client.listWaTemplates(),
        client.listContentTemplates(),
      ]);
      const cloudResult: any = results[0].status === "fulfilled" ? results[0].value : null;
      const cloudTemplates: any = results[1].status === "fulfilled" ? results[1].value : null;
      const hostedTemplates: any = results[2].status === "fulfilled" ? results[2].value : null;
      const cloudNumbers = Array.isArray(cloudResult?.numbers) ? cloudResult.numbers.map((n: any) => ({
        id: n.id, displayPhoneNumber: n.displayPhoneNumber, verifiedName: n.verifiedName,
        qualityRating: n.qualityRating, status: n.status, wabaId: n.wabaId,
      })) : [];
      const templates = Array.isArray(cloudTemplates?.templates) ? cloudTemplates.templates.map((t: any) => ({
        name: t.name, language: t.language, category: t.category, status: t.status,
      })) : [];
      const content = Array.isArray(hostedTemplates?.templates) ? hostedTemplates.templates.map((t: any) => ({
        sid: t.sid, friendlyName: t.friendlyName, language: t.language, body: typeof t.body === "string" ? t.body.slice(0, 120) : undefined,
      })) : [];
      return reply(req, {
        ok: true,
        pairedSessionApi: "not documented by @senndo/sdk 1.5.0; no paired-session send method exposed by the configured SDK",
        whatsappCloud: results[0].status === "fulfilled" ? { available: true, numbers: cloudNumbers } : { available: false, error: safeError((results[0] as PromiseRejectedResult).reason) },
        whatsappCloudTemplates: results[1].status === "fulfilled" ? { available: true, templates } : { available: false, error: safeError((results[1] as PromiseRejectedResult).reason) },
        whatsappTwilio: results[2].status === "fulfilled" ? { available: true, reason: hostedTemplates?.reason || null, templates: content } : { available: false, error: safeError((results[2] as PromiseRejectedResult).reason) },
      });
    }
    if (mode === "test") {
      const { data: apiKey, error } = await admin.rpc("senndo_get_secret", { p_name: "senndo_api_key" });
      if (error || typeof apiKey !== "string" || !apiKey) return reply(req,{error:"Clé API Senndo non configurée"},400);
      const client = new SenndoClient({ apiKey, baseUrl:"https://api.senndo.com", timeoutMs:20000, maxRetries:0, userAgent:"AgriCapital-CRM/1.0" });
      const result = await client.listSenderIds();
      const senderIds = Array.isArray(result?.senderIds) ? result.senderIds.map((item:any)=>({value:item.value,lifecycleStatus:item.lifecycleStatus})) : [];
      return reply(req,{ok:true,apiKeyValid:true,senderIds});
    }
    if (mode !== "save") return reply(req,{error:"Mode invalide"},400);
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const webhookSecret = typeof body.webhookSecret === "string" ? body.webhookSecret.trim() : "";
    const emailSenderId = typeof body.emailSenderId === "string" ? body.emailSenderId.trim() : "";
    const whatsappSenderPhone = typeof body.whatsappSenderPhone === "string" ? body.whatsappSenderPhone.trim() : "";
    if (apiKey && !/^(sk_(test|live)_)[A-Za-z0-9_-]{12,}$/.test(apiKey)) return reply(req,{error:"Format de clé Senndo invalide"},400);
    if (webhookSecret && webhookSecret.length < 16) return reply(req,{error:"Le secret webhook doit contenir au moins 16 caractères"},400);
    if (emailSenderId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSenderId)) return reply(req,{error:"L'expéditeur e-mail doit être une adresse valide vérifiée dans Senndo"},400);
    if (whatsappSenderPhone && !/^\+225[0-9]{8,10}$/.test(whatsappSenderPhone.replace(/[\s().-]/g, ""))) return reply(req,{error:"Le numéro WhatsApp doit être au format international +225..."},400);
    if (!apiKey && !webhookSecret && !emailSenderId && !whatsappSenderPhone) return reply(req,{error:"Renseigne au moins une valeur à enregistrer"},400);
    if (apiKey) {
      const { error } = await admin.rpc("senndo_store_secret", { p_name:"senndo_api_key", p_value:apiKey });
      if (error) throw error;
    }
    if (webhookSecret) {
      const { error } = await admin.rpc("senndo_store_secret", { p_name:"senndo_webhook_secret", p_value:webhookSecret });
      if (error) throw error;
    }
    if (emailSenderId) {
      const { error } = await admin.rpc("senndo_store_secret", { p_name:"senndo_email_sender_id", p_value:emailSenderId });
      if (error) throw error;
    }
    if (whatsappSenderPhone) {
      const normalizedPhone = whatsappSenderPhone.replace(/[\s().-]/g, "");
      if (normalizedPhone !== "+2250564551717") return reply(req,{error:"Le numéro WhatsApp autorisé pour AgriCapital est +22564551717."},400);
      const { error } = await admin.rpc("senndo_store_secret", { p_name:"senndo_whatsapp_sender_phone", p_value:normalizedPhone });
      if (error) throw error;
    }
    return reply(req,{ok:true,message:"Configuration enregistrée dans Supabase Vault.",configured:{apiKey:Boolean(apiKey),webhookSecret:Boolean(webhookSecret),emailSenderId:Boolean(emailSenderId),whatsappSenderPhone:Boolean(whatsappSenderPhone)}});
  } catch (e) {
    // Never log request bodies or secret-bearing errors.
    console.error("senndo-config error");
    return reply(req,{error:"Impossible d'enregistrer la configuration Senndo"},500);
  }
});