-- La rémunération de base ne peut pas être modifiée via le profil sans permission financière.
begin;

create or replace function public.guard_profile_salary_base()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not (
    private.is_global_admin((select auth.uid()))
    or private.has_role_permission('finance.payroll')
    or private.has_role_permission('finance.manage')
  ) then
    if tg_op = 'INSERT' then
      new.salaire_base := null;
    else
      new.salaire_base := old.salaire_base;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_profile_salary_base on public.profiles;
create trigger trg_guard_profile_salary_base
before insert or update on public.profiles
for each row execute function public.guard_profile_salary_base();

notify pgrst, 'reload schema';
commit;
