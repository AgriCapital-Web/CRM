import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12); crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("") + "!7";
}

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
    const { data: canManageRequests, error: permissionError } = await admin.rpc("user_has_app_permission", {
      _user_id: caller.user.id,
      _required_code: "parametres.manage_users",
    });
    if (permissionError) {
      return json({ error: `Vérification des permissions impossible: ${permissionError.message}`, step, logs }, 500);
    }
    if (canManageRequests !== true) {
      return json({ error: "Accès réservé aux utilisateurs autorisés à gérer les comptes.", step, logs }, 403);
    }
    log(`caller=${caller.user.id}`);

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

    // Le rôle attribué est vérifié dans le catalogue actif de la base,
    // sans liste de rôles codée en dur. Les rôles de gouvernance restent protégés.
    const LEGACY_ROLE_MAP: Record<string, string> = {
      superviseur_tc: "responsable_commercial",
      responsable_zone: "responsable_district",
      responsable_technique_agronomique: "responsable_technique_agronomique",
      chef_equipe: "chef_equipe_commercial",
      assistant: "assistant_administratif",
      assistante: "assistant_administratif",
      secretaire: "assistant_administratif",
      raf: "comptable",
    };
    const requested = String(role || reqRow.role_souhaite || "").trim();
    const finalRole = LEGACY_ROLE_MAP[requested] ?? requested;
    if (!finalRole) return json({ error: "Aucun rôle à attribuer", step: "resolve_role", logs }, 400);
    step = "validate_role_catalog";
    const { data: roleRecord, error: roleCatalogError } = await admin
      .from("app_roles")
      .select("code,actif")
      .eq("code", finalRole)
      .eq("actif", true)
      .maybeSingle();
    if (roleCatalogError) return json({ error: `Vérification du rôle impossible: ${roleCatalogError.message}`, step, logs }, 500);
    if (!roleRecord) return json({ error: `Le rôle choisi n'existe pas ou n'est pas actif: ${finalRole}`, step, logs }, 400);

    const { data: canAssignRole, error: assignRolePermissionError } = await admin.rpc("user_can_assign_app_role", {
      p_actor_user_id: caller.user.id,
      p_role_code: finalRole,
    });
    if (assignRolePermissionError) return json({ error: "Vérification du rôle attribuable impossible.", step, logs }, 500);
    if (canAssignRole !== true) return json({ error: "Ce rôle ne peut pas être attribué par votre compte.", step, logs }, 403);

    const { data: canCreateAccount, error: createPermissionError } = await admin.rpc("user_can_manage_admin_action", {
      p_actor_user_id: caller.user.id,
      p_target_user_id: reqRow.auth_user_id || null,
      p_action: "create_user",
    });
    if (createPermissionError) return json({ error: "Vérification de la permission de création impossible.", step, logs }, 500);
    if (canCreateAccount !== true) return json({ error: "Permission de création de compte insuffisante.", step, logs }, 403);

    let userId: string | null = reqRow.auth_user_id;
    let tempPassword: string | null = null;

    // La validation du PDG/administrateur constitue la validation du compte :
    // aucune confirmation email séparée n'est demandée à l'utilisateur.
    if (userId) {
      step = "confirm_email_on_approval";
      const { data: existingUser, error: existingUserError } = await admin.auth.admin.getUserById(userId);
      if (existingUserError || !existingUser?.user) {
        return json({ error: "Compte d'authentification introuvable.", step, logs }, 404);
      }
      if (!existingUser.user.email_confirmed_at) {
        const { data: confirmedUser, error: confirmError } = await admin.auth.admin.updateUserById(userId, {
          email_confirm: true,
        });
        if (confirmError) {
          return json({ error: `Impossible de confirmer l'email lors de l'approbation : ${confirmError.message}`, step, logs }, 400);
        }
        if (!confirmedUser.user.email_confirmed_at) {
          return json({ error: "La confirmation email n'a pas été enregistrée.", step, logs }, 500);
        }
        log(`email confirmé par l'approbation administrative: ${userId}`);
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
        tempPassword = generateTempPassword();
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
      telephone_indicatif: reqRow.telephone_indicatif ?? null,
      telephone_local: reqRow.telephone_local ?? reqRow.telephone ?? null,
      username: reqRow.username ?? String(reqRow.email).split("@")[0],
      poste: reqRow.poste_souhaite || finalRole,
      photo_url: reqRow.photo_url ?? null,
      district_id: reqRow.district_id,
      region_id: reqRow.region_id,
      actif: true,
      password_change_required: Boolean(tempPassword),
    };
    const { data: linkedProfile, error: linkedProfileError } = await admin
      .from("profiles").select("id,user_id,photo_url").eq("user_id", userId).maybeSingle();
    if (linkedProfileError) return json({ error: `Profil: ${linkedProfileError.message}`, step, logs }, 400);
    if (linkedProfile) {
      const { error: profileUpdateError } = await admin.from("profiles").update({
        email: profilePayload.email,
        nom_complet: profilePayload.nom_complet,
        telephone: profilePayload.telephone,
        telephone_indicatif: profilePayload.telephone_indicatif,
        telephone_local: profilePayload.telephone_local,
        username: profilePayload.username,
        poste: profilePayload.poste,
        photo_url: profilePayload.photo_url ?? linkedProfile.photo_url ?? null,
        district_id: profilePayload.district_id,
        region_id: profilePayload.region_id,
        password_change_required: Boolean(tempPassword),
      }).eq("user_id", userId);
      if (profileUpdateError) return json({ error: `Profil: ${profileUpdateError.message}`, step, logs }, 400);
    } else {
      const { error: profileInsertError } = await admin.from("profiles").insert({ id: userId, ...profilePayload });
      if (profileInsertError) return json({ error: `Profil: ${profileInsertError.message}`, step, logs }, 400);
    }
    step = "activate_profile";
    const { data: activationRows, error: activationError } = await admin.rpc("admin_set_profile_active_authorized", {
      p_user_id: userId,
      p_actif: true,
      p_actor_user_id: caller.user.id,
    });
    if (activationError) return json({ error: `Activation du profil: ${activationError.message}`, step, logs }, 400);
    const activeProfile = (activationRows ?? []).find((p: any) => p.user_id === userId || p.profile_id === userId);
    if (!activeProfile || activeProfile.actif !== true) {
      return json({ error: "Le compte n'a pas été activé de façon persistante.", step, logs }, 500);
    }

    step = "assign_role";
    const { error: roleErr } = await admin.rpc("admin_set_user_roles_with_primary_authorized", {
      p_user_id: userId,
      p_roles: [finalRole],
      p_primary_role: finalRole,
      p_actor_user_id: caller.user.id,
    });
    if (roleErr) return json({ error: `Attribution du rôle impossible: ${roleErr.message}`, step, logs }, 400);

    step = "verify_role";
    const { data: rolesAfter, error: rolesAfterError } = await admin.from("user_roles").select("role,is_primary").eq("user_id", userId);
    if (rolesAfterError) return json({ error: `Vérification des rôles impossible: ${rolesAfterError.message}`, step, logs }, 400);
    const assigned = (rolesAfter ?? []).map((r: any) => r.role);
    const primaryAfter = (rolesAfter ?? []).find((r: any) => r.is_primary === true)?.role;
    if (!assigned.includes(finalRole) || primaryAfter !== finalRole) {
      return json({ error: `Rôle ou rôle principal non persisté. Rôle demandé: ${finalRole}; principal actuel: ${primaryAfter ?? "aucun"}`, step, logs }, 500);
    }
    log(`rôles après attribution: ${assigned.join(", ")}`);

    step = "update_request";
    const { data: updatedRequest, error: updErr } = await admin.from("account_requests").update({
      statut: "approuve",
      auth_user_id: userId,
      role_souhaite: finalRole,
      traite_par: caller.user.id,
      traite_le: new Date().toISOString(),
    }).eq("id", request_id).select("id,statut,auth_user_id").maybeSingle();
    if (updErr) return json({ error: updErr.message, step, logs }, 400);
    if (!updatedRequest || updatedRequest.statut !== "approuve" || updatedRequest.auth_user_id !== userId) {
      return json({ error: "La demande n'a pas été enregistrée comme approuvée.", step, logs }, 500);
    }
    const { data: finalProfile } = await admin.from("profiles").select("actif").eq("user_id", userId).maybeSingle();
    if (finalProfile?.actif !== true) {
      return json({ error: "La demande a été traitée mais le profil reste inactif. L'activation n'a pas été confirmée.", step: "verify_activation", logs }, 500);
    }

    return json({ success: true, user_id: userId, role: finalRole, roles: assigned, actif: finalProfile.actif, request_status: updatedRequest.statut, temp_password: tempPassword, logs });
  } catch (e) {
    console.error("approve-account-request error", step, e);
    return json({ error: (e as Error).message, step, logs }, 500);
  }
});
