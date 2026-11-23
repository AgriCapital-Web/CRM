import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SenndoClient } from "npm:@senndo/sdk@1.5.0";


const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .slice(0, 500)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatPersonName = (lastName?: string | null, givenNames?: string | null) => {
  const surname = String(lastName || "").trim();
  const given = String(givenNames || "").trim().split(/\s+/).filter(Boolean).pop() || "";
  const titleCase = (value: string) => value.toLocaleLowerCase("fr-FR")
    .replace(/(^|[\s’'-])(\p{L})/gu, (_match, boundary, letter) => boundary + letter.toLocaleUpperCase("fr-FR"));
  if (given && surname) return `${titleCase(given)} ${surname.toLocaleUpperCase("fr-FR")}`;
  return given ? titleCase(given) : surname ? surname.toLocaleUpperCase("fr-FR") : "Utilisateur";
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting send-account-request-notification function");

    // Appel réservé aux services internes (service role) — évite le relais de notifications par des tiers.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!serviceKey || bearer !== serviceKey) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { requestData } = await req.json();
    const requestNameParts = String(requestData?.nom_complet || "").trim().split(/\s+/).filter(Boolean);
    const applicantLastName = String(requestData?.nom || requestNameParts[0] || "").trim();
    const applicantGivenNames = String(requestData?.prenoms || requestNameParts.slice(1).join(" ")).trim();
    const applicantDisplayName = formatPersonName(applicantLastName, applicantGivenNames);
    // Toutes les valeurs issues du formulaire public sont échappées avant insertion dans l'email HTML.
    const safe = {
      nom_complet: escapeHtml(applicantDisplayName),
      email: escapeHtml(requestData?.email),
      telephone: escapeHtml(requestData?.telephone),
      poste: escapeHtml(requestData?.poste),
      region: escapeHtml(requestData?.region),
      departement: escapeHtml(requestData?.departement),
      message: escapeHtml(requestData?.message),
    };
    // Aucune donnée personnelle du demandeur n'est journalisée.
    console.log("Request data received");

    // Le routage est strictement déterminé par le poste demandé.
    // Le PDG reçoit toujours la demande; le responsable métier ne reçoit
    // que les demandes de son périmètre et de sa région.
    const requestedRole = String(requestData?.role_souhaite || requestData?.poste || "").trim();
    const normalizedRole = requestedRole.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const isCommercial = /commercial|vente/.test(normalizedRole);
    const isLandMobilization = /mobilisateur|mobilisation fonciere|foncier/.test(normalizedRole);
    const isTechnical = /technicien|technique|agronomique/.test(normalizedRole);

    const recipientRoles = isCommercial
      ? ["pdg", "responsable_commercial"]
      : isLandMobilization
        ? ["pdg", "responsable_operations"]
        : isTechnical
          ? ["pdg", "responsable_technique_agronomique", "manager_technique_national"]
          : ["pdg"];

    const { data: roleRows, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id,role")
      .in("role", recipientRoles);
    if (rolesError) throw rolesError;

    const roleUserIds = [...new Set((roleRows || []).map((row: any) => String(row.user_id)).filter(Boolean))];
    if (!roleUserIds.length) {
      console.warn("Aucun destinataire autorisé trouvé pour la demande.");
      return new Response(JSON.stringify({ success: true, adminsNotified: 0, routing: recipientRoles }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: resolvedProfiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id,user_id,email,nom_complet,nom,prenoms,telephone,telephone_indicatif,telephone_local,region_id,actif")
      .in("user_id", roleUserIds)
      .eq("actif", true);
    if (profilesError) throw profilesError;

    const recipientsByUser = new Map<string, any>();
    for (const profile of resolvedProfiles || []) {
      const userId = String(profile.user_id || profile.id);
      const roleForUser = (roleRows || []).filter((row: any) => String(row.user_id) === userId).map((row: any) => row.role);
      const isPdg = roleForUser.includes("pdg");
      const isRegionalCommercialManager = roleForUser.includes("responsable_commercial")
        && Boolean(requestData?.region_id)
        && String(profile.region_id || "") === String(requestData.region_id);
      const isRequestedFunctionalManager = isLandMobilization
        ? roleForUser.includes("responsable_operations")
        : isTechnical
          ? roleForUser.some((role: string) => ["responsable_technique_agronomique", "manager_technique_national"].includes(role))
          : isCommercial
            ? isRegionalCommercialManager
            : false;
      if (isPdg || isRequestedFunctionalManager) recipientsByUser.set(userId, profile);
    }
    const adminProfiles = [...recipientsByUser.values()];

    console.log("Account-request routing resolved", {
      category: isCommercial ? "commercial" : isLandMobilization ? "foncier" : isTechnical ? "technique" : "autres",
      recipientCount: adminProfiles.length,
    });

    // Send notifications only to the PDG and the responsable métier autorisés
    for (const adminProfile of adminProfiles || []) {
      console.log("Processing notification for admin");

      // The in-app row is the idempotency claim for all external channels.
      const notificationDedupeKey = `account-request:${String(requestData.auth_user_id || requestData.email).toLowerCase()}:${adminProfile.user_id || adminProfile.id}`;
      const { data: existingNotification, error: lookupError } = await supabaseAdmin
        .from('notifications').select('id').eq('dedupe_key', notificationDedupeKey).maybeSingle();
      if (lookupError) {
        console.error("Notification claim lookup failed; external delivery skipped.");
        continue;
      }
      if (existingNotification) {
        console.log("Duplicate account-request notification suppressed");
        continue;
      }
      const { data: insertedNotification, error: notifError } = await supabaseAdmin.from('notifications').insert({
        user_id: adminProfile.id,
        type: 'account_request',
        titre: 'Nouvelle demande de compte',
        message: `${applicantDisplayName} (${requestData.email}) demande un accès à la plateforme.`,
        lien: '/account-requests',
        dedupe_key: notificationDedupeKey
      }).select('id').maybeSingle();

      if (notifError || !insertedNotification) {
        console.error("Notification claim failed or duplicate; external delivery skipped.");
        continue;
      }
      console.log("In-app notification created");

      // Send email notification using Resend
      const resendKey = Deno.env.get('RESEND_API_KEY');
      const { data: senndoKey } = await supabaseAdmin.rpc("senndo_get_secret", { p_name: "senndo_api_key" });
      const { data: senndoSender } = await supabaseAdmin.rpc("senndo_get_secret", { p_name: "senndo_email_sender_id" });
      if (typeof senndoKey === "string" && senndoKey && adminProfile.email) {
        try {
          const senndo = new SenndoClient({ apiKey: senndoKey, baseUrl: "https://api.senndo.com", timeoutMs: 30000, maxRetries: 2, userAgent: "AgriCapital-CRM/1.0" });
          await senndo.sendMessage({
            channel: "email", to: adminProfile.email,
            senderId: (typeof senndoSender === "string" && senndoSender) || Deno.env.get("SENNDO_EMAIL_SENDER_ID") || "notifications@agricapital.ci",
            subject: "AgriCapital | Notification automatique : nouvelle demande de compte",
            text: `AgriCapital — notification automatique à l’équipe. Nouvelle demande de compte. Nom : ${applicantDisplayName}. E-mail : ${requestData.email}. Téléphone : ${requestData.telephone}. Rôle demandé : ${requestData.role_souhaite || requestData.poste_souhaite}. Consultez les demandes dans le CRM : https://app.agricapital.ci/account-requests`,
            idempotencyKey: `account-request-${String(requestData.auth_user_id || requestData.email).toLowerCase()}-${String(adminProfile.email).toLowerCase()}`,
          });
        } catch (error) {
          console.error("Senndo admin email failed; no fallback after a provider attempt.");
        }
      } else if (resendKey && adminProfile.email) {
        try {
          console.log("Sending admin notification email");
          
          const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': `account-request-${String(requestData.auth_user_id || requestData.email).toLowerCase()}-${String(adminProfile.email).toLowerCase()}`,
            },
            body: JSON.stringify({
              from: 'AgriCapital <notifications@agricapital.ci>',
              to: [adminProfile.email],
              subject: 'AgriCapital | Notification automatique : nouvelle demande de compte',
              html: `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #00643C, #00843C); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
                    .info-row { display: flex; padding: 10px 0; border-bottom: 1px solid #eee; }
                    .label { font-weight: bold; width: 150px; color: #666; }
                    .value { flex: 1; }
                    .footer { text-align: center; padding: 15px; color: #666; font-size: 12px; }
                    .button { display: inline-block; background: #00643C; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h1>🌿 AgriCapital</h1>
                      <p>Nouvelle demande de compte</p>
                    </div>
                    <div class="content">
                      <p>Bonjour ${escapeHtml(formatPersonName(adminProfile.nom, adminProfile.prenoms))},</p>
                      <p>Une nouvelle demande de création de compte a été soumise sur la plateforme AgriCapital.</p>
                      
                      <h3>Détails de la demande :</h3>
                      <div class="info-row">
                        <span class="label">Nom complet :</span>
                        <span class="value">${safe.nom_complet}</span>
                      </div>
                      <div class="info-row">
                        <span class="label">Email :</span>
                        <span class="value">${safe.email}</span>
                      </div>
                      <div class="info-row">
                        <span class="label">Téléphone :</span>
                        <span class="value">${safe.telephone}</span>
                      </div>
                      ${safe.poste ? `
                      <div class="info-row">
                        <span class="label">Poste souhaité :</span>
                        <span class="value">${safe.poste}</span>
                      </div>
                      ` : ''}
                      ${safe.region ? `
                      <div class="info-row">
                        <span class="label">Région :</span>
                        <span class="value">${safe.region}</span>
                      </div>
                      ` : ''}
                      ${safe.departement ? `
                      <div class="info-row">
                        <span class="label">Département :</span>
                        <span class="value">${safe.departement}</span>
                      </div>
                      ` : ''}
                      ${safe.message ? `
                      <div class="info-row">
                        <span class="label">Message :</span>
                        <span class="value">${safe.message}</span>
                      </div>
                      ` : ''}
                      
                      <p style="margin-top: 20px;">Connectez-vous à la plateforme pour examiner et traiter cette demande.</p>
                      
                      <div style="text-align: center;">
                        <a href="https://app.agricapital.ci/account-requests" class="button">Voir les demandes</a>
                      </div>
                    </div>
                    <div class="footer">
                      <p>© 2025 AgriCapital - Tous droits réservés</p>
                      <p>Ceci est un email automatique, merci de ne pas y répondre.</p>
                    </div>
                  </div>
                </body>
                </html>
              `
            })
          });

          console.log("Email sent successfully:", emailResponse);
        } catch (emailError: any) {
          console.error("Error sending email:", emailError);
        }
      } else {
        console.log("Resend API key not configured or no email for admin");
      }

      // Route the administrator alert through the same country policy as every other notification.
      if (adminProfile.telephone || adminProfile.telephone_local) {
        try {
          const dispatchUrl = Deno.env.get("SUPABASE_URL") ?? "";
          const internalSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
          const message = `AgriCapital: demande de compte ${applicantDisplayName.slice(0, 28)}. Poste: ${requestedRole.slice(0, 22)}. Voir CRM: app.agricapital.ci`;
          const routed = await fetch(dispatchUrl + "/functions/v1/notification-dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-agricapital-automation-secret": internalSecret },
            body: JSON.stringify({
              mode: "internal_routed_message",
              contact: {
                source_type: "equipe",
                source_id: String(adminProfile.id),
                user_id: String(adminProfile.id),
                nom_complet: formatPersonName(adminProfile.nom, adminProfile.prenoms),
                nom: adminProfile.nom || null,
                prenoms: adminProfile.prenoms || null,
                telephone: adminProfile.telephone || (adminProfile.telephone_indicatif && adminProfile.telephone_local ? `${adminProfile.telephone_indicatif}${adminProfile.telephone_local}` : adminProfile.telephone_local),
              },
              content: message,
              channel: "sms",
              event_key: `account-request:${String(requestData.auth_user_id || requestData.email).toLowerCase()}:${adminProfile.id}`,
            }),
            signal: AbortSignal.timeout(45000),
          });
          const routedResult = await routed.json().catch(() => ({}));
          if (!routed.ok || !routedResult.ok) throw new Error(routedResult.error || "Routage notification refusé");
        } catch {
          console.error("Administrator notification dispatch failed.");
        }
      }
    }

    console.log("All notifications processed successfully");

    return new Response(
      JSON.stringify({ success: true, message: 'Notifications sent', adminsNotified: adminProfiles?.length || 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in send-account-request-notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
