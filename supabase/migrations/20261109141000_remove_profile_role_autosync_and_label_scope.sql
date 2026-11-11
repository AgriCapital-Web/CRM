-- user_roles is the only role authority; profile labels never grant permissions.
begin;

drop trigger if exists trg_sync_governance_role_from_profile on public.profiles;
drop function if exists public.sync_governance_role_from_profile();

-- A profile label (PDG, DG, Associé) is descriptive only. Geography is
-- governed by app_roles.niveau_couverture and zone_assignments.
create or replace function public.normalize_profile_org_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_type text;
begin
  if new.equipe_id is not null and coalesce(new.departement, '') = '' then
    select e.type_equipe into v_type
    from public.equipes e
    where e.id = new.equipe_id;

    if v_type is not null then
      new.departement := case lower(v_type)
        when 'commercial' then 'Commercial'
        when 'technique' then 'Technique'
        when 'service_client' then 'Service client'
        else initcap(replace(v_type, '_', ' '))
      end;
    end if;
  end if;
  return new;
end;
$function$;

notify pgrst, 'reload schema';
commit;
