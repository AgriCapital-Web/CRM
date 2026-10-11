import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (p: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(p), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

/** Échappe toute valeur fournie par l'utilisateur avant insertion dans un email HTML. */
const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .slice(0, 500)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const VALID_ROLES = [
  "commercial", "technicien", "chef_equipe_commercial", "chef_equipe_technique",
  "responsable_commercial", "responsable_technique_agronomique", "responsable_zone",
  "comptable", "service_client", "operations",
];

// Aucun rôle ne peut être auto-attribué : toute demande passe par la validation d'un administrateur.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let step = "init";
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json();
    const {
      username, password, email, nom_complet, telephone, role_souhaite,
      poste_souhaite, district_id, region_id, departement_geo_id, departement, justification, photo_url,
    } = body ?? {};

    if (!username || !password || !email || !nom_complet || !telephone || !role_souhaite) {
      return json({ error: "Champs obligatoires manquants (identifiant, mot de passe, email, nom, téléphone, rôle).", step: "validate_body" }, 400);
    }
    if (String(password).length < 8) {
      return json({ error: "Le mot de passe doit contenir au moins 8 caractères.", step: "validate_password" }, 400);
    }
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(String(username))) {
      return json({ error: "Identifiant invalide (3 à 30 caractères : lettres, chiffres, . _ -).", step: "validate_username" }, 400);
    }
    if (!VALID_ROLES.includes(String(role_souhaite))) {
      return json({ error: `Rôle invalide: ${role_souhaite}`, step: "validate_role" }, 400);
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanEmail = String(email).trim().toLowerCase();

    // Username déjà pris ?
    const { data: available } = await admin.rpc("username_available", { _username: cleanUsername });
    if (available === false) {
      return json({ error: "Cet identifiant est déjà utilisé. Choisissez-en un autre.", step: "username_available" }, 409);
    }

    // Email déjà existant ? (aucune donnée personnelle renvoyée au client)
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id,user_id")
      .ilike("email", cleanEmail)
      .maybeSingle();

    // Réponse identique que l'email existe ou non (anti-énumération de comptes).
    const genericAccepted = () => json({ success: true, immediate_access: false });

    if (existingProfile?.user_id) {
      console.log("submit-account-request: email déjà rattaché à un compte (réponse générique)");
      return genericAccepted();
    }

    // Création du compte auth SANS confirmation d'email :
    // le demandeur doit prouver qu'il possède l'adresse avant toute activation.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password: String(password),
      email_confirm: false,
      user_metadata: { nom_complet, username: cleanUsername, pending_role: role_souhaite },
    });

    if (createErr) {
      const msg = String(createErr.message || "");
      if (/already/i.test(msg)) {
        return genericAccepted();
      }
      return json({ error: msg, step: "create_auth_user" }, 400);
    }

    const userId = created.user!.id;

    // Envoi du lien de vérification d'adresse email
    try {
      const siteUrl = Deno.env.get("SITE_URL") ?? "https://app.agricapital.ci";
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "signup",
        email: cleanEmail,
        password: String(password),
        options: { redirectTo: `${siteUrl}/login` },
      });
      const actionLink = (linkData as any)?.properties?.action_link;
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (actionLink && RESEND_API_KEY) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "AgriCapital <no-reply@agricapital.ci>",
            to: [cleanEmail],
            subject: "Confirmez votre adresse email — AgriCapital",
            html: `<p>Bonjour ${escapeHtml(nom_complet)},</p><p>Confirmez votre adresse email pour que votre demande de compte puisse être validée :</p><p><a href="${escapeHtml(actionLink)}">Confirmer mon adresse email</a></p>`,
          }),
        });
      }
    } catch (linkErr) {
      console.warn("verification email non envoyée", linkErr);
    }


    // Profil inactif jusqu'à validation
    await admin.from("profiles").update({
      user_id: userId,
      email: cleanEmail,
      nom_complet,
      telephone,
      username: cleanUsername,
      poste: poste_souhaite ?? null,
      district_id: district_id ?? null,
      region_id: region_id ?? null,
      actif: false,
    }).eq("user_id", userId);

    const { error: reqErr } = await admin.from("account_requests").insert({
      nom_complet,
      email: cleanEmail,
      telephone,
      username: cleanUsername,
      auth_user_id: userId,
      poste_souhaite: poste_souhaite ?? role_souhaite,
      role_souhaite,
      district_id: district_id ?? null,
      region_id: region_id ?? null,
      departement_geo_id: departement_geo_id ?? null,
      departement: departement ?? null,
      justification: justification ?? null,
      photo_url: photo_url ?? null,
      statut: "en_attente",
    });

    if (reqErr) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      console.error("insert account_requests failed", reqErr);
      return json({ error: "Votre demande n'a pas pu être enregistrée. Veuillez réessayer." }, 400);
    }

    // Notification interne aux administrateurs (appel serveur-à-serveur authentifié)
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-account-request-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          requestData: {
            nom_complet, email: cleanEmail, telephone,
            username: cleanUsername, poste: poste_souhaite ?? role_souhaite,
          },
        }),
      });
    } catch (notifErr) {
      console.warn("notification admin non envoyée", notifErr);
    }

    return json({
      success: true,
      user_id: userId,
      username: cleanUsername,
      immediate_access: false,
    });
  } catch (e) {
    console.error("submit-account-request error", e);
    return json({ error: (e as Error).message, step }, 500);
  }
});