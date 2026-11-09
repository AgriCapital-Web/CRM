-- Profil, équipes et rôles : contrôles d'accès et règles de couverture exécutés côté serveur.
begin;

-- Les écrans RH peuvent lire/modifier les profils uniquement avec les permissions
-- enregistrées dans role_permissions. Les triggers existants conservent les champs
-- de gouvernance sous contrôle exclusif du PDG.
drop policy if exists "Profiles select by permission" on public.profiles;
create policy "Profiles select by permission"
  on public.profiles for select to authenticated
  using (
    private.has_role_permission('utilisateurs.view')
    or private.has_role_permission('utilisateurs.update')
  );

drop policy if exists "Profiles update by permission" on public.profiles;
create policy "Profiles update by permission"
  on public.profiles for update to authenticated
  using (private.has_role_permission('utilisateurs.update'))
  with check (private.has_role_permission('utilisateurs.update'));

-- Les rôles ne sont jamais écrits directement depuis le navigateur.
-- Les écritures passent par admin-manage-user et ses RPC transactionnelles.
drop policy if exists "CRM roles delete by permission" on public.user_roles;
drop policy if exists "CRM roles insert by permission" on public.user_roles;
drop policy if exists "CRM roles update by permission" on public.user_roles;

drop policy if exists "CRM roles select by permission" on public.user_roles;
create policy "CRM roles select by permission"
  on public.user_roles for select to authenticated
  using (
    private.is_global_admin((select auth.uid()))
    or (
      private.has_role_permission('roles.view')
      and user_id = (select auth.uid())
    )
    or private.has_role_permission('roles.manage_permissions')
  );

-- Le niveau de couverture est une donnée du référentiel app_roles.
-- Aucune liste de rôles ou correspondance métier n'est maintenue dans React.
create or replace function public.set_user_primary_zone_assignment(
  p_user_id uuid,
  p_zone_type text,
  p_zone_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_coverage text;
begin
  if auth.uid() is null or p_user_id is null then
    raise exception 'Utilisateur cible et session authentifiée obligatoires.'
      using errcode = '42501';
  end if;

  if not (
    private.is_global_admin((select auth.uid()))
    or private.has_role_permission('parametres.manage_geo')
    or private.has_role_permission('utilisateurs.create')
    or private.has_role_permission('utilisateurs.update')
  ) then
    raise exception 'Permission insuffisante pour modifier la couverture géographique.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.user_id = p_user_id) then
    raise exception 'Profil cible introuvable.' using errcode = 'P0002';
  end if;

  select ar.niveau_couverture
    into v_coverage
  from public.user_roles ur
  join public.app_roles ar on ar.code = ur.role and ar.actif is true
  where ur.user_id = p_user_id
    and ur.is_primary is true
  limit 1;

  v_coverage := coalesce(v_coverage, 'global');

  if v_coverage = 'global' then
    if p_zone_type is not null or p_zone_id is not null then
      raise exception 'Ce rôle possède une couverture globale et ne doit pas recevoir de zone locale.'
        using errcode = '22023';
    end if;
  else
    if p_zone_type is distinct from v_coverage or p_zone_id is null then
      raise exception 'La zone doit correspondre au niveau de couverture du rôle principal (%).', v_coverage
        using errcode = '22023';
    end if;

    if p_zone_type = 'district' and not exists (
      select 1 from public.v_geo_districts d where d.id = p_zone_id
    ) then
      raise exception 'District introuvable ou inactif.' using errcode = '22023';
    elsif p_zone_type = 'region' and not exists (
      select 1 from public.v_geo_regions r where r.id = p_zone_id
    ) then
      raise exception 'Région introuvable ou inactive.' using errcode = '22023';
    elsif p_zone_type = 'departement' and not exists (
      select 1 from public.v_geo_departements d where d.id = p_zone_id
    ) then
      raise exception 'Département introuvable ou inactif.' using errcode = '22023';
    elsif p_zone_type = 'sous_prefecture' and not exists (
      select 1 from public.v_geo_sous_prefectures sp where sp.id = p_zone_id
    ) then
      raise exception 'Sous-préfecture introuvable ou inactive.' using errcode = '22023';
    elsif p_zone_type not in ('district','region','departement','sous_prefecture') then
      raise exception 'Type de zone invalide.' using errcode = '22023';
    end if;
  end if;

  delete from public.zone_assignments where user_id = p_user_id;
  if p_zone_type is not null then
    insert into public.zone_assignments(user_id, zone_type, zone_id, created_by)
    values (p_user_id, p_zone_type, p_zone_id, auth.uid());
  end if;
end;
$function$;

revoke all on function public.set_user_primary_zone_assignment(uuid,text,uuid) from public, anon;
grant execute on function public.set_user_primary_zone_assignment(uuid,text,uuid) to authenticated, service_role;

-- La liste d'équipes compatible avec le département est calculée par PostgreSQL.
create or replace function public.get_team_options_for_department(p_departement text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_team_type text;
  v_requires_team boolean;
  v_teams jsonb;
begin
  if auth.uid() is null or not (
    private.is_global_admin((select auth.uid()))
    or private.has_role_permission('utilisateurs.create')
    or private.has_role_permission('utilisateurs.update')
  ) then
    raise exception 'Permission insuffisante pour consulter les équipes.'
      using errcode = '42501';
  end if;

  v_team_type := case lower(trim(coalesce(p_departement, '')))
    when 'commercial' then 'commercial'
    when 'technique' then 'technique'
    else null
  end;
  v_requires_team := v_team_type is not null;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'nom', e.nom, 'type_equipe', e.type_equipe) order by e.nom),
    '[]'::jsonb
  )
  into v_teams
  from public.equipes e
  where e.actif is true
    and v_team_type is not null
    and (e.type_equipe is null or e.type_equipe = v_team_type);

  return jsonb_build_object(
    'requires_team', v_requires_team,
    'equipes', coalesce(v_teams, '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_team_options_for_department(text) from public, anon;
grant execute on function public.get_team_options_for_department(text) to authenticated, service_role;

-- Autorisation d'une action d'administration utilisateur : la correspondance
-- action -> permission et la protection des comptes de gouvernance restent en SQL.
create or replace function public.user_can_manage_admin_action(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_allowed boolean := false;
  v_governance_target boolean := false;
begin
  if p_actor_user_id is null then
    return false;
  end if;

  v_allowed := case p_action
    when 'create_user' then private.user_has_role_permission(p_actor_user_id, 'utilisateurs.create')
    when 'set_active' then private.user_has_role_permission(p_actor_user_id, 'utilisateurs.update')
                                  or private.user_has_role_permission(p_actor_user_id, 'utilisateurs.delete')
    when 'set_password' then private.user_has_role_permission(p_actor_user_id, 'utilisateurs.reset_password')
    when 'set_username' then private.user_has_role_permission(p_actor_user_id, 'utilisateurs.update')
    when 'set_roles' then private.user_has_role_permission(p_actor_user_id, 'roles.manage_permissions')
    when 'delete_user' then private.user_has_role_permission(p_actor_user_id, 'utilisateurs.delete')
    else false
  end;

  if not v_allowed then
    return false;
  end if;

  if p_target_user_id is not null and p_action in ('set_active','set_password','set_username','set_roles','delete_user') then
    select exists (
      select 1 from public.user_roles ur
      where ur.user_id = p_target_user_id
        and lower(trim(ur.role)) in ('pdg','dg','super_admin','admin','administrateur','president','président')
    ) into v_governance_target;

    if v_governance_target and not private.is_global_admin(p_actor_user_id) then
      return false;
    end if;
  end if;

  return true;
end;
$function$;

revoke all on function public.user_can_manage_admin_action(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.user_can_manage_admin_action(uuid,uuid,text) to service_role;

-- Contrôle centralisé avant création ou changement de rôle, pour éviter
-- toute écriture partielle d'un compte lorsqu'un rôle est interdit.
create or replace function public.user_can_assign_app_role(
  p_actor_user_id uuid,
  p_role_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_actor_user_id is not null
    and exists (
      select 1 from public.app_roles ar
      where ar.code = p_role_code and ar.actif is true
    )
    and (
      private.is_global_admin(p_actor_user_id)
      or (
        private.user_has_role_permission(p_actor_user_id, 'utilisateurs.create')
        or private.user_has_role_permission(p_actor_user_id, 'roles.manage_permissions')
      )
    )
    and (
      lower(trim(coalesce(p_role_code, ''))) not in
        ('pdg','dg','super_admin','admin','administrateur','president','président')
      or private.is_global_admin(p_actor_user_id)
    );
$function$;

revoke all on function public.user_can_assign_app_role(uuid,text) from public, anon, authenticated;
grant execute on function public.user_can_assign_app_role(uuid,text) to service_role;

notify pgrst, 'reload schema';
commit;
