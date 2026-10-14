-- Respect multi-team membership for team leads and grant service-client global read scope
-- on client-linked operational records, while financial modules remain permission-gated.
CREATE OR REPLACE FUNCTION private.can_access_client(_user_id uuid, _client_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c record; p record; g record;
begin
 if _user_id is null or _client_id is null then return false; end if;
 if private.is_global_admin(_user_id)
    or private.has_role(_user_id,'responsable_operations')
    or private.has_role(_user_id,'service_client')
    or private.has_role(_user_id,'chef_equipe_service_client')
    or private.has_role(_user_id,'comptable') then return true; end if;
 select * into c from public.clients where id=_client_id;
 if not found then return false; end if;
 if c.commercial_id=_user_id or c.user_id=_user_id or c.created_by=_user_id then return true; end if;
 if exists(select 1 from public.interventions_techniques i where i.client_id=_client_id and i.agent_technique_id=_user_id) then return true; end if;
 select * into p from public.profiles where user_id=_user_id limit 1;
 if not found then return false; end if;
 if exists (
   select 1 from public.plantations pl
   where pl.client_id=_client_id and (
     (pl.district_id is not null and p.district_id=pl.district_id)
     or (pl.region_id is not null and p.region_id=pl.region_id)
   )
 ) then return true; end if;
 if exists (
   select 1 from public.plantations pl
   join public.zone_assignments z on z.user_id=_user_id
   where pl.client_id=_client_id and (
     (z.zone_type='district' and z.zone_id=pl.district_id)
     or (z.zone_type='region' and z.zone_id=pl.region_id)
     or (z.zone_type='departement' and z.zone_id=pl.departement_id)
     or (z.zone_type='sous_prefecture' and z.zone_id=pl.sous_prefecture_id)
   )
 ) then return true; end if;
 select coalesce(c.district_id, pa.district_id) as district_id,
        coalesce(c.region_id, pa.region_id) as region_id,
        coalesce(c.departement_id, pa.departement_id) as departement_id,
        coalesce(c.sous_prefecture_id, pa.sous_prefecture_id) as sous_prefecture_id
 into g from (select 1) x left join public.parcelles pa on pa.id=c.parcelle_id;
 if g.district_id is not null and p.district_id=g.district_id then return true; end if;
 if g.region_id is not null and p.region_id=g.region_id then return true; end if;
 if exists(
   select 1 from public.zone_assignments z
   where z.user_id=_user_id
     and ((z.zone_type='district' and z.zone_id=g.district_id)
       or (z.zone_type='region' and z.zone_id=g.region_id)
       or (z.zone_type='departement' and z.zone_id=g.departement_id)
       or (z.zone_type='sous_prefecture' and z.zone_id=g.sous_prefecture_id))
 ) then return true; end if;
 if private.has_role(_user_id,'chef_equipe_commercial')
    or private.has_role(_user_id,'chef_equipe_technique')
    or private.has_role(_user_id,'responsable_commercial') then
   if exists(
     select 1
       from public.profiles viewer
       join public.equipe_membres viewer_team on viewer_team.profile_id=viewer.id
       join public.equipe_membres member_team on member_team.equipe_id=viewer_team.equipe_id
       join public.profiles member on member.id=member_team.profile_id
      where viewer.user_id=_user_id
        and (
          member.user_id=c.commercial_id
          or (g.region_id is not null and member.region_id=g.region_id)
          or (g.district_id is not null and member.district_id=g.district_id)
          or exists(
            select 1 from public.zone_assignments z
            where z.user_id=member.user_id
              and ((z.zone_type='district' and z.zone_id=g.district_id)
                or (z.zone_type='region' and z.zone_id=g.region_id)
                or (z.zone_type='departement' and z.zone_id=g.departement_id)
                or (z.zone_type='sous_prefecture' and z.zone_id=g.sous_prefecture_id)
              )
          )
        )
   ) then return true; end if;
   -- Compatibilité avec les profils encore rattachés uniquement à l'équipe principale.
   if p.equipe_id is not null and exists(
     select 1 from public.profiles member
      where member.equipe_id=p.equipe_id
        and (member.user_id=c.commercial_id
          or (g.region_id is not null and member.region_id=g.region_id)
          or (g.district_id is not null and member.district_id=g.district_id))
   ) then return true; end if;
 end if;
 return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.can_access_lead(_user_id uuid, _lead_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l record; p record;
begin
  if _user_id is null or _lead_id is null then return false; end if;

  if private.is_global_admin(_user_id)
     or private.has_role(_user_id,'responsable_operations')
     or private.has_role(_user_id,'service_client')
     or private.has_role(_user_id,'chef_equipe_service_client') then
    return true;
  end if;

  select * into l from public.leads where id=_lead_id;
  if not found then return false; end if;

  if private.has_role(_user_id,'mobilisateur_foncier') then
    return l.created_by=_user_id or l.assigned_to=_user_id;
  end if;

  if private.has_role(_user_id,'superviseur_mobilisation_fonciere') then
    return l.created_by=_user_id
      or l.assigned_to=_user_id
      or exists (
        select 1 from public.zone_assignments z
        where z.user_id=_user_id and z.zone_type='region'
          and z.zone_id=l.region_id
      );
  end if;

  if l.created_by=_user_id or l.assigned_to=_user_id then return true; end if;

  if exists (
    select 1 from public.zone_assignments z
    where z.user_id=_user_id
      and ((z.zone_type='region' and z.zone_id=l.region_id)
        or (z.zone_type='departement' and z.zone_id=l.departement_id)
        or (z.zone_type='sous_prefecture' and z.zone_id=l.sous_prefecture_id))
  ) then return true; end if;

  select * into p from public.profiles where user_id=_user_id limit 1;
  if not found then return false; end if;

  if l.region_id is not null and p.region_id=l.region_id then return true; end if;
  if l.district_id is not null and p.district_id=l.district_id then return true; end if;

  if private.has_role(_user_id,'chef_equipe_commercial')
     or private.has_role(_user_id,'chef_equipe_technique')
     or private.has_role(_user_id,'chef_equipe_service_client')
     or private.has_role(_user_id,'responsable_commercial') then
    if exists (
      select 1
        from public.profiles viewer
        join public.equipe_membres viewer_team on viewer_team.profile_id=viewer.id
        join public.equipe_membres member_team on member_team.equipe_id=viewer_team.equipe_id
        join public.profiles member on member.id=member_team.profile_id
       where viewer.user_id=_user_id
         and (member.user_id=l.assigned_to or member.user_id=l.created_by)
    ) then return true; end if;
    -- Compatibilité avec les rattachements historiques.
    if p.equipe_id is not null and exists (
      select 1 from public.profiles member
       where member.equipe_id=p.equipe_id
         and (member.user_id=l.assigned_to or member.user_id=l.created_by)
    ) then return true; end if;
  end if;

  return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.can_access_parcelle(_user_id uuid, _parcelle_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    private.is_global_admin(_user_id)
    or private.has_role(_user_id, 'responsable_operations')
    or private.has_role(_user_id, 'service_client')
    or private.has_role(_user_id, 'chef_equipe_service_client')
    or exists (
      select 1 from public.parcelles p
      where p.id = _parcelle_id and p.created_by = _user_id
    )
    or exists (
      select 1
      from public.plantations pl
      where pl.parcelle_id = _parcelle_id
        and private.can_access_client(_user_id, pl.client_id)
    )
    or exists (
      select 1
      from public.zone_assignments za
      join public.parcelles p on p.id = _parcelle_id
      where za.user_id = _user_id
        and (
          (za.zone_type='district' and za.zone_id=p.district_id)
          or (za.zone_type='region' and za.zone_id=p.region_id)
          or (za.zone_type='departement' and za.zone_id=p.departement_id)
          or (za.zone_type='sous_prefecture' and za.zone_id=p.sous_prefecture_id)
        )
    )
    or exists (
      select 1
      from public.profiles pr
      join public.parcelles p on p.id = _parcelle_id
      where pr.user_id = _user_id
        and (
          (pr.district_id is not null and pr.district_id = p.district_id)
          or (pr.region_id is not null and pr.region_id = p.region_id)
        )
        and private.has_role(_user_id, 'responsable_commercial')
    );
$function$
;

delete from public.role_permissions
where role_code in ('service_client', 'chef_equipe_service_client')
  and permission_code in ('commissions.view', 'portefeuilles.view');

insert into public.role_permissions (role_code, permission_code)
values ('service_client', 'plantations.view')
on conflict do nothing;


-- Keep team performance scoped to the teams the current user belongs to.
CREATE OR REPLACE FUNCTION private.can_view_team_performance(_user_id uuid, _team_id uuid, _team_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p record;
begin
 if _user_id is null then return false; end if;
 if private.is_global_admin(_user_id) or private.has_role(_user_id,'responsable_operations') then return true; end if;
 select * into p from public.profiles where user_id=_user_id limit 1;
 if private.has_role(_user_id,'responsable_commercial') and lower(coalesce(_team_type,''))='commercial' then return true; end if;
 if (
   (private.has_role(_user_id,'chef_equipe_commercial') and lower(coalesce(_team_type,''))='commercial') or
   (private.has_role(_user_id,'chef_equipe_technique') and lower(coalesce(_team_type,''))='technique')
 ) and (
   p.equipe_id=_team_id
   or exists (
     select 1 from public.equipe_membres em
     join public.profiles viewer on viewer.id=em.profile_id
     where viewer.user_id=_user_id and em.equipe_id=_team_id
   )
 ) then return true; end if;
 return false;
end; $function$
;

-- Aggregate team performance through explicit memberships; keep RLS active on underlying tables.
create or replace view public.v_performance_equipes with (security_invoker = true) as
 SELECT id,
    nom,
    type_equipe,
    region_id,
        CASE
            WHEN lower(COALESCE(type_equipe, ''::text)) ~~ '%commercial%'::text THEN ( SELECT count(*) AS count
               FROM clients c
                 JOIN profiles p ON p.user_id = c.created_by
              WHERE p.equipe_id = e.id OR (EXISTS ( SELECT 1
                       FROM equipe_membres em
                      WHERE em.profile_id = p.id AND em.equipe_id = e.id)))
            ELSE 0::bigint
        END AS clients,
        CASE
            WHEN lower(COALESCE(type_equipe, ''::text)) ~~ '%commercial%'::text THEN COALESCE(( SELECT sum(COALESCE(c.total_hectares, 0::numeric)) AS sum
               FROM clients c
                 JOIN profiles p ON p.user_id = c.created_by
              WHERE p.equipe_id = e.id OR (EXISTS ( SELECT 1
                       FROM equipe_membres em
                      WHERE em.profile_id = p.id AND em.equipe_id = e.id))), 0::numeric)
            ELSE 0::numeric
        END AS hectares,
        CASE
            WHEN lower(COALESCE(type_equipe, ''::text)) ~~ '%technique%'::text THEN ( SELECT count(*) AS count
               FROM interventions_techniques i
                 JOIN profiles p ON p.id = i.agent_technique_id
              WHERE p.equipe_id = e.id OR (EXISTS ( SELECT 1
                       FROM equipe_membres em
                      WHERE em.profile_id = p.id AND em.equipe_id = e.id)))
            ELSE 0::bigint
        END AS interventions
   FROM equipes e
  WHERE actif = true AND private.can_view_team_performance(auth.uid(), id, type_equipe);;
alter view public.v_performance_equipes set (security_invoker = true);
