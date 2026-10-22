import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST requis" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  // This endpoint processes notification and account-provisioning queues with
  // service-role privileges. It must only be callable by the scheduled job.
  const suppliedSecret = req.headers.get("x-agricapital-automation-secret");
  let internalAuthorized = false;
  if (suppliedSecret) {
    const configuredSecret = Deno.env.get("NOTIFICATION_CRON_SECRET");
    if (configuredSecret && suppliedSecret === configuredSecret) {
      internalAuthorized = true;
    } else {
      const { data: expectedSecret, error: secretError } = await admin.rpc("notification_get_internal_secret");
      internalAuthorized = !secretError && typeof expectedSecret === "string" && suppliedSecret === expectedSecret;
    }
  }
  if (!internalAuthorized) {
    return new Response(JSON.stringify({ ok: false, error: "Non autorisé" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  try {
    const { data: lock } = await admin.from("notification_cron_state")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", true)
      .or("last_run_at.is.null,last_run_at.lt." + new Date(Date.now() - 4 * 60 * 1000).toISOString())
      .select("id")
      .maybeSingle();

    if (!lock) return new Response(JSON.stringify({ ok: true, skipped: "lock" }), { headers: { "Content-Type": "application/json" } });

    const call = async (body: unknown) => {
      const response = await fetch(url + "/functions/v1/notification-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-agricapital-automation-secret": serviceKey },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "notification-dispatch " + response.status);
      return payload;
    };

    const scheduled = await call({ mode: "run_automations" });

    const { data: accounts } = await admin.from("client_account_provision_outbox")
      .select("id,client_id,tentatives")
      .eq("statut", "en_attente")
      .order("created_at")
      .limit(20);

    const accountResults = [];
    for (const account of accounts || []) {
      try {
        const response = await fetch(url + "/functions/v1/provision-client-account", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-agricapital-account-secret": serviceKey },
          body: JSON.stringify({ client_id: account.client_id }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || "Provisionnement HTTP " + response.status);
        await admin.from("client_account_provision_outbox").update({
          statut: "traite", processed_at: new Date().toISOString(), tentatives: (account.tentatives || 0) + 1, derniere_erreur: null,
        }).eq("id", account.id);
        accountResults.push({ id: account.id, ok: true, user_id: payload.user_id || null });
      } catch (error) {
        await admin.from("client_account_provision_outbox").update({
          statut: (account.tentatives || 0) >= 4 ? "echoue" : "en_attente",
          tentatives: (account.tentatives || 0) + 1,
          derniere_erreur: error instanceof Error ? error.message : String(error),
        }).eq("id", account.id);
        accountResults.push({ id: account.id, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const { data: events } = await admin.from("notification_event_outbox")
      .select("id,event_code,context,tentatives")
      .eq("statut", "en_attente")
      .order("created_at")
      .limit(20);

    const results = [];
    if ((events || []).length) {
      try {
        const payload = await call({
          mode: "events",
          events: (events || []).map((event) => ({
            id: event.id,
            event_code: event.event_code,
            context: event.context || {},
          })),
        });
        const byId = new Map((payload.results || []).map((item: { id: string; ok: boolean; error?: string }) => [item.id, item]));
        for (const event of events || []) {
          const result = byId.get(event.id);
          if (result?.ok) {
            await admin.from("notification_event_outbox").update({
              statut: "traite",
              processed_at: new Date().toISOString(),
              tentatives: (event.tentatives || 0) + 1,
              derniere_erreur: null,
            }).eq("id", event.id);
            results.push({ id: event.id, ok: true });
          } else {
            const error = result?.error || "notification-dispatch batch failed";
            await admin.from("notification_event_outbox").update({
              statut: (event.tentatives || 0) >= 4 ? "echoue" : "en_attente",
              tentatives: (event.tentatives || 0) + 1,
              derniere_erreur: error,
            }).eq("id", event.id);
            results.push({ id: event.id, ok: false, error });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const event of events || []) {
          await admin.from("notification_event_outbox").update({
            statut: (event.tentatives || 0) >= 4 ? "echoue" : "en_attente",
            tentatives: (event.tentatives || 0) + 1,
            derniere_erreur: message,
          }).eq("id", event.id);
          results.push({ id: event.id, ok: false, error: message });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, scheduled, accounts: accountResults, outbox: results }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});