import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { SenndoClient } from "npm:@senndo/sdk@1.5.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agricapital-automation-secret",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && /^https:\/\/([a-z0-9-]+\.)*(agricapital\.ci|lovableproject\.com|lovable\.app)$/i.test(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
};
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
});
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey);

async function sendWebPush(contact: Contact, title: string, body: string, dedupeKey: string, data: Record<string, unknown> = {}) {
  const isStaff = contact.source_type === "equipe" && Boolean(contact.user_id);
  const ownerId = isStaff ? contact.user_id : contact.source_id;
  if (!ownerId) return 0;

  let query = admin.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("active", true);
  query = isStaff ? query.eq("user_id", ownerId) : query.eq("client_id", ownerId);
  const { data: subscriptions, error } = await query;
  if (error) throw error;
  if (!subscriptions?.length) return 0;

  const { data: vapid, error: vapidError } = await admin.rpc("notification_vapid_config");
  if (vapidError || !vapid?.public_key || !vapid?.private_key) {
    throw new Error("Configuration VAPID indisponible côté serveur.");
  }
  webpush.setVapidDetails(vapid.subject || "mailto:contact@agricapital.ci", vapid.public_key, vapid.private_key);

  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify({
        title,
        body,
        tag: dedupeKey,
        dedupe_key: dedupeKey,
        url: isStaff ? "/dashboard" : "/",
        data,
      }), { TTL: 86400, urgency: "normal" });
      sent++;
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").update({
          active: false, updated_at: new Date().toISOString(),
        }).eq("id", subscription.id);
      } else {
        console.error("[WebPush] envoi impossible", { statusCode, subscriptionId: subscription.id });
      }
    }
  }
  return sent;
}

type Contact = {
  source_type: string; source_id: string; user_id?: string | null;
  nom_complet?: string | null; email?: string | null; telephone?: string | null; telephone_secondaire?: string | null; whatsapp?: string | null;
  role_code?: string | null; offre_id?: string | null; offre_code?: string | null; offre_nom?: string | null;
};

const normalizeSms = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const assertSmsLength = (value: string) => {
  const length = Array.from(value).length;
  if (length > 155) throw new Error(`SMS trop long : ${length}/155 caractères, espaces et signes compris.`);
  if (!length) throw new Error("Le SMS ne peut pas être vide.");
  return value;
};
const assertWhatsAppLength = (value: string) => {
  const length = Array.from(value).length;
  if (length > 350) throw new Error(`Message WhatsApp trop long : ${length}/350 caractères.`);
  if (!length) throw new Error("Le message WhatsApp ne peut pas être vide.");
  return value;
};
type MediaAttachment = { bucket?: string; path: string; name: string; mimeType: string; size?: number };
async function prepareMedia(attachments: MediaAttachment[] = []) {
  const prepared: Array<{ ref: string; name: string; mimeType: string; path: string }> = [];
  const client = await getSenndoClient();
  for (const item of attachments) {
    if (!item?.path || !item?.name || !item?.mimeType) continue;
    const { data, error } = await admin.storage.from(item.bucket || "notification-media").download(item.path);
    if (error || !data) throw new Error(`Média indisponible : ${item.name}`);
    const uploaded = await client.uploadMedia({ file: new Uint8Array(await data.arrayBuffer()), fileName: item.name, contentType: item.mimeType });
    if (!uploaded?.ref) throw new Error(`Téléversement Senndo impossible : ${item.name}`);
    prepared.push({ ref: uploaded.ref, name: item.name, mimeType: item.mimeType, path: item.path });
  }
  return prepared;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c)
);

const render = (template: string, contact: Contact, context: Record<string, unknown> = {}) => {
  const nameParts = String(contact.nom_complet || "Client").trim().split(/\s+/).filter(Boolean);
  const leadStyleName = contact.source_type === "lead" || contact.source_type === "prospect";
  const familyName = nameParts.length > 1 ? (leadStyleName ? nameParts[nameParts.length - 1] : nameParts[0]) : (nameParts[0] || "Client");
  const firstName = nameParts.length > 1 ? (leadStyleName ? nameParts[nameParts.length - 2] : nameParts[nameParts.length - 1]) : familyName;
  const displayName = nameParts.length > 1 ? `${firstName.charAt(0).toLocaleUpperCase("fr-FR")}${firstName.slice(1).toLocaleLowerCase("fr-FR")} ${familyName.toLocaleUpperCase("fr-FR")}` : familyName;
  const vars: Record<string, string> = {
    nom: displayName, nom_complet: displayName, prenom: firstName, nom_famille: familyName,
    email: contact.email || "", telephone: contact.telephone || "",
    role: contact.role_code || "", offre: contact.offre_nom || contact.offre_code || "",
    offre_code: contact.offre_code || "", date: new Date().toLocaleDateString("fr-FR"),
    ...Object.fromEntries(Object.entries(context).map(([k, v]) => [k, v == null ? "" : String(v)])),
  };
  return template.replace(/\{\{\s*([a-zA-Z0-9_ ]+)\s*\}\}|\{\s*([a-zA-Z0-9_ ]+)\s*\}/g, (_match, doubleKey, singleKey) => {
    const key = String(doubleKey || singleKey || "").trim().replace(/\s+/g, "_");
    return vars[key] ?? "";
  });
};

async function internalAuthorized(req: Request) {
  const expected = Deno.env.get("NOTIFICATION_CRON_SECRET");
  const supplied = req.headers.get("x-agricapital-automation-secret");
  if (supplied && supplied === serviceKey) return true;
  if (expected && supplied && supplied === expected) return true;
  if (!supplied) return false;
  const { data, error } = await admin.rpc("notification_get_internal_secret");
  return !error && data === supplied;
}

async function staffAuthorized(req: Request, requiredPermission: "messagerie.view" | "messagerie.send" = "messagerie.view") {
  if (await internalAuthorized(req)) return true;
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const { data, error: authError } = await admin.auth.getUser(auth.slice(7));
  if (authError || !data.user) return false;
  const { data: roles, error: rolesError } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
  if (rolesError || !roles?.length) return false;
  const roleCodes = [...new Set(roles.map((item) => item.role).filter(Boolean))];
  const { data: grants, error: grantsError } = await admin.from("role_permissions")
    .select("role_code")
    .in("role_code", roleCodes)
    .eq("permission_code", requiredPermission);
  return !grantsError && Boolean(grants?.length);
}

async function getSenndoClient() {
  const { data: apiKey, error } = await admin.rpc("senndo_get_secret", { p_name: "senndo_api_key" });
  if (error || typeof apiKey !== "string" || !apiKey) throw new Error("Senndo non configuré");
  return new SenndoClient({ apiKey, baseUrl: "https://api.senndo.com", timeoutMs: 30000, maxRetries: 2, userAgent: "AgriCapital-CRM/1.0" });
}
async function providerStatus() {
  const { data: apiKey } = await admin.rpc("senndo_get_secret", { p_name: "senndo_api_key" });
  const { data: webhookSecret } = await admin.rpc("senndo_get_secret", { p_name: "senndo_webhook_secret" });
  const { data: emailSenderId } = await admin.rpc("senndo_get_secret", { p_name: "senndo_email_sender_id" });
  let whatsapp: { senderPhone: string } | null = null;
  try { whatsapp = await resolveWhatsAppSenderSession(); } catch { whatsapp = null; }
  return {
    senndo: Boolean(apiKey), webhook: Boolean(webhookSecret), sms: false,
    email: false, whatsapp_paired: Boolean(whatsapp),
    voice: false, sender_id: "AgriCapital",
    whatsapp_business_number: whatsapp?.senderPhone || null,
    email_sender_id: emailSenderId || null, email_provider: apiKey ? "senndo" : null,
  };
}
async function sendEmail(contact: Contact, subject: string, content: string, dedupeKey: string, attachments: MediaAttachment[] = []) {
  if (!contact.email) throw new Error("Email absent");
  const { data: apiKey, error: apiKeyError } = await admin.rpc("senndo_get_secret", { p_name: "senndo_api_key" });
  const { data: senderId } = await admin.rpc("senndo_get_secret", { p_name: "senndo_email_sender_id" });
  if (apiKeyError || typeof apiKey !== "string" || !apiKey) throw new Error("Clé API Senndo non configurée");
  if (typeof senderId !== "string" || !senderId || !senderId.toLowerCase().endsWith("@agricapital.ci")) throw new Error("L’expéditeur e-mail doit être une adresse vérifiée du domaine agricapital.ci dans Senndo.");
  const links: string[] = [];
  for (const item of attachments) {
    const { data, error } = await admin.storage.from(item.bucket || "notification-media").createSignedUrl(item.path, 7 * 24 * 60 * 60);
    if (!error && data?.signedUrl) links.push(`${item.name}: ${data.signedUrl}`);
  }
  const plain = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const text = links.length ? `${plain}\n\nPièces jointes :\n${links.join("\n")}` : plain;
  const result = await sendBrandedEmail({ apiKey, to: contact.email, subject: subject || "Notification AgriCapital", content: text, senderId, idempotencyKey: dedupeKey });
  return { provider: "senndo", messageId: result.id || null };
}
async function sendSms(contact: Contact, content: string, dedupeKey: string) {
  const candidates = [...new Set([contact.telephone, contact.telephone_secondaire].map((value) => String(value || "").trim()).filter(Boolean))];
  if (!candidates.length) throw new Error("Aucun numéro de téléphone disponible");
  const client = await getSenndoClient();
  let lastError: unknown = null;
  for (let index = 0; index < candidates.length; index++) {
    const to = candidates[index];
    try {
      const result = await client.sendMessage({
        channel: "sms", to, text: normalizeSms(content), senderId: "AgriCapital",
        idempotencyKey: index === 0 ? dedupeKey : dedupeKey + ":telephone-secondaire",
      });
      return { provider: "senndo", messageId: result.id || null, content: normalizeSms(content), to };
    } catch (error) {
      lastError = error;
      if (index === candidates.length - 1) throw error;
      const status = Number((error as any)?.status || (error as any)?.statusCode || 0);
      const message = String((error as any)?.message || "");
      const recipientRejected = [400,404,422].includes(status) || /invalid.{0,20}(phone|number|recipient)|(phone|number|recipient).{0,20}invalid/i.test(message);
      // En cas de timeout ou d'erreur réseau, la livraison du premier SMS est incertaine :
      // ne jamais envoyer sur le second numéro et risquer un doublon.
      if (!recipientRejected) throw error;
      console.warn("[Senndo SMS] Numéro principal explicitement refusé; essai du secondaire", { sourceId: contact.source_id, status });
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Échec de l’envoi SMS sur les numéros disponibles");
}
async function resolveWhatsAppSenderSession(): Promise<{ apiKey: string; senderSessionId: string; senderPhone: string }> {
  const [{ data: apiKey, error: apiError }, { data: configuredPhone, error: phoneError }] = await Promise.all([
    admin.rpc("senndo_get_secret", { p_name: "senndo_api_key" }),
    admin.rpc("senndo_get_secret", { p_name: "senndo_whatsapp_sender_phone" }),
  ]);
  if (apiError || typeof apiKey !== "string" || !apiKey) throw new Error("Clé API Senndo non configurée");
  if (phoneError || typeof configuredPhone !== "string" || !configuredPhone.trim()) throw new Error("Numéro de session WhatsApp Senndo non configuré en base.");

  const response = await fetch("https://api.senndo.com/v1/wa/sessions", {
    method: "GET",
    headers: { authorization: "Bearer " + apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Impossible de lire les sessions WhatsApp Senndo (HTTP " + response.status + ").");

  const asArray = (value: any): any[] => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
  const rawSessions = [
    ...asArray(payload),
    ...asArray(payload?.sessions),
    ...asArray(payload?.data?.sessions),
    ...asArray(payload?.data),
    ...asArray(payload?.items),
    ...asArray(payload?.results),
    ...asArray(payload?.data?.items),
    ...asArray(payload?.data?.results),
    ...asArray(payload?.session),
    ...asArray(payload?.data?.session),
  ];
  const seenSessions = new Set<any>();
  const sessions = rawSessions
    .filter((item: any) => item && typeof item === "object" && !seenSessions.has(item) && (seenSessions.add(item), true))
    .map((item: any) => {
      const nested = item.session && typeof item.session === "object" ? item.session
        : item.data?.session && typeof item.data.session === "object" ? item.data.session : null;
      return nested ? {
        ...item, ...nested,
        id: nested.id ?? item.id,
        sessionId: nested.sessionId ?? nested.session_id ?? item.sessionId ?? item.session_id,
        senderSessionId: nested.senderSessionId ?? nested.sender_session_id ?? item.senderSessionId ?? item.sender_session_id,
        uuid: nested.uuid ?? item.uuid,
      } : item;
    });

  const nestedObjects = (root: any, depth = 0): any[] => {
    if (!root || typeof root !== "object" || depth > 5) return [];
    return [root, ...Object.values(root).flatMap((value: any) => nestedObjects(value, depth + 1))];
  };
  const technicalSessionId = (session: any): string => {
    const objects = nestedObjects(session);
    const preferred = [
      "senderSessionId", "sender_session_id", "sessionId", "session_id",
      "uniqueSessionId", "unique_session_id", "sessionKey", "session_key",
      "sessionUid", "session_uid", "sessionIdentifier", "session_identifier",
      "instanceId", "instance_id", "deviceId", "device_id", "sid", "uuid", "id",
    ];
    for (const key of preferred) {
      const value = objects.map((object: any) => object?.[key]).find((candidate: any) =>
        (typeof candidate === "string" && candidate.trim()) ||
        (typeof candidate === "number" && Number.isFinite(candidate)));
      if (value !== undefined) return String(value).trim();
    }
    return "";
  };
  const normalizePhone = (value: unknown) => {
    const rawPhone = String(value ?? "").split("@")[0].split(":")[0].replace(/\D/g, "");
    if (!rawPhone) return "";
    const national = rawPhone.startsWith("225") ? rawPhone.slice(3) : rawPhone;
    if (national.length === 10 && /^0[157]\d{8}$/.test(national)) return "225" + national.slice(-8);
    if (national.length === 8) return "225" + national;
    return rawPhone;
  };
  const phoneValues = (session: any) => [
    session?.phoneNumber, session?.phone_number, session?.phone, session?.displayPhoneNumber,
    session?.display_phone_number, session?.number, session?.jid, session?.user?.id,
    session?.user?.jid, session?.me?.id, session?.me?.jid, session?.account?.phone,
    session?.account?.phoneNumber, session?.profile?.phone, session?.whatsapp?.phone,
    session?.session?.phoneNumber, session?.session?.phone_number, session?.session?.user?.id,
    session?.session?.me?.id, session?.creds?.me?.id, session?.authState?.creds?.me?.id,
  ].filter((value) => (typeof value === "string" || typeof value === "number") && String(value).trim());
  const statusOf = (session: any) => String(
    session?.status ?? session?.state ?? session?.connectionStatus ?? session?.connection_status ??
    session?.connection?.status ?? session?.session?.status ?? ""
  ).trim().toLowerCase();
  const connected = sessions.filter((session: any) => ["connected", "open", "ready", "authenticated"].includes(statusOf(session)));
  const senderDigits = normalizePhone(configuredPhone);
  if (!senderDigits) throw new Error("Le numéro de session WhatsApp Senndo configuré est invalide.");
  const matches = connected.filter((session: any) => phoneValues(session).some((value: unknown) => normalizePhone(value) === senderDigits));

  // Senndo peut omettre le téléphone d'une session. Si une seule session est connectée,
  // elle est non ambiguë et peut être utilisée; plusieurs sessions exigent une correspondance exacte.
  const session = matches.length === 1 ? matches[0] : (matches.length === 0 && connected.length === 1 ? connected[0] : null);
  const senderSessionId = session ? technicalSessionId(session) : "";
  if (!session || !senderSessionId) {
    throw new Error(connected.length === 0
      ? "Aucune session WhatsApp connectée n’a été trouvée dans Senndo."
      : connected.length > 1 && matches.length !== 1
        ? "Plusieurs sessions WhatsApp sont connectées sans correspondance unique avec le numéro configuré."
        : "La session WhatsApp est connectée, mais Senndo ne fournit pas son identifiant technique.");
  }
  return { apiKey, senderSessionId, senderPhone: String(configuredPhone).trim() };
}

function normalizeWhatsAppRecipient(value: string): string {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) throw new Error("Numéro WhatsApp destinataire invalide.");
  let normalized = "";
  if (raw.startsWith("+")) normalized = "+" + digits;
  else if (raw.startsWith("00")) normalized = "+" + digits.slice(2);
  else if (digits.startsWith("225")) normalized = "+" + digits;
  else if (digits.length === 10 && /^0[157]\d{8}$/.test(digits)) normalized = "+225" + digits;
  else if (digits.length === 8) normalized = "+225" + digits;
  else throw new Error("Le numéro WhatsApp destinataire doit être au format international, par exemple +2250700000000.");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("Numéro WhatsApp destinataire invalide.");
  return normalized;
}

async function sendWhatsApp(contact: Contact, content: string, dedupeKey: string, mediaRef?: string) {
  const rawRecipient = contact.whatsapp || contact.telephone;
  if (!rawRecipient) throw new Error("Numéro WhatsApp absent");
  const recipient = normalizeWhatsAppRecipient(rawRecipient);
  const session = await resolveWhatsAppSenderSession();
  const response = await fetch("https://api.senndo.com/v1/messages", {
    method: "POST",
    headers: { authorization: "Bearer " + session.apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      channel: "whatsapp_baileys", to: recipient, text: content,
      senderSessionId: session.senderSessionId, idempotencyKey: dedupeKey,
      ...(mediaRef ? { media: { ref: mediaRef } } : {}),
    }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof payload?.message === "string" ? payload.message.slice(0, 250) : "";
    throw new Error("Senndo a refusé l’envoi WhatsApp appairé (HTTP " + response.status + ")." + (detail ? " " + detail : ""));
  }
  return { provider: "senndo_whatsapp_baileys", messageId: payload?.id ?? payload?.messageId ?? payload?.message?.id ?? null };
}

async function sendVoice(contact: Contact, content: string, dedupeKey: string) {
  if (!contact.telephone) throw new Error("Téléphone absent pour l'appel vocal");
  const client = await getSenndoClient();
  const result = await client.sendMessage({ channel: "voice", to: contact.telephone, text: content, idempotencyKey: dedupeKey });
  return { provider: "senndo", messageId: result.id || null };
}

async function resolveContacts(criteria: Record<string, unknown>) {
  const { data, error } = await admin.rpc("notification_resolve_recipients", { _criteres: criteria });
  if (error) throw error;
  const rows = (data || []) as Contact[];
  // The legacy RPC folds WhatsApp into the telephone field and does not return a
  // separate whatsapp property. Hydrate that property server-side so "auto"
  // can select the paired WhatsApp channel instead of silently choosing SMS.
  const clientIds = [...new Set(rows.filter((row) => row.source_type !== "prospect" && row.source_type !== "equipe").map((row) => row.source_id))];
  const prospectIds = [...new Set(rows.filter((row) => row.source_type === "prospect").map((row) => row.source_id))];
  const staffProfileIds = [...new Set(rows.filter((row) => row.source_type === "equipe").map((row) => row.source_id))];
  const [clientsResult, prospectsResult, staffResult] = await Promise.all([
    clientIds.length ? admin.from("clients").select("id,whatsapp,telephone_secondaire").in("id", clientIds) : Promise.resolve({ data: [], error: null }),
    prospectIds.length ? admin.from("leads").select("id,whatsapp,telephone_secondaire").in("id", prospectIds) : Promise.resolve({ data: [], error: null }),
    staffProfileIds.length ? admin.from("profiles").select("id,whatsapp,telephone_secondaire").in("id", staffProfileIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (clientsResult.error) throw clientsResult.error;
  if (prospectsResult.error) throw prospectsResult.error;
  if (staffResult.error) throw staffResult.error;
  const clientContacts = new Map((clientsResult.data || []).map((row: any) => [row.id, row]));
  const prospectContacts = new Map((prospectsResult.data || []).map((row: any) => [row.id, row]));
  const staffContacts = new Map((staffResult.data || []).map((row: any) => [row.id, row]));
  const map = new Map<string, Contact>();
  for (const original of rows) {
    const contactData:any = original.source_type === "prospect"
      ? prospectContacts.get(original.source_id)
      : original.source_type === "equipe"
        ? staffContacts.get(original.source_id)
        : clientContacts.get(original.source_id);
    const row: Contact = {
      ...original,
      whatsapp: typeof contactData?.whatsapp === "string" && contactData.whatsapp.trim() ? contactData.whatsapp : null,
      telephone_secondaire: typeof contactData?.telephone_secondaire === "string" && contactData.telephone_secondaire.trim() ? contactData.telephone_secondaire : null,
    };
    const key = row.user_id || row.email?.toLowerCase() || row.whatsapp || row.telephone || row.source_type + ":" + row.source_id;
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

async function deliver(args: {
  campaignId?: string | null; automationId?: string | null; canal: string;
  subject?: string | null; content: string; contacts: Contact[];
  context?: Record<string, unknown>; eventKey?: string; mediaAttachments?: MediaAttachment[];
}) {
  let sent = 0, failed = 0;
  const effectiveChannel = args.canal === "app" ? "app" : "whatsapp";
  const needsSenndoMedia = effectiveChannel === "whatsapp";
  const preparedMedia = args.mediaAttachments?.length && needsSenndoMedia ? await prepareMedia(args.mediaAttachments) : [];
  for (const contact of args.contacts) {
    const channels = args.canal === "app" ? ["app"] : ["whatsapp"];
    for (const channel of [...new Set(channels)]) {
      if (channel === "app" && !contact.user_id && contact.source_type === "equipe") continue;
      const dedupeKey = (args.campaignId || args.automationId || "manual") + ":" +
        (args.eventKey || "") + ":" + (contact.user_id || contact.source_id) + ":" + channel;
      const { data: existing } = await admin.from("notification_deliveries")
        .select("id,statut,created_at").eq("dedupe_key", dedupeKey).maybeSingle();

      if (existing?.statut === "envoye" || existing?.statut === "livre" || existing?.statut === "en_cours") { if (effectiveChannel === "auto") break; else continue; }

      // Render the message separately for each recipient/channel. These variables must
      // exist before building the delivery row and before invoking the provider.
      const rendered = render(args.content, contact, args.context || {});
      const renderedSubject = render(args.subject || "", contact, args.context || {});
      const attachments = args.mediaAttachments || [];
      const mediaForChannel = channel === "whatsapp" ? preparedMedia : [];
      const attachmentMetadata = attachments.map((item) => ({
        bucket: item.bucket || "notification-media",
        path: item.path,
        name: item.name,
        mimeType: item.mimeType,
        size: item.size ?? null,
      }));

      const deliveryPayload = {
        campaign_id: args.campaignId || null, automation_id: args.automationId || null,
        user_id: contact.user_id || null, source_type: contact.source_type, source_id: contact.source_id,
        recipient_name: contact.nom_complet || null, recipient_email: contact.email || null,
        recipient_phone: contact.telephone || null, canal: channel, statut: "en_cours",
        contenu: channel === "sms" ? assertSmsLength(normalizeSms(rendered)) : rendered, dedupe_key: dedupeKey,
        media_attachments: attachmentMetadata,
        metadata: { event_key: args.eventKey || null },
      };

      let delivery: { id: string };
      if (existing) {
        // Conditional update is the atomic claim: only one worker may deliver.
        const ageMs = Date.now() - new Date(existing.created_at).getTime();
        if (existing.statut === "en_attente" && ageMs < 5 * 60 * 1000) continue;
        if (existing.statut !== "echoue" && existing.statut !== "en_attente") continue;
        const { data: claimed, error: claimError } = await admin.from("notification_deliveries")
          .update({ statut: "en_cours", erreur: null })
          .eq("id", existing.id).eq("statut", existing.statut)
          .select("id").maybeSingle();
        if (claimError) { failed++; continue; }
        if (!claimed) continue;
        delivery = claimed;
      } else {
        const { data: inserted, error: insertError } = await admin.from("notification_deliveries")
          .insert(deliveryPayload).select("id").maybeSingle();
        if (insertError?.code === "23505") continue;
        if (insertError || !inserted) { failed++; continue; }
        delivery = inserted;
      }
      try {
        if (channel === "app") {
          if (contact.user_id) {
            const { error } = await admin.from("notifications").insert({
              user_id: contact.user_id, type: "communication", title: renderedSubject,
              message: rendered, data: { campaign_id: args.campaignId, automation_id: args.automationId, dedupe_key: dedupeKey }, dedupe_key: dedupeKey,
            });
            if (error) {
              if (error.code === "23505") {
                await admin.from("notification_deliveries").update({ statut: "envoye", sent_at: new Date().toISOString() }).eq("id", delivery.id);
                sent++;
                continue;
              }
              throw error;
            }
          }

          const pushCount = await sendWebPush(contact, renderedSubject, rendered, dedupeKey, {
            campaign_id: args.campaignId || null,
            automation_id: args.automationId || null,
            event_key: args.eventKey || null,
          });
          if (!contact.user_id && pushCount === 0) {
            throw new Error("Aucun abonnement Push actif pour ce destinataire. Il doit activer les notifications depuis son PWA.");
          }
          await admin.from("notification_deliveries").update({ statut: "envoye", sent_at: new Date().toISOString() }).eq("id", delivery.id);
        } else if (channel === "whatsapp") {
          assertWhatsAppLength(rendered);
          const result = await sendWhatsApp(contact, rendered, dedupeKey, mediaForChannel[0]?.ref);
          for (let i = 1; i < mediaForChannel.length; i++) {
            await sendWhatsApp(contact, "", dedupeKey + ":media:" + i, mediaForChannel[i].ref);
          }
          await admin.from("notification_deliveries").update({
            statut: "envoye", fournisseur: result.provider, provider_message_id: result.messageId, sent_at: new Date().toISOString(),
          }).eq("id", delivery.id);
        }
        sent++;
        if (effectiveChannel === "auto") break;
      } catch (error) {
        failed++;
        await admin.from("notification_deliveries").update({
          statut: "echoue", erreur: error instanceof Error ? error.message : String(error),
        }).eq("id", delivery.id);
        const status = Number((error as any)?.status || (error as any)?.statusCode || 0);
        const message = String((error as any)?.message || "");
        const outcomeUncertain = status >= 500 || /timeout|timed out|network|failed to fetch|connection reset|socket|econn|abort/i.test(message);
        // En mode automatique, un résultat de livraison incertain interdit le repli vers un autre canal :
        // le premier message a peut-être été délivré malgré le timeout.
        if (args.canal === "auto" && outcomeUncertain) break;
      }
    }
  }
  return { sent, failed };
}

async function runCampaign(campaignId: string) {
  const { data: campaign, error } = await admin.from("notification_campaigns")
    .select("*, segment:notification_segments(criteres)").eq("id", campaignId).single();
  if (error) throw error;
  if (["annule","termine"].includes(campaign.statut)) return { skipped: true, reason: campaign.statut };
  if (campaign.programme_le && new Date(campaign.programme_le).getTime() > Date.now()) return { skipped: true, reason: "programme" };

  const criteria = campaign.segment?.criteres || campaign.criteres || {};
  let contacts = await resolveContacts(criteria);
  const selectedRecipients = Array.isArray(criteria.selected_recipients) ? criteria.selected_recipients as Array<{ source_type?: string; source_id?: string }> : [];
  if (selectedRecipients.length) {
    const selected = new Set(selectedRecipients.map((r) => `${r.source_type || ""}:${r.source_id || ""}`));
    contacts = contacts.filter((c) => selected.has(`${c.source_type}:${c.source_id}`));
  }
  await admin.from("notification_campaigns").update({
    statut: "en_cours", demarre_le: new Date().toISOString(), total_destinataires: contacts.length,
  }).eq("id", campaign.id);
  const result = await deliver({
    campaignId: campaign.id, canal: campaign.canal, subject: campaign.sujet,
    content: campaign.contenu, contacts, mediaAttachments: campaign.media_attachments || [],
  });
  await admin.from("notification_campaigns").update({
    statut: result.failed ? (result.sent ? "partiel" : "echoue") : "termine",
    total_envoyes: result.sent, total_echecs: result.failed, termine_le: new Date().toISOString(),
  }).eq("id", campaign.id);
  return { campaign_id: campaign.id, contacts: contacts.length, ...result };
}

async function runEvent(eventCode: string, context: Record<string, unknown>) {
  const { data: automations, error } = await admin.from("notification_automations")
    .select("*").eq("evenement", eventCode).eq("actif", true);
  if (error) throw error;
  const results = [];
  for (const automation of automations || []) {
    let contacts = await resolveContacts(automation.criteres || {});
    if (context.client_id) {
      contacts = contacts.filter((c) => c.source_id === context.client_id && c.source_type === "client");
    }
    if (context.proprietaire_id) {
      contacts = contacts.filter((c) => c.source_id === context.proprietaire_id && c.source_type === "proprietaire_foncier");
    }
    if (context.user_id) contacts = contacts.filter((c) => c.user_id === context.user_id);
    const cooldownMinutes = Math.max(0, Number(automation.cooldown_minutes) || 0);
    if (cooldownMinutes > 0 && contacts.length) {
      const cutoff = new Date(Date.now() - cooldownMinutes * 60_000).toISOString();
      const eligible: Contact[] = [];
      for (const contact of contacts) {
        let query = admin.from("notification_deliveries").select("id").eq("automation_id", automation.id)
          .eq("source_id", contact.source_id).gte("created_at", cutoff)
          .in("statut", ["en_cours", "envoye", "livre"]).limit(1);
        if (context.paiement_id) query = query.contains("metadata", { event_key: eventCode + ":" + String(context.paiement_id) });
        const { data: recent, error: recentError } = await query;
        if (recentError) throw recentError;
        if (!recent?.length) eligible.push(contact);
      }
      contacts = eligible;
    }
    let selectedChannel = automation.canal;
    if (selectedChannel === "auto" && context.client_id) {
      const preferenceColumn = eventCode === "solde_regle" ? "canal_finalisation" : "canal_rappel";
      const { data: preference } = await admin.from("notification_client_preferences")
        .select(preferenceColumn).eq("client_id", String(context.client_id)).maybeSingle();
      const preferred = preference?.[preferenceColumn];
      if (typeof preferred === "string" && preferred !== "auto") selectedChannel = preferred;
    }
    const result = await deliver({
      automationId: automation.id, canal: selectedChannel, subject: automation.sujet,
      content: automation.contenu, contacts, context, mediaAttachments: automation.media_attachments || [],
      eventKey: eventCode + ":" + (context.paiement_id || context.client_id || context.proprietaire_id || context.user_id || "global"),
    });
    await admin.from("notification_automations").update({ derniere_execution_at: new Date().toISOString() }).eq("id", automation.id);
    results.push({ automation_id: automation.id, ...result });
  }
  return results;
}

async function dispatchWebPush(context: Record<string, unknown>) {
  const notificationId = String(context.notification_id || "");
  if (!notificationId) throw new Error("notification_id manquant");
  const { data: notification, error } = await admin.from("notifications")
    .select("id,user_id,title,message,data,dedupe_key").eq("id", notificationId).maybeSingle();
  if (error) throw error;
  if (!notification) return { sent: 0, skipped: true };
  const { data: subscriptions, error: subError } = await admin.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth").eq("user_id", notification.user_id).eq("active", true);
  if (subError) throw subError;
  if (!subscriptions?.length) return { sent: 0, skipped: true };
  const { data: config, error: configError } = await admin.rpc("notification_vapid_config");
  if (configError || !config?.public_key || !config?.private_key || !config?.subject) {
    throw new Error("Configuration VAPID indisponible");
  }
  webpush.setVapidDetails(config.subject, config.public_key, config.private_key);
  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: notification.title, body: notification.message, notificationId: notification.id,
          tag: notification.dedupe_key || notification.id, data: notification.data || {},
          url: notification.data?.route || "/",
        }),
        { TTL: 3600, urgency: "normal" },
      );
      sent++;
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || error?.status || 0);
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
      } else {
        console.warn("[WebPush] envoi impossible", sub.id, statusCode || "erreur");
      }
    }
  }
  return { sent, total: subscriptions.length };
}

async function dispatchPortalWebPush(context: Record<string, unknown>) {
  const notificationId = String(context.portal_notification_id || "");
  const clientId = String(context.client_id || "");
  if (!notificationId || !clientId) throw new Error("Notification portail incomplète");
  const { data: notification, error } = await admin.from("portail_notifications")
    .select("id,client_id,title,message,data,dedupe_key").eq("id", notificationId).maybeSingle();
  if (error) throw error;
  if (!notification) return { sent: 0, skipped: true };
  const { data: subscriptions, error: subError } = await admin.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth").eq("client_id", clientId).eq("active", true);
  if (subError) throw subError;
  if (!subscriptions?.length) return { sent: 0, skipped: true };
  const { data: config, error: configError } = await admin.rpc("notification_vapid_config");
  if (configError || !config?.public_key || !config?.private_key || !config?.subject) throw new Error("Configuration VAPID indisponible");
  webpush.setVapidDetails(config.subject, config.public_key, config.private_key);
  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: notification.title, body: notification.message, notificationId: notification.id,
          tag: notification.dedupe_key || notification.id, data: notification.data || {}, url: notification.data?.url || "/" }),
        { TTL: 3600, urgency: "normal" },
      );
      sent++;
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || error?.status || 0);
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
      } else console.warn("[WebPush portail] envoi impossible", sub.id, statusCode || "erreur");
    }
  }
  return { sent, total: subscriptions.length };
}

async function runEvents(events: Array<{ id: string; event_code: string; context: Record<string, unknown> }>) {
  const results = [];
  for (const event of events.slice(0, 20)) {
    try {
      if (event.event_code === "notification_push") {
        const push = await dispatchWebPush(event.context || {});
        results.push({ id: event.id, ok: true, push });
      } else if (event.event_code === "portail_notification_push") {
        const push = await dispatchPortalWebPush(event.context || {});
        results.push({ id: event.id, ok: true, push });
      } else {
        const deliveries = await runEvent(event.event_code, event.context || {});
        const failed = deliveries.reduce((sum: number, item: any) => sum + Math.max(0, Number(item?.failed) || 0), 0);
        if (failed > 0) {
          results.push({
            id: event.id,
            ok: false,
            error: `Échec de livraison pour ${failed} canal(aux). Le dossier de notification sera réessayé.`,
            deliveries,
          });
        } else {
          results.push({ id: event.id, ok: true, deliveries });
        }
      }
    } catch (error) {
      results.push({ id: event.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

async function runScheduledAutomations() {
  const now = new Date();
  const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const results = [];

  // Les rappels sont ciblés par client et par échéance : aucun envoi massif à toute la base.
  const { data: duePayments, error: dueError } = await admin.from("paiements")
    .select("id,client_id,montant,date_echeance,statut")
    .eq("type_paiement", "REDEVANCE")
    .neq("statut", "valide")
    .gte("date_echeance", now.toISOString().slice(0, 10))
    .lte("date_echeance", inThreeDays.toISOString().slice(0, 10))
    .limit(500);
  if (dueError) throw dueError;

  for (const paiement of duePayments || []) {
    results.push(await runEvent("paiement_echeance", {
      client_id: paiement.client_id,
      paiement_id: paiement.id,
      montant: paiement.montant,
      date_echeance: paiement.date_echeance,
    }));
  }

  const { data: overduePayments, error: overdueError } = await admin.from("paiements")
    .select("id,client_id,montant,date_echeance,statut")
    .eq("type_paiement", "REDEVANCE")
    .neq("statut", "valide")
    .lt("date_echeance", now.toISOString().slice(0, 10))
    .limit(500);
  if (overdueError) throw overdueError;

  for (const paiement of overduePayments || []) {
    results.push(await runEvent("paiement_retard", {
      client_id: paiement.client_id,
      paiement_id: paiement.id,
      montant: paiement.montant,
      date_echeance: paiement.date_echeance,
    }));
  }

  const { data: scheduled } = await admin.from("notification_campaigns").select("id")
    .eq("statut", "programme").lte("programme_le", now.toISOString()).limit(20);
  for (const campaign of scheduled || []) results.push(await runCampaign(campaign.id));

  return results;
}


const BRAND_LOGO_URL = "https://www.agricapital.ci/logo-agricapital.png";
function escapeEmailHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function buildAgriCapitalEmailHtml(content: string) {
  const body = /<\/?[a-z][\s\S]*>/i.test(content) ? content : escapeEmailHtml(content).replace(/\r?\n/g, "<br>");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f3f5f4;font-family:Arial,Helvetica,sans-serif;color:#27332d;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">AgriCapital — Investir la terre. Cultiver l’avenir.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f5f4;padding:24px 10px;"><tr><td align="center">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e1e7e3;border-radius:12px;overflow:hidden;">
  <tr><td style="height:6px;background:#16834a;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td align="center" style="padding:24px;"><a href="https://www.agricapital.ci/" style="text-decoration:none;">
  <img src="${BRAND_LOGO_URL}" width="250" alt="AgriCapital — Investir la terre. Cultiver l’avenir." style="display:block;width:250px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;"></a></td></tr>
  <tr><td style="padding:0 28px 28px;font-size:15px;line-height:1.75;overflow-wrap:anywhere;">${body}</td></tr>
  <tr><td style="padding:20px 24px;background:#f8faf8;border-top:1px solid #e6ebe7;text-align:center;font-size:12px;line-height:1.7;color:#66736b;">
  <strong style="font-size:14px;color:#176b45;">AgriCapital SARL</strong><br>Investir la terre. Cultiver l’avenir.<br>
  <a href="https://www.agricapital.ci/" style="color:#176b45;">www.agricapital.ci</a> ·
  <a href="mailto:contact@agricapital.ci" style="color:#176b45;">contact@agricapital.ci</a><br>Daloa – Gonaté, Haut-Sassandra, Côte d’Ivoire</td></tr>
  </table><div style="max-width:560px;padding:12px 10px;color:#8a958e;font-size:11px;line-height:1.5;text-align:center;">Message envoyé par AgriCapital via Senndo.</div>
  </td></tr></table></body></html>`;
}
function emailPlainText(content: string) {
  return content.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
async function sendBrandedEmail(input: { apiKey: string; to: string; subject: string; content: string; senderId: string; idempotencyKey: string }) {
  const response = await fetch("https://api.senndo.com/v1/messages", {
    method: "POST", headers: { authorization: "Bearer " + input.apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ channel: "email", to: input.to, subject: input.subject, text: emailPlainText(input.content),
      html: buildAgriCapitalEmailHtml(input.content), senderId: input.senderId, replyTo: "contact@agricapital.ci", idempotencyKey: input.idempotencyKey }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error("Senndo a refusé l’envoi e-mail (HTTP " + response.status + "). " +
      (typeof payload?.message === "string" ? payload.message.slice(0, 250) : "Vérifiez l’expéditeur vérifié et la configuration e-mail Senndo."));
    (err as any).status = response.status; (err as any).code = typeof payload?.code === "string" ? payload.code : "SENNDO_EMAIL_REJECTED"; throw err;
  }
  return { id: payload?.id ?? payload?.messageId ?? payload?.message?.id ?? null, status: payload?.status ?? payload?.message?.status ?? "accepted" };
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "status";
    if (mode === "run_automations") {
      if (!(await internalAuthorized(req))) return json(req, { error: "Non autorise" }, 401);
      return json(req, { ok: true, results: await runScheduledAutomations() });
    }
    if (mode === "events") {
      // Les événements déclenchés depuis le CRM peuvent venir d'un utilisateur du personnel.
      // Les appels cron restent protégés par le secret interne ; un appel manuel exige une session
      // authentifiée et un rôle du personnel reconnu par staffAuthorized.
      const authorized = await internalAuthorized(req) || await staffAuthorized(req, "messagerie.send");
      if (!authorized) return json(req, { error: "Accès refusé : session du personnel requise." }, 401);
      const events = Array.isArray(body.events) ? body.events : [];
      return json(req, { ok: true, results: await runEvents(events) });
    }
    // Le statut ne retourne que des indicateurs de configuration non secrets.
    // Il est consommé par l'écran de paramètres et ne doit pas provoquer un 401 bloquant
    // toute l'interface quand le contrôle de rôle n'est pas encore résolu.
    if (mode === "status") {
      const auth = req.headers.get("Authorization") || "";
      if (!auth.startsWith("Bearer ")) return json(req, { error: "Authentification requise" }, 401);
      const { data: authData, error: authError } = await admin.auth.getUser(auth.slice(7));
      if (authError || !authData.user) return json(req, { error: "Session invalide" }, 401);
      return json(req, { ok: true, providers: await providerStatus() });
    }
    const requiredPermission = mode === "preview" ? "messagerie.view" : "messagerie.send";
    if (!(await staffAuthorized(req, requiredPermission))) return json(req, { error: "Accès refusé : votre rôle ne possède pas la permission de messagerie requise." }, 401);
    if (mode === "recipient_directory") {
      const contacts = await resolveContacts({ audience: "tous" });
      return json(req, { ok: true, contacts: contacts.map((c) => ({ source_type: c.source_type, source_id: c.source_id, nom_complet: c.nom_complet, email: c.email, telephone: c.telephone, role_code: c.role_code })) });
    }
    if (mode === "manual_contact") {
      const leadId = String(body.lead_id || "").trim();
      const channel = String(body.channel || "");
      const content = String(body.content || "").trim();
      const subject = String(body.subject || "Suivi de votre projet de plantation de palmier à huile").slice(0, 160);
      const requestId = String(body.request_id || crypto.randomUUID()).replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 100);
      if (!leadId) return json(req, { error: "lead_id requis" }, 400);
      if (!["whatsapp", "email", "sms"].includes(channel)) return json(req, { error: "Canal non pris en charge" }, 400);
      const normalizedContent = channel === "sms" ? normalizeSms(content) : content;
      const effectiveLength = Array.from(normalizedContent).length;
      const limit = channel === "sms" ? 155 : channel === "whatsapp" ? 350 : 5000;
      if (!normalizedContent || effectiveLength > limit) {
        return json(req, { error: `Le message doit contenir entre 1 et ${limit} caractères (actuellement ${effectiveLength}).` }, 400);
      }
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader.startsWith("Bearer ")) return json(req, { error: "Authentification requise" }, 401);
      const { data: authData, error: authError } = await admin.auth.getUser(authHeader.slice(7));
      const actor = authData?.user;
      if (authError || !actor) return json(req, { error: "Session invalide" }, 401);
      const rawAttachments = Array.isArray(body.media_attachments) ? body.media_attachments : [];
      if (rawAttachments.length > 6) return json(req, { error: "Six pièces jointes maximum par message." }, 400);
      if (channel === "sms" && rawAttachments.length) return json(req, { error: "Les SMS ne prennent pas en charge les pièces jointes." }, 400);
      const templateId = String(body.template_id || "").trim();
      let templateMedia: Array<Record<string, unknown>> = [];
      if (templateId) {
        const { data: selectedTemplate, error: templateError } = await admin.from("notification_templates")
          .select("id,canal,actif,media_attachments").eq("id", templateId).maybeSingle();
        if (templateError) throw templateError;
        if (!selectedTemplate || !selectedTemplate.actif || selectedTemplate.canal !== channel) {
          return json(req, { error: "Le modèle sélectionné n’est plus disponible pour ce canal." }, 400);
        }
        templateMedia = Array.isArray(selectedTemplate.media_attachments) ? selectedTemplate.media_attachments : [];
      }
      const allowedMime = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime|3gpp)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel)|text\/(plain|csv))$/i;
      const mediaAttachments: MediaAttachment[] = [];
      for (const item of rawAttachments) {
        if (!item || typeof item.path !== "string" || typeof item.name !== "string" || typeof item.mimeType !== "string") {
          return json(req, { error: "Pièce jointe invalide." }, 400);
        }
        if (item.bucket && item.bucket !== "notification-media") return json(req, { error: "Bucket de pièce jointe non autorisé." }, 400);
        const ownedByActor = item.path.startsWith(`${actor.id}/`);
        const belongsToSelectedTemplate = templateMedia.some((stored: any) =>
          stored?.path === item.path && (stored?.bucket || "notification-media") === (item.bucket || "notification-media"));
        if ((!ownedByActor && !belongsToSelectedTemplate) || item.path.includes("..")) {
          return json(req, { error: "Accès refusé à une pièce jointe." }, 403);
        }
        if (!allowedMime.test(item.mimeType)) return json(req, { error: `Type de fichier non pris en charge : ${item.name}` }, 400);
        mediaAttachments.push({ bucket: "notification-media", path: item.path, name: item.name.slice(0, 180), mimeType: item.mimeType, size: Number(item.size) || undefined });
      }
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", actor.id);
      const supervisor = (roles || []).some((r) => [
        "pdg", "dg", "admin", "super_admin", "responsable_operations", "responsable_commercial",
        "chef_equipe_commercial", "service_client", "chef_equipe_service_client"
      ].includes(r.role));
      const { data: lead, error: leadError } = await admin.from("leads")
        .select("id,nom,prenoms,civilite,telephone,whatsapp,email,type_lead,assigned_to,created_by,client_id,proprietaire_id,prospect_id")
        .eq("id", leadId).maybeSingle();
      if (leadError) throw leadError;
      if (!lead) return json(req, { error: "Lead ou prospect introuvable" }, 404);
      // Barrière serveur : un client ou propriétaire foncier ne reçoit plus de prospection,
      // même si un ancien dossier lead/prospect est encore présent.
      if (lead.client_id || lead.proprietaire_id) {
        return json(req, { error: "Prospection bloquée : ce contact est déjà client ou propriétaire foncier." }, 409);
      }
      const { data: identityLink, error: identityLinkError } = await admin.from("crm_party_links")
        .select("party_id").eq("module_code", "leads").eq("record_id", lead.id).maybeSingle();
      if (identityLinkError) throw identityLinkError;
      if (identityLink?.party_id) {
        const { data: effectiveLinks, error: effectiveLinksError } = await admin.from("crm_party_links")
          .select("module_code").eq("party_id", identityLink.party_id)
          .in("module_code", ["clients", "proprietaires_terres"]).limit(1);
        if (effectiveLinksError) throw effectiveLinksError;
        if (effectiveLinks?.length) {
          return json(req, { error: "Prospection bloquée : ce contact est déjà client ou propriétaire foncier." }, 409);
        }
      }
      if (!supervisor && lead.assigned_to !== actor.id && lead.created_by !== actor.id) {
        return json(req, { error: "Vous ne pouvez contacter que vos propres leads ou prospects." }, 403);
      }
      const contact: Contact = {
        source_type: "lead", source_id: lead.id,
        nom_complet: [lead.prenoms, lead.nom].filter(Boolean).join(" ").trim() || "Contact AgriCapital",
        email: lead.email || null, telephone: lead.telephone || null, whatsapp: lead.whatsapp || null,
      };
      if (channel === "whatsapp" && !(contact.whatsapp || contact.telephone)) return json(req, { error: "Numéro WhatsApp absent" }, 400);
      if (channel === "sms" && !contact.telephone) return json(req, { error: "Numéro de téléphone absent" }, 400);
      if (channel === "email" && !contact.email) return json(req, { error: "Adresse email absente" }, 400);
      const dedupeKey = `manual-contact:${lead.id}:${channel}:${requestId || crypto.randomUUID()}`;
      let result: { provider: string; messageId: string | null };
      if (channel === "whatsapp" || channel === "auto" || channel === "email_sms") {
        assertWhatsAppLength(normalizedContent);
        const prepared = mediaAttachments.length ? await prepareMedia(mediaAttachments) : [];
        result = await sendWhatsApp(contact, normalizedContent, dedupeKey, prepared[0]?.ref);
        for (let i = 1; i < prepared.length; i++) {
          await sendWhatsApp(contact, "", `${dedupeKey}:media:${i}`, prepared[i].ref);
        }
      } else {
        return json(req, { error: "Canal désactivé : utilisez WhatsApp pour les notifications externes." }, 400);
      }
      return json(req, { ok: true, channel: "whatsapp", messageId: result.messageId || null, characterCount: Array.from(normalizedContent).length, attachmentsSent: mediaAttachments.length });
    }
    if (mode === "preview") {
      const contacts = await resolveContacts(body.criteria || {});
      return json(req, { ok: true, count: contacts.length, sample: contacts.slice(0,20).map((c) => ({
        nom_complet:c.nom_complet,email:c.email,telephone:c.telephone,offre_nom:c.offre_nom,role_code:c.role_code
      }))});
    }
    if (mode === "event") {
      if (!body.event_code) return json(req, { error: "event_code requis" }, 400);
      return json(req, { ok: true, results: await runEvent(body.event_code, body.context || {}) });
    }
    if (mode === "campaign") {
      if (!body.campaign_id) return json(req, { error: "campaign_id requis" }, 400);
      return json(req, { ok: true, result: await runCampaign(body.campaign_id) });
    }
    return json(req, { error: "Mode non reconnu" }, 400);
  } catch (error) {
    console.error("notification-dispatch error", error);
    return json(req, { error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
