import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kkiapay-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function methodFromSource(value: unknown): string {
  const source = String(value || "").toLowerCase();
  if (source.includes("wave")) return "Wave";
  if (/(card|visa|mastercard|bank)/.test(source)) return "Carte bancaire";
  return "Mobile Money";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Méthode non autorisée" }, 405);

  try {
    const webhookSecret = Deno.env.get("KKIAPAY_WEBHOOK_SECRET") || Deno.env.get("KKIAPAY_PRIVATE_KEY");
    const privateKey = Deno.env.get("KKIAPAY_PRIVATE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!webhookSecret || !privateKey || !supabaseUrl || !serviceKey) {
      console.error("Kkiapay webhook server configuration is incomplete");
      return json({ success: false, error: "Webhook indisponible" }, 503);
    }

    const signature = (req.headers.get("x-kkiapay-signature") || "").toLowerCase().replace(/^sha256=/, "");
    if (!signature) return json({ success: false, error: "Signature manquante" }, 401);
    const rawBody = await req.text();
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const expected = Array.from(new Uint8Array(signed)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (!constantTimeEqual(signature, expected)) return json({ success: false, error: "Signature invalide" }, 401);

    let body: any;
    try { body = JSON.parse(rawBody); } catch { return json({ success: false, error: "Payload invalide" }, 400); }
    const transactionId = body?.transactionId;
    const eventStatus = String(body?.status || "").toUpperCase();
    if (typeof transactionId !== "string" || !transactionId.trim() || transactionId.length > 128) {
      return json({ success: false, error: "Identifiant de transaction invalide" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const reference = body?.data?.reference ?? body?.reference ?? null;
    const paiementId = body?.data?.paiement_id ?? body?.paiement_id ?? null;
    let payment: any = null;

    if (reference) {
      const { data, error } = await admin.from("paiements").select("*").eq("reference", reference).limit(1).maybeSingle();
      if (error) throw error;
      payment = data;
    }
    if (!payment && typeof paiementId === "string") {
      const { data, error } = await admin.from("paiements").select("*").eq("id", paiementId).maybeSingle();
      if (error) throw error;
      payment = data;
    }
    if (!payment) {
      const { data, error } = await admin.from("paiements").select("*").contains("metadata", { kkiapay_transaction_id: transactionId }).limit(1).maybeSingle();
      if (error) throw error;
      payment = data;
    }

    const eventBase = {
      transaction_id: transactionId,
      reference: reference || payment?.reference || null,
      paiement_id: payment?.id || null,
      status: eventStatus || "UNKNOWN",
      amount: Number(body?.amount || 0),
      fees: Number(body?.fees || 0),
      source: methodFromSource(body?.source ?? body?.data?.method),
      signature_valid: true,
      raw_payload: body,
      processed: false,
    };

    if (!payment) {
      const { error } = await admin.from("kkiapay_events").insert(eventBase);
      if (error) console.error("Orphan Kkiapay event logging failed", error.message);
      return json({ success: true, matched: false, message: "Événement reçu; aucun paiement correspondant" });
    }

    if (payment.statut === "valide" && payment.kkiapay_transaction_id === transactionId) {
      await admin.from("kkiapay_events").insert({ ...eventBase, processed: true, processed_at: new Date().toISOString() });
      return json({ success: true, applied: true, alreadyApplied: true });
    }
    if (payment.statut === "valide") {
      await admin.from("kkiapay_events").insert({ ...eventBase, processed: false });
      return json({ success: false, error: "Le paiement est déjà associé à une autre transaction" }, 409);
    }

    if (eventStatus !== "SUCCESS") {
      const nextStatus = eventStatus === "FAILED" ? "echoue" : "en_attente";
      const { error } = await admin.from("paiements").update({ statut: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", payment.id).neq("statut", "valide");
      if (error) throw error;
      const { error: eventError } = await admin.from("kkiapay_events").insert({
        ...eventBase, processed: true, processed_at: new Date().toISOString(),
      });
      if (eventError) console.error("Kkiapay event logging failed", eventError.message);
      return json({ success: true, applied: false, status: nextStatus });
    }

    const providerResponse = await fetch("https://api.kkiapay.me/api/v1/transactions/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-private-key": privateKey },
      body: JSON.stringify({ transactionId }),
      signal: AbortSignal.timeout(10000),
    });
    if (!providerResponse.ok) return json({ success: false, error: "Vérification Kkiapay indisponible" }, 502);
    const verified = await providerResponse.json();
    const verifiedStatus = String(verified?.status || "").toUpperCase();
    const providerAmount = Number(verified?.amount);
    const expectedAmount = Number(payment.montant);
    if (verifiedStatus !== "SUCCESS") {
      await admin.from("kkiapay_events").insert({ ...eventBase, status: verifiedStatus || eventStatus, processed: true, processed_at: new Date().toISOString() });
      return json({ success: true, applied: false, status: verifiedStatus || eventStatus });
    }
    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0 || !Number.isFinite(providerAmount) || Math.abs(providerAmount - expectedAmount) > 1) {
      console.warn("Kkiapay webhook amount mismatch", { paiementId: payment.id, expectedAmount, providerAmount });
      await admin.from("kkiapay_events").insert({ ...eventBase, amount: Number.isFinite(providerAmount) ? providerAmount : eventBase.amount, processed: false });
      return json({ success: false, error: "Montant confirmé différent du paiement attendu" }, 409);
    }

    const { data: reused, error: reusedError } = await admin.from("paiements").select("id")
      .eq("kkiapay_transaction_id", transactionId).neq("id", payment.id).limit(1).maybeSingle();
    if (reusedError) throw reusedError;
    if (reused) return json({ success: false, error: "Transaction déjà rattachée à un autre paiement" }, 409);

    const verifiedAt = new Date().toISOString();
    const method = methodFromSource(verified?.source ?? body?.source ?? body?.data?.method);
    const metadata = {
      ...(payment.metadata || {}),
      payment_provider: "kkiapay",
      kkiapay_transaction_id: transactionId,
      kkiapay_method: method,
      kkiapay_source: verified?.source ?? body?.source ?? null,
      kkiapay_fees: Number(verified?.fees || body?.fees || 0),
      provider_amount: providerAmount,
      webhook_received_at: verifiedAt,
      verified_at: verifiedAt,
      verification_source: "server_api",
    };
    const { error: finalizeError } = await admin.rpc("finalize_portal_payment", {
      _paiement_id: payment.id,
      _transaction_id: transactionId,
      _provider_amount: providerAmount,
      _metadata: metadata,
      _validated_at: verifiedAt,
    });
    if (finalizeError) {
      console.error("Kkiapay payment finalization failed", finalizeError.message);
      await admin.from("kkiapay_events").insert({ ...eventBase, amount: providerAmount, source: method, processed: false });
      return json({ success: false, error: "Le paiement n'a pas pu être enregistré" }, 409);
    }

    const { error: methodError } = await admin.from("paiements").update({ mode_paiement: method }).eq("id", payment.id);
    if (methodError) console.error("Kkiapay method update failed", methodError.message);
    const { error: eventError } = await admin.from("kkiapay_events").insert({
      ...eventBase, status: verifiedStatus, amount: providerAmount, fees: Number(verified?.fees || body?.fees || 0),
      source: method, processed: true, processed_at: verifiedAt,
    });
    if (eventError) console.error("Kkiapay event logging failed", eventError.message);

    return json({ success: true, applied: true, paymentId: payment.id, status: verifiedStatus });
  } catch (error) {
    console.error("Kkiapay webhook processing failed", error);
    return json({ success: false, error: "Erreur de traitement du webhook" }, 500);
  }
});
