-- AgriCapital CRM — permissions individuelles, périmètres clients et encaissements
-- Migration idempotente. Les rôles et affectations utilisateurs existants sont conservés.

create table if not exists public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_code text not null references public.app_permissions(code) on update cascade on delete cascade,
  effect text not null check (effect in ('allow','deny')),
  reason text,
  granted_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, permission_code)
);
create index if not exists user_permission_overrides_user_idx on public.user_permission_overrides(user_id);
alter table public.user_permission_overrides enable row level security;
drop policy if exists user_permission_overrides_admin_only on public.user_permission_overrides;
create policy user_permission_overrides_admin_only on public.user_permission_overrides
  for all to authenticated
  using (private.crm_is_global_admin((select auth.uid())))
  with check (private.crm_is_global_admin((select auth.uid())));

create or replace function private.crm_is_global_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select _user_id is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id and lower(trim(ur.role)) in ('pdg','dg')
  );
$function$;

create or replace function private.crm_user_has_role_permission(p_user_id uuid, p_permission_code text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select case
    when p_user_id is null then false
    when private.crm_is_global_admin(p_user_id) then true
    when exists (select 1 from public.user_permission_overrides uo where uo.user_id=p_user_id and uo.permission_code=p_permission_code and uo.effect='deny') then false
    when exists (select 1 from public.user_permission_overrides uo where uo.user_id=p_user_id and uo.permission_code=p_permission_code and uo.effect='allow') then true
    else exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_code=ur.role
      join public.app_permissions ap on ap.code=rp.permission_code and ap.actif is true
      where ur.user_id=p_user_id and rp.permission_code=p_permission_code
    )
  end;
$function$;

create or replace function private.crm_has_role_permission(p_permission_code text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select private.crm_user_has_role_permission((select auth.uid()), p_permission_code);
$function$;

create or replace function private.has_role_permission(p_permission_code text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select private.crm_has_role_permission(p_permission_code);
$function$;

create or replace function public.crm_set_user_permission_override(
  _target_user_id uuid, _permission_code text, _effect text, _reason text default null
)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.crm_is_global_admin(auth.uid()) then
    raise exception 'Accès refusé : seuls le PDG et le DG peuvent modifier les permissions individuelles.' using errcode='42501';
  end if;
  if _target_user_id is null then raise exception 'Utilisateur cible obligatoire.'; end if;
  if not exists(select 1 from public.app_permissions ap where ap.code=_permission_code and ap.actif is true) then
    raise exception 'Permission inconnue ou inactive.';
  end if;
  if _effect is null or _effect='inherit' then
    delete from public.user_permission_overrides where user_id=_target_user_id and permission_code=_permission_code;
    return;
  end if;
  if _effect not in ('allow','deny') then raise exception 'Effet invalide.'; end if;
  insert into public.user_permission_overrides(user_id,permission_code,effect,reason,granted_by)
  values(_target_user_id,_permission_code,_effect,nullif(trim(_reason),''),auth.uid())
  on conflict(user_id,permission_code) do update
    set effect=excluded.effect,reason=excluded.reason,granted_by=excluded.granted_by,updated_at=now();
end;
$function$;
revoke all on function public.crm_set_user_permission_override(uuid,text,text,text) from public;
grant execute on function public.crm_set_user_permission_override(uuid,text,text,text) to authenticated;

create or replace function public.crm_user_app_permissions(_user_id uuid)
returns text[] language sql stable security definer set search_path = ''
as $function$
  select coalesce(array_agg(ap.code order by ap.code),array[]::text[])
  from public.app_permissions ap
  where ap.actif is true and private.crm_user_has_role_permission(_user_id,ap.code);
$function$;

create or replace function public.crm_current_user_permissions()
returns text[] language sql stable security definer set search_path = ''
as $function$
  with uid as (select auth.uid() as id),
  candidates(permission_code) as (
    select ap.code from public.app_permissions ap,uid
    where ap.actif is true and private.crm_is_global_admin(uid.id)
    union
    select rp.permission_code from public.user_roles ur
      join public.role_permissions rp on rp.role_code=ur.role
      join public.app_permissions ap on ap.code=rp.permission_code and ap.actif is true
    where ur.user_id=(select id from uid)
    union select 'system.global_admin' where private.crm_is_global_admin((select id from uid))
    union select 'system.can_supervise_leads' where private.crm_is_global_admin((select id from uid)) or private.can_supervise_leads((select id from uid))
    union select 'system.service_client' where private.crm_is_global_admin((select id from uid)) or exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('service_client','chef_equipe_service_client'))
    union select 'system.commercial_assignable' where private.crm_is_global_admin((select id from uid)) or private.is_commercial_assignable((select id from uid))
    union select 'system.commercial_manager' where private.crm_is_global_admin((select id from uid)) or exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('chef_equipe_commercial','responsable_commercial'))
    union select 'system.commercial_director' where private.crm_is_global_admin((select id from uid)) or exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role='responsable_commercial')
    union select 'system.technical_manager' where private.crm_is_global_admin((select id from uid)) or exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role='chef_equipe_technique')
    union select 'system.manage_account_requests' where private.crm_has_role_permission('parametres.manage_users')
    union select 'system.manage_user_credentials' where private.crm_has_role_permission('utilisateurs.update') or private.crm_has_role_permission('utilisateurs.reset_password')
    union select 'system.client_only' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role='user') and not exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role<>'user')
    union select 'system.transfer_plantation' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('pdg','dg','service_client','chef_equipe_service_client'))
    union select 'system.independent_service_customers' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('pdg','dg','service_client','chef_equipe_service_client','comptable','manager_commercial_national','responsable_operations'))
    union select 'system.independent_service_proformas' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('pdg','dg','service_client','chef_equipe_service_client','comptable','manager_commercial_national','responsable_operations','technicien','chef_equipe_technique','manager_technique_national'))
    union select 'system.independent_service_items' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('pdg','dg','service_client','chef_equipe_service_client','comptable','manager_commercial_national','responsable_operations','technicien','chef_equipe_technique','manager_technique_national'))
    union select 'system.view_team_commissions' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('pdg','dg','comptable','responsable_operations','responsable_commercial','chef_equipe_commercial','chef_equipe_technique'))
    union select 'system.commercial_role' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role='commercial')
    union select 'system.zone_scope_global' where private.crm_is_global_admin((select id from uid)) or exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('responsable_operations','manager_commercial_national','manager_technique_national'))
    union select 'system.independent_service_write' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('pdg','dg','service_client','chef_equipe_service_client'))
    union select 'system.independent_service_operations' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('pdg','dg','technicien','chef_equipe_technique','manager_technique_national','responsable_operations'))
    union select 'system.manage_hr' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('rh','responsable_rh','ressources_humaines','admin','administrateur','pdg','dg','directeur_general','directeur général'))
    union select 'system.role_pdg' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and lower(trim(ur.role))='pdg')
    union select 'system.role_responsable_commercial' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and lower(trim(ur.role))='responsable_commercial')
    union select 'system.role_chef_equipe' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and lower(trim(ur.role)) in ('chef_equipe_commercial','chef_equipe_technique','chef_equipe_service_client'))
    union select 'system.role_commercial' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and lower(trim(ur.role))='commercial')
    union select 'system.role_technique' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and lower(trim(ur.role))='chef_equipe_technique')
    union
    select uo.permission_code from public.user_permission_overrides uo
      join public.app_permissions ap on ap.code=uo.permission_code and ap.actif is true
    where uo.user_id=(select id from uid) and uo.effect='allow'
  )
  select coalesce(array_agg(distinct c.permission_code order by c.permission_code),array[]::text[])
  from candidates c
  where (select id from uid) is not null
    and not exists(select 1 from public.user_permission_overrides uo where uo.user_id=(select id from uid) and uo.permission_code=c.permission_code and uo.effect='deny');
$function$;

insert into public.app_permissions(code,module,action,libelle,description,actif)
values
('system.global_admin','system','global_admin','Administration globale','Accès général de direction',true),
('system.can_supervise_leads','system','can_supervise_leads','Superviser les prospects','Capacité de supervision et attribution des prospects',true),
('system.service_client','system','service_client','Relation client globale','Capacité relation client',true),
('system.commercial_assignable','system','commercial_assignable','Affectation commerciale','Capacité de recevoir et gérer des affectations commerciales',true),
('system.commercial_manager','system','commercial_manager','Management commercial','Capacité de management commercial',true),
('system.commercial_director','system','commercial_director','Direction commerciale','Capacité de direction commerciale',true),
('system.technical_manager','system','technical_manager','Management technique','Capacité de management technique',true),
('system.manage_account_requests','system','manage_account_requests','Gérer les demandes de compte','Capacité de traiter les demandes de compte',true),
('system.manage_user_credentials','system','manage_user_credentials','Gérer les identifiants','Capacité de gestion des identifiants utilisateurs',true),
('system.client_only','system','client_only','Compte client uniquement','Indique un compte portail client',true),
('system.transfer_plantation','system','transfer_plantation','Transférer une plantation','Capacité de transfert de plantation',true),
('system.independent_service_customers','system','independent_service_customers','Clients prestations indépendantes','Accès au module clients des prestations indépendantes',true),
('system.independent_service_proformas','system','independent_service_proformas','Proformas prestations indépendantes','Accès au module proformas des prestations indépendantes',true),
('system.independent_service_items','system','independent_service_items','Lignes prestations indépendantes','Accès aux lignes des prestations indépendantes',true),
('system.view_team_commissions','system','view_team_commissions','Commissions équipe','Consultation des commissions de l’équipe',true),
('system.commercial_role','system','commercial_role','Fonction commerciale','Capacité spécifique au rôle commercial',true),
('system.zone_scope_global','system','zone_scope_global','Périmètre géographique global','Accès géographique global',true),
('system.independent_service_write','system','independent_service_write','Modifier les prestations indépendantes','Capacité de modification des prestations indépendantes',true),
('system.independent_service_operations','system','independent_service_operations','Opérations prestations indépendantes','Accès opérationnel aux prestations indépendantes',true),
('system.manage_hr','system','manage_hr','Gestion RH','Capacité de gestion des ressources humaines',true),
('system.role_pdg','system','role_pdg','Rôle PDG','Indicateur de rôle PDG',true),
('system.role_responsable_commercial','system','role_responsable_commercial','Rôle responsable commercial','Indicateur de rôle responsable commercial',true),
('system.role_chef_equipe','system','role_chef_equipe','Rôle chef d’équipe','Indicateur de rôle chef d’équipe',true),
('system.role_commercial','system','role_commercial','Rôle commercial','Indicateur de rôle commercial',true),
('system.role_technique','system','role_technique','Rôle technique','Indicateur de rôle technique',true)
on conflict(code) do update set module=excluded.module,action=excluded.action,libelle=excluded.libelle,description=excluded.description,actif=true,updated_at=now();

delete from public.role_permissions where permission_code='paiements.record' and role_code not in ('comptable','pdg','dg');

drop policy if exists "CRM support global clients read v3" on public.clients;
drop policy if exists "CRM clients select by permission and scope" on public.clients;
create policy "CRM clients select by effective permission and scope" on public.clients
  for select to authenticated
  using (private.crm_has_role_permission('clients.view') and (
    created_by=(select auth.uid()) or commercial_id=(select auth.uid()) or private.can_access_client((select auth.uid()),id)
  ));

drop policy if exists "CRM clients update restricted business roles" on public.clients;
create policy "CRM clients update by effective permission and scope" on public.clients
  for update to authenticated
  using (private.crm_has_role_permission('clients.update')
    and (type_client is distinct from 'beneficiaire_particulier' or private.crm_is_global_admin((select auth.uid())))
    and (private.crm_is_global_admin((select auth.uid())) or private.can_access_client((select auth.uid()),id)))
  with check (private.crm_has_role_permission('clients.update')
    and (type_client is distinct from 'beneficiaire_particulier' or private.crm_is_global_admin((select auth.uid())))
    and (private.crm_is_global_admin((select auth.uid())) or private.can_access_client((select auth.uid()),id)));

drop policy if exists "Clients delete by permission" on public.clients;
drop policy if exists "CRM clients delete by explicit permission and scope" on public.clients;
create policy "CRM clients delete by effective permission and scope" on public.clients
  for delete to authenticated
  using (private.crm_has_role_permission('clients.delete')
    and (private.crm_is_global_admin((select auth.uid())) or private.can_access_client((select auth.uid()),id)));
