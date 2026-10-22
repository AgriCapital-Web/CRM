-- Preserve the status of existing landowners, but submit all new registrations for validation.
alter table public.proprietaires_terres
  add column if not exists validation_statut text not null default 'valide',
  add column if not exists validated_by uuid references auth.users(id) on delete set null,
  add column if not exists validated_at timestamptz,
  add column if not exists validation_notes text;

alter table public.proprietaires_terres
  alter column validation_statut set default 'a_valider';

alter table public.proprietaires_terres
  drop constraint if exists proprietaires_terres_validation_statut_check;
alter table public.proprietaires_terres
  add constraint proprietaires_terres_validation_statut_check
  check (validation_statut in ('a_valider','valide','refuse'));

insert into public.app_permissions (code,module,action,libelle,description,actif)
values ('proprietaires.validate','proprietaires','validate','Valider les dossiers fonciers','Valider ou refuser les dossiers de propriétaires fonciers soumis par les équipes terrain.',true)
on conflict (code) do update set module=excluded.module, action=excluded.action, libelle=excluded.libelle, description=excluded.description, actif=true;

insert into public.role_permissions (role_code,permission_code)
select roles.role_code,'proprietaires.validate'
from (values ('pdg'),('service_client'),('chef_equipe_service_client')) as roles(role_code)
on conflict do nothing;

-- Keep the validation fields protected even for users who can edit owner contact details.
create or replace function public.guard_landowner_validation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'INSERT' then
    if new.validation_statut is null then new.validation_statut := 'a_valider'; end if;
    if new.validation_statut not in ('a_valider','valide','refuse') then
      raise exception 'Statut de validation foncière invalide.' using errcode='23514';
    end if;
    if new.validation_statut <> 'a_valider'
       and current_setting('request.jwt.claim.role',true) is distinct from 'service_role'
       and not private.has_role_permission('proprietaires.validate') then
      raise exception 'Seuls les validateurs autorisés peuvent valider un nouveau dossier foncier.' using errcode='42501';
    end if;
    if new.validation_statut = 'valide' then
      new.validated_by := auth.uid();
      new.validated_at := coalesce(new.validated_at,now());
    end if;
    return new;
  end if;

  if new.validation_statut is distinct from old.validation_statut then
    if current_setting('request.jwt.claim.role',true) is distinct from 'service_role'
       and not private.has_role_permission('proprietaires.validate') then
      raise exception 'Vous ne disposez pas du droit de validation foncière.' using errcode='42501';
    end if;
    if new.validation_statut not in ('a_valider','valide','refuse') then
      raise exception 'Statut de validation foncière invalide.' using errcode='23514';
    end if;
    if new.validation_statut = 'valide' then
      new.validated_by := auth.uid();
      new.validated_at := now();
    elsif new.validation_statut = 'refuse' then
      new.validated_by := auth.uid();
      new.validated_at := now();
    else
      new.validated_by := null;
      new.validated_at := null;
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_guard_landowner_validation_fields on public.proprietaires_terres;
create trigger trg_guard_landowner_validation_fields
before insert or update of validation_statut,validated_by,validated_at
on public.proprietaires_terres
for each row execute function public.guard_landowner_validation_fields();

revoke all on function public.guard_landowner_validation_fields() from public,anon,authenticated;
grant execute on function public.guard_landowner_validation_fields() to service_role;
