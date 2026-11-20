import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) return respond({ error: "server_not_configured" }, 503);

  const authorization = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return respond({ error: "unauthorized" }, 401);

  const admin = createClient(url, serviceKey);
  const { data: permissions, error: permissionError } = await admin.rpc("crm_user_app_permissions", {
    _user_id: auth.user.id,
  });
  if (permissionError) return respond({ error: "permission_check_failed" }, 500);
  if (!Array.isArray(permissions) || !permissions.includes("parametres.manage_system")) {
    return respond({ error: "forbidden" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respond({ error: "invalid_json" }, 400);
  }

  const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
    return respond({ error: "invalid_client_id" }, 400);
  }

  const { data, error } = await admin.rpc("admin_reset_client_portal_access", {
    p_client_id: clientId,
    p_actor_user_id: auth.user.id,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "22023" ? 409 : 500;
    return respond({ error: error.message || "reset_failed" }, status);
  }
  return respond(data ?? { success: true });
});