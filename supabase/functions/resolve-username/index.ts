import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) {
      console.error("resolve-username: missing Supabase environment configuration");
      return json({ error: "Service de connexion temporairement indisponible." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!username || !password) return json({ error: "Identifiant ou mot de passe incorrect." }, 401);

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Ne renvoyer aucune adresse e-mail avant d'avoir validé le mot de passe.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,user_id,username")
      .eq("username", username)
      .maybeSingle();

    if (profileError) {
      console.error("resolve-username profile lookup failed:", profileError.message);
      return json({ error: "Service de connexion temporairement indisponible." }, 500);
    }
    if (!profile) return json({ error: "Identifiant ou mot de passe incorrect." }, 401);

    const authUserId = profile.user_id || profile.id;
    if (!authUserId) return json({ error: "Identifiant ou mot de passe incorrect." }, 401);

    const { data: authUserResult, error: authUserError } = await admin.auth.admin.getUserById(authUserId);
    const accountEmail = authUserResult?.user?.email;
    if (authUserError || !accountEmail) {
      return json({ error: "Identifiant ou mot de passe incorrect." }, 401);
    }

    // Vérifier les identifiants avec le client public avant de révéler l'e-mail associé.
    const verifier = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
      email: accountEmail,
      password,
    });
    if (verifyError || !verified.user) {
      return json({ error: "Identifiant ou mot de passe incorrect." }, 401);
    }

    return json({ email: accountEmail.toLowerCase() });
  } catch (error) {
    console.error("resolve-username unexpected error:", error);
    return json({ error: "Service de connexion temporairement indisponible." }, 500);
  }
});
