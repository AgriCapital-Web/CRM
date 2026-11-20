import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { SenndoClient } from "npm:@senndo/sdk@1.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function normalizePhone(value: unknown) {
  const raw = String(value ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (raw.length < 8 || raw.length > 15) throw new Error("Numéro de téléphone invalide.");
  const hasIvoryCoastCode = raw.startsWith("225");
  const national = hasIvoryCoastCode ? raw.slice(3) : raw;
  // Match older 8-digit subscriber numbers with newer 10-digit CI mobile numbers.
  if (national.length === 10 && /^0[157]\d{8}$/.test(national)) return national.slice(-8);
  if (national.length === 9 && national.startsWith("0")) return national.slice(1);
  return hasIvoryCoastCode ? national : national.replace(/^0+/, "");
}
function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map(x => x.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, "0")).join("");
}
async function codeHash(code: string, salt: string) {
  const secret = Deno.env.get("PORTAL_ACCESS_CODE_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return sha256(code + ":" + salt + ":" + secret);
}
async function sessionTokenHash(token: string) { return sha256(token); }
async function issueSession(supabase: any, clientId: string) {
  const raw = randomHex(32) + "." + randomHex(16);
  const token_hash = await sessionTokenHash(raw);
  const { error } = await supabase.from("client_portal_sessions").insert({
    client_id: clientId,
    token_hash,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
  return raw;
}
async function findClient(supabase: any, phone: string) {
  const tail = phone.slice(-8);
  const { data, error } = await supabase.from("clients")
    .select("id,telephone,whatsapp,telephone_local,whatsapp_local,telephone_indicatif,whatsapp_indicatif,email,nom_complet,compte_actif,validation_statut,statut_global,id_unique,type_client,is_internal,offre_id,montant_total_contrat,contrat_solde_at")
    .or(`telephone.ilike.%${tail},whatsapp.ilike.%${tail},telephone_local.ilike.%${tail},whatsapp_local.ilike.%${tail}`)
    .limit(100);
  if (error) throw error;
  const contacts = (c: any) => [
    c.telephone, c.whatsapp, c.telephone_local, c.whatsapp_local,
    c.telephone_indicatif && c.telephone_local ? String(c.telephone_indicatif) + String(c.telephone_local) : null,
    c.whatsapp_indicatif && c.whatsapp_local ? String(c.whatsapp_indicatif) + String(c.whatsapp_local) : null,
  ].filter(Boolean);
  return (data || []).find((c: any) => contacts(c).some((value: any) => {
    try { return normalizePhone(value) === phone; } catch { return false; }
  })) || null;
}
function maskPhone(value: unknown) {
  const d = String(value ?? "").replace(/\D/g, "");
  return d.length >= 4 ? "•••• " + d.slice(-4) : null;
}
function smsDestination(client: any) {
  // Utiliser le téléphone principal du dossier CRM, jamais le numéro WhatsApp par défaut.
  const dial = String(client.telephone_indicatif || "225").replace(/\D/g, "");
  let local = String(client.telephone_local || client.telephone || "").replace(/\D/g, "").replace(/^00/, "");
  if (!local) return null;
  if (local.startsWith(dial) && local.length > dial.length + 7) local = local.slice(dial.length);
  if (!client.telephone_indicatif && local.length > 10) return "+" + local;
  if (dial === "225") return "+225" + local;
  return "+" + dial + local.replace(/^0+/, "");
}
async function sendOtpSms(supabase: any, to: string, code: string) {
  const { data: apiKey, error } = await supabase.rpc("senndo_get_secret", { p_name: "senndo_api_key" });
  if (error || typeof apiKey !== "string" || !apiKey) throw new Error("Configuration Senndo SMS indisponible.");
  const senndo = new SenndoClient({ apiKey, baseUrl: "https://api.senndo.com", timeoutMs: 30000, maxRetries: 2, userAgent: "AgriCapital-Portal/1.0" });
  const result = await senndo.sendMessage({
    channel: "sms", to, text: "AgriCapital : votre code de verification portail est " + code + ". Valable 10 minutes. Ne le partagez pas.",
    ...(to.startsWith("+225") ? { senderId: "AgriCapital" } : {}),
    idempotencyKey: "portal-otp-" + crypto.randomUUID(),
  });
  console.info("[Portal OTP] SMS accepté par Senndo", { messageId: result?.id || null, destination: maskPhone(to) });
  return result;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const action = body?.action || "inspect";
    const phone = normalizePhone(body?.telephone || body?.phone || "");
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;
    if (!secret) throw new Error("Service database indisponible.");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secret);
    const client = await findClient(supabase, phone);
    if (!client) return json({ success: false, code: "CLIENT_NOT_FOUND", error: "Ce numéro n'est pas enregistré dans votre dossier client AgriCapital." });
    const isDemo = client.id_unique === "AC-DEMO";
    const isBeneficiary = client.type_client === "beneficiaire_particulier";
    const isPreActivation = !client.compte_actif && client.validation_statut === "valide" && !client.is_internal && !isDemo && !isBeneficiary;
    if (!client.compte_actif && !isDemo && !isBeneficiary && !isPreActivation) {
      return json({ success: false, code: "CLIENT_NOT_READY", error: "Votre dossier client doit être validé avant l’accès au portail." });
    }
    const { data: access, error: accessError } = await supabase.from("client_portal_access_codes")
      .select("id,locked_until,last_verified_at").eq("client_id", client.id).maybeSingle();
    if (accessError) throw accessError;

    if (action === "inspect") {
      if (isDemo) {
        const token = await issueSession(supabase, client.id);
        return json({ success: true, demo: true, demo_code: "2026", access_token: token });
      }
      // Never disclose client identity before the caller proves control of the phone or knows the code.
      return json({ success: true, demo: false, telephone_masque: maskPhone(client.telephone || client.whatsapp || client.telephone_local),
        needs_access_code_setup: !access, locked_until: access?.locked_until || null, pre_activation: isPreActivation, otp_required_for_setup: !access });
    }
    if (action === "request_otp") {
      if (access) return json({ success: false, error: "Un code d'accès existe déjà pour ce compte.", needs_access_code_setup: false });
      const dest = smsDestination(client);
      if (!dest) return json({ success: false, error: "Aucun numéro joignable n'est enregistré pour ce dossier." });
      const { data: recent } = await supabase.from("otp_codes").select("created_at").eq("telephone", phone)
        .gte("created_at", new Date(Date.now() - 60 * 1000).toISOString()).limit(1);
      if (recent && recent.length) return json({ success: false, error: "Un code vient d'être envoyé. Patientez une minute avant d'en demander un autre." });
      const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      await supabase.from("otp_codes").delete().eq("telephone", phone).eq("verified", false);
      const { data: otpRow, error: otpErr } = await supabase.from("otp_codes").insert({
        telephone: phone, code: await codeHash(otp, "otp:" + phone),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), verified: false, attempts: 0,
      }).select("id").single();
      if (otpErr || !otpRow) throw otpErr || new Error("Impossible d'enregistrer le code de vérification.");
      try {
        await sendOtpSms(supabase, dest, otp);
      } catch (sendError: any) {
        await supabase.from("otp_codes").delete().eq("id", otpRow.id);
        console.error("[Portal OTP] Échec Senndo SMS", {
          status: sendError?.status || sendError?.statusCode || null,
          code: sendError?.code || null,
          message: String(sendError?.message || "Erreur fournisseur").slice(0, 300),
          destination: maskPhone(dest),
        });
        return json({ success: false, code: "SMS_SEND_FAILED", error: "Le SMS n'a pas pu être envoyé. Vérifiez votre numéro auprès d'AgriCapital ou réessayez dans quelques instants." }, 502);
      }
      return json({ success: true, otp_sent: true, canal: "sms", telephone_masque: maskPhone(dest) });
    }
    if (action === "verify_otp") {
      const otp = String(body?.otp || "");
      if (!/^\d{6}$/.test(otp)) return json({ success: false, code: "OTP_INVALID", error: "Saisissez le code SMS à 6 chiffres." });
      const { data: otpRow, error: otpReadError } = await supabase.from("otp_codes")
        .select("id,code,expires_at,attempts").eq("telephone", phone).eq("verified", false)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (otpReadError) throw otpReadError;
      if (!otpRow || new Date(otpRow.expires_at).getTime() < Date.now() || Number(otpRow.attempts || 0) >= 5) {
        return json({ success: false, code: "OTP_EXPIRED", error: "Code SMS expiré ou inexistant. Demandez un nouveau code." });
      }
      if (otpRow.code !== await codeHash(otp, "otp:" + phone)) {
        await supabase.from("otp_codes").update({ attempts: Number(otpRow.attempts || 0) + 1 }).eq("id", otpRow.id);
        return json({ success: false, code: "OTP_INVALID", error: "Code SMS incorrect." });
      }
      const { error: verifyError } = await supabase.from("otp_codes").update({ verified: true }).eq("id", otpRow.id);
      if (verifyError) throw verifyError;
      return json({ success: true, otp_verified: true });
    }
    if (action === "setup") {
      if (access) return json({ success: false, error: "Un code d'accès existe déjà pour ce compte. Utilisez-le pour vous connecter.", needs_access_code_setup: false });
      const code = String(body?.code || ""), confirm = String(body?.confirm_code || "");
      if (!/^\d{4}$/.test(code) || code !== confirm) return json({ success: false, error: "Le code doit contenir exactement 4 chiffres et les deux champs doivent être identiques." });
      // Le téléphone a déjà été vérifié par l'action verify_otp.
      const { data: otpRow, error: otpReadError } = await supabase.from("otp_codes")
        .select("id,expires_at,attempts").eq("telephone", phone).eq("verified", true)
        .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (otpReadError) throw otpReadError;
      if (!otpRow || Number(otpRow.attempts || 0) >= 5) {
        return json({ success: false, code: "OTP_REQUIRED", error: "Vérifiez d'abord le code SMS reçu sur votre téléphone." });
      }
      const salt = randomHex(16), hash = await codeHash(code, salt);
      const { error } = await supabase.from("client_portal_access_codes").insert({
        client_id: client.id, code_hash: hash, code_salt: salt, failed_attempts: 0, locked_until: null,
        set_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (error) {
        if (error.code === "23505") return json({ success: false, error: "Un code d'accès vient d'être enregistré pour ce compte. Utilisez-le pour vous connecter.", needs_access_code_setup: false });
        throw error;
      }
      await supabase.from("otp_codes").delete().eq("id", otpRow.id);
      const token = await issueSession(supabase, client.id);
      await supabase.from("historique_activites").insert({ table_name: "clients", record_id: client.id, action: "PORTAL_ACCESS_CODE_CREATED", details: "Code d'accès portail client à 4 chiffres créé après vérification SMS." });
      return json({ success: true, first_connection: true, access_token: token });
    }
    if (action === "login") {
      const code = String(body?.code || "");
      if (!/^\d{4}$/.test(code)) return json({ success: false, error: "Code d'accès invalide." });
      if (!access) return json({ success: false, needs_access_code_setup: true });
      if (access.locked_until && new Date(access.locked_until).getTime() > Date.now()) return json({ success: false, error: "Trop de tentatives. Veuillez réessayer plus tard.", locked_until: access.locked_until });
      const { data: fullAccess, error: fullAccessError } = await supabase.from("client_portal_access_codes").select("*").eq("client_id", client.id).single();
      if (fullAccessError) throw fullAccessError;
      const expected = await codeHash(code, fullAccess.code_salt);
      if (expected !== fullAccess.code_hash) {
        const attempts = Number(fullAccess.failed_attempts || 0) + 1;
        const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
        await supabase.from("client_portal_access_codes").update({ failed_attempts: attempts >= 5 ? 0 : attempts, locked_until: lockedUntil, updated_at: new Date().toISOString() }).eq("client_id", client.id);
        return json({ success: false, error: lockedUntil ? "Trop de tentatives. Réessayez dans 15 minutes." : "Code d'accès incorrect." });
      }
      await supabase.from("client_portal_access_codes").update({ failed_attempts: 0, locked_until: null, last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("client_id", client.id);
      return json({ success: true, access_token: await issueSession(supabase, client.id) });
    }
    if (action === "logout") {
      const token = String(body?.access_token || "");
      if (token) await supabase.from("client_portal_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", await sessionTokenHash(token));
      return json({ success: true });
    }
    return json({ success: false, error: "Action invalide." });
  } catch (error: any) {
    console.error("portal-access internal error:", error?.message || error);
    return json({ success: false, code: "TEMPORARY_SERVICE_ERROR", error: "Nous rencontrons une difficulté technique. Veuillez réessayer dans quelques instants. Si le problème persiste, contactez AgriCapital au 05 64 55 17 17." }, 200);
  }
});