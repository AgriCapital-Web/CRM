import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { SenndoClient } from "npm:@senndo/sdk@1.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // Réservé aux administrateurs authentifiés (ou appel interne service role)
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const deny = (msg: string, status: number) =>
      new Response(JSON.stringify({ success: false, error: msg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    if (!bearer) return deny("Non authentifié", 401);
    if (bearer !== serviceKey) {
      const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData } = await admin.auth.getUser(bearer);
      if (!userData?.user) return deny("Session invalide", 401);
      const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userData.user.id });
      if (!isAdmin) return deny("Accès réservé aux administrateurs", 403);
    }

    const { email, nom_complet, login_url, used_own_password, temp_password } = await req.json();
    if (!email) throw new Error("email requis");

    const secretClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: senndoKey } = await secretClient.rpc("senndo_get_secret", { p_name: "senndo_api_key" });
    const { data: senndoSender } = await secretClient.rpc("senndo_get_secret", { p_name: "senndo_email_sender_id" });
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const subject = "AgriCapital | Votre compte est activé";
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f6f7f9;border-radius:8px">
        <p style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#166534">AGRICAPITAL · NOTIFICATION AUTOMATIQUE</p>\n        <h2 style="color:#166534">Votre compte est activé</h2>\n        <p>Cette notification automatique confirme l’activation de votre accès AgriCapital.</p>
        <p>Votre demande de compte sur <strong>app.agricapital.ci</strong> a été <strong style="color:#166534">validée</strong>.</p>
        <p>Vous pouvez dès à présent vous connecter et commencer à enregistrer vos ventes.</p>
        ${used_own_password
          ? `<p>Utilisez le mot de passe que vous avez choisi lors de votre demande.</p>`
          : `<p><strong>Mot de passe temporaire :</strong> <code style="background:#fff;padding:6px 10px;border-radius:6px">${temp_password}</code><br/><em>Nous vous recommandons de le modifier après la première connexion.</em></p>`}
        <p style="margin-top:20px">
          <a href="${login_url}" style="background:#166534;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">Se connecter</a>
        </p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px">AgriCapital — Investir la terre. Cultiver l'avenir.</p>
      </div>`;

    if (typeof senndoKey === "string" && senndoKey) {
      const senndo = new SenndoClient({ apiKey: senndoKey, baseUrl: "https://api.senndo.com", timeoutMs: 30000, maxRetries: 2, userAgent: "AgriCapital-CRM/1.0" });
      const text = `AgriCapital — notification automatique. Votre compte est activé. Connectez-vous sur ${login_url}. ${used_own_password ? "Utilisez le mot de passe choisi lors de votre demande." : "Votre mot de passe temporaire est : " + String(temp_password ?? "") + ". Modifiez-le après la première connexion."} Investir la terre. Cultiver l’avenir.`;
      await senndo.sendMessage({ channel: "email", to: email, senderId: (typeof senndoSender === "string" && senndoSender) || Deno.env.get("SENNDO_EMAIL_SENDER_ID") || "no-reply@agricapital.ci", subject, text, idempotencyKey: `account-approved-${String(email).toLowerCase()}` });
    } else if (RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `account-approved-${String(email).toLowerCase()}` },
        body: JSON.stringify({
          from: "AgriCapital <no-reply@agricapital.ci>",
          to: [email], subject, html,
        }),
      });
      if (!r.ok) console.error("resend fail", await r.text());
    } else {
      console.warn("RESEND_API_KEY manquant — email non envoyé (log only)");
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-account-approved-notification error", e);
    return new Response(JSON.stringify({ success: false, error: "Envoi impossible" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});