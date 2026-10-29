import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};


/** Autorise soit un administrateur authentifié, soit un appel interne (service role / secret cron). */
async function authorize(req: Request, admin: any): Promise<Response | null> {
  const deny = (msg: string, status: number) =>
    new Response(JSON.stringify({ success: false, error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (serviceKey && bearer === serviceKey) return null;
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) return null;
  if (!bearer) return deny("Non authentifié", 401);

  const { data } = await admin.auth.getUser(bearer);
  const user = data?.user;
  if (!user) return deny("Session invalide", 401);
  const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: user.id });
  if (!isAdmin) return deny("Accès réservé aux administrateurs", 403);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const denied = await authorize(req, supabase);
    if (denied) return denied;

    // Find overdue payments (past due date, still pending)
    const today = new Date().toISOString().split("T")[0];

    const { data: overduePaiements, error: pErr } = await supabase
      .from("paiements")
      .select(`
        id, montant, date_echeance, reference, type_paiement,
        souscripteur_id,
        souscripteurs (id, nom_complet, telephone, user_id)
      `)
      .in("statut", ["en_attente", "partiel"])
      .lt("date_echeance", today)
      .order("date_echeance", { ascending: true })
      .limit(100);

    if (pErr) throw pErr;

    const notifications: any[] = [];
    const summary = { total: overduePaiements?.length || 0, notified: 0 };

    for (const paiement of overduePaiements || []) {
      const souscripteur = paiement.souscripteurs as any;
      if (!souscripteur) continue;

      const daysPastDue = Math.floor(
        (new Date().getTime() - new Date(paiement.date_echeance).getTime()) / (1000 * 60 * 60 * 24)
      );

      let priority = "info";
      if (daysPastDue > 30) priority = "urgent";
      else if (daysPastDue > 14) priority = "warning";

      // Create notification for the subscriber if they have a user_id
      if (souscripteur.user_id) {
        notifications.push({
          user_id: souscripteur.user_id,
          type: "paiement_retard",
          title: `Paiement en retard - ${daysPastDue} jour(s)`,
          message: `AgriCapital · Notification automatique : le paiement de ${paiement.montant.toLocaleString()} F CFA (réf. ${paiement.reference || "N/A"}) présente ${daysPastDue} jour(s) de retard. Consultez votre espace pour régulariser.`,
          data: {
            paiement_id: paiement.id,
            dedupe_key: `payment-overdue:${paiement.id}:${today}`,
            montant: paiement.montant,
            days_overdue: daysPastDue,
            priority,
          },
        });
      }

      // Notify hierarchy (admins, managers)
      await supabase.rpc("notify_hierarchy", {
        p_type: "paiement_retard",
        p_title: `Retard de paiement - ${souscripteur.nom_complet}`,
        p_message: `Paiement de ${paiement.montant.toLocaleString()} FCFA en retard de ${daysPastDue} jour(s) pour ${souscripteur.nom_complet} (${souscripteur.telephone})`,
        p_data: {
          paiement_id: paiement.id,
          souscripteur_id: souscripteur.id,
          montant: paiement.montant,
          days_overdue: daysPastDue,
          priority,
        },
      });

      // Flag plantation for non-payment alert
      if (daysPastDue > 7) {
        await supabase
          .from("plantations")
          .update({ alerte_non_paiement: true })
          .eq("souscripteur_id", souscripteur.id);
      }

      summary.notified++;
    }

    // Bulk insert subscriber notifications
    if (notifications.length > 0) {
      await supabase.from("notifications").upsert(notifications, { onConflict: "dedupe_key", ignoreDuplicates: true });
    }

    return new Response(JSON.stringify({
      success: true,
      summary,
      message: `${summary.notified} relance(s) envoyée(s) sur ${summary.total} paiement(s) en retard`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("payment-reminders error", error);
    return new Response(JSON.stringify({ error: "Erreur interne" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
