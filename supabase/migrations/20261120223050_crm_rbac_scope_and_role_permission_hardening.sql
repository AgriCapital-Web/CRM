-- Generated from audited live definitions. Role coverage is sourced from app_roles.
begin;

CREATE OR REPLACE FUNCTION private.can_access_client(_user_id uuid, _client_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c record; p record; g record;
begin
  if _user_id is null or _client_id is null then return false; end if;
  if private.crm_is_global_admin(_user_id) or private.crm_user_has_global_scope(_user_id) then return true; end if;
  select * into c from public.clients where id = _client_id;
  if not found then return false; end if;
  if c.commercial_id = _user_id or c.user_id = _user_id or c.created_by = _user_id then return true; end if;
  if exists (
    select 1 from public.interventions_techniques i
    join public.profiles technician on technician.id = i.agent_technique_id
    where i.client_id = _client_id and technician.user_id = _user_id
  ) then return true; end if;
  select * into p from public.profiles where user_id = _user_id limit 1;
  if not found then return false; end if;
  select
    coalesce(c.district_id, pa.district_id) as district_id,
    coalesce(c.region_id, pa.region_id) as region_id,
    coalesce(c.departement_id, pa.departement_id) as departement_id,
    coalesce(c.sous_prefecture_id, pa.sous_prefecture_id) as sous_prefecture_id
  into g from (select 1) x left join public.parcelles pa on pa.id = c.parcelle_id;
  if exists (
    select 1 from public.zone_assignments z
    where z.user_id = _user_id
      and ((z.zone_type = 'district' and z.zone_id = g.district_id)
        or (z.zone_type = 'region' and z.zone_id = g.region_id)
        or (z.zone_type = 'departement' and z.zone_id = g.departement_id)
        or (z.zone_type = 'sous_prefecture' and z.zone_id = g.sous_prefecture_id))
  ) then return true; end if;
  if exists (
    select 1 from public.plantations pl
    join public.zone_assignments z on z.user_id = _user_id
    where pl.client_id = _client_id
      and ((z.zone_type = 'district' and z.zone_id = pl.district_id)
        or (z.zone_type = 'region' and z.zone_id = pl.region_id)
        or (z.zone_type = 'departement' and z.zone_id = pl.departement_id)
        or (z.zone_type = 'sous_prefecture' and z.zone_id = pl.sous_prefecture_id))
  ) then return true; end if;
  if exists (
    select 1 from public.user_roles ur
    join public.app_roles ar on ar.code = ur.role and ar.actif is true
    where ur.user_id = _user_id
      and ((ar.niveau_couverture = 'region' and p.region_id is not null and p.region_id = g.region_id)
        or (ar.niveau_couverture = 'district' and p.district_id is not null and p.district_id = g.district_id))
  ) then return true; end if;
  if private.has_role(_user_id, 'chef_equipe_commercial')
     or private.has_role(_user_id, 'chef_equipe_technique')
     or private.has_role(_user_id, 'responsable_commercial') then
    if exists (
      select 1 from public.profiles viewer
      join public.equipe_membres viewer_team on viewer_team.profile_id = viewer.id
      join public.equipe_membres member_team on member_team.equipe_id = viewer_team.equipe_id
      join public.profiles member on member.id = member_team.profile_id
      where viewer.user_id = _user_id
        and (member.user_id = c.commercial_id
          or (g.region_id is not null and member.region_id = g.region_id)
          or (g.district_id is not null and member.district_id = g.district_id)
          or exists (
            select 1 from public.zone_assignments z
            where z.user_id = member.user_id
              and ((z.zone_type = 'district' and z.zone_id = g.district_id)
                or (z.zone_type = 'region' and z.zone_id = g.region_id)
                or (z.zone_type = 'departement' and z.zone_id = g.departement_id)
                or (z.zone_type = 'sous_prefecture' and z.zone_id = g.sous_prefecture_id))
          ))
    ) then return true; end if;
    if p.equipe_id is not null and exists (
      select 1 from public.profiles member where member.equipe_id = p.equipe_id
        and (member.user_id = c.commercial_id
          or (g.region_id is not null and member.region_id = g.region_id)
          or (g.district_id is not null and member.district_id = g.district_id))
    ) then return true; end if;
  end if;
  return false;
end;
$function$


CREATE OR REPLACE FUNCTION private.can_access_lead(_user_id uuid, _lead_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l record; p record;
begin
  if _user_id is null or _lead_id is null then return false; end if;
  if private.crm_is_global_admin(_user_id) or private.crm_user_has_global_scope(_user_id) then return true; end if;
  select * into l from public.leads where id = _lead_id;
  if not found then return false; end if;
  if private.has_role(_user_id, 'mobilisateur_foncier') then
    return l.created_by = _user_id or l.assigned_to = _user_id;
  end if;
  if l.created_by = _user_id or l.assigned_to = _user_id then return true; end if;
  if exists (
    select 1 from public.zone_assignments z where z.user_id = _user_id
      and ((z.zone_type = 'district' and z.zone_id = l.district_id)
        or (z.zone_type = 'region' and z.zone_id = l.region_id)
        or (z.zone_type = 'departement' and z.zone_id = l.departement_id)
        or (z.zone_type = 'sous_prefecture' and z.zone_id = l.sous_prefecture_id))
  ) then return true; end if;
  select * into p from public.profiles where user_id = _user_id limit 1;
  if not found then return false; end if;
  if exists (
    select 1 from public.user_roles ur
    join public.app_roles ar on ar.code = ur.role and ar.actif is true
    where ur.user_id = _user_id
      and ((ar.niveau_couverture = 'region' and p.region_id is not null and p.region_id = l.region_id)
        or (ar.niveau_couverture = 'district' and p.district_id is not null and p.district_id = l.district_id))
  ) then return true; end if;
  if private.has_role(_user_id, 'chef_equipe_commercial')
     or private.has_role(_user_id, 'chef_equipe_technique')
     or private.has_role(_user_id, 'chef_equipe_service_client')
     or private.has_role(_user_id, 'responsable_commercial') then
    if exists (
      select 1 from public.profiles viewer
      join public.equipe_membres viewer_team on viewer_team.profile_id = viewer.id
      join public.equipe_membres member_team on member_team.equipe_id = viewer_team.equipe_id
      join public.profiles member on member.id = member_team.profile_id
      where viewer.user_id = _user_id and (member.user_id = l.assigned_to or member.user_id = l.created_by)
    ) then return true; end if;
    if p.equipe_id is not null and exists (
      select 1 from public.profiles member
      where member.equipe_id = p.equipe_id and (member.user_id = l.assigned_to or member.user_id = l.created_by)
    ) then return true; end if;
  end if;
  return false;
end;
$function$


CREATE OR REPLACE FUNCTION private.can_access_parcelle(_user_id uuid, _parcelle_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select _user_id is not null and _parcelle_id is not null and (
    private.crm_is_global_admin(_user_id)
    or private.crm_user_has_global_scope(_user_id)
    or exists (select 1 from public.parcelles p where p.id = _parcelle_id and p.created_by = _user_id)
    or exists (select 1 from public.plantations pl where pl.parcelle_id = _parcelle_id and private.can_access_client(_user_id, pl.client_id))
    or exists (
      select 1 from public.zone_assignments za join public.parcelles p on p.id = _parcelle_id
      where za.user_id = _user_id
        and ((za.zone_type = 'district' and za.zone_id = p.district_id)
          or (za.zone_type = 'region' and za.zone_id = p.region_id)
          or (za.zone_type = 'departement' and za.zone_id = p.departement_id)
          or (za.zone_type = 'sous_prefecture' and za.zone_id = p.sous_prefecture_id))
    )
    or exists (
      select 1 from public.user_roles ur
      join public.app_roles ar on ar.code = ur.role and ar.actif is true
      join public.profiles pr on pr.user_id = _user_id
      join public.parcelles p on p.id = _parcelle_id
      where (ar.niveau_couverture = 'region' and pr.region_id is not null and pr.region_id = p.region_id)
         or (ar.niveau_couverture = 'district' and pr.district_id is not null and pr.district_id = p.district_id)
    )
  );
$function$


CREATE OR REPLACE FUNCTION private.can_read_commission(_user_id uuid, _profile_id uuid, _type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.crm_user_has_role_permission(_user_id, 'commissions.view')
    and (
      private.crm_is_global_admin(_user_id)
      or private.crm_user_has_global_scope(_user_id)
      or (
        exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_operations')
        and (
          exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                  where v.user_id = _user_id and v.region_id is not null and v.region_id = t.region_id)
          or exists (select 1 from public.zone_assignments z join public.profiles t on t.id = _profile_id
                     where z.user_id = _user_id and z.zone_type = 'region' and z.zone_id = t.region_id)
        )
      )
      or exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                 where v.user_id = _user_id and v.id = t.id)
      or (
        _type <> 'technique'
        and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_commercial')
        and exists (select 1 from public.user_roles ur
                    where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id)
                      and ur.role in ('commercial','chef_equipe_commercial','responsable_commercial'))
        and exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                    where v.user_id = _user_id and v.region_id is not null and v.region_id = t.region_id)
      )
      or (
        exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'superviseur_mobilisation_fonciere')
        and exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                    where v.user_id = _user_id and v.region_id is not null and v.region_id = t.region_id)
        and exists (select 1 from public.user_roles ur
                    where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id)
                      and ur.role = 'mobilisateur_foncier')
      )
      or (
        (
          (_type = 'technique' and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_technique')
            and exists (select 1 from public.user_roles ur where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id) and ur.role = 'technicien'))
          or (_type <> 'technique' and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_commercial')
            and exists (select 1 from public.user_roles ur where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id) and ur.role in ('commercial','chef_equipe_commercial')))
        )
        and exists (
          select 1 from public.equipes t
          where ((_type = 'technique' and lower(coalesce(t.type_equipe,'')) like '%technique')
             or (_type <> 'technique' and lower(coalesce(t.type_equipe,'')) like '%commercial%'))
            and private.can_view_commission_team(_user_id, t.id, _type)
            and (t.id = (select target.equipe_id from public.profiles target where target.id = _profile_id)
              or exists (select 1 from public.equipe_membres em where em.profile_id = _profile_id and em.equipe_id = t.id))
        )
      )
    );
$function$


CREATE OR REPLACE FUNCTION private.can_view_commission_team(_user_id uuid, _team_id uuid, _type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.crm_user_has_role_permission(_user_id, 'commissions.view')
    and exists (
      select 1 from public.equipes t
      where t.id = _team_id and (
        private.crm_is_global_admin(_user_id)
        or private.crm_user_has_global_scope(_user_id)
        or (
          exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_operations')
          and (
            exists (select 1 from public.profiles v where v.user_id = _user_id and v.region_id is not null and v.region_id = t.region_id)
            or exists (select 1 from public.zone_assignments z where z.user_id = _user_id and z.zone_type = 'region' and z.zone_id = t.region_id)
          )
        )
        or (lower(coalesce(t.type_equipe,'')) like '%commercial%' and _type <> 'technique'
            and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_commercial'))
        or exists (
          select 1 from public.profiles v
          where v.user_id = _user_id
            and ((lower(coalesce(t.type_equipe,'')) like '%technique%'
                  and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_technique')
                  and _type = 'technique')
              or (lower(coalesce(t.type_equipe,'')) like '%commercial%'
                  and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_commercial')
                  and _type <> 'technique'))
            and (v.equipe_id = t.id or exists (select 1 from public.equipe_membres em where em.profile_id = v.id and em.equipe_id = t.id))
        )
      )
    );
$function$


CREATE OR REPLACE FUNCTION private.crm_user_has_global_scope(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_user_id is not null and exists (
    select 1 from public.user_roles ur
    join public.app_roles ar on ar.code = ur.role and ar.actif is true
    where ur.user_id = p_user_id and ar.niveau_couverture = 'global'
  );
$function$


CREATE OR REPLACE FUNCTION public.crm_current_user_permissions()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with uid as (select auth.uid() as id),
  candidates(permission_code) as (
    select ap.code
    from public.app_permissions ap, uid
    where ap.actif is true and private.crm_is_global_admin(uid.id)

    union
    select rp.permission_code
    from public.user_roles ur
    join public.role_permissions rp on rp.role_code = ur.role
    join public.app_permissions ap on ap.code = rp.permission_code and ap.actif is true
    where ur.user_id = (select id from uid)

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
    union select 'system.zone_scope_global' where private.crm_is_global_admin((select id from uid)) or exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('manager_commercial_national','manager_technique_national'))
    union select 'system.independent_service_write' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('pdg','dg','service_client','chef_equipe_service_client'))
    union select 'system.independent_service_operations' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('pdg','dg','technicien','chef_equipe_technique','manager_technique_national','responsable_operations'))
    union select 'system.manage_hr' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and ur.role in ('rh','responsable_rh','ressources_humaines','admin','administrateur','pdg','dg','directeur_general','directeur général'))
    union select 'system.role_pdg' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and lower(trim(ur.role))='pdg')
    union select 'system.role_responsable_commercial' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and lower(trim(ur.role))='responsable_commercial')
    union select 'system.role_chef_equipe' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and lower(trim(ur.role)) in ('chef_equipe_commercial','chef_equipe_technique','chef_equipe_service_client'))
    union select 'system.role_commercial' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and lower(trim(ur.role))='commercial')
    union select 'system.role_technique' where exists(select 1 from public.user_roles ur where ur.user_id=(select id from uid) and lower(trim(ur.role))='chef_equipe_technique')

    union
    select uo.permission_code
    from public.user_permission_overrides uo
    join public.app_permissions ap on ap.code = uo.permission_code and ap.actif is true
    where uo.user_id = (select id from uid) and uo.effect = 'allow'
  )
  select coalesce(array_agg(distinct c.permission_code order by c.permission_code), array[]::text[])
  from candidates c
  where (select id from uid) is not null
    and not exists (
      select 1 from public.user_permission_overrides uo
      where uo.user_id = (select id from uid)
        and uo.permission_code = c.permission_code
        and uo.effect = 'deny'
    );
$function$


drop policy if exists client_acquisitions_staff_select on public.acquisitions;
create policy acquisitions_select_by_client_permission_and_scope on public.acquisitions
for select to authenticated using (
  private.crm_has_role_permission('clients.view')
  and (created_by=(select auth.uid()) or private.can_access_client((select auth.uid()),client_id))
);

drop policy if exists "Lots technical scope select" on public.lots_hectares;
create policy "Lots technical scope select" on public.lots_hectares for select to authenticated using (
  (private.crm_has_role_permission('parcelles.view') and private.can_access_parcelle((select auth.uid()),parcelle_id))
  or exists(select 1 from public.clients c where c.id=lots_hectares.client_id and c.user_id=(select auth.uid()))
);
drop policy if exists "Lots technical scope insert" on public.lots_hectares;
create policy "Lots technical scope insert" on public.lots_hectares for insert to authenticated with check (
  private.crm_has_role_permission('parcelles.create') and private.can_access_parcelle((select auth.uid()),parcelle_id)
);
drop policy if exists "Lots technical scope update" on public.lots_hectares;
create policy "Lots technical scope update" on public.lots_hectares for update to authenticated
using (private.crm_has_role_permission('parcelles.update') and private.can_access_parcelle((select auth.uid()),parcelle_id))
with check (private.crm_has_role_permission('parcelles.update') and private.can_access_parcelle((select auth.uid()),parcelle_id));
drop policy if exists "Lots delete by permission" on public.lots_hectares;
create policy lots_delete_by_permission_and_parcel_scope on public.lots_hectares for delete to authenticated using (
  private.crm_has_role_permission('proprietaires.delete') and private.can_access_parcelle((select auth.uid()),parcelle_id)
);

drop policy if exists "staff read audit" on public.admin_audit_logs;
create policy admin_audit_logs_read_by_audit_permission on public.admin_audit_logs for select to authenticated using (
  private.crm_has_role_permission('parametres.view_audit') or acteur_user_id=(select auth.uid())
);

delete from public.role_permissions
where (role_code='associe_actionnaire' and permission_code in ('leads.create','leads.update','messagerie.send'))
   or (role_code='technicien' and permission_code in ('leads.create','leads.update','leads.view','commissions.view','portefeuilles.view','proprietaires.create','messagerie.send'))
   or (role_code='chef_equipe_technique' and permission_code in ('leads.create','leads.update','leads.view','commissions.view','portefeuilles.view','paiements.view','proprietaires.create','messagerie.send'))
   or (role_code='comptable' and permission_code in ('clients.create','leads.create','leads.update','leads.view','messagerie.send'));

notify pgrst, 'reload schema';
commit;