import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) return respond({ error: "server_not_configured" }, 503);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return respond({ error: "unauthorized" }, 401);

  const admin = createClient(url, serviceKey);
  const { data: roles, error: rolesError } = await admin.from("user_roles").select("role").eq("user_id", auth.user.id);
  if (rolesError) return respond({ error: "role_check_failed" }, 500);
  const allowed = (roles ?? []).some((row: { role: string }) =>
    ["admin", "super_admin", "pdg", "dg"].includes(String(row.role).toLowerCase())
  );
  if (!allowed) return respond({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return respond({ error: "invalid_json" }, 400); }
  const { data: current, error: readError } = await admin.from("acremap_integration_settings")
    .select("id,api_base_url,api_key,webhook_secret,enabled,updated_at").eq("id", "default").maybeSingle();
  if (readError) return respond({ error: "settings_read_failed" }, 500);

  if (body.action === "get") {
    return respond(publicSettings(current));
  }
  if (body.action !== "save") return respond({ error: "invalid_action" }, 400);

  const baseUrl = typeof body.api_base_url === "string" ? body.api_base_url.trim().replace(/\/$/, "") : "";
  if (!baseUrl) return respond({ error: "api_base_url_required" }, 400);
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      return respond({ error: "https_required" }, 400);
    }
  } catch { return respond({ error: "invalid_api_base_url" }, 400); }

  const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
  const webhookSecret = typeof body.webhook_secret === "string" ? body.webhook_secret.trim() : "";
  const row = {
    id: "default",
    api_base_url: baseUrl,
    api_key: apiKey || current?.api_key || "",
    webhook_secret: webhookSecret || current?.webhook_secret || "",
    enabled: body.enabled === true,
    updated_at: new Date().toISOString(),
  };
  const { error: writeError } = await admin.from("acremap_integration_settings").upsert(row, { onConflict: "id" });
  if (writeError) return respond({ error: "settings_write_failed" }, 500);
  return respond(publicSettings(row));
});

function publicSettings(row: any) {
  return {
    id: "default",
    api_base_url: row?.api_base_url ?? "",
    enabled: row?.enabled === true,
    updated_at: row?.updated_at ?? null,
    has_api_key: Boolean(row?.api_key),
    has_webhook_secret: Boolean(row?.webhook_secret),
  };
}
function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}
