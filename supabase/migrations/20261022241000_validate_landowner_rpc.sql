create or replace function public.validate_proprietaire_foncier(
  _proprietaire_id uuid,
  _decision text,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_owner public.proprietaires_terres%rowtype;
  v_parcelles integer := 0;
  v_conventions integer := 0;
begin
  if auth.uid() is null or not private.has_role_permission('proprietaires.validate') then
    raise exception 'Accès refusé : le rôle ne permet pas de valider un dossier foncier.' using errcode='42501';
  end if;
  if _decision not in ('valide','refuse') then
    raise exception 'Décision de validation invalide.' using errcode='22023';
  end if;

  select * into v_owner from public.proprietaires_terres
   where id = _proprietaire_id for update;
  if not found then raise exception 'Propriétaire foncier introuvable.' using errcode='P0002'; end if;
  if v_owner.validation_statut <> 'a_valider' then
    raise exception 'Ce dossier foncier a déjà été traité.' using errcode='23514';
  end if;

  update public.proprietaires_terres
     set validation_statut = _decision,
         validation_notes = nullif(btrim(coalesce(_notes,'')),''),
         updated_by = auth.uid(),
         updated_at = now()
   where id = _proprietaire_id;

  if _decision = 'valide' then
    update public.parcelles
       set statut = 'validee', updated_at = now()
     where proprietaire_id = _proprietaire_id and statut = 'a_valider';
    get diagnostics v_parcelles = row_count;

    update public.conventions_foncieres
       set statut = 'active', updated_at = now()
     where proprietaire_id = _proprietaire_id and statut = 'a_valider';
    get diagnostics v_conventions = row_count;
  else
    update public.parcelles
       set statut = 'refusee', updated_at = now()
     where proprietaire_id = _proprietaire_id and statut = 'a_valider';
    get diagnostics v_parcelles = row_count;

    update public.conventions_foncieres
       set statut = 'refusee', updated_at = now()
     where proprietaire_id = _proprietaire_id and statut = 'a_valider';
    get diagnostics v_conventions = row_count;
  end if;

  return jsonb_build_object(
    'proprietaire_id',_proprietaire_id,
    'validation_statut',_decision,
    'parcelles_traitees',v_parcelles,
    'conventions_traitees',v_conventions
  );
end
$function$;

revoke all on function public.validate_proprietaire_foncier(uuid,text,text) from public, anon;
grant execute on function public.validate_proprietaire_foncier(uuid,text,text) to authenticated;
