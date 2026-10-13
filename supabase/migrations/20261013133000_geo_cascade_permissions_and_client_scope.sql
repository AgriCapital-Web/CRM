create or replace function private.is_service_client(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role in ('service_client','chef_equipe_service_client'))
    or exists (select 1 from public.profiles p where p.user_id = _user_id and (
      replace(lower(coalesce(p.poste,'')), '_', ' ') like '%service client%'
      or replace(lower(coalesce(p.relation_rh,'')), '_', ' ') like '%service client%'
    ));
$function$;

drop policy if exists "CRM clients update by permission and scope" on public.clients;
create policy "CRM clients update by permission and scope" on public.clients for update
using (private.has_role_permission('clients.update') and not private.is_service_client((select auth.uid())) and private.can_access_client((select auth.uid()), id))
with check (private.has_role_permission('clients.update') and not private.is_service_client((select auth.uid())) and private.can_access_client((select auth.uid()), id));

drop policy if exists "CRM clients delete by explicit permission and scope" on public.clients;
create policy "CRM clients delete by explicit permission and scope" on public.clients for delete
using (private.has_role_permission('clients.delete') and not private.is_service_client((select auth.uid())) and private.can_access_client((select auth.uid()), id));

do $geo$
declare tbl text;
begin
  foreach tbl in array array['districts','regions','departements','sous_prefectures','villages','campements'] loop
    execute format('drop policy if exists %I on public.%I', 'Geo managers read all ' || tbl, tbl);
    execute format('create policy %I on public.%I for select using (private.is_global_admin((select auth.uid())) or private.has_role_permission(''parametres.manage_geo''))', 'Geo managers read all ' || tbl, tbl);
    execute format('drop policy if exists %I on public.%I', 'Geo managers update status ' || tbl, tbl);
    execute format('create policy %I on public.%I for update using (private.is_global_admin((select auth.uid())) or private.has_role_permission(''parametres.manage_geo'')) with check (private.is_global_admin((select auth.uid())) or private.has_role_permission(''parametres.manage_geo''))', 'Geo managers update status ' || tbl, tbl);
  end loop;
end;
$geo$;

create or replace function private.can_access_client(_user_id uuid, _client_id uuid)
returns boolean language plpgsql stable security definer set search_path to ''
as $function$
declare c record; p record; g record;
begin
 if _user_id is null or _client_id is null then return false; end if;
 if private.is_global_admin(_user_id) or private.has_role(_user_id,'responsable_operations') or private.has_role(_user_id,'service_client') or private.has_role(_user_id,'chef_equipe_service_client') or private.has_role(_user_id,'comptable') then return true; end if;
 select * into c from public.clients where id=_client_id;
 if not found then return false; end if;
 if c.commercial_id=_user_id or c.user_id=_user_id then return true; end if;
 if exists(select 1 from public.interventions_techniques i where i.client_id=_client_id and i.agent_technique_id=_user_id) then return true; end if;
 select * into p from public.profiles where user_id=_user_id limit 1;
 if not found then return false; end if;
 if exists(select 1 from public.plantations pl where pl.client_id=_client_id and ((pl.district_id is not null and p.district_id=pl.district_id) or (pl.region_id is not null and p.region_id=pl.region_id))) then return true; end if;
 if exists(select 1 from public.plantations pl join public.zone_assignments z on z.user_id=_user_id where pl.client_id=_client_id and (
   (z.zone_type='district' and z.zone_id=pl.district_id) or (z.zone_type='region' and z.zone_id=pl.region_id) or
   (z.zone_type='departement' and z.zone_id=pl.departement_id) or (z.zone_type='sous_prefecture' and z.zone_id=pl.sous_prefecture_id)
 )) then return true; end if;
 select coalesce(c.district_id,pa.district_id) district_id, coalesce(c.region_id,pa.region_id) region_id,
        coalesce(c.departement_id,pa.departement_id) departement_id, coalesce(c.sous_prefecture_id,pa.sous_prefecture_id) sous_prefecture_id
 into g from (select 1) x left join public.parcelles pa on pa.id=c.parcelle_id;
 if g.district_id is not null and p.district_id=g.district_id then return true; end if;
 if g.region_id is not null and p.region_id=g.region_id then return true; end if;
 if exists(select 1 from public.zone_assignments z where z.user_id=_user_id and (
   (z.zone_type='district' and z.zone_id=g.district_id) or (z.zone_type='region' and z.zone_id=g.region_id) or
   (z.zone_type='departement' and z.zone_id=g.departement_id) or (z.zone_type='sous_prefecture' and z.zone_id=g.sous_prefecture_id)
 )) then return true; end if;
 if p.equipe_id is not null and (private.has_role(_user_id,'chef_equipe_commercial') or private.has_role(_user_id,'chef_equipe_technique') or private.has_role(_user_id,'responsable_commercial')) then
   if exists(select 1 from public.profiles member where member.equipe_id=p.equipe_id and (
     member.user_id=c.commercial_id or (g.region_id is not null and member.region_id=g.region_id) or (g.district_id is not null and member.district_id=g.district_id) or exists(
       select 1 from public.zone_assignments z where z.user_id=member.user_id and (
         (z.zone_type='district' and z.zone_id=g.district_id) or (z.zone_type='region' and z.zone_id=g.region_id) or
         (z.zone_type='departement' and z.zone_id=g.departement_id) or (z.zone_type='sous_prefecture' and z.zone_id=g.sous_prefecture_id)
       )
     )
   )) then return true; end if;
 end if;
 return false;
end;
$function$;
