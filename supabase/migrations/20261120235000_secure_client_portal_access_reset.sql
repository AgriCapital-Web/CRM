create or replace function public.admin_reset_client_portal_access(
  p_client_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_client_name text;
  v_actor_name text;
  v_deleted integer := 0;
  v_revoked integer := 0;
  v_event_key text;
begin
  if p_actor_user_id is null
     or not private.crm_user_has_role_permission(p_actor_user_id, 'parametres.manage_system') then
    raise exception 'Accès refusé : permission de gestion système requise.' using errcode = '42501';
  end if;

  select c.nom_complet into v_client_name
  from public.clients c
  where c.id = p_client_id
  for update;

  if not found then
    raise exception 'Client introuvable.' using errcode = 'P0002';
  end if;

  delete from public.client_portal_access_codes
  where client_id = p_client_id;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'Aucun code portail actif à réinitialiser pour ce client.' using errcode = '22023';
  end if;

  update public.client_portal_sessions
  set revoked_at = coalesce(revoked_at, now())
  where client_id = p_client_id and revoked_at is null;
  get diagnostics v_revoked = row_count;

  v_event_key := 'client-access-code-reset:' || p_client_id::text || ':' || extract(epoch from clock_timestamp())::text;

  insert into public.notification_event_outbox(event_code, context)
  values (
    'client_access_code_reset',
    jsonb_build_object(
      'client_id', p_client_id,
      'dedupe_key', v_event_key,
      'source', 'settings_client_access_reset'
    )
  );

  select p.nom_complet into v_actor_name
  from public.profiles p
  where p.user_id = p_actor_user_id
  order by p.created_at desc
  limit 1;

  insert into public.admin_audit_logs(
    acteur_user_id, acteur_libelle, cible_libelle, action, entite, entite_id,
    ancienne_valeur, nouvelle_valeur, statut, details, source
  ) values (
    p_actor_user_id, coalesce(v_actor_name, 'Administrateur'), v_client_name,
    'CLIENT_PORTAL_ACCESS_CODE_RESET', 'client_portal_access_codes', p_client_id::text,
    jsonb_build_object('code_present', true),
    jsonb_build_object('code_removed', true, 'sessions_revoked', v_revoked, 'sms_queued', true),
    'succes',
    'Code portail réinitialisé ; sessions révoquées ; notification SMS mise en file.',
    'settings'
  );

  return jsonb_build_object(
    'success', true,
    'code_removed', true,
    'sessions_revoked', v_revoked,
    'sms_queued', true
  );
end;
$function$;

revoke all on function public.admin_reset_client_portal_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_reset_client_portal_access(uuid, uuid) to service_role;