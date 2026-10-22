create or replace function public.guard_landowner_validation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_service_role boolean := coalesce(current_setting('request.jwt.claim.role',true) = 'service_role', false);
  v_can_validate boolean := private.has_role_permission('proprietaires.validate');
begin
  if tg_op = 'INSERT' then
    if new.validation_statut is null then new.validation_statut := 'a_valider'; end if;
    if new.validation_statut not in ('a_valider','valide','refuse') then
      raise exception 'Statut de validation foncière invalide.' using errcode='23514';
    end if;
    if new.validation_statut <> 'a_valider' and not v_service_role and not v_can_validate then
      raise exception 'Seuls les validateurs autorisés peuvent valider un nouveau dossier foncier.' using errcode='42501';
    end if;
    if new.validation_statut = 'valide' then
      new.statut := 'actif';
      new.validated_by := auth.uid();
      new.validated_at := coalesce(new.validated_at,now());
    elsif new.validation_statut = 'refuse' then
      new.statut := 'refuse';
      new.validated_by := auth.uid();
      new.validated_at := coalesce(new.validated_at,now());
    else
      new.statut := 'en_attente_validation';
      new.validated_by := null;
      new.validated_at := null;
    end if;
    return new;
  end if;

  if new.validation_statut is distinct from old.validation_statut then
    if not v_service_role and not v_can_validate then
      raise exception 'Vous ne disposez pas du droit de validation foncière.' using errcode='42501';
    end if;
    if new.validation_statut not in ('a_valider','valide','refuse') then
      raise exception 'Statut de validation foncière invalide.' using errcode='23514';
    end if;
    if new.validation_statut = 'valide' then
      new.statut := 'actif';
      new.validated_by := auth.uid();
      new.validated_at := now();
    elsif new.validation_statut = 'refuse' then
      new.statut := 'refuse';
      new.validated_by := auth.uid();
      new.validated_at := now();
    else
      new.statut := 'en_attente_validation';
      new.validated_by := null;
      new.validated_at := null;
    end if;
  elsif new.statut is distinct from old.statut
     and new.validation_statut <> 'valide'
     and new.statut = 'actif' then
    raise exception 'Un dossier foncier doit être validé avant son activation.' using errcode='42501';
  elsif (new.validated_by is distinct from old.validated_by
     or new.validated_at is distinct from old.validated_at)
     and not v_service_role then
    raise exception 'Les métadonnées de validation sont gérées automatiquement.' using errcode='42501';
  end if;
  return new;
end
$function$;

revoke all on function public.guard_landowner_validation_fields() from public,anon,authenticated;
grant execute on function public.guard_landowner_validation_fields() to service_role;
