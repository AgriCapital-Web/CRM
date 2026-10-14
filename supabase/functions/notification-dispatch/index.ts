import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { SenndoClient } from "npm:@senndo/sdk@1.5.0";
import webpush from "npm:web-push@3.6.7";

const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") || "https://agricapital.ci,https://www.agricapital.ci,https://app.agricapital.ci,https://crm.agricapital.ci,https://portail.agricapital.ci,http://localhost:5173,http://localhost:8080")
    .split(",").map((v) => v.trim()).filter(Boolean),
);
const corsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agricapital-automation-secret",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && (ALLOWED_ORIGINS.has(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin))) headers["Access-Control-Allow-Origin"] = origin;
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
  nom_complet?: string | null; email?: string | null; telephone?: string | null; whatsapp?: string | null;
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
  const fullName = contact.nom_complet || "Client";
  const firstName = fullName.split(/\s+/)[0] || "Client";
  const vars: Record<string, string> = {
    nom: fullName, nom_complet: fullName, prenom: firstName,
    email: contact.email || "", telephone: contact.telephone || "",
    role: contact.role_code || "", offre: contact.offre_nom || contact.offre_code || "",
    offre_code: contact.offre_code || "", date: new Date().toLocaleDateString("fr-FR"),
    ...Object.fromEntries(Object.entries(context).map(([k, v]) => [k, v == null ? "" : String(v)])),
  };
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? "");
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

async function staffAuthorized(req: Request) {
  if (await internalAuthorized(req)) return true;
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const { data } = await admin.auth.getUser(auth.slice(7));
  if (!data.user) return false;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
  return (roles || []).some((r) => [
    "pdg","dg","admin","super_admin","directeur_tc","responsable_operations","responsable_commercial",
    "chef_equipe_commercial","chef_equipe_technique","service_client","chef_equipe_service_client","comptable",
    "commercial_terrain","mobilisateur_foncier","superviseur_mobilisation_fonciere"
  ].includes(r.role));
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
  return { senndo: Boolean(apiKey), webhook: Boolean(webhookSecret), sms: Boolean(apiKey), email: Boolean(apiKey && emailSenderId), whatsapp_paired: Boolean(apiKey), voice: Boolean(apiKey), sender_id: "AgriCapital", whatsapp_business_number: "+2250564551717", email_sender_id: emailSenderId || null, email_provider: apiKey ? "senndo" : null };
}
async function sendEmail(contact: Contact, subject: string, content: string, dedupeKey: string, attachments: MediaAttachment[] = []) {
  if (!contact.email) throw new Error("Email absent");
  const client = await getSenndoClient();
  const { data: configuredSenderId } = await admin.rpc("senndo_get_secret", { p_name: "senndo_email_sender_id" });
  const senderId = typeof configuredSenderId === "string" && configuredSenderId ? configuredSenderId : Deno.env.get("SENNDO_EMAIL_SENDER_ID");
  if (!senderId) throw new Error("Adresse expéditrice Senndo non configurée");
  const links: string[] = [];
  for (const item of attachments) {
    const { data, error } = await admin.storage.from(item.bucket || "notification-media").createSignedUrl(item.path, 7 * 24 * 60 * 60);
    if (!error && data?.signedUrl) links.push(`${item.name}: ${data.signedUrl}`);
  }
  const plain = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const text = links.length ? `${plain}\n\nPièces jointes :\n${links.join("\n")}` : plain;
  const result = await client.sendMessage({ channel: "email", to: contact.email, subject: subject || "Notification AgriCapital", text, senderId, idempotencyKey: dedupeKey });
  return { provider: "senndo", messageId: result.id || null };
}
async function sendSms(contact: Contact, content: string, dedupeKey: string) {
  if (!contact.telephone) throw new Error("Téléphone absent");
  const client = await getSenndoClient();
  const result = await client.sendMessage({ channel: "sms", to: contact.telephone, text: normalizeSms(content), senderId: Deno.env.get("SENNDO_SMS_SENDER_ID") || "AgriCapital", idempotencyKey: dedupeKey });
  return { provider: "senndo", messageId: result.id || null, content: normalizeSms(content) };
}
async function sendWhatsApp(contact: Contact, content: string, dedupeKey: string, mediaRef?: string) {
  const recipient = contact.whatsapp || contact.telephone;
  if (!recipient) throw new Error("Numéro WhatsApp absent");
  const client = await getSenndoClient();
  const result = await client.sendMessage({ channel: "whatsapp", to: recipient, text: content,
    ...(mediaRef ? { media: { ref: mediaRef } } : {}), idempotencyKey: dedupeKey });
  return { provider: "senndo", messageId: result.id || null };
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
  const map = new Map<string, Contact>();
  for (const row of (data || []) as Contact[]) {
    const key = row.user_id || row.email?.toLowerCase() || row.telephone || row.source_type + ":" + row.source_id;
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
  const needsSenndoMedia = args.canal === "whatsapp" || (args.canal === "auto" && args.contacts.some((contact) => Boolean(contact.whatsapp)));
  const preparedMedia = args.mediaAttachments?.length && needsSenndoMedia ? await prepareMedia(args.mediaAttachments) : [];
  for (const contact of args.contacts) {
    const primaryAutoChannel = (() => {
      if (args.canal !== "auto") return null;
      const phone = (contact.telephone || contact.whatsapp || "").replace(/\s+/g, "");
      const digits = phone.replace(/[^0-9]/g, "");
      return contact.whatsapp ? "whatsapp" : (contact.telephone ? "sms" : "email");
    })();
    const channels = args.canal === "email_sms"
      ? ["email", "sms"]
      : args.canal === "auto"
        ? [primaryAutoChannel || "email", "email"]
        : [args.canal];
    for (const channel of [...new Set(channels)]) {
      if (channel === "app" && !contact.user_id && contact.source_type === "equipe") continue;
      const dedupeKey = (args.campaignId || args.automationId || "manual") + ":" +
        (args.eventKey || "") + ":" + (contact.user_id || contact.source_id) + ":" + channel;
      const { data: existing } = await admin.from("notification_deliveries")
        .select("id,statut,created_at").eq("dedupe_key", dedupeKey).maybeSingle();

      if (existing?.statut === "envoye" || existing?.statut === "livre" || existing?.statut === "en_cours") continue;

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
        } else if (channel === "email") {
          const result = await sendEmail(contact, renderedSubject, rendered, dedupeKey, attachments);
          await admin.from("notification_deliveries").update({
            statut: "envoye", fournisseur: result.provider, provider_message_id: result.messageId, sent_at: new Date().toISOString(),
          }).eq("id", delivery.id);
        } else if (channel === "whatsapp") {
          const result = await sendWhatsApp(contact, rendered, dedupeKey, mediaForChannel[0]?.ref);
          for (let i = 1; i < mediaForChannel.length; i++) {
            await sendWhatsApp(contact, "", dedupeKey + ":media:" + i, mediaForChannel[i].ref);
          }
          await admin.from("notification_deliveries").update({
            statut: "envoye", fournisseur: result.provider, provider_message_id: result.messageId, sent_at: new Date().toISOString(),
          }).eq("id", delivery.id);
        } else if (channel === "voice") {
          const result = await sendVoice(contact, rendered, dedupeKey);
          await admin.from("notification_deliveries").update({
            statut: "envoye", fournisseur: result.provider, provider_message_id: String(result.messageId || ""),
            sent_at: new Date().toISOString(),
          }).eq("id", delivery.id);
        } else {
          const result = await sendSms(contact, assertSmsLength(rendered), dedupeKey);
          await admin.from("notification_deliveries").update({
            statut: "envoye", fournisseur: result.provider, provider_message_id: String(result.messageId || ""),
            contenu: result.content, sent_at: new Date().toISOString(),
          }).eq("id", delivery.id);
        }
        sent++;
        if (args.canal === "auto") break;
      } catch (error) {
        failed++;
        await admin.from("notification_deliveries").update({
          statut: "echoue", erreur: error instanceof Error ? error.message : String(error),
        }).eq("id", delivery.id);
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
  const contacts = await resolveContacts(criteria);
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
        await runEvent(event.event_code, event.context || {});
        results.push({ id: event.id, ok: true });
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
      if (!(await internalAuthorized(req))) return json(req, { error: "Non autorise" }, 401);
      const events = Array.isArray(body.events) ? body.events : [];
      return json(req, { ok: true, results: await runEvents(events) });
    }
    if (!(await staffAuthorized(req))) return json(req, { error: "Non autorise" }, 401);
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
      const allowedMime = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime|3gpp)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|vnd\.ms-excel)|text\/plain)$/i;
      const mediaAttachments: MediaAttachment[] = [];
      for (const item of rawAttachments) {
        if (!item || typeof item.path !== "string" || typeof item.name !== "string" || typeof item.mimeType !== "string") {
          return json(req, { error: "Pièce jointe invalide." }, 400);
        }
        if (item.bucket && item.bucket !== "notification-media") return json(req, { error: "Bucket de pièce jointe non autorisé." }, 400);
        if (!item.path.startsWith(`${actor.id}/`) || item.path.includes("..")) return json(req, { error: "Accès refusé à une pièce jointe." }, 403);
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
      if (channel === "whatsapp" && !(contact.whatsapp || contact.telephone)) return json(req, { error: "Numéro WhatsApp absent" }, 400);
      if (channel === "sms" && !contact.telephone) return json(req, { error: "Numéro de téléphone absent" }, 400);
      if (channel === "email" && !contact.email) return json(req, { error: "Adresse email absente" }, 400);
      const dedupeKey = `manual-contact:${lead.id}:${channel}:${requestId || crypto.randomUUID()}`;
      let result: { provider: string; messageId: string | null };
      if (channel === "whatsapp") {
        assertWhatsAppLength(normalizedContent);
        const prepared = mediaAttachments.length ? await prepareMedia(mediaAttachments) : [];
        result = await sendWhatsApp(contact, normalizedContent, dedupeKey, prepared[0]?.ref);
        for (let i = 1; i < prepared.length; i++) {
          await sendWhatsApp(contact, "", `${dedupeKey}:media:${i}`, prepared[i].ref);
        }
      } else if (channel === "sms") {
        result = await sendSms(contact, assertSmsLength(normalizeSms(normalizedContent)), dedupeKey);
      } else {
        result = await sendEmail(contact, subject, normalizedContent, dedupeKey, mediaAttachments);
      }
      return json(req, { ok: true, channel, messageId: result.messageId || null, characterCount: Array.from(channel === "sms" ? normalizeSms(normalizedContent) : normalizedContent).length, attachmentsSent: mediaAttachments.length });
    }
    if (mode === "status") return json(req, { ok: true, providers: await providerStatus() });
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
