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
  if (origin && (ALLOWED_ORIGINS.has(origin) || /^https:\/\/crm-[a-z0-9-]+-adminagricapitals-projects\.vercel\.app$/i.test(origin) || /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i.test(origin) || /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i.test(origin))) headers["Access-Control-Allow-Origin"] = origin;
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
    if (channel !== "email") {
      const destinationDigits = to.replace(/\D/g, "");
      if (!/^[1-9]\d{7,14}$/.test(destinationDigits)) {
        return reply(req, { error: "Numéro invalide : utilisez le format international, par exemple +2250759566087." }, 400);
      }
    }

    const { data: apiKey, error: keyError } = await admin.rpc("senndo_get_secret", { p_name: "senndo_api_key" });
    if (keyError || typeof apiKey !== "string" || !apiKey) return reply(req, { error: "Clé API Senndo non configurée" }, 400);
    const client = new SenndoClient({ apiKey, baseUrl: "https://api.senndo.com", timeoutMs: 30000, maxRetries: 0, userAgent: "AgriCapital-CRM/1.0" });
    let result: any;
    if (channel === "email") {
      const { data: senderId } = await admin.rpc("senndo_get_secret", { p_name: "senndo_email_sender_id" });
      if (typeof senderId !== "string" || !senderId) return reply(req, { error: "Adresse expéditrice e-mail vérifiée non configurée" }, 400);
      result = await client.sendMessage({ channel: "email", to, subject: subject || "Test AgriCapital", text, senderId, idempotencyKey: crypto.randomUUID() });
    } else if (channel === "whatsapp") {
      // Paired WhatsApp uses the REST channel whatsapp_baileys, not generic whatsapp.
      const sessionsResponse = await fetch("https://api.senndo.com/v1/wa/sessions", {
        method: "GET", headers: { authorization: "Bearer " + apiKey, accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      const sessionsPayload = await sessionsResponse.json().catch(() => null);
      if (!sessionsResponse.ok) {
        const detail = typeof sessionsPayload?.message === "string" ? sessionsPayload.message.slice(0, 250) : "";
        return reply(req, { error: "Impossible de lire les sessions WhatsApp Senndo (HTTP " + sessionsResponse.status + ")." + (detail ? " " + detail : ""), providerStatus: sessionsResponse.status, code: "WHATSAPP_SESSION_LOOKUP_FAILED" }, 502);
      }
      const rawSessions = Array.isArray(sessionsPayload) ? sessionsPayload
        : Array.isArray(sessionsPayload?.sessions) ? sessionsPayload.sessions
        : Array.isArray(sessionsPayload?.data?.sessions) ? sessionsPayload.data.sessions
        : Array.isArray(sessionsPayload?.data) ? sessionsPayload.data
        : Array.isArray(sessionsPayload?.items) ? sessionsPayload.items
        : Array.isArray(sessionsPayload?.results) ? sessionsPayload.results : [];
      const sessions = rawSessions.map((item: any) => {
        if (!item?.session || typeof item.session !== "object") return item;
        return { ...item.session, id: item.session.id ?? item.id,
          sessionId: item.session.sessionId ?? item.session.session_id ?? item.sessionId ?? item.session_id,
          senderSessionId: item.session.senderSessionId ?? item.senderSessionId,
          uuid: item.session.uuid ?? item.uuid };
      });
      // Senndo peut retourner le même numéro ivoirien en format historique (8 chiffres)
      // ou nouveau format (préfixe opérateur 01/05/07 + 8 chiffres).
      const normalizePhone = (value: unknown) => {
        const raw = String(value ?? "").split("@")[0].split(":")[0].replace(/\D/g, "");
        if (!raw) return "";
        const national = raw.startsWith("225") ? raw.slice(3) : raw;
        if (national.length === 10 && /^0[157]\d{8}$/.test(national)) return "225" + national.slice(-8);
        if (national.length === 8) return "225" + national;
        return raw;
      };
      const senderDigits = normalizePhone("+22564551717");
      const phoneValues = (s: any) => [
        s?.phoneNumber,s?.phone_number,s?.phone,s?.displayPhoneNumber,s?.display_phone_number,s?.number,s?.jid,
        s?.user?.id,s?.user?.jid,s?.me?.id,s?.me?.jid,s?.account?.phone,s?.account?.phoneNumber,s?.profile?.phone,s?.whatsapp?.phone,
        s?.session?.phoneNumber,s?.session?.phone_number,s?.session?.user?.id,s?.session?.me?.id,
        s?.creds?.me?.id,s?.authState?.creds?.me?.id
      ].filter((v) => (typeof v === "string" || typeof v === "number") && String(v).trim());
      const statusOf = (s: any) => String(s?.status ?? s?.state ?? s?.connectionStatus ?? s?.connection_status ?? s?.connection?.status ?? s?.session?.status ?? "").trim().toLowerCase();
      const connected = sessions.filter((s: any) => ["connected","open","ready","authenticated"].includes(statusOf(s)));
      const matches = connected.filter((s: any) => phoneValues(s).some((v: string) => normalizePhone(v) === senderDigits));
      const session = matches.length === 1 ? matches[0] : matches.length > 1 ? null : connected.length === 1 ? connected[0] : null;
      const idCandidates = session ? [
        session.id,session.sessionId,session.session_id,session.senderSessionId,session.sender_session_id,
        session.uuid,session.sessionKey,session.session_key,session.uniqueSessionId,session.unique_session_id,
        session.sessionName,session.session_name,session.name,session.key,
        session.session?.id,session.session?.sessionId,session.session?.session_id,session.session?.uniqueSessionId
      ] : [];
      const senderSessionId = idCandidates.find((value: unknown) =>
        (typeof value === "string" && value.trim().length > 0) || (typeof value === "number" && Number.isFinite(value))
      );
      if (!session || senderSessionId === undefined || String(senderSessionId).trim() === "") return reply(req, {
        error: connected.length === 0 ? "Aucune session WhatsApp connectée n’a été trouvée dans Senndo."
          : connected.length > 1 && matches.length !== 1 ? "Plusieurs sessions WhatsApp sont connectées sans correspondance unique avec le numéro AgriCapital."
          : "La session WhatsApp est connectée, mais Senndo ne fournit pas son identifiant technique. Vérifiez la session dans Senndo.",
        code: connected.length > 1 && matches.length !== 1 ? "WHATSAPP_SESSION_AMBIGUOUS" : "WHATSAPP_SESSION_ID_MISSING",
        connectedSessions: connected.length,
        matchingSessions: matches.length
      }, 409);
      const sendResponse = await fetch("https://api.senndo.com/v1/messages", {
        method: "POST",
        headers: { authorization: "Bearer " + apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ channel: "whatsapp_baileys", to, text, senderSessionId: String(senderSessionId), idempotencyKey: crypto.randomUUID() }),
        signal: AbortSignal.timeout(30000),
      });
      const sendPayload = await sendResponse.json().catch(() => null);
      if (!sendResponse.ok) {
        const detail = typeof sendPayload?.message === "string" ? sendPayload.message.slice(0, 300) : "";
        const code = typeof sendPayload?.code === "string" ? sendPayload.code.slice(0, 80) : "SEN NDO_VALIDATION";
        return reply(req, { error: "Senndo a refusé l’envoi WhatsApp appairé (HTTP " + sendResponse.status + ")." + (detail ? " " + detail : ""), providerStatus: sendResponse.status, providerCode: code, code: "WHATSAPP_SEND_REJECTED" }, 502);
      }
      return reply(req, { ok: true, channel: "whatsapp_baileys", accepted: true, messageId: sendPayload?.id ?? sendPayload?.messageId ?? sendPayload?.message?.id ?? null, senderPhone: "+22564551717", message: "Demande WhatsApp appairée acceptée par Senndo. Vérifiez le statut de livraison pour confirmer la réception." });
    } else if (channel === "sms") {
      // Prefer a configured sender ID; otherwise resolve the registered Senndo sender.
      let senderId = Deno.env.get("SENNDO_SMS_SENDER_ID")?.trim() || "";
      if (!senderId) {
        const senderResult = await client.listSenderIds();
        const senders = Array.isArray(senderResult?.senderIds) ? senderResult.senderIds : [];
        const matching = senders.find((item: any) =>
          String(item?.value || "").toLowerCase() === "agricapital" &&
          !/reject|inactive|pending|blocked/i.test(String(item?.lifecycleStatus || ""))
        );
        senderId = String(matching?.value || "");
      }
      if (!senderId) return reply(req, { error: "Aucun Sender ID SMS AgriCapital actif n’est enregistré chez Senndo. Vérifiez/validez le Sender ID dans Senndo avant le test." }, 409);
      const smsText = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").slice(0, 150);
      if (!smsText) return reply(req, { error: "Le message ne contient aucun caractère SMS exploitable après normalisation." }, 400);
      result = await client.sendMessage({ channel: "sms", to, text: smsText, senderId, idempotencyKey: crypto.randomUUID() });
    } else {
      result = await client.sendMessage({ channel: "voice", to, text, idempotencyKey: crypto.randomUUID() });
    }
    return reply(req, { ok: true, channel, accepted: true, messageId: result?.id || null, message: "Demande de test acceptée par Senndo. Vérifiez ensuite le statut de livraison auprès du fournisseur." });
  } catch (error) {
    // Never log destination, message body, credentials, or raw provider responses.
    const err = error as { status?: number; statusCode?: number; code?: string; apiMessage?: string; message?: string };
    const providerStatus = Number(err?.status || err?.statusCode || 0);
    const providerCode = typeof err?.code === "string" ? err.code.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60) : "";
    const providerMessage = typeof err?.apiMessage === "string" ? err.apiMessage.slice(0, 300) : "";
    console.error("senndo-test-send provider failure", JSON.stringify({
      channel: typeof channel === "string" ? channel : "unknown",
      status: providerStatus || null,
      code: providerCode || null,
    }));
    const statusHint = providerStatus ? " (réponse fournisseur " + providerStatus + ")" : "";
    const codeHint = providerCode ? " [" + providerCode + "]" : "";
    const messageHint = providerMessage ? " Détail Senndo : " + providerMessage : "";
    const guidance = channel === "sms"
      ? " Vérifiez la clé API, le solde et le Sender ID SMS approuvé."
      : channel === "voice"
        ? " Vérifiez l'activation du canal vocal et le format du contenu."
        : channel === "email"
          ? " Vérifiez l'expéditeur e-mail vérifié et la configuration du compte."
          : " Vérifiez le canal WhatsApp réellement activé, le modèle et la fenêtre de conversation.";
    return reply(req, {
      error: "Senndo n’a pas pu traiter cet envoi" + statusHint + codeHint + "." + messageHint + guidance,
      providerStatus: providerStatus || null,
      providerCode: providerCode || null,
    }, 502);
  }
});
