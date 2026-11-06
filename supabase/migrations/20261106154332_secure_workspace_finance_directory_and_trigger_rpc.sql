begin;

create or replace function public.workspace_list_finance_users()
returns table(
  id uuid,
  nom_complet text,
  email text,
  poste text,
  relation_rh text,
  actif boolean,
  salaire_base numeric,
  role_codes text[],
  role_names text[]
)
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if not public.workspace_can_manage_finance() then
    raise exception 'Permission financière requise'
      using errcode = '42501';
  end if;

  return query
  select p.id,p.nom_complet,p.email,p.poste,p.relation_rh,p.actif,p.salaire_base,
         coalesce(array_agg(distinct ur.role) filter(where ur.role is not null),'{}'::text[]),
         coalesce(array_agg(distinct ar.nom) filter(where ar.nom is not null),'{}'::text[])
  from public.profiles p
  left join public.user_roles ur on ur.user_id=p.user_id
  left join public.app_roles ar on lower(ar.code)=lower(ur.role)
  where p.user_id is not null
  group by p.id,p.nom_complet,p.email,p.poste,p.relation_rh,p.actif,p.salaire_base
  order by p.nom_complet;
end;
$function$;

create or replace function public.workspace_event_has_participant(p_event_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select p_profile_id = public.internal_current_profile_id()
     and exists (
       select 1
       from public.workspace_event_participants ep
       where ep.event_id = p_event_id
         and ep.profile_id = public.internal_current_profile_id()
     );
$function$;

create or replace function public.workspace_event_is_owner(p_event_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select p_profile_id = public.internal_current_profile_id()
     and exists (
       select 1
       from public.workspace_events e
       where e.id = p_event_id
         and e.created_by_profile_id = public.internal_current_profile_id()
     );
$function$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prorettype='trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
  end loop;
end
$$;

commit;
