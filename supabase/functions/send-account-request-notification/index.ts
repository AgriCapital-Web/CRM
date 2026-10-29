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
    // Toutes les valeurs issues du formulaire public sont échappées avant insertion dans l'email HTML.
    const safe = {
      nom_complet: escapeHtml(requestData?.nom_complet),
      email: escapeHtml(requestData?.email),
      telephone: escapeHtml(requestData?.telephone),
      poste: escapeHtml(requestData?.poste),
      region: escapeHtml(requestData?.region),
      departement: escapeHtml(requestData?.departement),
      message: escapeHtml(requestData?.message),
    };
    // Aucune donnée personnelle du demandeur n'est journalisée.
    console.log("Request data received");

    // Get all super admins
    const { data: superAdmins, error: adminsError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'super_admin');

    if (adminsError) {
      console.error("Error fetching super admins:", adminsError);
      throw adminsError;
    }

    console.log("Super admins found:", superAdmins?.length);

    // Get admin profiles
    const adminIds = superAdmins?.map(a => a.user_id) || [];
    const { data: adminProfiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, nom_complet, telephone')
      .in('id', adminIds);

    if (profilesError) {
      console.error("Error fetching admin profiles:", profilesError);
      throw profilesError;
    }

    console.log("Admin profiles found:", adminProfiles?.length);

    // Send notifications to each super admin
    for (const adminProfile of adminProfiles || []) {
      console.log("Processing notification for admin");

      // Create in-app notification
      const { error: notifError } = await supabaseAdmin.from('notifications').insert({
        user_id: adminProfile.id,
        type: 'account_request',
        titre: 'Nouvelle demande de compte',
        message: `${requestData.nom_complet} (${requestData.email}) demande un accès à la plateforme.`,
        lien: '/account-requests',
        dedupe_key: `account-request:${String(requestData.auth_user_id || requestData.email).toLowerCase()}:${adminProfile.user_id || adminProfile.id}`
      });

      if (notifError) {
        if (notifError.code === "23505") { console.log("Duplicate account-request notification suppressed"); continue; }
        console.error("Notification claim failed; external delivery skipped to avoid duplicates.");
        continue;
      } else {
        console.log("In-app notification created");
      }

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
            text: `AgriCapital — notification automatique à l’équipe. Nouvelle demande de compte. Nom : ${requestData.nom_complet}. E-mail : ${requestData.email}. Téléphone : ${requestData.telephone}. Rôle demandé : ${requestData.role_souhaite || requestData.poste_souhaite}. Consultez les demandes dans le CRM : https://app.agricapital.ci/account-requests`,
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
                      <p>Bonjour ${escapeHtml(adminProfile.nom_complet)},</p>
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

      // Send WhatsApp notification (if configured)
      const whatsappToken = Deno.env.get('WHATSAPP_TOKEN');
      const whatsappPhoneId = Deno.env.get('WHATSAPP_PHONE_ID');
      if (whatsappToken && whatsappPhoneId && adminProfile.telephone) {
        try {
          // Format phone number for WhatsApp (remove leading 0, add country code)
          let phoneNumber = adminProfile.telephone.replace(/\D/g, '');
          if (phoneNumber.startsWith('0')) {
            phoneNumber = '225' + phoneNumber.substring(1);
          }
          
          console.log("Sending WhatsApp notification to administrator");
          
          const whatsappResponse = await fetch(`https://graph.facebook.com/v17.0/${whatsappPhoneId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${whatsappToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: phoneNumber,
              type: 'text',
              text: {
                body: `🌱 *AgriCapital · Notification automatique à l’équipe*\nNouvelle demande de compte\n\n` +
                      `Nom: ${requestData.nom_complet}\n` +
                      `Email: ${requestData.email}\n` +
                      `Tél: ${requestData.telephone}\n` +
                      `${requestData.poste ? `Poste: ${requestData.poste}\n` : ''}` +
                      `\nConnectez-vous à app.agricapital.ci pour traiter cette demande.`
              }
            })
          });

          if (whatsappResponse.ok) {
            console.log("WhatsApp message sent successfully");
          } else {
            const errorText = await whatsappResponse.text();
            console.error("WhatsApp send failed:", errorText);
          }
        } catch (whatsappError: any) {
          console.error("Error sending WhatsApp:", whatsappError);
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
