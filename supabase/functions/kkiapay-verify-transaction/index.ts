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
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Méthode non autorisée" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const privateKey = Deno.env.get("KKIAPAY_PRIVATE_KEY");
    if (!url || !serviceKey || !privateKey) {
      console.error("Kkiapay verifier missing server configuration");
      return json({ success: false, error: "Service de paiement indisponible" }, 503);
    }

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ success: false, error: "Authentification requise" }, 401);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json({ success: false, error: "Session invalide" }, 401);

    const body = await req.json().catch(() => ({}));
    const transactionId = body?.transactionId;
    const paiementId = body?.paiementId;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof transactionId !== "string" || !transactionId.trim() || transactionId.length > 128) {
      return json({ success: false, error: "Identifiant de transaction invalide" }, 400);
    }
    if (typeof paiementId !== "string" || !UUID_RE.test(paiementId)) {
      return json({ success: false, error: "Identifiant de paiement invalide" }, 400);
    }

    const { data: payment, error: paymentError } = await admin
      .from("paiements")
      .select("id,client_id,montant,montant_paye,statut,reference,kkiapay_transaction_id,metadata,mode_paiement")
      .eq("id", paiementId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return json({ success: false, error: "Paiement introuvable" }, 404);

    const { data: staff, error: staffError } = await admin.rpc("is_staff", { _user_id: user.id });
    if (staffError) console.error("Staff check failed", staffError.message);
    let allowed = Boolean(staff);
    if (!allowed) {
      const { data: client, error: clientError } = await admin
        .from("clients")
        .select("id,user_id")
        .eq("id", payment.client_id)
        .maybeSingle();
      if (clientError) throw clientError;
      allowed = Boolean(client && client.user_id === user.id);
    }
    if (!allowed) return json({ success: false, error: "Accès non autorisé à ce paiement" }, 403);

    if (payment.statut === "valide" && payment.kkiapay_transaction_id === transactionId) {
      return json({
        success: true,
        applied: true,
        alreadyApplied: true,
        transaction: { id: transactionId, status: "SUCCESS", isPaymentSuccessful: true, amount: payment.montant_paye ?? payment.montant },
      });
    }
    if (payment.statut === "valide") {
      return json({ success: false, error: "Ce paiement est déjà validé avec une autre transaction" }, 409);
    }

    const { data: reused, error: reusedError } = await admin
      .from("paiements")
      .select("id")
      .eq("kkiapay_transaction_id", transactionId)
      .neq("id", paiementId)
      .limit(1)
      .maybeSingle();
    if (reusedError) throw reusedError;
    if (reused) return json({ success: false, error: "Transaction déjà rattachée à un autre paiement" }, 409);

    const response = await fetch("https://api.kkiapay.me/api/v1/transactions/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-private-key": privateKey },
      body: JSON.stringify({ transactionId }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error("Kkiapay status API returned", response.status);
      return json({ success: false, error: "Vérification Kkiapay indisponible" }, 502);
    }
    const result = await response.json();
    const status = String(result?.status || "").toUpperCase();
    const providerAmount = Number(result?.amount);
    const due = Number(payment.montant);
    if (status !== "SUCCESS") {
      return json({
        success: true,
        applied: false,
        transaction: { id: transactionId, status, isPaymentSuccessful: false, failureMessage: result?.failureMessage || null },
      });
    }
    if (!Number.isFinite(due) || due <= 0 || !Number.isFinite(providerAmount) || Math.abs(providerAmount - due) > 1) {
      console.warn("Kkiapay amount mismatch", { paiementId, due, providerAmount });
      return json({ success: false, error: "Le montant confirmé par Kkiapay ne correspond pas au montant dû" }, 409);
    }

    const source = String(result?.source || "").toLowerCase();
    const method = source.includes("wave")
      ? "Wave"
      : /(card|visa|mastercard|bank)/.test(source)
        ? "Carte bancaire"
        : "Mobile Money";
    const verifiedAt = new Date().toISOString();
    const metadata = {
      ...(payment.metadata || {}),
      payment_provider: "kkiapay",
      kkiapay_transaction_id: transactionId,
      kkiapay_method: method,
      kkiapay_source: result?.source ?? null,
      kkiapay_fees: Number(result?.fees || 0),
      provider_amount: providerAmount,
      verified_at: verifiedAt,
      verification_source: "server_api",
    };

    const { data: finalized, error: finalizeError } = await admin.rpc("finalize_portal_payment", {
      _paiement_id: paiementId,
      _transaction_id: transactionId,
      _provider_amount: providerAmount,
      _metadata: metadata,
      _validated_at: verifiedAt,
    });
    if (finalizeError) {
      console.error("Payment finalization failed", finalizeError.message);
      return json({ success: false, error: "Le paiement n'a pas pu être enregistré" }, 409);
    }

    const { error: methodError } = await admin
      .from("paiements")
      .update({ mode_paiement: method })
      .eq("id", paiementId);
    if (methodError) console.error("Payment channel update failed", methodError.message);

    const { error: eventError } = await admin.from("kkiapay_events").insert({
      transaction_id: transactionId,
      reference: payment.reference,
      paiement_id: paiementId,
      status,
      amount: providerAmount,
      fees: Number(result?.fees || 0),
      source: method,
      signature_valid: true,
      raw_payload: result,
      processed: true,
      processed_at: verifiedAt,
    });
    if (eventError) console.error("Kkiapay event audit insert failed", eventError.message);

    return json({
      success: true,
      applied: true,
      finalization: finalized,
      transaction: {
        id: transactionId,
        status,
        isPaymentSuccessful: true,
        amount: providerAmount,
        fees: Number(result?.fees || 0),
        source: method,
        performedAt: result?.performed_at || result?.createdAt || verifiedAt,
      },
    });
  } catch (error) {
    console.error("Kkiapay verification failed", error);
    return json({ success: false, error: "Erreur lors de la vérification du paiement" }, 500);
  }
});
