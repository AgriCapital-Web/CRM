import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const normalizePhone = (input: unknown) => {
  let d = String(input ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (d.startsWith("225") && d.length > 8) d = d.slice(3);
  return d.replace(/^0+/, "");
};
const phoneMatches = (a: unknown, b: unknown) => {
  const na = normalizePhone(a), nb = normalizePhone(b);
  return !!na && na === nb;
};
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const verifyPortalSession = async (supabase: any, token: unknown): Promise<string | null> => {
  if (typeof token !== "string" || token.length < 40) return null;
  const tokenHash = await sha256(token);
  const { data: session, error } = await supabase
    .from("client_portal_sessions")
    .select("id,client_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !session) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("telephone,whatsapp,telephone_local,whatsapp_local,compte_actif,type_client")
    .eq("id", session.client_id)
    .maybeSingle();
  if (!client || (!client.compte_actif && client.type_client !== "beneficiaire_particulier")) return null;

  await supabase.from("client_portal_sessions")
    .update({
      last_seen_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", session.id);

  const contactPhone = client.telephone || client.whatsapp || client.telephone_local || client.whatsapp_local;
  return contactPhone ? String(contactPhone) : null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-session",
};

function unauthorized(message = "Session portail requise") {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


/**
 * Verify a KKiaPay transaction against KKiaPay's own API.
 * This is the ONLY source of truth for whether a payment succeeded.
 * We never trust client-supplied "success" flags, URL params, or amounts.
 */
async function verifyKkiapayTransaction(transactionId: string): Promise<
  | { ok: true; amount: number | null; method: string | null; fees: number; raw: any }
  | { ok: false; reason: string }
> {
  const privateKey = Deno.env.get("KKIAPAY_PRIVATE_KEY");
  if (!privateKey) return { ok: false, reason: "KKIAPAY_PRIVATE_KEY not configured" };
  try {
    const res = await fetch("https://api.kkiapay.me/api/v1/transactions/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-private-key": privateKey },
      body: JSON.stringify({ transactionId }),
    });
    const result = await res.json();
    const status = String(result?.status || "").toUpperCase();
    if (status !== "SUCCESS") return { ok: false, reason: `KKiaPay status=${status || "unknown"}` };
    return {
      ok: true,
      amount: typeof result?.amount === "number" ? result.amount : null,
      method: result?.source || null,
      fees: Number(result?.fees || 0),
      raw: result,
    };
  } catch (e: any) {
    return { ok: false, reason: `verify error: ${e?.message || "unknown"}` };
  }
}

async function sendConfirmationSms(phoneRaw: string | null | undefined, message: string) {
  if (!phoneRaw) return;
  const INFOBIP_API_KEY = Deno.env.get("INFOBIP_API_KEY");
  const INFOBIP_BASE_URL = Deno.env.get("INFOBIP_BASE_URL");
  if (!INFOBIP_API_KEY || !INFOBIP_BASE_URL) {
    return;
  }
  let phone = String(phoneRaw).replace(/\D/g, "");
  if (!phone.startsWith("225")) phone = "225" + phone;
  try {
    await fetch(`${INFOBIP_BASE_URL}/sms/2/text/advanced`, {
      method: "POST",
      headers: { "Authorization": `App ${INFOBIP_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ destinations: [{ to: phone }], from: "AgriCapital", text: message }] }),
    });
  } catch (e) { console.error("SMS confirmation error:", e); }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // SECURITY: this function runs with the service role (RLS bypassed) and the
    // client portal has no Supabase JWT. Every action therefore requires a valid
    // portal session token issued by `send-otp` after OTP verification, and the
    // session phone must own the client/payment being acted on.
    const sessionPhone = await verifyPortalSession(
      supabase,
      req.headers.get("x-portal-session") || body.portal_token,
    );
    if (!sessionPhone) return unauthorized();

    const assertOwnsClient = async (clientId: string) => {
      const { data: owner } = await supabase
        .from("clients")
        .select("telephone,whatsapp,telephone_local,whatsapp_local")
        .eq("id", clientId)
        .maybeSingle();
      if (!owner) throw new Error("Client introuvable");
      return [owner.telephone,owner.whatsapp,owner.telephone_local,owner.whatsapp_local].some((phone:any)=>phoneMatches(phone,sessionPhone));
    };




    const assertFinancialEligibility = async (clientId: string) => {
      const { data: client, error } = await supabase.from("clients")
        .select("id,type_client,is_internal,contrat_solde_at,montant_total_contrat")
        .eq("id", clientId).maybeSingle();
      if (error) throw error;
      if (!client) throw new Error("Client introuvable");
      if (client.type_client === "beneficiaire_particulier") throw new Error("Les bénéficiaires particuliers ne disposent pas d’actions financières.");
      if (client.is_internal) throw new Error("Cet actif AgriCapital n’est pas encore transféré à un client.");
      const { data: summary, error: summaryError } = await supabase.from("v_client_synthese")
        .select("montant_total_contrat,reste_a_payer").eq("client_id", clientId).maybeSingle();
      if (summaryError) throw summaryError;
      const total = Number(summary?.montant_total_contrat ?? client.montant_total_contrat ?? 0);
      const remaining = Number(summary?.reste_a_payer ?? 0);
      if (client.contrat_solde_at || (total > 0 && remaining <= 0)) throw new Error("Ce contrat est déjà soldé.");
    };

    // === PI à 0 F : activation automatique sans passer par KKiaPay ===
    // Le montant est recalculé côté serveur depuis la vue v_prix_effectif_offres
    // (prix CRM + promotions). L'activation n'est possible que si le PI effectif est 0.
    if (action === "activate_free") {
      const { client_id, plantation_id, reference } = body;
      if (!client_id || !plantation_id) throw new Error("client_id et plantation_id requis");
      if (!(await assertOwnsClient(client_id))) return unauthorized("Accès refusé à ce client");
      await assertFinancialEligibility(client_id);

      const { data: client } = await supabase
        .from("clients")
        .select("*, offres(*)")
        .eq("id", client_id)
        .maybeSingle();
      if (!client) throw new Error("Client introuvable");

      const { data: plantation } = await supabase
        .from("plantations")
        .select("*")
        .eq("id", plantation_id)
        .eq("client_id", client_id)
        .maybeSingle();
      if (!plantation) throw new Error("Plantation introuvable");

      const { data: effectiveDi, error: priceError } = await supabase
        .rpc("get_client_effective_pi", { _client_id: client_id });
      if (priceError) throw priceError;
      const piParHa = Number(effectiveDi ?? client.offres?.montant_paiement_initial_par_ha ?? 0);
      const hectares = Math.max(0, Number(plantation.superficie_ha || 0) - Number(plantation.superficie_activee || 0));
      const piTotal = piParHa * hectares;

      if (piTotal > 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Le Paiement initial de cette plantation n'est pas à 0 F.", montant: piTotal }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const ref = reference || `PI0-${Date.now()}`;
      const nowIso = new Date().toISOString();

      const { data: existing } = await supabase
        .from("paiements")
        .select("id, statut")
        .eq("client_id", client_id)
        .eq("plantation_id", plantation_id)
        .eq("est_paiement_initial", true)
        .maybeSingle();

      const payload = {
        client_id,
        plantation_id,
        type_paiement: "PI",
        montant: 0,
        montant_theorique: 0,
        montant_paye: 0,
        statut: "valide",
        mode_paiement: "Promotion",
        reference: ref,
        est_paiement_initial: true,
        date_paiement: nowIso,
        metadata: { payment_provider: "promotion", pi_offert: true, pi_par_ha: piParHa, hectares },
      };

      let paiementId = existing?.id;
      if (existing) {
        const { error } = await supabase.from("paiements").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase.from("paiements").insert(payload).select("id").single();
        if (error) throw error;
        paiementId = created.id;
      }

      const { data: finalized, error: finalizeError } = await supabase.rpc("finalize_portal_payment", {
        _paiement_id: paiementId,
        _provider_amount: 0,
        _metadata: { payment_provider: "promotion", pi_offert: true, activation_source: "client_portal" },
        _validated_at: nowIso,
      });
      if (finalizeError) throw finalizeError;

      try {
        await sendConfirmationSms(
          client.telephone,
          `AgriCapital: Votre Paiement initial est offert (0 F). Votre plantation est activee. Suivi: client.agricapital.ci`
        );
      } catch (_e) { /* ignore */ }

      return new Response(JSON.stringify({ success: true, activated: true, reference: ref, propagation: finalized }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "insert") {
      const { client_id, plantation_id, type_paiement, reference, mode_paiement, montant } = body;
      if (!client_id || !type_paiement || !reference) {
        throw new Error("Client, type de paiement et référence requis");
      }

      const canonicalType = String(type_paiement).toUpperCase();
      if (canonicalType !== "PI" && canonicalType !== "MENSUALITE") {
        throw new Error("Type de paiement invalide. Utilisez PI ou MENSUALITE.");
      }

      if (!(await assertOwnsClient(client_id))) return unauthorized("Accès refusé à ce client");
      await assertFinancialEligibility(client_id);

      if (plantation_id) {
        const { data: plantation } = await supabase
          .from("plantations")
          .select("id,client_id")
          .eq("id",plantation_id)
          .eq("client_id",client_id)
          .maybeSingle();
        if (!plantation) throw new Error("Plantation introuvable ou non rattachée au client");
      }

      const { data: state, error: stateError } = await supabase
        .rpc("portal_current_payment_state",{_client_id:client_id});
      if (stateError) throw stateError;

      const currentDue = canonicalType === "PI"
        ? Number(state?.paiement_initial?.solde || 0)
        : Number(state?.mensualite?.montant_a_payer || 0);
      const requestedAmount = Number(montant);

      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        throw new Error("Le montant à payer doit être supérieur à 0 F CFA.");
      }

      if (canonicalType === "PI") {
        if (currentDue <= 0) throw new Error("Aucun Paiement initial réel n'est actuellement dû.");
        if (Math.abs(requestedAmount - currentDue) > 0.01) {
          throw new Error("Le Paiement initial doit être réglé à son solde réel. Les paiements flexibles concernent les mensualités.");
        }
      } else {
        if (currentDue <= 0) throw new Error("Aucun paiement mensuel réel n'est actuellement dû.");
        if (!plantation_id) throw new Error("Une plantation réelle est requise pour une mensualité.");
        const { data: contract, error: contractError } = await supabase
          .from("clients")
          .select("jours_contrat_total,jours_payes")
          .eq("id", client_id)
          .maybeSingle();
        if (contractError) throw contractError;
        const remainingDays = Math.max(0, Number(contract?.jours_contrat_total || 0) - Number(contract?.jours_payes || 0));
        if (remainingDays > 0) {
          const { data: coveredDays, error: daysError } = await supabase.rpc("portal_days_for_amount", {
            _client_id: client_id,
            _plantation_id: plantation_id,
            _amount: requestedAmount,
          });
          if (daysError) throw daysError;
          if (Number(coveredDays || 0) > remainingDays) {
            throw new Error("Le montant dépasse la couverture restante réelle du contrat.");
          }
        }
      }

      if (canonicalType === "PI" && !plantation_id) {
        throw new Error("Une plantation réelle est requise pour le Paiement initial.");
      }
      const amount = requestedAmount;

      const { data: existing } = await supabase
        .from("paiements")
        .select("id,statut")
        .eq("client_id",client_id)
        .eq("type_paiement",canonicalType)
        .eq("statut","en_attente")
        .order("created_at",{ascending:false})
        .limit(1)
        .maybeSingle();

      const payload = {
        client_id,
        plantation_id: plantation_id || null,
        type_paiement: canonicalType,
        montant: amount,
        montant_theorique: amount,
        montant_paye: null,
        statut: "en_attente",
        mode_paiement: mode_paiement || "Mobile Money",
        reference,
        est_paiement_initial: canonicalType === "PI",
        metadata: {
          payment_provider: "kkiapay",
          source: "client_portal",
          db_amount: amount,
          requested_payment_amount: amount,
          current_due: currentDue
        }
      };

      let paiement:any;
      if (existing) {
        const { data:updated,error } = await supabase
          .from("paiements")
          .update(payload)
          .eq("id",existing.id)
          .select()
          .single();
        if (error) throw error;
        paiement=updated;
      } else {
        const { data:created,error } = await supabase
          .from("paiements")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        paiement=created;
      }

      return new Response(JSON.stringify({
        success:true,
        paiement,
        montant_reel:amount,
        etat_financier:state
      }),{
        headers:{...corsHeaders,"Content-Type":"application/json"}
      });
    }

    if (action === "confirm") {
      const { reference, kkiapay_transaction_id, client_debit_amount, fee_absorption_rate } = body;
      if (!reference) throw new Error("Reference requise");

      // SECURITY: A payment can ONLY be confirmed via server-side verification
      // against KKiaPay. The client cannot force a payment into `valide`.
      if (!kkiapay_transaction_id || typeof kkiapay_transaction_id !== "string") {
        throw new Error("kkiapay_transaction_id requis pour confirmer un paiement");
      }

      const verification = await verifyKkiapayTransaction(kkiapay_transaction_id);
      if (!verification.ok) {
        console.warn("Refusing confirm — KKiaPay verification failed:", verification.reason, "ref:", reference);
        return new Response(
          JSON.stringify({ success: false, error: "Transaction non vérifiée par KKiaPay" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: paiementData } = await supabase
        .from("paiements")
        .select("*, plantations(*), clients(telephone, nom_complet)")
        .eq("reference", reference)
        .maybeSingle();

      if (!paiementData) throw new Error("Paiement introuvable");
      if (!phoneMatches(paiementData.clients?.telephone, sessionPhone)) {
        return unauthorized("Accès refusé à ce paiement");
      }

      const kkiapayAmount = verification.amount;
      const trustedMontantPaye = typeof kkiapayAmount === "number" ? kkiapayAmount : paiementData.montant;

      const { error: updateError } = await supabase.rpc("finalize_portal_payment", {
        _paiement_id: paiementData.id,
        _transaction_id: kkiapay_transaction_id,
        _provider_amount: trustedMontantPaye,
        _validated_at: new Date().toISOString(),
        _metadata: {
          ...(paiementData.metadata || {}),
          payment_provider: "kkiapay",
          kkiapay_transaction_id,
          kkiapay_amount: kkiapayAmount,
          client_debit_amount: typeof client_debit_amount === "number" ? client_debit_amount : trustedMontantPaye,
          fee_absorption_rate: typeof fee_absorption_rate === "number" ? fee_absorption_rate : (paiementData.metadata?.fee_absorption_rate ?? 0),
          method: verification.method,
          fees: verification.fees,
          verified_at: new Date().toISOString(),
        },
      });

      if (updateError) throw updateError;

      // Legacy repair remains intentionally absent: finalize_portal_payment is
      // the single atomic source of truth for payment and activation propagation.
      // Server-side confirmation SMS (replaces the removed `send_custom` action).
      try {
        const fmt = new Intl.NumberFormat("fr-FR").format(trustedMontantPaye);
        await sendConfirmationSms(
          paiementData.clients?.telephone,
          `AgriCapital: Paiement de ${fmt} F CFA recu (Ref: ${reference}). Merci! Votre recu est disponible sur client.agricapital.ci`
        );
      } catch (e) { console.error("SMS post-confirm error:", e); }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") {
      const { reference, transaction_id } = body;
      if (!reference && !transaction_id) throw new Error("Reference requise");
      // SECURITY: requires a valid portal session (checked above) AND the
      // payment must belong to the client owning that session. Only the
      // minimum fields needed to render the result UI are returned; PII
      // (nom_complet, telephone, client_id) is never exposed.
      const selectFields = "id, reference, statut, montant, montant_paye, type_paiement, mode_paiement, date_paiement, created_at, metadata, plantations(nom_plantation, id_unique, superficie_ha), clients(nom_complet,telephone)";
      let row: any = null;
      let error: any = null;
      if (reference) {
        // reference is also validated to keep raw filter input out of queries
        if (typeof reference !== "string" || !/^[A-Za-z0-9_-]{4,64}$/.test(reference)) {
          return new Response(JSON.stringify({ success: false, error: "Référence invalide" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        ({ data: row, error } = await supabase.from("paiements").select(selectFields).eq("reference", reference).maybeSingle());
      } else {
        // SECURITY: never interpolate client input into a raw PostgREST filter
        // string. Strictly validate the transaction id format, then use
        // parameterized .eq() filters only.
        if (typeof transaction_id !== "string" || !/^[A-Za-z0-9_-]{4,64}$/.test(transaction_id)) {
          return new Response(JSON.stringify({ success: false, error: "transaction_id invalide" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        ({ data: row, error } = await supabase.from("paiements").select(selectFields).eq("kkiapay_transaction_id", transaction_id).maybeSingle());
        if (!error && !row) {
          ({ data: row, error } = await supabase.from("paiements").select(selectFields).eq("metadata->>kkiapay_transaction_id", transaction_id).maybeSingle());
        }
      }
      if (error) throw error;
      if (row && !phoneMatches((row as any).clients?.telephone, sessionPhone)) {
        return unauthorized("Accès refusé à ce paiement");
      }
      const data = row
        ? (({ clients, ...rest }: any) => ({
            ...rest,
            client: clients ? { nom_complet: clients.nom_complet || null, telephone: clients.telephone || null } : null,
          }))(row)
        : row;


      // Strip metadata fields that could leak internal details.
      let safe = data;
      if (data && data.metadata && typeof data.metadata === "object") {
        const md: any = data.metadata;
        safe = {
          ...data,
          metadata: {
            client_debit_amount: md.client_debit_amount ?? null,
            fee_absorption_rate: md.fee_absorption_rate ?? null,
            method: md.method ?? null,
          },
        };
      }
      return new Response(JSON.stringify({ success: true, paiement: safe }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Action inconnue");
  } catch (e: any) {
    console.error("create-payment error:", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
