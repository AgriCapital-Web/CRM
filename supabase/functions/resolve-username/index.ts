import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret, x-cron-secret, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const adminClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    status,
  });

/**
 * Résout un identifiant en e-mail sans exposer l'e-mail avant validation.
 * Le RPC applique une limitation des tentatives par identifiant.
 * Le mode recovery envoie le courriel côté serveur sans révéler si le compte existe.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  try {
    const body = await req.json();
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const mode = body?.mode === "recovery" ? "recovery" : "login";

    if (!username || username.length < 2 || username.length > 64 || /[\x00-\x1F\x7F]/.test(username)) {
      return json({ error: "Identifiant invalide" }, 400);
    }

    const admin = adminClient();
    const { data: email, error } = await admin.rpc("resolve_username_email", { _username: username });

    if (mode === "recovery") {
      if (!error && email) {
        const siteUrl = "https://app.agricapital.ci";
        const anon = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        await anon.auth.resetPasswordForEmail(String(email), { redirectTo: `${siteUrl}/reset-password` });
      }
      return json({ sent: true });
    }

    if (!password || error || !email) return json({ error: "Identifiant ou mot de passe incorrect." }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: String(email),
      password,
    });
    if (signInError || !signIn?.user) {
      return json({ error: "Identifiant ou mot de passe incorrect." }, 401);
    }
    await anon.auth.signOut().catch(() => {});
    return json({ email: String(email) });
  } catch (error) {
    console.error("resolve-username request failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "Requête invalide" }, 400);
  }
});
