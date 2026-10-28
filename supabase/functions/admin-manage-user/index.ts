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
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    step = "auth_caller";
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Non authentifié", step }, 401);
    const { data: caller } = await admin.auth.getUser(token);
    if (!caller?.user) return json({ error: "Session invalide", step }, 401);
    step = "parse_body";
    const { action, user_id, password, username, email, nom_complet, nom, prenoms, telephone, telephone_indicatif, telephone_local, telephone_principal_whatsapp, telephone_secondaire, telephone_secondaire_local, telephone_secondaire_indicatif, telephone_secondaire_whatsapp, whatsapp, whatsapp_indicatif, whatsapp_local, departement, relation_rh, taux_commission, salaire_base, district_id, region_id, equipe_id, photo_url, type_piece_identite, numero_piece_identite, piece_identite_url, piece_identite_recto_url, piece_identite_verso_url, piece_identite_page_principale_url, roles, actif, primary_role } = await req.json();
    if (!action || (action !== "create_user" && !user_id)) return json({ error: "action requis et user_id obligatoire sauf pour create_user", step }, 400);

    if (action === "complete_forced_password_change") {
      if (caller.user.id !== user_id) return json({ error: "Action non autorisée", step }, 403);
      const { data: updated, error: clearError } = await admin
        .from("profiles")
        .update({ password_change_required: false })
        .or(`id.eq.${user_id},user_id.eq.${user_id}`)
        .select("id,user_id,password_change_required");
      if (clearError) return json({ error: clearError.message, step }, 400);
      if (!(updated || []).some((p: any) => p.password_change_required === false)) {
        return json({ error: "Impossible de confirmer la fin du changement de mot de passe.", step }, 500);
      }
      return json({ success: true, action, password_change_required: false });
    }

    const [{ data: isAdmin }, { data: isPdg }, { data: isSuperAdmin }] = await Promise.all([
      admin.rpc("is_admin", { _user_id: caller.user.id }),
      admin.rpc("has_role", { _user_id: caller.user.id, _role: "pdg" }),
      admin.rpc("has_role", { _user_id: caller.user.id, _role: "super_admin" }),
    ]);
    if (!isAdmin && !isPdg && !isSuperAdmin) {
      return json({ error: "Accès réservé au PDG ou à un administrateur autorisé", step }, 403);
    }

    if (action === "create_user") {
      step = "validate_create_user";
      const cleanEmail = String(email ?? "").trim().toLowerCase();
      const cleanUsername = String(username ?? "").trim().toLowerCase();
      const cleanName = String(nom_complet ?? "").trim();
      const roleList: string[] = Array.isArray(roles)
        ? Array.from(new Set(roles.filter((r: unknown): r is string => typeof r === "string" && r.trim().length > 0)))
        : [];
      const primaryRole = typeof primary_role === "string" && roleList.includes(primary_role) ? primary_role : roleList[0];
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return json({ error: "Adresse e-mail valide obligatoire.", step }, 400);
      if (!/^[a-z0-9._-]{2,64}$/.test(cleanUsername)) return json({ error: "Identifiant invalide (2 à 64 caractères : lettres, chiffres, point, tiret et soulignement).", step }, 400);
      if (cleanName.length < 2) return json({ error: "Le nom complet est obligatoire.", step }, 400);
      if (!roleList.length || !primaryRole) return json({ error: "Sélectionnez au moins un rôle et un rôle principal.", step }, 400);
      const forbiddenRoles = new Set(["pdg", "dg", "super_admin", "admin", "administrateur", "president", "président"]);
      if (roleList.some((r) => forbiddenRoles.has(r.toLowerCase()))) return json({ error: "Un rôle de gouvernance privilégiée ne peut pas être attribué par cette opération.", step }, 403);
      const { data: available, error: usernameError } = await admin.rpc("username_available", { _username: cleanUsername });
      if (usernameError) return json({ error: `Vérification de l'identifiant impossible : ${usernameError.message}`, step }, 400);
      if (available === false) return json({ error: "Cet identifiant est déjà utilisé.", step }, 409);
      const { data: rolesFound, error: rolesLookupError } = await admin.from("app_roles").select("code,actif").in("code", roleList);
      if (rolesLookupError) return json({ error: `Vérification des rôles impossible : ${rolesLookupError.message}`, step }, 400);
      const validRoles = new Set((rolesFound || []).filter((r: any) => r.actif === true).map((r: any) => String(r.code)));
      if (roleList.some((r) => !validRoles.has(r))) return json({ error: "Un ou plusieurs rôles sont inconnus ou inactifs.", step }, 400);
      const tempPassword = "Ac0000";
      step = "create_auth_user";
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { nom_complet: cleanName, username: cleanUsername },
      });
      if (createError || !created?.user?.id) return json({ error: createError?.message || "Création du compte Auth non confirmée.", step }, 400);
      const authId = created.user.id;
      try {
        step = "create_profile";
        const profilePayload: Record<string, unknown> = {
          id: authId,
          user_id: authId,
          email: cleanEmail,
          nom_complet: cleanName,
          nom: String(nom ?? "").trim().toLocaleUpperCase("fr-FR") || null,
          prenoms: String(prenoms ?? "").trim().toLocaleUpperCase("fr-FR") || null,
          username: cleanUsername,
          telephone: telephone ?? null,
          telephone_indicatif: telephone_indicatif ?? null,
          telephone_local: telephone_local ?? telephone ?? null,
          telephone_principal_whatsapp: telephone_principal_whatsapp === true,
          telephone_secondaire: telephone_secondaire ?? null,
          telephone_secondaire_local: telephone_secondaire_local ?? telephone_secondaire ?? null,
          telephone_secondaire_indicatif: telephone_secondaire_indicatif ?? null,
          telephone_secondaire_whatsapp: telephone_secondaire_whatsapp === true,
          whatsapp: whatsapp ?? null,
          whatsapp_indicatif: whatsapp_indicatif ?? null,
          whatsapp_local: whatsapp_local ?? null,
          departement: departement ?? null,
          relation_rh: relation_rh ?? "Employé",
          taux_commission: taux_commission == null || taux_commission === "" ? null : Number(taux_commission),
          salaire_base: salaire_base == null || salaire_base === "" ? null : Number(salaire_base),
          district_id: district_id ?? null,
          region_id: region_id ?? null,
          equipe_id: equipe_id ?? null,
          photo_url: photo_url ?? null,
          type_piece_identite: type_piece_identite ?? null,
          numero_piece_identite: numero_piece_identite ?? null,
          piece_identite_url: piece_identite_url ?? piece_identite_recto_url ?? null,
          piece_identite_recto_url: piece_identite_recto_url ?? piece_identite_url ?? null,
          piece_identite_verso_url: piece_identite_verso_url ?? null,
          piece_identite_page_principale_url: piece_identite_page_principale_url ?? null,
          poste: primaryRole,
          actif: true,
          type_compte: "interne",
          password_change_required: true,
        };
        const { error: profileError } = await admin.from("profiles").upsert(profilePayload, { onConflict: "id" });
        if (profileError) throw new Error("Profil : " + profileError.message);
        step = "assign_roles";
        const { error: roleError } = await admin.rpc("admin_set_user_roles_with_primary", {
          p_user_id: authId,
          p_roles: roleList,
          p_primary_role: primaryRole,
        });
        if (roleError) throw new Error("Attribution des rôles : " + roleError.message);
        step = "verify_created_account";
        const [{ data: profileCheck, error: profileCheckError }, { data: roleCheck, error: roleCheckError }] = await Promise.all([
          admin.from("profiles").select("id,user_id,actif,password_change_required").eq("user_id", authId).maybeSingle(),
          admin.from("user_roles").select("role,is_primary").eq("user_id", authId),
        ]);
        if (profileCheckError) throw new Error("Vérification du profil : " + profileCheckError.message);
        if (roleCheckError) throw new Error("Vérification des rôles : " + roleCheckError.message);
        const primaryRows = (roleCheck || []).filter((r: any) => r.is_primary === true);
        if (!profileCheck || profileCheck.actif !== true || profileCheck.password_change_required !== true || primaryRows.length !== 1 || primaryRows[0].role !== primaryRole) {
          throw new Error("Le compte, son activation, son obligation de changement de mot de passe ou son rôle principal n'a pas été confirmé.");
        }
        return json({ success: true, action, user_id: authId, roles: (roleCheck || []).map((r: any) => r.role), primary_role: primaryRole, actif: true, password_change_required: true, temp_password: tempPassword });
      } catch (error) {
        await admin.from("user_roles").delete().eq("user_id", authId).catch(() => {});
        await admin.from("profiles").delete().eq("user_id", authId).catch(() => {});
        await admin.auth.admin.deleteUser(authId).catch(() => {});
        throw error;
      }
    }

    if (action === "set_active") {
      step = "set_active";
      if (typeof actif !== "boolean") return json({ error: "Le statut actif doit être un booléen.", step }, 400);
      const { data: updatedProfiles, error: updateError } = await admin.rpc("admin_set_profile_active", {
        p_user_id: user_id,
        p_actif: actif,
      });
      if (updateError) return json({ error: updateError.message, step }, 400);
      const persisted = (updatedProfiles ?? []).find((p: any) => p.user_id === user_id || p.profile_id === user_id);
      if (!persisted) return json({ error: "Aucun profil correspondant à ce compte n'a été modifié.", step }, 404);
      if (persisted.actif !== actif) return json({ error: "Le statut du compte n'a pas été enregistré correctement.", step }, 500);
      return json({ success: true, action, user_id, actif: persisted.actif, profile_id: persisted.profile_id });
    }

    if (action === "set_password") {
      step = "set_password";
      if (typeof password !== "string" || password.length === 0) return json({ error: "Saisissez le nouveau mot de passe.", step }, 400);
      const { data: target, error: targetError } = await admin.auth.admin.getUserById(user_id);
      if (targetError || !target?.user) return json({ error: "Compte utilisateur introuvable.", step }, 404);
      const { error: passwordError } = await admin.auth.admin.updateUserById(user_id, { password });
      if (passwordError) return json({ error: passwordError.message, step }, 400);
      const { data: updatedProfiles, error: flagError } = await admin
        .from("profiles")
        .update({ password_change_required: true })
        .or(`id.eq.${user_id},user_id.eq.${user_id}`)
        .select("id,user_id,password_change_required");
      if (flagError) return json({ error: `Mot de passe modifié, mais obligation de changement non enregistrée: ${flagError.message}`, step: "set_password_flag" }, 400);
      if (!(updatedProfiles || []).some((p: any) => p.password_change_required === true)) return json({ error: "Mot de passe modifié, mais le profil ne permet pas d'enregistrer le changement obligatoire.", step: "verify_password_flag" }, 500);
      return json({ success: true, action, password_change_required: true });
    }

    if (action === "set_username") {
      step = "set_username";
      const clean = String(username ?? "").trim().toLowerCase();
      if (!/^[a-zA-Z0-9._-]{3,30}$/.test(clean)) {
        return json({ error: "Identifiant invalide (3 à 30 caractères : lettres, chiffres, . _ -)", step }, 400);
      }
      const { data: authTarget, error: authError } = await admin.auth.admin.getUserById(user_id);
      if (authError || !authTarget?.user) return json({ error: "Compte utilisateur introuvable.", step }, 404);
      const authId = authTarget.user.id;
      const { data: targetProfile, error: profileError } = await admin.from("profiles").select("id,user_id,username").or("id.eq." + authId + ",user_id.eq." + authId).limit(1).maybeSingle();
      if (profileError) return json({ error: profileError.message, step }, 400);
      if (!targetProfile) return json({ error: "Profil associé au compte introuvable.", step }, 404);
      const { data: matches, error: duplicateError } = await admin.from("profiles").select("id,user_id,username").ilike("username", clean);
      if (duplicateError) return json({ error: duplicateError.message, step }, 400);
      if ((matches || []).some((p: any) => p.id !== targetProfile.id && p.user_id !== authId)) return json({ error: "Cet identifiant est déjà utilisé", step }, 409);
      const { error: profileUpdateError } = await admin.from("profiles").update({ username: clean }).eq("id", targetProfile.id);
      if (profileUpdateError) return json({ error: profileUpdateError.message, step }, 400);
      const { error: requestUpdateError } = await admin.from("account_requests").update({ username: clean }).eq("auth_user_id", authId);
      if (requestUpdateError) return json({ error: "Identifiant modifié dans le profil, mais synchronisation de la demande impossible: " + requestUpdateError.message, step }, 400);
      const { data: authUpdated, error: metadataError } = await admin.auth.admin.updateUserById(authId, { user_metadata: { ...(authTarget.user.user_metadata || {}), username: clean } });
      if (metadataError) return json({ error: "Identifiant modifié dans le profil, mais synchronisation Auth impossible: " + metadataError.message, step }, 400);
      const { data: verifyProfile, error: verifyError } = await admin.from("profiles").select("username").eq("id", targetProfile.id).maybeSingle();
      if (verifyError || verifyProfile?.username !== clean || authUpdated.user?.user_metadata?.username !== clean) return json({ error: "La synchronisation de l’identifiant n’a pas été confirmée.", step: "verify_username" }, 500);
      return json({ success: true, action, username: clean, user_id: authId });
    }

    if (action === "set_roles") {
      step = "set_roles";
      const list: string[] = Array.isArray(roles) ? Array.from(new Set(roles.filter((r: unknown): r is string => typeof r === "string" && r.trim().length > 0))) : [];
      if (list.length === 0) return json({ error: "Au moins un rôle est requis", step }, 400);
      const primaryRole = typeof primary_role === "string" && list.includes(primary_role) ? primary_role : list[0];
      // Résout l'identifiant du compte de connexion (l'appelant peut envoyer l'id du profil).
      step = "resolve_user";
      let authId: string | null = null;
      const { data: direct } = await admin.auth.admin.getUserById(user_id);
      if (direct?.user) authId = direct.user.id;
      if (!authId) {
        const { data: prof } = await admin.from("profiles").select("user_id").eq("id", user_id).maybeSingle();
        if (prof?.user_id) {
          const { data: viaProfile } = await admin.auth.admin.getUserById(prof.user_id);
          if (viaProfile?.user) authId = viaProfile.user.id;
        }
      }
      if (!authId) {
        return json({ error: "Ce profil n'a pas de compte de connexion actif. Créez d'abord son accès.", step }, 404);
      }
      step = "save_roles_transactionally";
      const { error: saveError } = await admin.rpc("admin_set_user_roles_with_primary", {
        p_user_id: authId,
        p_roles: list,
        p_primary_role: primaryRole,
      });
      if (saveError) return json({ error: saveError.message, step }, 400);
      step = "verify_roles";
      const { data: check, error: checkError } = await admin.from("user_roles").select("role,is_primary").eq("user_id", authId);
      if (checkError) return json({ error: checkError.message, step }, 400);
      const verifiedPrimary = (check || []).filter((r: any) => r.is_primary === true);
      if (verifiedPrimary.length !== 1 || verifiedPrimary[0].role !== primaryRole) {
        return json({ error: "Le rôle principal n'a pas été enregistré correctement.", step }, 500);
      }
      const { error: activeError } = await admin.from("profiles").update({ actif: true }).or(`id.eq.${authId},user_id.eq.${authId}`);
      if (activeError) return json({ error: activeError.message, step }, 400);
      return json({ success: true, action, primary_role: primaryRole, roles: (check ?? []).map((r: any) => r.role) });
    }

    if (action === "delete_user") {
      step = "delete_user";
      if (user_id === caller.user.id) {
        return json({ error: "Impossible de supprimer votre propre compte", step }, 400);
      }
      await admin.from("user_roles").delete().eq("user_id", user_id);
      await admin.from("account_requests").delete().eq("auth_user_id", user_id);
      await admin.from("profiles").delete().eq("id", user_id);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message, step }, 400);
      return json({ success: true, action });
    }

    return json({ error: `Action inconnue: ${action}`, step }, 400);
  } catch (e) {
    console.error("admin-manage-user error", step, e);
    return json({ error: (e as Error).message, step }, 500);
  }
});
