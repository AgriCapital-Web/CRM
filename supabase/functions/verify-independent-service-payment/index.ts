import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Méthode non autorisée" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const privateKey = Deno.env.get("KKIAPAY_PRIVATE_KEY");
    if (!url || !serviceKey || !privateKey) return json({ success: false, error: "Service de paiement indisponible" }, 503);
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ success: false, error: "Authentification requise" }, 401);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, error: "Session invalide" }, 401);
    const body = await req.json().catch(() => ({}));
    const paymentId = body?.payment_id;
    const transactionId = body?.transaction_id;
    if (typeof paymentId !== "string" || !/^[0-9a-f-]{36}$/i.test(paymentId) ||
        typeof transactionId !== "string" || !transactionId.trim() || transactionId.length > 128) {
      return json({ success: false, error: "Références de paiement invalides" }, 400);
    }
    const { data: roles, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", authData.user.id);
    if (roleError) throw roleError;
    const allowedRoles = new Set(["pdg", "dg", "service_client", "chef_equipe_service_client", "comptable"]);
    if (!(roles || []).some((row: any) => allowedRoles.has(String(row.role)))) return json({ success: false, error: "Accès non autorisé" }, 403);

    const { data: payment, error: paymentError } = await admin.from("independent_service_payments")
      .select("id,invoice_id,amount,status,provider_transaction_id,provider")
      .eq("id", paymentId).maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment || payment.provider !== "kkiapay") return json({ success: false, error: "Paiement introuvable" }, 404);
    if (payment.status === "succeeded" && payment.provider_transaction_id === transactionId) return json({ success: true, already_confirmed: true });
    if (payment.status === "succeeded") return json({ success: false, error: "Ce paiement est déjà confirmé" }, 409);

    const response = await fetch("https://api.kkiapay.me/api/v1/transactions/status", {
      method: "POST", headers: { "Content-Type": "application/json", "x-private-key": privateKey },
      body: JSON.stringify({ transactionId }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return json({ success: false, error: "Vérification Kkiapay indisponible" }, 502);
    const providerData = await response.json();
    const status = String(providerData?.status || "").toUpperCase();
    if (status !== "SUCCESS") return json({ success: false, pending: true, error: "La transaction n'est pas encore confirmée par Kkiapay." }, 409);
    const providerAmount = Number(providerData?.amount);
    if (!Number.isFinite(providerAmount) || Math.abs(providerAmount - Number(payment.amount)) > 1) {
      return json({ success: false, error: "Le montant confirmé par Kkiapay ne correspond pas à la facture." }, 409);
    }
    const { data: finalized, error: finalizeError } = await admin.rpc("finalize_independent_service_payment", {
      p_payment_id: payment.id, p_transaction_id: transactionId, p_provider_amount: providerAmount,
      p_provider_payload: { status, amount: providerAmount, source: providerData?.source || null, fees: providerData?.fees || 0, verified_at: new Date().toISOString() },
    });
    if (finalizeError) throw finalizeError;
    return json({ success: true, payment: finalized });
  } catch (error) {
    console.error("Independent service payment verification failed", error);
    return json({ success: false, error: "La vérification du paiement a échoué." }, 500);
  }
});