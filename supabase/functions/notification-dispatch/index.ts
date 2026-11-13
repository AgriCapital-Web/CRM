import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { SenndoClient } from "npm:@senndo/sdk@1.5.0";
import webpush from "https://esm.sh/web-push@3.6.7";

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
const json = (req: Request, body: unknown, status = 200) => new Response(
  [204, 205, 304].includes(status) ? null : JSON.stringify(body),
  { status, headers: { ...corsHeaders(req), ...(status === 204 || status === 304 ? {} : { "Content-Type": "application/json" }) } },
);
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
  nom_complet?: string | null; nom?: string | null; prenoms?: string | null; email?: string | null; telephone?: string | null; telephone_secondaire?: string | null; whatsapp?: string | null; telephone_secondaire_whatsapp_numero?: string | null;
  telephone_indicatif?: string | null; telephone_local?: string | null; whatsapp_indicatif?: string | null; whatsapp_local?: string | null;
  telephone_secondaire_indicatif?: string | null; telephone_secondaire_local?: string | null;
  telephone_principal_whatsapp?: boolean | null; telephone_secondaire_whatsapp?: boolean | null; telephone_whatsapp?: boolean | null;
  whatsapp_candidates?: string[];
  telephone_candidates?: string[];
  role_code?: string | null; offre_id?: string | null; offre_code?: string | null; offre_nom?: string | null;
};

const normalizeSms = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[œŒ]/g, "oe").replace(/[æÆ]/g, "ae").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[•·]/g, " ").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
const assertSmsLength = (value: string, maxCharacters = 155) => {
  const length = Array.from(value).length;
  if (length > maxCharacters) throw new Error(`SMS trop long : ${length}/${maxCharacters} caractères, espaces et signes compris.`);
  if (!length) throw new Error("Le SMS ne peut pas être vide.");
  return value;
};
const assertWhatsAppLength = (value: string) => {
  const length = Array.from(value).length;
  if (length > 4096) throw new Error(`Message WhatsApp trop long : ${length}/4096 caractères.`);
  if (!length) throw new Error("Le message WhatsApp ne peut pas être vide.");
  return value;
};

function stripAgriCapitalPrefix(value: string): string {
  return value
    .replace(/^\s*AgriCapital\s*\(notification automatique\)\s*:\s*/i, "")
    .replace(/^\s*AgriCapital\s*(?::|[·•—-])\s*/i, "")
    .replace(/^\s*AgriCapital\s*\n+/i, "")
    .replace(/^\s*Notification automatique(?:\s+|\n+|$)/i, "")
    .trimStart();
}

function normalizeWhatsAppMessage(value: string): string {
  // WhatsApp conserve l'en-tête automatique, suivi de deux sauts de ligne avant le corps.
  // Le Sender ID évite uniquement de répéter le nom AgriCapital.
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/🌱/gu, "")
    .replace(/^\s*AgriCapital\s*\(notification automatique\)\s*:\s*/i, "")
    .replace(/^\s*AgriCapital\s*(?::|[·•—-])\s*/i, "")
    .trimStart();
  const lines = normalized.split("\n").map((line) => line.trimEnd());
  const bodyLines = lines.filter((line) =>
    !/^(?:AgriCapital\s*[·•—-]\s*)?Notification automatique\s*$/i.test(line.trim())
  );
  const normalizeForCompare = (line: string) => line.replace(/[*_~]/g, "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[’‘]/g, "'").replace(/[.!]/g, "")
    .replace(/\s+/g, " ").trim().toLocaleLowerCase("fr");
  const slogan = "Investir la terre. Cultiver l'avenir.";
  let sloganSeen = false;
  const body = bodyLines.filter((line) => {
    if (normalizeForCompare(line) !== normalizeForCompare(slogan)) return true;
    if (sloganSeen) return false;
    sloganSeen = true;
    return true;
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return body ? "Notification automatique\n\n" + body : "Notification automatique";
}
function reformulateSmsWithinLimit(value: string, maxSmsCharacters = 155): string {
  let text = stripAgriCapitalPrefix(normalizeSms(value)).replace(/\s+/g, " ").trim();
  if (Array.from(text).length <= maxSmsCharacters) return text;

  const rules: Array<[RegExp, string]> = [
    [/AgriCapital\s*\(notification automatique\)\s*:/gi, "AgriCapital:"],
    [/Votre dossier de prospection a bien ete enregistre/gi, "Dossier de prospection enregistre"],
    [/Votre solde PalmTerroir restant est de/gi, "Solde PalmTerroir restant :"],
    [/votre solde restant est de/gi, "Solde restant :"],
    [/Merci de prevoir son reglement/gi, "Merci de regler"],
    [/Merci de prevoir le reglement/gi, "Merci de regler"],
    [/Appelez le fondateur au/gi, "Appelez au"],
    [/pour confirmer votre statut/gi, "pour confirmer"],
    [/votre compte AgriCapital est active/gi, "compte AgriCapital actif"],
    [/a bien ete enregistre/gi, "enregistre"],
    [/est maintenant active/gi, "est actif"],
    [/Contactez AgriCapital/gi, "Contact: 0564551717"],
    [/Pour toute question/gi, "Questions:"],
    [/Merci pour votre accompagnement spirituel/gi, "Merci pour votre soutien"],
  ];
  for (const [pattern, replacement] of rules) {
    text = text.replace(pattern, replacement);
    if (Array.from(text).length <= maxSmsCharacters) return text;
  }

  // Retirer d'abord les signatures et les formules secondaires, jamais le nom du destinataire.
  text = text.replace(/\s*(?:Direction|Investir la terre[^.]*|AgriCapital\.?|Merci\.)\s*$/i, "").trim();
  if (Array.from(text).length <= maxSmsCharacters) return text;

  const greeting = text.match(/^(.*?Bonjour\s+[^,;:]+[,;:]\s*)(.*)$/i);
  if (greeting) {
    const head = greeting[1];
    let body = greeting[2].trim();
    const available = maxSmsCharacters - Array.from(head).length;
    if (available <= 0) throw new Error("Le nom complet du destinataire dépasse la limite SMS autorisée.");
    body = body.replace(/\s*[-–—]\s*AgriCapital\.?$/i, "").trim();
    const words = body.split(/\s+/).filter(Boolean);
    while (words.length && Array.from(words.join(" ")).length > available) words.pop();
    const compactBody = words.join(" ").replace(/[ ,;:]+$/g, "");
    const fitted = head + (compactBody.length < body.length ? compactBody.replace(/[.!?]?$/, "") + "…" : compactBody);
    return assertSmsLength(fitted, maxSmsCharacters);
  }

  const chars = Array.from(text);
  return assertSmsLength(chars.slice(0, Math.max(0, maxSmsCharacters - 1)).join("").trimEnd() + "…", maxSmsCharacters);
}

function restructureSmsTemplateWithinLimit(value: string, maxBodyCharacters = 130): string {
  const tokenPattern = /\{\s*(?:dernier_prenom_nom|dernierprenom_nom)\s*\}/gi;
  const marker = "__AGRICAPITAL_LAST_GIVEN_NAME_AND_SURNAME__";
  let text = stripAgriCapitalPrefix(normalizeSms(value)).replace(tokenPattern, marker);
  if (!text) throw new Error("Le message est vide.");
  const rules: Array<[RegExp, string]> = [
    [/nous vous prions de bien vouloir/gi, "Merci de"],
    [/nous vous invitons à/gi, "Merci de"],
    [/veuillez/gi, "Merci de"],
    [/afin de/gi, "pour"],
    [/au sujet de/gi, "sur"],
    [/en raison de/gi, "car"],
    [/dans les meilleurs délais/gi, "rapidement"],
    [/nous vous remercions/gi, "Merci"],
    [/a votre disposition/gi, "disponible"],
    [/s'il vous plait/gi, "svp"],
    [/votre dossier de prospection a bien ete enregistre/gi, "dossier de prospection enregistré"],
    [/votre solde restant est de/gi, "solde restant :"],
    [/merci de prevoir son reglement/gi, "merci de régler"],
    [/appelez le fondateur au/gi, "appelez au"],
    [/pour confirmer votre statut/gi, "pour confirmer"],
  ];
  for (const [pattern, replacement] of rules) text = text.replace(pattern, replacement);
  text = text.replace(/\s*(?:Direction|Investir la terre[^.]*|Merci pour votre confiance\.?|AgriCapital\.? )\s*$/i, "").trim();
  const nameIndex = text.indexOf(marker);
  const bodyText = text.replaceAll(marker, "");
  if (Array.from(bodyText).length <= maxBodyCharacters) return text.replaceAll(marker, "{dernierprenom_nom}");
  if (nameIndex >= 0) {
    const beforeName = text.slice(0, nameIndex);
    const afterName = text.slice(nameIndex + marker.length).trim();
    const remaining = maxBodyCharacters - Array.from(beforeName).length;
    if (remaining < 1) throw new Error("Le texte avant le nom dépasse déjà 130 caractères.");
    const words = afterName.split(/\s+/).filter(Boolean);
    let kept = words;
    while (kept.length && Array.from(kept.join(" ")).length > remaining - 1) kept.pop();
    const suffix = kept.length ? " " + kept.join(" ") : "";
    const fitted = beforeName + marker + suffix + (kept.length < words.length ? "…" : "");
    return fitted.replaceAll(marker, "{dernierprenom_nom}");
  }
  const chars = Array.from(text);
  return chars.slice(0, Math.max(0, maxBodyCharacters - 1)).join("").trimEnd() + "…";
}

function brandAutomatedMessage(value: string, channel: string, maxSmsCharacters = 155): string {
  const content = value.trim();
  if (channel === "sms") {
    return reformulateSmsWithinLimit(stripAgriCapitalPrefix(normalizeSms(content)), maxSmsCharacters);
  }
  if (channel === "whatsapp") return normalizeWhatsAppMessage(content);
  return stripAgriCapitalPrefix(content);
}

type MediaAttachment = { bucket?: string; path: string; name: string; mimeType: string; size?: number };
async function prepareMedia(attachments: MediaAttachment[] = []) {
  const prepared: Array<{ ref: string; name: string; mimeType: string; path: string }> = [];
  const client = await getSenndoClient();
  for (const item of attachments) {
    if (!item?.path || !item?.name || !item?.mimeType) continue;
    // Senndo ne reçoit que des images dans des formats éprouvés. Les anciens
    // documents/vidéos ne doivent jamais être transmis comme des médias WhatsApp.
    if (!/^image\/(jpeg|png)$/i.test(item.mimeType)) {
      console.warn("[NotificationMedia] pièce jointe ignorée : format non accepté", { name: item.name, mimeType: item.mimeType });
      continue;
    }
    const { data, error } = await admin.storage.from(item.bucket || "notification-media").download(item.path);
    if (error || !data) throw new Error(`Média indisponible : ${item.name}`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (!bytes.length) throw new Error(`Image vide : ${item.name}`);
    const uploaded = await client.uploadMedia({ file: bytes, fileName: item.name, contentType: item.mimeType });
    if (!uploaded?.ref) throw new Error(`Téléversement Senndo impossible : ${item.name}`);
    prepared.push({ ref: uploaded.ref, name: item.name, mimeType: item.mimeType, path: item.path });
  }
  return prepared;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c)
);

const render = (template: string, contact: Contact, context: Record<string, unknown> = {}) => {
  const nameParts = String(contact.nom_complet || (context.finance_payout_sms === true ? "" : "Client")).trim().split(/\s+/).filter(Boolean);
  const leadStyleName = contact.source_type === "lead" || contact.source_type === "prospect";
  const familyName = nameParts.length > 1 ? (leadStyleName ? nameParts[nameParts.length - 1] : nameParts[0]) : (nameParts[0] || (context.finance_payout_sms === true ? "" : "Client"));
  const firstName = nameParts.length > 1 ? (leadStyleName ? nameParts[nameParts.length - 2] : nameParts[nameParts.length - 1]) : familyName;
  const titleCaseNames = (value: string) => value.trim().replace(/^[\s.,;:]+|[\s.,;:]+$/g, "").toLocaleLowerCase("fr-FR").replace(/(^|[\s'-])(\p{L})/gu, (_match, boundary, letter) => boundary + letter.toLocaleUpperCase("fr-FR"));
  const structuredFirstNames = contact.prenoms?.trim();
  const structuredLastName = contact.nom?.trim();
  const structuredDisplayName = structuredFirstNames && structuredLastName
    ? (() => {
        const givenNames = structuredFirstNames.split(/\s+/).filter(Boolean);
        const lastGivenName = givenNames[givenNames.length - 1] || structuredFirstNames;
        return titleCaseNames(lastGivenName) + " " + titleCaseNames(structuredLastName);
      })()
    : null;
  const displayName = structuredDisplayName || (nameParts.length > 1 ? `${titleCaseNames(firstName)} ${titleCaseNames(familyName)}` : titleCaseNames(familyName));
  // Seul le jeton {dernier_prenom_nom} est autorisé pour le nom du destinataire.
  // Les anciens alias nom/prenom/nom_complet ne sont volontairement pas exposés.
  const vars: Record<string, string> = {
    email: contact.email || "", telephone: contact.telephone || "",
    role: contact.role_code || "", offre: contact.offre_nom || contact.offre_code || "",
    offre_code: contact.offre_code || "", date: new Date().toLocaleDateString("fr-FR"),
    ...Object.fromEntries(Object.entries(context).map(([k, v]) => [k, v == null ? "" : String(v)])),
    dernier_prenom_nom: displayName, dernierprenom_nom: displayName,
    ...(context.finance_payout_sms === true ? { prenom: firstName, nom: familyName, nom_complet: displayName } : {}),
  };
  const greetingAdjusted = context.finance_payout_sms === true
    ? template.replace(/Bonjour\s+\{\s*(?:dernier_prenom_nom|dernierprenom_nom)\s*\}/gi, displayName ? `Bonjour ${displayName}` : "Bonjour")
    : template;
  return greetingAdjusted.replace(/\{\s*dernier_prenom_nom\s*\}/gi, () => displayName)
    .replace(/\{\{\s*([a-zA-Z0-9_ ]+)\s*\}\}|\{\s*([a-zA-Z0-9_ ]+)\s*\}/g, (_match, doubleKey, singleKey) => {
      const key = String(doubleKey || singleKey || "").trim().replace(/\s+/g, "_");
      return key === "dernier_prenom_nom" ? displayName : vars[key] ?? "";
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
  const { data: allowed, error: permissionError } = await admin.rpc("crm_user_has_app_permission", {
    _user_id: data.user.id,
    _required_code: requiredPermission,
  });
  return !permissionError && allowed === true;
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
  let smsReady = false;
  let accountBalance: any = null;
  let balanceError: string | null = null;
  let senderCountries: any[] = [];
  let senderIdLifecycle: string | null = null;
  if (typeof apiKey === "string" && apiKey) {
    try {
      const client = new SenndoClient({ apiKey, baseUrl: "https://api.senndo.com", timeoutMs: 12000, maxRetries: 0, userAgent: "AgriCapital-CRM/1.0" });
      const [senderResult, balanceResult] = await Promise.all([
        client.listSenderIds(),
        client.getBalance({ currency: "USD" }).catch((error: any) => { balanceError = String(error?.code || error?.message || "Solde indisponible"); return null; }),
      ]);
      const senders = Array.isArray(senderResult?.senderIds) ? senderResult.senderIds : [];
      const sender = senders.find((item: any) => String(item?.value || "") === "AgriCapital");
      senderIdLifecycle = sender?.lifecycleStatus || null;
      senderCountries = Array.isArray(sender?.countries) ? sender.countries : [];
      smsReady = Boolean(sender) && !/reject|inactive|pending|blocked/i.test(String(sender?.lifecycleStatus || ""));
      if (balanceResult) {
        const rawBalance = balanceResult?.balanceUsd ?? balanceResult?.balance_usd ?? balanceResult?.balance ?? balanceResult?.amountUsd;
        const balanceUsd = rawBalance === undefined || rawBalance === null ? null : Number(rawBalance);
        if (balanceUsd !== null && Number.isFinite(balanceUsd)) {
          const budgetUsd = 100;
          const remainingOnBudgetUsd = Math.min(budgetUsd, Math.max(0, balanceUsd));
          accountBalance = {
            currency: "USD", balanceUsd, budgetUsd, remainingOnBudgetUsd,
            consumedOnBudgetUsd: Math.max(0, budgetUsd - remainingOnBudgetUsd),
            updatedAt: new Date().toISOString(),
          };
        } else balanceError = "Senndo n'a pas renvoyé un solde USD exploitable.";
      }
    } catch (error: any) {
      smsReady = false;
      if (!balanceError) balanceError = String(error?.code || error?.message || "Lecture du compte Senndo indisponible");
    }
  }
  return {
    senndo: Boolean(apiKey), webhook: Boolean(webhookSecret), sms: smsReady,
    email: false, whatsapp_paired: Boolean(whatsapp),
    voice: false, sender_id: "AgriCapital", sender_id_lifecycle: senderIdLifecycle,
    sender_countries: senderCountries, accountBalance, balanceError,
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
async function claimGlobalSend(recipient: string, channel: string, content: string, scope?: string) {
  if (!content.trim()) return;
  const { data, error } = await admin.rpc("notification_claim_send_guard", {
    p_recipient: recipient, p_channel: channel, p_content: content, p_scope: scope || null,
  });
  if (error) throw new Error("Protection anti-doublon indisponible : " + error.message);
  if (data !== true) {
    const duplicate = new Error("DUPLICATE_BLOCKED: message identique déjà réservé ou envoyé à ce destinataire dans les dernières 24 heures.");
    (duplicate as any).code = "DUPLICATE_BLOCKED";
    throw duplicate;
  }
}
async function releaseGlobalSend(recipient: string, channel: string, content: string, scope?: string) {
  if (!content.trim()) return;
  const { error } = await admin.rpc("notification_release_send_guard", {
    p_recipient: recipient, p_channel: channel, p_content: content, p_scope: scope || null,
  });
  if (error) console.error("[NotificationDedupe] libération impossible", error.message);
}
async function finishGlobalSend(recipient: string, channel: string, content: string, messageId: string | null, scope?: string) {
  if (!content.trim()) return;
  const { error } = await admin.rpc("notification_finish_send_guard", {
    p_recipient: recipient, p_channel: channel, p_content: content, p_message_id: messageId, p_scope: scope || null,
  });
  if (error) console.error("[NotificationDedupe] confirmation impossible", error.message);
}

async function sendSms(contact: Contact, content: string, dedupeKey: string, dedupeScope?: string) {
  const candidates = contact.telephone_candidates?.length ? contact.telephone_candidates : phoneCandidates(contact);
  if (!candidates.length) throw new Error("Aucun numéro de téléphone disponible");
  const client = await getSenndoClient();
  let lastError: unknown = null;
  for (let index = 0; index < candidates.length; index++) {
    const to = candidates[index];
    try {
      const smsText = assertSmsLength(normalizeSms(content));
      await claimGlobalSend(to, "sms", smsText, dedupeScope);
      try {
        const result = await client.sendMessage({
          channel: "sms", to, text: smsText,
          ...(to.startsWith("+225") ? { senderId: "AgriCapital" } : {}),
          idempotencyKey: index === 0 ? dedupeKey : dedupeKey + ":telephone-secondaire",
        });
        await finishGlobalSend(to, "sms", smsText, result.id || null, dedupeScope);
        return { provider: "senndo", messageId: result.id || null, content: smsText, to };
      } catch (sendError) {
        const status = Number((sendError as any)?.status || (sendError as any)?.statusCode || 0);
        if (status >= 400 && status < 500) await releaseGlobalSend(to, "sms", smsText, dedupeScope);
        throw sendError;
      }
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

function normalizeWhatsAppRecipient(value: unknown, indicatif?: unknown): string | null {
  const raw = String(value ?? "").trim().split("@")[0].split(":")[0];
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  let normalized = "";
  if (raw.startsWith("+")) normalized = "+" + digits;
  else if (raw.startsWith("00")) normalized = "+" + digits.slice(2);
  else if (digits.startsWith("225") && digits.length >= 11) normalized = "+" + digits;
  else if (indicatif && digits.length >= 8 && digits.length <= 12) {
    let dial = String(indicatif).replace(/\D/g, "");
    if (dial.startsWith("00")) dial = dial.slice(2);
    const national = dial === "225" ? digits : digits.replace(/^0+/, "");
    if (dial) normalized = "+" + (digits.startsWith(dial) ? digits : dial + national);
  } else if (digits.length === 10 && /^0[157]\d{8}$/.test(digits)) normalized = "+225" + digits;
  else if (digits.length === 8) normalized = "+225" + digits;
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

function phoneCandidates(contact: Contact): string[] {
 const values:Array<[unknown,unknown]>=[[contact.telephone_local||contact.telephone,contact.telephone_indicatif],[contact.telephone_secondaire_local||contact.telephone_secondaire,contact.telephone_secondaire_indicatif]];
 return [...new Set(values.map(([v,d])=>normalizeWhatsAppRecipient(v,d)).filter((v):v is string=>Boolean(v)))];
}

type NotificationRoutingPolicy = {
  domestic_country_calling_code: string;
  domestic_channel: "sms";
  international_channel: "whatsapp";
  sms_max_characters: number;
  sms_content_max_characters: number;
  sms_sender_id: "AgriCapital";
};
const DEFAULT_ROUTING_POLICY: NotificationRoutingPolicy = {
  domestic_country_calling_code: "+225",
  domestic_channel: "sms",
  international_channel: "whatsapp",
  sms_max_characters: 155,
  sms_content_max_characters: 130,
  sms_sender_id: "AgriCapital",
};
async function getNotificationRoutingPolicy(): Promise<NotificationRoutingPolicy> {
  const { data, error } = await admin.from("notification_channel_policy")
    .select("domestic_country_calling_code,domestic_channel,international_channel,sms_max_characters,sms_content_max_characters,sms_sender_id")
    .eq("id", true).maybeSingle();
  if (error || !data) {
    console.warn("[NotificationRouting] politique par défaut utilisée", { reason: error?.message || "configuration absente" });
    return DEFAULT_ROUTING_POLICY;
  }
  return {
    domestic_country_calling_code: String(data.domestic_country_calling_code || "+225"),
    domestic_channel: "sms",
    international_channel: "whatsapp",
    sms_max_characters: Math.min(155, Math.max(1, Number(data.sms_max_characters) || 155)),
    sms_content_max_characters: Math.min(130, Math.max(1, Number(data.sms_content_max_characters) || 130)),
    sms_sender_id: "AgriCapital",
  };
}
function resolveAutomaticChannel(contact: Contact, policy: NotificationRoutingPolicy): "sms" | "whatsapp" | null {
  const candidates = phoneCandidates(contact);
  const destination = candidates[0] || normalizeWhatsAppRecipient(contact.whatsapp, contact.whatsapp_indicatif);
  if (!destination) return null;
  return destination.startsWith(policy.domestic_country_calling_code)
    ? policy.domestic_channel : policy.international_channel;
}
function routedWhatsAppContact(contact: Contact, policy: NotificationRoutingPolicy): Contact {
  const internationalPhones = phoneCandidates(contact).filter((phone) => !phone.startsWith(policy.domestic_country_calling_code));
  const existing = contact.whatsapp_candidates?.length ? contact.whatsapp_candidates : whatsappCandidates(contact);
  const recipients = internationalPhones.length
    ? [...internationalPhones, ...existing.filter((phone) => !internationalPhones.includes(phone))]
    : existing;
  return { ...contact, whatsapp_candidates: recipients, whatsapp: recipients[0] || null };
}
function selectedWhatsAppNumber(contact: Contact): string | null {
  return contact.whatsapp_candidates?.[0] || whatsappCandidates(contact)[0] || null;
}
function whatsappCandidates(contact: Contact): string[] {
 const values:Array<[unknown,unknown]>=[];
 if(contact.telephone_principal_whatsapp||contact.telephone_whatsapp)values.push([contact.telephone_local||contact.telephone,contact.telephone_indicatif]);
 if(contact.telephone_secondaire_whatsapp)values.push([contact.telephone_secondaire_local||contact.telephone_secondaire,contact.telephone_secondaire_indicatif]);
 if(contact.whatsapp)values.push([contact.whatsapp,null]);
 if(contact.whatsapp_local)values.push([contact.whatsapp_local,contact.whatsapp_indicatif||"+225"]);
 if(contact.telephone_secondaire_whatsapp_numero)values.push([contact.telephone_secondaire_whatsapp_numero,null]);
 if(!values.length)values.push([contact.telephone_local||contact.telephone,contact.telephone_indicatif]);
 values.push([contact.telephone_secondaire_local||contact.telephone_secondaire,contact.telephone_secondaire_indicatif]);
 return [...new Set(values.map(([v,d])=>normalizeWhatsAppRecipient(v,d)).filter((v):v is string=>Boolean(v)))];
}

async function sendWhatsApp(contact: Contact, content: string, dedupeKey: string, mediaRef?: string, dedupeScope?: string) {
  const recipients = contact.whatsapp_candidates?.length ? contact.whatsapp_candidates : whatsappCandidates(contact);
  if (!recipients.length) throw new Error("Aucun numéro WhatsApp valide dans la fiche du destinataire. Vérifiez le WhatsApp, l’indicatif et le téléphone principal marqué WhatsApp.");
  const session = await resolveWhatsAppSenderSession();
  for (let index = 0; index < recipients.length; index++) {
    const recipient = recipients[index];
  await claimGlobalSend(recipient, "whatsapp", content, dedupeScope);
  const response = await fetch("https://api.senndo.com/v1/messages", {
    method: "POST",
    headers: { authorization: "Bearer " + session.apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      channel: "whatsapp_baileys", to: recipient, text: content,
      senderSessionId: session.senderSessionId, idempotencyKey: index === 0 ? dedupeKey : dedupeKey + ":recipient:" + index,
      ...(mediaRef ? { media: { ref: mediaRef } } : {}),
    }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500) await releaseGlobalSend(recipient, "whatsapp", content, dedupeScope);
    const nestedErrors = [payload?.error, payload?.message, payload?.details, payload?.data?.error, payload?.data]
      .filter((value: any) => value && typeof value === "object");
    const providerCodeValue = payload?.code ?? nestedErrors.map((value: any) => value.code).find((value: any) => typeof value === "string");
    const providerCode = typeof providerCodeValue === "string" ? providerCodeValue.slice(0, 80) : "";
    const nestedMessage = nestedErrors.map((value: any) => value.message ?? value.description ?? value.detail).find((value: any) => typeof value === "string");
    const detailValue = typeof payload?.message === "string" ? payload.message
      : nestedMessage ?? payload?.error ?? payload?.details ?? payload?.reason;
    const detail = typeof detailValue === "string"
      ? detailValue.slice(0, 350)
      : detailValue != null
        ? JSON.stringify(detailValue).slice(0, 350)
        : "";
    const error = new Error("Senndo a refusé l’envoi WhatsApp appairé (HTTP " + response.status + ")." +
      (providerCode ? " Code: " + providerCode + "." : "") + (detail ? " " + detail : ""));
    (error as any).status = response.status;
    (error as any).code = providerCode || "SENNDO_WHATSAPP_REJECTED";
    (error as any).providerStatus = payload?.status ?? response.status;
    (error as any).recipient = recipient;
    if (providerCode !== "RECIPIENT_NOT_REACHABLE" || index === recipients.length - 1) throw error;
    console.warn("[NotificationWhatsApp] numéro injoignable, essai du prochain numéro explicitement WhatsApp", { sourceType: contact.source_type, sourceId: contact.source_id, attempted: recipient });
    continue;
  }
  const acceptedMessageId = payload?.id ?? payload?.messageId ?? payload?.message?.id ?? null;
  await finishGlobalSend(recipient, "whatsapp", content, acceptedMessageId, dedupeScope);
  return {
    provider: "senndo_whatsapp_baileys",
    messageId: acceptedMessageId,
    to: recipient,
    senderPhone: session.senderPhone,
  };
  }
  throw new Error("Aucun numéro WhatsApp n’a pu être utilisé.");
}

async function sendVoice(contact: Contact, content: string, dedupeKey: string) {
  const recipient=(contact.telephone_candidates?.length?contact.telephone_candidates:phoneCandidates(contact))[0];
  if (!recipient) throw new Error("Téléphone absent pour l'appel vocal");
  const client = await getSenndoClient();
  const result = await client.sendMessage({ channel: "voice", to: recipient, text: content, idempotencyKey: dedupeKey });
  return { provider: "senndo", messageId: result.id || null };
}

async function hydrateContacts(rows: Contact[]): Promise<Contact[]> {
 const groups=[["clients",["client","beneficiaire_particulier","proprietaire_foncier+beneficiaire_particulier","proprietaire_foncier"]],["leads",["lead","prospect"]],["prospects",["prospect"]],["proprietaires_terres",["proprietaire_foncier"]],["profiles",["equipe","utilisateur"]],["cotitulaires_mandataires",["cotitulaire_proprietaire"]],["client_cotitulaires_mandataires",["cotitulaire_client"]],["crm_parties",["autre"]],["imported_phone_contacts",["contact_importe"]]] as const;
 const fetched=await Promise.all(groups.map(async([table,types])=>{const ids=[...new Set(rows.filter(r=>(types as readonly string[]).includes(r.source_type)).map(r=>r.source_id))];if(!ids.length)return[table,new Map()] as const;const {data,error}=await admin.from(table).select("*").in("id",ids);if(error)throw error;return[table,new Map((data||[]).map((r:any)=>[r.id,r]))] as const;}));
 const maps=new Map(fetched),out:Contact[]=[];
 for(const original of rows){
  let table=groups.find(([,types])=>(types as readonly string[]).includes(original.source_type))?.[0];
  if(original.source_type==="prospect")table=maps.get("prospects")?.has(original.source_id)?"prospects":"leads";
  if(original.source_type==="proprietaire_foncier")table=maps.get("proprietaires_terres")?.has(original.source_id)?"proprietaires_terres":"clients";
  const record:any=table?maps.get(table)?.get(original.source_id):null;if(!record)continue;
 const c:Contact={...original,...record,source_type:original.source_type,source_id:original.source_id,user_id:original.user_id||record.user_id||null,
 nom:record.nom||null, prenoms:record.prenoms||null,
 nom_complet:record.nom_complet||record.display_name||[record.prenoms,record.nom].filter(Boolean).join(" ")||record.denomination_sociale||original.nom_complet||null,
 email:original.email||record.email||null,telephone:record.telephone||(record.telephone_local?String(record.telephone_indicatif||"+225")+record.telephone_local:null)||record.phone||original.telephone||record.whatsapp||null,
 telephone_secondaire:record.telephone_secondaire||record.secondary_phone||null,whatsapp:record.whatsapp||null,
 telephone_principal_whatsapp:record.telephone_principal_whatsapp??record.whatsapp_primary??false,telephone_secondaire_whatsapp:record.telephone_secondaire_whatsapp??record.whatsapp_secondary??false,
 telephone_indicatif:record.telephone_indicatif||null,telephone_local:record.telephone_local||null,whatsapp_indicatif:record.whatsapp_indicatif||null,whatsapp_local:record.whatsapp_local||null,
 telephone_secondaire_indicatif:record.telephone_secondaire_indicatif||null,telephone_secondaire_local:record.telephone_secondaire_local||null,
 role_code:original.role_code||record.role_code||null,offre_id:original.offre_id||record.offre_id||null,offre_code:original.offre_code||record.offre_code||null,offre_nom:original.offre_nom||record.offre_nom||null};
 c.telephone_candidates=phoneCandidates(c);c.telephone=c.telephone_candidates[0]||null;c.telephone_secondaire=c.telephone_candidates[1]||null;c.whatsapp_candidates=whatsappCandidates(c);c.whatsapp=c.whatsapp_candidates[0]||null;out.push(c);
 }
 return out;
}
async function resolveDirectoryContacts(criteria:Record<string,unknown>){
 const {data,error}=await admin.rpc("notification_resolve_recipients",{_criteres:criteria});if(error)throw error;
 return hydrateContacts((data||[]) as Contact[]);
}
async function resolveContacts(criteria: Record<string,unknown>){
 const hydrated=await resolveDirectoryContacts(criteria);
 const priority=(c:Contact)=>c.source_type==="client"||c.source_type==="beneficiaire_particulier"?0:c.source_type==="lead"?1:c.source_type==="prospect"?2:c.source_type.includes("proprietaire_foncier")?3:c.source_type.startsWith("cotitulaire")?4:c.source_type==="equipe"?5:c.source_type==="utilisateur"?6:7;
 hydrated.sort((a,b)=>priority(a)-priority(b));
 const unique=new Map<string,Contact>();
 for(const c of hydrated){const key=c.user_id||c.email?.toLowerCase()||c.whatsapp||c.telephone||c.source_type+":"+c.source_id;if(!unique.has(key))unique.set(key,c);}
 return [...unique.values()];
}
async function deliver(args: {
  campaignId?: string | null; automationId?: string | null; canal: string;
  subject?: string | null; content: string; contacts: Contact[];
  context?: Record<string, unknown>; eventKey?: string; mediaAttachments?: MediaAttachment[];
}) {
  let sent = 0, failed = 0;
  const failureReasons: string[] = [];
  const routingPolicy = await getNotificationRoutingPolicy();
  const needsSenndoMedia = Boolean(args.mediaAttachments?.length) && (
    args.canal === "whatsapp" ||
    (["auto", "sms", "email_sms"].includes(args.canal) &&
      args.contacts.some((contact) => resolveAutomaticChannel(contact, routingPolicy) === "whatsapp"))
  );
  const preparedMedia = args.mediaAttachments?.length && needsSenndoMedia ? await prepareMedia(args.mediaAttachments) : [];
  for (const contact of args.contacts) {
    const phoneChannel = resolveAutomaticChannel(contact, routingPolicy);
    const channels = args.canal === "auto"
      ? (phoneChannel ? [phoneChannel] : [])
      : args.canal === "email_sms"
        ? ["email", ...(phoneChannel ? [phoneChannel] : [])]
        : args.canal === "sms"
          ? ["sms"]
          : args.canal === "whatsapp"
            ? ["whatsapp"]
            : [args.canal];
    if (!channels.length) {
      failed++;
      failureReasons.push("Aucun numéro international valide pour appliquer la règle SMS/WhatsApp.");
      continue;
    }
    for (const channel of [...new Set(channels)]) {
      if (channel === "app" && !contact.user_id && contact.source_type === "equipe") continue;
      const dedupeKey = (args.campaignId || args.automationId || "manual") + ":" +
        (args.eventKey || "") + ":" + (contact.user_id || contact.source_id) + ":" + channel;
      const { data: existing } = await admin.from("notification_deliveries")
        .select("id,statut,created_at,erreur,recipient_phone,metadata").eq("dedupe_key", dedupeKey).maybeSingle();

      if (["envoye","livre","lu"].includes(String(existing?.statut || ""))) {
        if (args.canal === "auto") break;
        continue;
      }
      if (existing?.statut === "en_cours" || existing?.statut === "incertain") {
        if (args.canal === "auto") break;
        continue;
      }
      let recipientContact = channel === "whatsapp" ? routedWhatsAppContact(contact, routingPolicy) : contact;
      if (channel === "whatsapp" && existing?.statut === "echoue" && /RECIPIENT_NOT_REACHABLE/i.test(String(existing.erreur || ""))) {
        const alternatives = (contact.whatsapp_candidates || whatsappCandidates(contact)).filter((phone) => phone !== String(existing.recipient_phone || ""));
        // Never hit the same WhatsApp number again after Senndo explicitly rejected it.
        if (!alternatives.length) continue;
        recipientContact = { ...contact, whatsapp_candidates: alternatives, whatsapp: alternatives[0] };
      }

      // Render the message separately for each recipient/channel. These variables must
      // exist before building the delivery row and before invoking the provider.
      const rawRendered = render(args.content, contact, args.context || {});
      let rendered: string;
      if (channel === "sms") {
        const greetingName = rawRendered.match(/Bonjour\s+([^,;:]+)[,;:]/i)?.[1]?.trim() || "";
        const templateForSms = greetingName
          ? rawRendered.replace(/Bonjour\s+[^,;:]+([,;:])/i, "Bonjour {dernierprenom_nom}$1")
          : rawRendered;
        const bodyFitted = restructureSmsTemplateWithinLimit(templateForSms, routingPolicy.sms_content_max_characters);
        const personalized = greetingName
          ? bodyFitted.replace(/\{\s*(?:dernier_prenom_nom|dernierprenom_nom)\s*\}/i, greetingName)
          : bodyFitted;
        rendered = brandAutomatedMessage(personalized, channel, routingPolicy.sms_max_characters);
        assertSmsLength(normalizeSms(rendered), routingPolicy.sms_max_characters);
      } else {
        rendered = brandAutomatedMessage(rawRendered, channel, routingPolicy.sms_max_characters);
      }
      const rawSubject = render(args.subject || "", contact, args.context || {});
      const renderedSubject = stripAgriCapitalPrefix(rawSubject);
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
        recipient_phone: (channel === "whatsapp" ? selectedWhatsAppNumber(recipientContact) : (contact.telephone_candidates?.[0] || contact.telephone || contact.telephone_secondaire)) || null, canal: channel, statut: "en_cours",
        contenu: channel === "sms" ? assertSmsLength(normalizeSms(rendered), routingPolicy.sms_max_characters) : rendered, dedupe_key: dedupeKey,
        media_attachments: attachmentMetadata,
        metadata: {
          event_key: args.eventKey || null,
          requested_channel: args.canal,
          routing_rule: channel === "sms" ? "CI:+225=>SMS" : channel === "whatsapp" ? "INTERNATIONAL=>WHATSAPP" : "EXPLICIT",
          sms_max_characters: routingPolicy.sms_max_characters,
        },
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
        if (claimError) { failed++; failureReasons.push(claimError.message); console.error("[NotificationDelivery] réservation échouée", { campaignId: args.campaignId || null, sourceId: contact.source_id, reason: claimError.message }); continue; }
        if (!claimed) continue;
        delivery = claimed;
      } else {
        const { data: inserted, error: insertError } = await admin.from("notification_deliveries")
          .insert(deliveryPayload).select("id").maybeSingle();
        if (insertError?.code === "23505") continue;
        if (insertError || !inserted) {
          failed++;
          const reason = insertError?.message || "Impossible de créer la ligne de suivi de livraison.";
          console.error("[NotificationDelivery] insertion échouée", { campaignId: args.campaignId || null, sourceType: contact.source_type, sourceId: contact.source_id, channel, reason });
          failureReasons.push(reason);
          continue;
        }
        delivery = inserted;
      }
      let attemptId: string | null = null;
      let attemptNumber = 1;
      try {
        const { count, error: countError } = await admin.from("notification_delivery_attempts")
          .select("id", { count: "exact", head: true }).eq("delivery_id", delivery.id);
        if (countError) throw countError;
        attemptNumber = (count || 0) + 1;
        const { data: attempt, error: attemptInsertError } = await admin.from("notification_delivery_attempts").insert({
          delivery_id: delivery.id, attempt_number: attemptNumber, statut: "en_cours"
        }).select("id").maybeSingle();
        if (attemptInsertError || !attempt) throw attemptInsertError || new Error("La tentative n’a pas été enregistrée.");
        attemptId = attempt.id;
      } catch (attemptError) {
        const reason = attemptError instanceof Error ? attemptError.message : String(attemptError);
        await admin.from("notification_deliveries").update({
          statut: "echoue", erreur: "Envoi arrêté : impossible d’enregistrer la tentative de livraison. " + reason,
        }).eq("id", delivery.id);
        failed++;
        failureReasons.push(reason);
        console.error("[NotificationDelivery] tentative non enregistrée; envoi interrompu", { deliveryId: delivery.id, reason });
        continue;
      }
      const providerDedupeKey = attemptNumber > 1 ? dedupeKey + ":attempt:" + attemptNumber : dedupeKey;
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

          // For authenticated users, inserting into notifications already enqueues
          // exactly one push through trg_notifications_push_event. Do not send a
          // second direct WebPush from this path.
          if (!contact.user_id) {
            const pushCount = await sendWebPush(contact, renderedSubject, rendered, dedupeKey, {
              campaign_id: args.campaignId || null,
              automation_id: args.automationId || null,
              event_key: args.eventKey || null,
            });
            if (pushCount === 0) {
              throw new Error("Aucun abonnement Push actif pour ce destinataire. Il doit activer les notifications depuis son PWA.");
            }
          }
          await admin.from("notification_deliveries").update({ statut: "envoye", sent_at: new Date().toISOString() }).eq("id", delivery.id);
        } else if (channel === "whatsapp") {
          assertWhatsAppLength(rendered);
          const result = await sendWhatsApp(recipientContact, rendered, providerDedupeKey, mediaForChannel[0]?.ref, args.eventKey || undefined);
          for (let i = 1; i < mediaForChannel.length; i++) {
            await sendWhatsApp(contact, "", providerDedupeKey + ":media:" + i, mediaForChannel[i].ref);
          }
          await admin.from("notification_deliveries").update({
            statut: "envoye", fournisseur: result.provider, provider_message_id: result.messageId,
            recipient_phone: result.to || deliveryPayload.recipient_phone,
            metadata: { ...deliveryPayload.metadata, attempted_recipient: result.to || deliveryPayload.recipient_phone, sender_phone: result.senderPhone || null, provider_code: null, retryable: true },
            provider_status: result.providerStatus || "accepted", erreur: null, sent_at: new Date().toISOString(),
          }).eq("id", delivery.id);
        } else if (channel === "sms") {
          const result = await sendSms(contact, rendered, providerDedupeKey, args.eventKey || undefined);
          await admin.from("notification_deliveries").update({
            statut: "envoye", fournisseur: result.provider, provider_message_id: result.messageId,
            recipient_phone: result.to || contact.telephone || null, contenu: result.content || normalizeSms(rendered),
            sent_at: new Date().toISOString(),
          }).eq("id", delivery.id);
        } else if (channel === "voice") {
          const result = await sendVoice(contact, rendered, providerDedupeKey);
          await admin.from("notification_deliveries").update({statut:"envoye",fournisseur:result.provider,provider_message_id:result.messageId,recipient_phone:contact.telephone_candidates?.[0]||contact.telephone,sent_at:new Date().toISOString()}).eq("id",delivery.id);
        } else if (channel === "email") {
          const result = await sendEmail(contact, renderedSubject, rendered, providerDedupeKey, attachments);
          await admin.from("notification_deliveries").update({
            statut: "envoye", fournisseur: result.provider, provider_message_id: result.messageId, sent_at: new Date().toISOString(),
          }).eq("id", delivery.id);
        }
        if (attemptId) await admin.from("notification_delivery_attempts").update({ statut: "accepte_fournisseur", provider_status: "accepted", finished_at: new Date().toISOString() }).eq("id", attemptId);
        sent++;
        if (args.canal === "auto") break;
      } catch (error) {
        failed++;
        const failureReason = error instanceof Error ? error.message : String(error);
        failureReasons.push(failureReason);
        console.error("[NotificationDelivery] échec fournisseur", { campaignId: args.campaignId || null, sourceType: contact.source_type, sourceId: contact.source_id, channel, reason: failureReason });
        const status = Number((error as any)?.status || (error as any)?.statusCode || 0);
        const message = String((error as any)?.message || "");
        const outcomeUncertain = status >= 500 || /timeout|timed out|network|failed to fetch|connection reset|socket|econn|abort/i.test(message);
        // A provider timeout may happen after delivery. Do not retry automatically:
        // doing so could send a duplicate message to the same recipient.
        const providerCode = String((error as any)?.code || (/RECIPIENT_NOT_REACHABLE/i.test(message) ? "RECIPIENT_NOT_REACHABLE" : ""));
        const unreachableRecipient = channel === "whatsapp" && providerCode === "RECIPIENT_NOT_REACHABLE";
        const attemptedRecipient = String((error as any)?.recipient || deliveryPayload.recipient_phone || "");
        await admin.from("notification_deliveries").update({
          statut: outcomeUncertain ? "incertain" : "echoue",
          recipient_phone: attemptedRecipient || deliveryPayload.recipient_phone,
          metadata: {
            ...deliveryPayload.metadata,
            attempted_recipient: attemptedRecipient || null,
            provider_code: providerCode || null,
            retryable: !outcomeUncertain && !unreachableRecipient,
          },
          provider_status: String((error as any)?.providerStatus || status || "error"),
          erreur: outcomeUncertain ? "Résultat fournisseur incertain ; vérification manuelle requise pour éviter un doublon. " + failureReason : failureReason,
        }).eq("id", delivery.id);
        if (attemptId) await admin.from("notification_delivery_attempts").update({
          statut: outcomeUncertain ? "incertain" : "echoue",
          provider_status: String((error as any)?.providerStatus || status || "error"),
          provider_error: failureReason.slice(0, 2000), finished_at: new Date().toISOString()
        }).eq("id", attemptId);
        // En mode automatique, un résultat de livraison incertain interdit le repli vers un autre canal :
        // le premier message a peut-être été délivré malgré le timeout.
        if (args.canal === "auto" && outcomeUncertain) break;
      }
    }
  }
  return { sent, failed, errors: [...new Set(failureReasons)].slice(0, 3) };
}

async function runScheduledCampaigns() {
  const now = new Date().toISOString();
  const { data: dueCampaigns, error } = await admin.from("notification_campaigns")
    .select("id")
    .eq("statut", "programme")
    .not("programme_le", "is", null)
    .lte("programme_le", now)
    .order("programme_le", { ascending: true })
    .limit(25);
  if (error) throw new Error("Lecture des campagnes programmées impossible : " + error.message);
  const results: Array<{ id: string; ok: boolean; result?: unknown; error?: string }> = [];
  for (const campaign of dueCampaigns || []) {
    try {
      const result = await runCampaign(String(campaign.id));
      results.push({ id: campaign.id, ok: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Make failed campaigns visible and avoid leaving them indefinitely in "en cours".
      await admin.from("notification_campaigns").update({
        statut: "echoue", total_echecs: 1, termine_le: new Date().toISOString(),
      }).eq("id", campaign.id).eq("statut", "en_cours");
      results.push({ id: campaign.id, ok: false, error: message });
    }
  }
  return { checked: (dueCampaigns || []).length, results };
}

async function runCampaign(campaignId: string) {
  const { data: campaign, error } = await admin.from("notification_campaigns")
    .select("*, segment:notification_segments(criteres)").eq("id", campaignId).single();
  if (error) throw error;
  if (["annule","termine","suspendue"].includes(campaign.statut)) return { skipped: true, reason: campaign.statut };
  if (campaign.programme_le && new Date(campaign.programme_le).getTime() > Date.now()) return { skipped: true, reason: "programme" };

  const criteria = campaign.segment?.criteres || campaign.criteres || {};
  if (["sms", "whatsapp", "auto", "email_sms"].includes(String(campaign.canal || ""))) {
    const routingPolicy = await getNotificationRoutingPolicy();
    const bodyWithoutRecipientName = normalizeSms(String(campaign.contenu || "").replace(/\{\s*(?:dernier_prenom_nom|dernierprenom_nom)\s*\}/gi, ""));
    const bodyCharacters = Array.from(bodyWithoutRecipientName).length;
    if (bodyCharacters > routingPolicy.sms_content_max_characters) {
      throw new Error(`Message de campagne trop long : ${bodyCharacters}/${routingPolicy.sms_content_max_characters} caractères hors nom/prénom. Utilisez « Restructurer » avant l'envoi.`);
    }
  }
  const hasExplicitSelection = Array.isArray(criteria.selected_recipients);
  const selectedRecipients = hasExplicitSelection ? criteria.selected_recipients as Array<{ source_type?: string; source_id?: string }> : [];
  // Fail closed: an empty saved manual selection must never fall through to the broad audience resolver.
  if (hasExplicitSelection && !selectedRecipients.some((item) => item?.source_type && item?.source_id)) {
    throw new Error("Campagne bloquée : aucun destinataire valide n’est enregistré. Modifiez la sélection avant l’envoi.");
  }
  // For a saved audience (e.g. prospects), resolve the current real audience at send time.
  // A stale zero counter must not block a valid audience, but an empty resolved audience is blocked below.
  let contacts: Contact[];
  if(selectedRecipients.length){
   const unique=[...new Map(selectedRecipients.filter(r=>r?.source_type&&r?.source_id).map(r=>[String(r.source_type)+":"+String(r.source_id),{source_type:String(r.source_type),source_id:String(r.source_id)} as Contact])).values()];
   contacts=await hydrateContacts(unique);
  }else{contacts=await resolveContacts(criteria);}
  if (!contacts.length) {
    throw new Error("Campagne bloquée : aucun destinataire actif n’a été trouvé pour l’audience enregistrée. Vérifiez les filtres et les fiches contacts.");
  }
  const { error: startError } = await admin.from("notification_campaigns").update({
    statut: "en_cours", demarre_le: new Date().toISOString(), total_destinataires: contacts.length,
  }).eq("id", campaign.id);
  if (startError) throw new Error("Impossible d’enregistrer le démarrage de la campagne en base : " + startError.message);
  try {
    const result = await deliver({
      campaignId: campaign.id, canal: campaign.canal, subject: campaign.sujet,
      content: campaign.contenu, contacts, mediaAttachments: campaign.media_attachments || [],
    });
    const {data:rows,error:rowsError}=await admin.from("notification_deliveries").select("source_type,source_id,statut").eq("campaign_id",campaign.id);
    if(rowsError)throw rowsError;
    const grouped=new Map<string,string[]>();
    for(const row of rows||[]){const k=String(row.source_type)+":"+String(row.source_id);grouped.set(k,[...(grouped.get(k)||[]),String(row.statut)]);}
    const states=[...grouped.values()],accepted=states.filter(v=>v.some(x=>["envoye","livre","lu"].includes(x))).length;
    const failures=states.filter(v=>!v.some(x=>["envoye","livre","lu"].includes(x))&&v.some(x=>["echoue","incertain"].includes(x))).length;
    const finalStatus=failures?(accepted?"partiel":"echoue"):"termine";
    const {error:finishError}=await admin.from("notification_campaigns").update({statut:finalStatus,total_destinataires:contacts.length,total_envoyes:accepted,total_echecs:failures,termine_le:new Date().toISOString()}).eq("id",campaign.id);
    if (finishError) throw new Error("Les livraisons ont été traitées, mais le résultat n’a pas pu être enregistré en base : " + finishError.message);
    return { campaign_id: campaign.id, contacts: contacts.length, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("notification_campaigns").update({
      statut: "active", total_echecs: Math.max(1, Number(campaign.total_echecs || 0)),
      termine_le: new Date().toISOString(),
    }).eq("id", campaign.id).eq("statut", "en_cours");
    throw new Error("Échec de la campagne " + campaign.nom + " : " + message);
  }
}

async function retryFailedCampaign(campaignId: string, deliveryId?: string | null) {
  const { data: campaign, error: campaignError } = await admin.from("notification_campaigns")
    .select("id,canal,contenu,sujet,media_attachments,statut,demarre_le").eq("id", campaignId).single();
  if (campaignError || !campaign) throw campaignError || new Error("Campagne introuvable.");
  if (!["whatsapp", "auto"].includes(String(campaign.canal || ""))) throw new Error("La relance ciblée est réservée aux campagnes WhatsApp ou automatiques ayant généré des envois WhatsApp.");
  if (["annule","suspendue"].includes(campaign.statut)) throw new Error("Campagne annulée ou suspendue : réactivez-la avant la relance.");
  if (campaign.statut === "en_cours") {
    const startedAt = campaign.demarre_le ? new Date(campaign.demarre_le).getTime() : 0;
    const stale = startedAt > 0 && Date.now() - startedAt > 10 * 60 * 1000;
    const { count, error: activeError } = await admin.from("notification_deliveries")
      .select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("canal", "whatsapp").eq("statut", "en_cours");
    if (activeError) throw activeError;
    if (!stale || (count || 0) > 0) throw new Error("Campagne encore en cours : attendez la fin des envois avant de relancer.");
  }
  let query = admin.from("notification_deliveries").select("id,source_type,source_id,user_id,recipient_name,recipient_phone,recipient_email,metadata").eq("campaign_id", campaignId).eq("canal", "whatsapp").eq("statut", "echoue");
  if (deliveryId) query = query.eq("id", deliveryId);
  const { data: failedRows, error } = await query;
  if (error) throw error;
  if (!failedRows?.length) return { sent: 0, failed: 0, skipped: 0, reason: "Aucun échec WhatsApp relançable." };
  // Un refus explicite RECIPIENT_NOT_REACHABLE est définitif pour le numéro testé :
  // ne pas le renvoyer en boucle. L'équipe doit corriger la fiche contact avant un nouvel envoi.
  const retryableRows = failedRows.filter((row:any) => row.metadata?.provider_code !== "RECIPIENT_NOT_REACHABLE" && !String(row.erreur || "").includes("RECIPIENT_NOT_REACHABLE"));
  // Source stricte : uniquement les échecs relançables. Les envois acceptés,
  // en cours, incertains et les numéros refusés par Senndo sont exclus.
  const contacts: Contact[] = retryableRows.filter((row:any) => Boolean(row.recipient_phone)).map((row:any) => ({
    source_type: row.source_type, source_id: row.source_id, user_id: row.user_id,
    nom_complet: row.recipient_name, telephone: row.recipient_phone, whatsapp: row.recipient_phone, email: row.recipient_email
  }));
  const skipped = failedRows.length - contacts.length;
  const result = contacts.length ? await deliver({ campaignId, canal: "whatsapp", subject: campaign.sujet, content: campaign.contenu, contacts, mediaAttachments: campaign.media_attachments || [] }) : { sent: 0, failed: 0, errors: [] };
  const { data: statuses, error: statusError } = await admin.from("notification_deliveries").select("statut").eq("campaign_id", campaignId);
  if (statusError) throw statusError;
  const accepted = (statuses || []).filter((row:any) => ["envoye","livre","lu"].includes(row.statut)).length;
  const remainingFailed = (statuses || []).filter((row:any) => row.statut === "echoue").length;
  await admin.from("notification_campaigns").update({
    total_destinataires: statuses?.length || 0, total_envoyes: accepted, total_echecs: remainingFailed,
    statut: "active", termine_le: new Date().toISOString()
  }).eq("id", campaignId);
  return { ...result, skipped, remaining_failed: remainingFailed, total_accepted: accepted };
}

async function runEvent(eventCode: string, context: Record<string, unknown>) {
  const { data: automations, error } = await admin.from("notification_automations")
    .select("*").eq("evenement", eventCode).eq("actif", true);
  if (error) throw error;
  const results = [];
  for (const automation of automations || []) {
    let contacts: Contact[] = [];
    if (context.finance_payout_id) {
      const { data: payout, error: payoutError } = await admin.from("finance_payouts")
        .select("id,status,profile_id,beneficiary_id,category,amount,reason,reference,paid_at")
        .eq("id", String(context.finance_payout_id)).maybeSingle();
      if (payoutError) throw payoutError;
      if (!payout || payout.status !== "succeeded") throw new Error("Decaissement confirme introuvable.");
      const { data: beneficiary, error: beneficiaryError } = await admin.from("finance_payout_beneficiaries")
        .select("id,display_name,first_names,last_name,phone,email")
        .eq("id", payout.beneficiary_id).maybeSingle();
      if (beneficiaryError) throw beneficiaryError;
      if (!beneficiary) throw new Error("Beneficiaire du decaissement introuvable.");
      let linkedProfile: any = null;
      if (payout.profile_id) {
        const { data, error } = await admin.from("profiles").select("id,user_id,prenoms,nom,nom_complet,telephone,whatsapp,email")
          .eq("id", payout.profile_id).maybeSingle();
        if (error) throw error;
        linkedProfile = data;
      }
      const firstNames = linkedProfile ? (linkedProfile.prenoms || "") : (beneficiary.first_names || "");
      const lastName = linkedProfile ? (linkedProfile.nom || "") : (beneficiary.last_name || "");
      const givenNameParts = String(firstNames || "").trim().split(/\s+/).filter(Boolean);
      const lastGivenName = givenNameParts[givenNameParts.length - 1] || "";
      const displayName = [lastGivenName ? titleCaseNames(lastGivenName) : "", lastName ? titleCaseNames(lastName) : ""].filter(Boolean).join(" ").trim()
        || linkedProfile?.nom_complet || (linkedProfile ? "" : beneficiary.display_name || "");
      const phone = linkedProfile?.telephone || linkedProfile?.whatsapp || beneficiary.phone || "";
      if (!phone) throw new Error("Telephone du beneficiaire absent.");
      contacts = [{
        source_type: "lead",
        source_id: beneficiary.id,
        user_id: linkedProfile?.user_id || null,
        nom_complet: displayName || "",
        telephone: phone,
        email: linkedProfile?.email || beneficiary.email || null,
      }];
    } else if (context.independent_service_customer_id) {
      const { data: independentCustomer, error: independentCustomerError } = await admin
        .from("independent_service_customers")
        .select("id,display_name,telephone,email")
        .eq("id", String(context.independent_service_customer_id))
        .maybeSingle();
      if (independentCustomerError) throw independentCustomerError;
      if (independentCustomer) contacts = [{
        source_type: "independent_service_customer",
        source_id: independentCustomer.id,
        nom_complet: independentCustomer.display_name,
        telephone: independentCustomer.telephone,
        email: independentCustomer.email || null,
      }];
    } else {
      contacts = await resolveContacts(automation.criteres || {});
    }
    if (context.client_id) {
      contacts = contacts.filter((c) => c.source_id === context.client_id && c.source_type === "client");
    }
    if (context.proprietaire_id) {
      contacts = contacts.filter((c) => c.source_id === context.proprietaire_id && c.source_type === "proprietaire_foncier");
    }
    if (context.lead_id) contacts = contacts.filter((c) => c.source_id === context.lead_id && c.source_type === "lead");
    if (context.prospect_id) contacts = contacts.filter((c) => c.source_id === context.prospect_id && c.source_type === "prospect");
    if (context.user_id) contacts = contacts.filter((c) => c.user_id === context.user_id);
    const cooldownMinutes = Math.max(0, Number(automation.cooldown_minutes) || 0);
    if (contacts.length) {
      const cutoff = new Date(Date.now() - cooldownMinutes * 60_000).toISOString();
      const eligible: Contact[] = [];
      for (const contact of contacts) {
        let query = admin.from("notification_deliveries").select("id").eq("automation_id", automation.id)
          .eq("source_id", contact.source_id)
          .in("statut", context.paiement_id ? ["envoye", "livre"] : ["en_cours", "envoye", "livre"]).limit(1);
        if (!context.paiement_id && cooldownMinutes > 0) query = query.gte("created_at", cutoff);
        if (context.paiement_id) query = query.contains("metadata", { event_key: eventCode + ":" + String(context.paiement_id) });
        const { data: recent, error: recentError } = await query;
        if (recentError) throw recentError;
        if (!recent?.length) eligible.push(contact);
      }
      contacts = eligible;
    }
    // La règle nationale/internationale prévaut sur les anciennes préférences de canal client.
    // Les notifications automatiques sont routées par l'indicatif du numéro dans deliver().
    const selectedChannel = automation.canal;
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
  const today = now.toISOString().slice(0, 10);
  const plusDeuxJours = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  const results: unknown[] = [];
  const addDays = (date: string, days: number) => {
    const value = new Date(date + "T12:00:00.000Z");
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };
  const dayDiff = (later: string, earlier: string) =>
    Math.floor((Date.parse(later + "T00:00:00Z") - Date.parse(earlier + "T00:00:00Z")) / 86400000);
  const formatDate = (date: string) => {
    const [year, month, day] = date.slice(0, 10).split("-");
    return day + "/" + month + "/" + year;
  };

  // Règle métier : 30 jours = un mois. Seuls les clients officiels payants
  // avec au moins une plantation activée sont concernés. Les bénéficiaires gratuits,
  // propriétaires fonciers, fiches internes et plantations non activées sont exclus.
  const { data: clients, error: clientsError } = await admin.from("clients")
    .select("id,id_unique,nom_complet,type_client,is_internal,statut_global,compte_actif,mensualite_montant,prochaine_echeance,contrat_debut_at")
    .in("type_client", ["client", "avec_terre"])
    .eq("is_internal", false)
    .eq("compte_actif", true)
    .gt("mensualite_montant", 0)
    .not("statut_global", "in", '("archive","supprime")')
    .limit(1000);
  if (clientsError) throw clientsError;

  const { data: plantations, error: plantationsError } = await admin.from("plantations")
    .select("id,client_id,date_activation,statut,statut_global,superficie_ha")
    .not("client_id", "is", null)
    .not("date_activation", "is", null)
    .limit(2000);
  if (plantationsError) throw plantationsError;

  const activeByClient = new Map<string, any[]>();
  for (const plantation of plantations || []) {
    const statuses = [String(plantation.statut || "").toLowerCase(), String(plantation.statut_global || "").toLowerCase()];
    if (!statuses.some((status) => ["actif", "active", "activee", "activée"].includes(status))) continue;
    const list = activeByClient.get(plantation.client_id) || [];
    list.push(plantation);
    activeByClient.set(plantation.client_id, list);
  }

  for (const client of clients || []) {
    const activePlantations = activeByClient.get(client.id) || [];
    const monthlyAmount = Number(client.mensualite_montant || 0);
    if (!activePlantations.length || monthlyAmount <= 0) continue;

    // Darius has an explicit, manually scheduled exception in the CRM. Respect it
    // rather than recalculating from the older activation date or sending early.
    const isDarius = client.id_unique === "AC_C000002" ||
      String(client.nom_complet || "").toLocaleUpperCase("fr-FR").includes("DARIUS");
    if (isDarius && client.prochaine_echeance) {
      const dueDate = String(client.prochaine_echeance).slice(0, 10);
      const paymentKey = String(client.id) + ":" + dueDate;
      const context = {
        client_id: client.id, paiement_id: paymentKey, montant: String(Math.round(monthlyAmount)),
        date_echeance: formatDate(dueDate),
      };
      if (dueDate < today) {
        results.push(await runEvent("paiement_retard", {
          ...context, jours_retard: String(dayDiff(today, dueDate)),
        }));
      } else if (dueDate === plusDeuxJours) {
        results.push(await runEvent("paiement_echeance", context));
      }
      continue;
    }

    const activationDate = activePlantations
      .map((plantation) => String(plantation.date_activation).slice(0, 10))
      .sort()[0];
    const baseDate = String(client.contrat_debut_at || activationDate).slice(0, 10);
    const firstDueDate = addDays(baseDate, 30);
    let overdueDueDate: string | null = null;
    let upcomingDueDate: string;

    if (firstDueDate > today) {
      upcomingDueDate = firstDueDate;
    } else {
      const elapsed = Math.max(0, dayDiff(today, firstDueDate));
      const cyclesElapsed = Math.floor(elapsed / 30);
      overdueDueDate = addDays(firstDueDate, cyclesElapsed * 30);
      upcomingDueDate = addDays(overdueDueDate, 30);
    }

    // Store the next scheduled 30-day due date for the CRM UI.
    if (client.prochaine_echeance !== upcomingDueDate) {
      const { error: dateError } = await admin.from("clients")
        .update({ prochaine_echeance: upcomingDueDate }).eq("id", client.id);
      if (dateError) throw dateError;
    }

    if (overdueDueDate && overdueDueDate < today) {
      const paymentKey = String(client.id) + ":" + overdueDueDate;
      results.push(await runEvent("paiement_retard", {
        client_id: client.id, paiement_id: paymentKey,
        montant: String(Math.round(monthlyAmount)), date_echeance: formatDate(overdueDueDate),
        jours_retard: String(dayDiff(today, overdueDueDate)),
      }));
    }
    if (upcomingDueDate === plusDeuxJours) {
      const paymentKey = String(client.id) + ":" + upcomingDueDate;
      results.push(await runEvent("paiement_echeance", {
        client_id: client.id, paiement_id: paymentKey,
        montant: String(Math.round(monthlyAmount)), date_echeance: formatDate(upcomingDueDate),
      }));
    }
  }

  const { data: scheduled, error: scheduledError } = await admin.from("notification_campaigns").select("id")
    .eq("statut", "programme").lte("programme_le", now.toISOString()).limit(20);
  if (scheduledError) throw scheduledError;
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
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f5f4;padding:24px 10px;"><tr><td align="center">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e1e7e3;border-radius:12px;overflow:hidden;">
  <tr><td style="height:6px;background:#16834a;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td align="center" style="padding:24px;"><a href="https://www.agricapital.ci/" style="text-decoration:none;">
  <img src="${BRAND_LOGO_URL}" width="250" alt="AgriCapital" style="display:block;width:250px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;"></a></td></tr>
  <tr><td style="padding:0 28px 28px;font-size:15px;line-height:1.75;overflow-wrap:anywhere;">${body}</td></tr>
  <tr><td style="padding:20px 24px;background:#f8faf8;border-top:1px solid #e6ebe7;text-align:center;font-size:12px;line-height:1.7;color:#66736b;">
  <strong style="font-size:14px;color:#176b45;">AgriCapital SARL</strong><br>
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
    if (mode === "run_scheduled_campaigns") {
      if (!(await internalAuthorized(req))) return json(req, { error: "Non autorise" }, 401);
      return json(req, { ok: true, results: await runScheduledCampaigns() });
    }
    if (mode === "internal_routed_message") {
      if (!(await internalAuthorized(req))) return json(req, { error: "Non autorise" }, 401);
      const raw = body.contact || {};
      const contact: Contact = {
        source_type: String(raw.source_type || "client"),
        source_id: String(raw.source_id || ""),
        user_id: raw.user_id ? String(raw.user_id) : null,
        nom_complet: raw.nom_complet ? String(raw.nom_complet) : null,
        telephone: raw.telephone ? String(raw.telephone) : null,
        telephone_secondaire: raw.telephone_secondaire ? String(raw.telephone_secondaire) : null,
        whatsapp: raw.whatsapp ? String(raw.whatsapp) : null,
      };
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!contact.source_id || !content || !contact.telephone) {
        return json(req, { error: "Contact, téléphone et contenu sont obligatoires." }, 400);
      }
      const result = await deliver({
        canal: "auto",
        content,
        contacts: [contact],
        eventKey: String(body.event_key || body.idempotency_key || crypto.randomUUID()),
        context: { source: "internal_routed_message" },
      });
      return json(req, { ok: true, result });
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
    if (mode === "restructure_sms") {
      const content = typeof body.content === "string" ? body.content : "";
      const rewritten = restructureSmsTemplateWithinLimit(content, 130);
      const bodyCharacters = Array.from(normalizeSms(rewritten.replace(/\{\s*(?:dernier_prenom_nom|dernierprenom_nom)\s*\}/gi, ""))).length;
      return json(req, { ok: true, content: rewritten, bodyCharacters, maxBodyCharacters: 130, engine: "internal" });
    }
    if (mode === "recipient_directory") {
      // Use the same canonical recipient resolver as campaign previews and sends.
      // Directly querying legacy CRM columns here caused the picker to fail with
      // a  non-2xx response when a legacy column was absent from the live schema.
      // resolveContacts already applies active/contact eligibility, canonical IDs,
      // and deduplication across the supported audiences.
      const [allContacts,otherContacts]=await Promise.all([resolveDirectoryContacts({audience:"tous"}),resolveDirectoryContacts({audience:"autres"})]);
      const contacts=[...allContacts,...otherContacts];
      const directory = new Map<string, Contact>();
      for (const contact of contacts) {
        if (!contact?.source_type || !contact?.source_id) continue;
        const key = String(contact.source_type) + ":" + String(contact.source_id);
        if (!directory.has(key)) directory.set(key, contact);
      }
      return json(req, {
        ok: true,
        contacts: [...directory.values()].map((contact) => ({
          source_type: contact.source_type,
          source_id: contact.source_id,
          nom_complet: contact.nom_complet || "",
          email: contact.email || null,
          telephone: contact.telephone || null,
          whatsapp: selectedWhatsAppNumber(contact),
          whatsapp_format_valid: Boolean(selectedWhatsAppNumber(contact)),
          role_code: contact.role_code || null,
        })),
      });
    }
    if (mode === "manual_contact") {
      const leadId = String(body.lead_id || "").trim();
      let channel = String(body.channel || "");
      const content = String(body.content || "").trim();
      const subject = String(body.subject || "Suivi de votre projet de plantation de palmier à huile").slice(0, 160);
      const requestId = String(body.request_id || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 100);
      if (!leadId) return json(req, { error: "lead_id requis" }, 400);
      if (!["whatsapp", "email", "sms"].includes(channel)) return json(req, { error: "Canal non pris en charge" }, 400);
      let normalizedContent = brandAutomatedMessage(content, channel === "email" ? "email" : "whatsapp");
      let effectiveLength = Array.from(normalizedContent).length;
      let limit = 5000;
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
      // Les pièces jointes sont validées après routage, car le pays du numéro décide du canal.
      const templateId = String(body.template_id || "").trim();
      let templateMedia: Array<Record<string, unknown>> = [];
      if (templateId) {
        const { data: selectedTemplate, error: templateError } = await admin.from("notification_templates")
          .select("id,canal,actif,media_attachments").eq("id", templateId).maybeSingle();
        if (templateError) throw templateError;
        if (!selectedTemplate || !selectedTemplate.actif) {
          return json(req, { error: "Le modèle sélectionné n’est plus disponible pour ce canal." }, 400);
        }
        templateMedia = Array.isArray(selectedTemplate.media_attachments) ? selectedTemplate.media_attachments : [];
      }
      const allowedMime = /^image\/(jpeg|png)$/i;
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
        .select("id,nom,prenoms,civilite,telephone,whatsapp,email,type_lead,assigned_to,created_by")
        .eq("id", leadId).maybeSingle();
      if (leadError) throw leadError;
      if (!lead) return json(req, { error: "Lead ou prospect introuvable" }, 404);
      if (!supervisor && lead.assigned_to !== actor.id && lead.created_by !== actor.id) {
        return json(req, { error: "Vous ne pouvez contacter que vos propres leads ou prospects." }, 403);
      }
      const contact: Contact = {
        source_type: "lead", source_id: lead.id,
        nom_complet: [lead.prenoms, lead.nom].filter(Boolean).join(" ").trim() || "Contact AgriCapital",
        email: lead.email || null, telephone: lead.telephone || null, whatsapp: lead.whatsapp || null,
      };
      const routingPolicy = await getNotificationRoutingPolicy();
      if (channel === "sms" || channel === "whatsapp") {
        const routedChannel = resolveAutomaticChannel(contact, routingPolicy);
        if (!routedChannel) return json(req, { error: "Numéro international invalide pour appliquer la règle SMS/WhatsApp." }, 400);
        channel = routedChannel;
        normalizedContent = brandAutomatedMessage(content, channel, routingPolicy.sms_max_characters);
        effectiveLength = Array.from(normalizedContent).length;
        limit = channel === "sms" ? routingPolicy.sms_max_characters : 4096;
        if (!normalizedContent || effectiveLength > limit) {
          return json(req, { error: `Le message doit contenir entre 1 et ${limit} caractères (actuellement ${effectiveLength}).` }, 400);
        }
      }
      if (channel === "sms" && rawAttachments.length) return json(req, { error: "Les SMS ne prennent pas en charge les pièces jointes." }, 400);
      const routedContact = channel === "whatsapp" ? routedWhatsAppContact(contact, routingPolicy) : contact;
      if (channel === "whatsapp" && !(contact.whatsapp || contact.telephone)) return json(req, { error: "Numéro WhatsApp absent" }, 400);
      if (channel === "sms" && !contact.telephone) return json(req, { error: "Numéro de téléphone absent" }, 400);
      if (channel === "email" && !contact.email) return json(req, { error: "Adresse email absente" }, 400);
      const requestBucket = Math.floor(Date.now() / (5 * 60 * 1000));
      const dedupeKey = `manual-contact:${lead.id}:${channel}:${requestId || requestBucket + ":" + (await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedContent)).then(hash => Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 20)))}`;
      let result: { provider: string; messageId: string | null };
      if (channel === "whatsapp") {
        assertWhatsAppLength(normalizedContent);
        const prepared = mediaAttachments.length ? await prepareMedia(mediaAttachments) : [];
        result = await sendWhatsApp(routedContact, normalizedContent, dedupeKey, prepared[0]?.ref);
        for (let i = 1; i < prepared.length; i++) {
          await sendWhatsApp(routedContact, "", `${dedupeKey}:media:${i}`, prepared[i].ref);
        }
      } else if (channel === "email") {
        result = await sendEmail(contact, subject, normalizedContent, dedupeKey, mediaAttachments);
      } else if (channel === "sms") {
        result = await sendSms(contact, normalizedContent, dedupeKey);
      } else {
        return json(req, { error: "Canal non pris en charge pour un contact manuel." }, 400);
      }
      return json(req, { ok: true, channel, messageId: result.messageId || null, characterCount: Array.from(normalizedContent).length, attachmentsSent: mediaAttachments.length });
    }
    if (mode === "preview") {
      const contacts = await resolveContacts(body.criteria || {});
      return json(req, { ok: true, count: contacts.length, sample: contacts.slice(0,20).map((c) => ({
        nom_complet:c.nom_complet,email:c.email,telephone:c.telephone,whatsapp:selectedWhatsAppNumber(c),whatsapp_format_valid:Boolean(selectedWhatsAppNumber(c)),offre_nom:c.offre_nom,role_code:c.role_code
      })), whatsapp_missing: contacts.filter((c) => !selectedWhatsAppNumber(c)).length, whatsapp_ready: contacts.filter((c) => Boolean(selectedWhatsAppNumber(c))).length });
    }
    if (mode === "event") {
      if (!body.event_code) return json(req, { error: "event_code requis" }, 400);
      return json(req, { ok: true, results: await runEvent(body.event_code, body.context || {}) });
    }
    if (mode === "campaign") {
      if (!body.campaign_id) return json(req, { error: "campaign_id requis" }, 400);
      return json(req, { ok: true, result: await runCampaign(body.campaign_id) });
    }
    if (mode === "retry_failed_campaign" || mode === "retry_failed_delivery") {
      if (!body.campaign_id) return json(req, { error: "campaign_id requis" }, 400);
      return json(req, { ok: true, result: await retryFailedCampaign(String(body.campaign_id), mode === "retry_failed_delivery" ? String(body.delivery_id || "") : null) });
    }
    return json(req, { error: "Mode non reconnu" }, 400);
  } catch (error) {
    console.error("notification-dispatch error", error);
    return json(req, { error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
