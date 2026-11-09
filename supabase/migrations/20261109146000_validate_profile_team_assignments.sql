-- Validation des affectations d'équipe côté base, y compris les créations par Edge Function.
begin;

create or replace function public.validate_profile_team_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_team_type text;
  v_department text := lower(trim(coalesce(new.departement, '')));
begin
  if new.equipe_id is null then
    return new;
  end if;

  select e.type_equipe into v_team_type
  from public.equipes e
  where e.id = new.equipe_id and e.actif is true;

  if not found then
    raise exception 'Équipe introuvable ou inactive.' using errcode = '22023';
  end if;

  if v_department = 'commercial' and v_team_type is not null and v_team_type <> 'commercial' then
    raise exception 'L’équipe sélectionnée n’est pas compatible avec le département Commercial.' using errcode = '22023';
  end if;

  if v_department = 'technique' and v_team_type is not null and v_team_type <> 'technique' then
    raise exception 'L’équipe sélectionnée n’est pas compatible avec le département Technique.' using errcode = '22023';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validate_profile_team_department on public.profiles;
create trigger trg_validate_profile_team_department
before insert or update of equipe_id, departement on public.profiles
for each row execute function public.validate_profile_team_department();

notify pgrst, 'reload schema';
commit;
