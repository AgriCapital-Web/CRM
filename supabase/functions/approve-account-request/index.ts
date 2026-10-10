import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (p: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(p), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let step = "init";
  const logs: string[] = [];
  const log = (m: string) => { logs.push(`[${new Date().toISOString()}] ${m}`); console.log("approve-account-request", m); };

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    step = "auth_caller";
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Non authentifié", step, logs }, 401);
    const { data: caller } = await admin.auth.getUser(token);
    if (!caller?.user) return json({ error: "Session invalide", step, logs }, 401);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: caller.user.id });
    if (!isAdmin) return json({ error: "Accès réservé aux administrateurs", step, logs }, 403);
    log(`caller=${caller.user.email}`);

    step = "parse_body";
    const { request_id, action, role, motif_rejet } = await req.json();
    if (!request_id || !action) return json({ error: "request_id et action requis", step, logs }, 400);
    log(`action=${action} request_id=${request_id} role=${role ?? "(défaut)"}`);

    step = "load_request";
    const { data: reqRow, error: reqErr } = await admin
      .from("account_requests").select("*").eq("id", request_id).maybeSingle();
    if (reqErr) return json({ error: reqErr.message, step, logs }, 400);
    if (!reqRow) return json({ error: "Demande introuvable", step, logs }, 404);

    if (action === "delete") {
      step = "delete";
      if (reqRow.auth_user_id && reqRow.statut !== "approuve") {
        await admin.auth.admin.deleteUser(reqRow.auth_user_id).catch(() => {});
      }
      const { error } = await admin.from("account_requests").delete().eq("id", request_id);
      if (error) return json({ error: error.message, step, logs }, 400);
      return json({ success: true, deleted: true, logs });
    }

    if (action === "reject") {
      step = "reject";
      if (reqRow.auth_user_id) {
        await admin.auth.admin.deleteUser(reqRow.auth_user_id).catch(() => {});
        await admin.from("profiles").delete().eq("id", reqRow.auth_user_id);
      }
      const { error } = await admin.from("account_requests").update({
        statut: "rejete",
        motif_rejet: motif_rejet ?? null,
        traite_par: caller.user.id,
        traite_le: new Date().toISOString(),
      }).eq("id", request_id);
      if (error) return json({ error: error.message, step, logs }, 400);
      return json({ success: true, rejected: true, logs });
    }

    if (action !== "approve") return json({ error: `Action inconnue: ${action}`, step, logs }, 400);

    // Le rôle demandé par le demandeur n'est jamais fiable : l'admin doit choisir
    // explicitement un rôle, validé ici contre une liste blanche.
    const LEGACY_ROLE_MAP: Record<string, string> = {
      superviseur_tc: "responsable_commercial",
      responsable_zone: "responsable_commercial",
      responsable_technique_agronomique: "responsable_operations",
      operations: "responsable_operations",
      chef_equipe: "chef_equipe_commercial",
      technicien: "chef_equipe_technique",
      agent_service_client: "service_client",
      assistant: "assistant_administratif",
      assistante: "assistant_administratif",
      secretaire: "assistant_administratif",
      raf: "comptable",
    };
    const ASSIGNABLE_ROLES = new Set([
      "responsable_operations", "directeur_tc", "responsable_commercial", "comptable",
      "chef_equipe_commercial", "chef_equipe_technique", "chef_equipe_service_client",
      "commercial", "service_client", "assistant_administratif",
    ]);
    const requested = role || reqRow.role_souhaite;
    const finalRole = LEGACY_ROLE_MAP[requested] ?? requested;
    if (!finalRole) return json({ error: "Aucun rôle à attribuer", step: "resolve_role", logs }, 400);
    if (finalRole === "super_admin") {
      return json({ error: "Le rôle super_admin ne peut pas être attribué via une demande de compte.", step: "resolve_role", logs }, 403);
    }
    if (!ASSIGNABLE_ROLES.has(finalRole)) {
      return json({ error: `Rôle non autorisé à l'attribution: ${finalRole}`, step: "resolve_role", logs }, 400);
    }

    let userId: string | null = reqRow.auth_user_id;
    let tempPassword: string | null = null;

    // L'adresse email du demandeur doit être vérifiée avant toute activation.
    if (userId) {
      step = "check_email_verified";
      const { data: existingUser } = await admin.auth.admin.getUserById(userId);
      if (!existingUser?.user?.email_confirmed_at) {
        return json({
          error: "Adresse email non vérifiée : le demandeur doit confirmer son email avant validation.",
          step,
          logs,
        }, 409);
      }
    }



    if (!userId) {
      step = "find_existing_auth_user";
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === String(reqRow.email).toLowerCase());
      if (existing) {
        userId = existing.id;
        log(`compte auth existant réutilisé: ${userId}`);
      } else {
        step = "create_auth_user";
        tempPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 14) + "A1!";
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: reqRow.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { nom_complet: reqRow.nom_complet, username: reqRow.username ?? undefined },
        });
        if (cErr) return json({ error: cErr.message, step, logs }, 400);
        userId = created.user!.id;
        log(`compte auth créé: ${userId}`);
      }
    }

    step = "upsert_profile";
    const profilePayload = {
      user_id: userId,
      email: reqRow.email,
      nom_complet: reqRow.nom_complet,
      telephone: reqRow.telephone,
      username: reqRow.username ?? String(reqRow.email).split("@")[0],
      poste: reqRow.poste_souhaite,
      district_id: reqRow.district_id,
      region_id: reqRow.region_id,
      actif: true,
    };
    const { data: linkedProfile, error: linkedProfileError } = await admin
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (linkedProfileError) return json({ error: `Profil: ${linkedProfileError.message}`, step, logs }, 400);
    const profileWrite = linkedProfile
      ? await admin.from("profiles").update(profilePayload).eq("user_id", userId)
      : await admin.from("profiles").insert({ id: userId, ...profilePayload });
    if (profileWrite.error) return json({ error: `Profil: ${profileWrite.error.message}`, step, logs }, 400);

    step = "assign_role";
    const { error: roleErr } = await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: finalRole }, { onConflict: "user_id,role" });
    if (roleErr) return json({ error: `Attribution du rôle impossible: ${roleErr.message}`, step, logs }, 400);

    step = "verify_role";
    const { data: rolesAfter } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const assigned = (rolesAfter ?? []).map((r: any) => r.role);
    if (!assigned.includes(finalRole)) {
      return json({ error: `Rôle non persisté (${finalRole}). Rôles actuels: ${assigned.join(", ") || "aucun"}`, step, logs }, 500);
    }
    log(`rôles après attribution: ${assigned.join(", ")}`);

    step = "update_request";
    const { error: updErr } = await admin.from("account_requests").update({
      statut: "approuve",
      auth_user_id: userId,
      role_souhaite: finalRole,
      traite_par: caller.user.id,
      traite_le: new Date().toISOString(),
    }).eq("id", request_id);
    if (updErr) return json({ error: updErr.message, step, logs }, 400);

    return json({ success: true, user_id: userId, role: finalRole, roles: assigned, temp_password: tempPassword, logs });
  } catch (e) {
    console.error("approve-account-request error", step, e);
    return json({ error: (e as Error).message, step, logs }, 500);
  }
});
