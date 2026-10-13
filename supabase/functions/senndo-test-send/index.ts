import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { SenndoClient } from "npm:@senndo/sdk@1.5.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const ALLOWED_ORIGINS = new Set((Deno.env.get("ALLOWED_ORIGINS") || "https://agricapital.ci,https://www.agricapital.ci,https://app.agricapital.ci,https://crm.agricapital.ci,http://localhost:5173,http://localhost:8080").split(",").map((v) => v.trim()).filter(Boolean));

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
  if (origin && (ALLOWED_ORIGINS.has(origin) || /^https:\/\/crm-[a-z0-9-]+-adminagricapitals-projects\.vercel\.app$/i.test(origin))) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function reply(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
async function authorize(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token.length < 20) return false;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: roles, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
  if (roleError) return false;
  return (roles || []).some((r) => ["pdg", "dg", "admin", "super_admin"].includes(String(r.role).toLowerCase()));
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return reply(req, { error: "POST requis" }, 405);
  if (!(await authorize(req))) return reply(req, { error: "Accès réservé aux administrateurs autorisés" }, 403);
  try {
    const body = await req.json();
    const channel = body?.channel;
    const to = typeof body?.to === "string" ? body.to.trim() : "";
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const subject = typeof body?.subject === "string" ? body.subject.trim().slice(0, 150) : "Test AgriCapital";
    if (!["sms", "email", "whatsapp", "voice"].includes(channel)) return reply(req, { error: "Canal de test invalide" }, 400);
    if (!to || to.length > 254) return reply(req, { error: "Destinataire invalide" }, 400);
    if (!text || text.length > 1000) return reply(req, { error: "Le message doit contenir entre 1 et 1000 caractères" }, 400);
    if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return reply(req, { error: "Adresse e-mail invalide" }, 400);
    if (channel !== "email" && !/^\+?[1-9]\d{7,14}$/.test(to.replace(/[\s().-]/g, ""))) return reply(req, { error: "Numéro invalide : utilisez le format international" }, 400);

    const { data: apiKey, error: keyError } = await admin.rpc("senndo_get_secret", { p_name: "senndo_api_key" });
    if (keyError || typeof apiKey !== "string" || !apiKey) return reply(req, { error: "Clé API Senndo non configurée" }, 400);
    const client = new SenndoClient({ apiKey, baseUrl: "https://api.senndo.com", timeoutMs: 30000, maxRetries: 0, userAgent: "AgriCapital-CRM/1.0" });
    let result: any;
    if (channel === "email") {
      const { data: senderId } = await admin.rpc("senndo_get_secret", { p_name: "senndo_email_sender_id" });
      if (typeof senderId !== "string" || !senderId) return reply(req, { error: "Adresse expéditrice e-mail vérifiée non configurée" }, 400);
      result = await client.sendMessage({ channel: "email", to, subject: subject || "Test AgriCapital", text, senderId, idempotencyKey: crypto.randomUUID() });
    } else if (channel === "sms") {
      result = await client.sendMessage({ channel: "sms", to, text: text.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").slice(0, 150), senderId: "AgriCapital", idempotencyKey: crypto.randomUUID() });
    } else if (channel === "whatsapp") {
      result = await client.sendMessage({ channel: "whatsapp", to, text, idempotencyKey: crypto.randomUUID() });
    } else {
      result = await client.sendMessage({ channel: "voice", to, text, idempotencyKey: crypto.randomUUID() });
    }
    return reply(req, { ok: true, channel, accepted: true, messageId: result?.id || null, message: "Demande de test acceptée par Senndo. Vérifiez ensuite le statut de livraison auprès du fournisseur." });
  } catch (_error) {
    // Never log destination, message body, credentials, or provider exception details.
    console.error("senndo-test-send failed");
    return reply(req, { error: "Échec de l'envoi de test. Vérifiez la disponibilité du canal, les crédits et la configuration du compte Senndo." }, 502);
  }
});
