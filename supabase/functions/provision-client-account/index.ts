import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-agricapital-account-secret",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "POST requis" }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const secret = Deno.env.get("NOTIFICATION_CRON_SECRET") || "";
  const internal = req.headers.get("x-agricapital-account-secret") || "";
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  let authorized = Boolean(internal && ((secret && internal === secret) || internal === serviceKey));
  if (!authorized && internal) {
    const { data: expectedSecret, error: secretError } = await admin.rpc("notification_get_internal_secret");
    authorized = !secretError && typeof expectedSecret === "string" && internal === expectedSecret;
  }
  if (!authorized) return json({ success: false, error: "Non autorisé" }, 401);

  try {
    const body = await req.json();
    const clientId = String(body?.client_id || "");
    if (!clientId) return json({ success: false, error: "client_id requis" }, 400);

    const { data: client, error: clientError } = await admin.from("clients")
      .select("id,user_id,nom_complet,compte_actif")
      .eq("id", clientId).single();
    if (clientError) throw clientError;
    if (!client) return json({ success: false, error: "Client introuvable" }, 404);
    if (!client.compte_actif) return json({ success: false, error: "Compte client non activé" }, 409);

    if (client.user_id) {
      const [{ data: profile, error: profileError }, { data: roles, error: rolesError }, { data: approvedRequest, error: requestError }] = await Promise.all([
        admin.from("profiles").select("user_id,type_compte,actif").eq("user_id", client.user_id).maybeSingle(),
        admin.from("user_roles").select("role").eq("user_id", client.user_id).limit(1),
        admin.from("account_requests").select("id").eq("auth_user_id", client.user_id).eq("statut", "approuve").limit(1).maybeSingle(),
      ]);
      if (profileError) throw profileError;
      if (rolesError) throw rolesError;
      if (requestError) throw requestError;

      const { error: detachError } = await admin.from("clients")
        .update({ user_id: null, updated_at: new Date().toISOString() })
        .eq("id", client.id);
      if (detachError) throw detachError;

      // Une personne peut être salariée et cliente, mais les deux dossiers restent indépendants.
      if (profile?.type_compte === "interne" || approvedRequest) {
        return json({
          success: true,
          client_id: client.id,
          internal_account_preserved: true,
          client_auth_link_removed: true,
          client_portal_auth_not_required: true,
        });
      }

      if ((roles || []).length > 0) {
        return json({
          success: false,
          code: "INTERNAL_ACCOUNT_REVIEW_REQUIRED",
          error: "Cette identité porte encore un rôle CRM. Vérifiez son profil interne avant toute suppression.",
        }, 409);
      }

      if (profile) {
        const { error: deleteProfileError } = await admin.from("profiles").delete().eq("user_id", client.user_id);
        if (deleteProfileError) throw deleteProfileError;
      }

      const { error: deleteUserError } = await admin.auth.admin.deleteUser(client.user_id);
      if (deleteUserError) throw deleteUserError;
    }

    // Le portail authentifie les clients par téléphone et code d'accès dédié.
    // Aucun compte Auth ni profil CRM client n'est créé à l'activation du dossier.
    return json({ success: true, client_id: client.id, client_portal_auth_not_required: true, user_id: null });
  } catch (error: any) {
    console.error("provision-client-account separation error:", error);
    return json({
      success: false,
      code: "TEMPORARY_SERVICE_ERROR",
      error: "La préparation de l’accès client n’a pas abouti. Le portail client utilise son code d’accès dédié.",
    }, 500);
  }
});
