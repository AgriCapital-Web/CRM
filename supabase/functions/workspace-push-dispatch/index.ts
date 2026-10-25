import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import webpush from "npm:web-push@3.6.7";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST requis" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ ok: false, error: "Configuration serveur absente" }, 500);
  const admin = createClient(url, serviceKey);
  try {
    const supplied = req.headers.get("x-agricapital-automation-secret") || "";
    const { data: expected, error: secretError } = await admin.rpc("notification_get_internal_secret");
    if (secretError || !expected || supplied !== expected) return json({ ok: false, error: "Non autorisé" }, 401);

    const { data: vapid, error: vapidError } = await admin.rpc("notification_vapid_config");
    if (vapidError || !vapid?.public_key || !vapid?.private_key) {
      return json({ ok: false, error: "Configuration Web Push/VAPID indisponible" }, 503);
    }
    webpush.setVapidDetails(vapid.subject || "mailto:contact@agricapital.ci", vapid.public_key, vapid.private_key);

    const { data: rows, error } = await admin.from("workspace_notifications")
      .select("id,recipient_profile_id,title,body,target_path,entity_type,entity_id,created_at")
      .is("push_sent_at", null).order("created_at", { ascending: true }).limit(100);
    if (error) throw error;

    let delivered = 0;
    let noSubscription = 0;
    let failed = 0;
    for (const row of rows || []) {
      const { data: profile, error: profileError } = await admin.from("profiles")
        .select("user_id").eq("id", row.recipient_profile_id).maybeSingle();
      if (profileError) { failed++; continue; }
      const userId = profile?.user_id;
      if (!userId) {
        await admin.from("workspace_notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", row.id);
        noSubscription++;
        continue;
      }
      const { data: subscriptions, error: subError } = await admin.from("push_subscriptions")
        .select("id,endpoint,p256dh,auth").eq("user_id", userId).eq("active", true);
      if (subError) { failed++; continue; }
      if (!subscriptions?.length) {
        await admin.from("workspace_notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", row.id);
        noSubscription++;
        continue;
      }
      let sentForRow = 0;
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({
            notificationId: row.id,
            title: row.title || "AgriCapital 360",
            body: row.body || "Vous avez une nouvelle notification.",
            url: row.target_path || "/dashboard",
            data: { route: row.target_path || "/dashboard", entityType: row.entity_type, entityId: row.entity_id },
          }), { TTL: 86400, urgency: "high" });
          sentForRow++;
        } catch (pushError) {
          const statusCode = Number((pushError as { statusCode?: number })?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            await admin.from("push_subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
          } else {
            console.error("[AgriCapital 360 Web Push]", { notificationId: row.id, statusCode });
          }
        }
      }
      if (sentForRow > 0) {
        await admin.from("workspace_notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", row.id);
        delivered += sentForRow;
      } else {
        failed++;
      }
    }
    return json({ ok: true, scanned: rows?.length || 0, delivered, noSubscription, failed });
  } catch (error) {
    console.error("[workspace-push-dispatch]", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Erreur serveur" }, 500);
  }
});
