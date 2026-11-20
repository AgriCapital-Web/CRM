CREATE OR REPLACE FUNCTION public.review_acquisition_validation(p_acquisition_id uuid, p_action text, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_acquisition public.acquisitions%rowtype;
  v_user uuid := auth.uid();
  v_pdg boolean := false;
  v_deferred_land boolean := false;
begin
  if v_user is null or not (
    private.has_role_permission('acquisitions.validate')
    or exists(select 1 from public.user_roles where user_id=v_user and role in ('pdg','service_client','chef_equipe_service_client'))
  ) then
    raise exception 'Vous n’êtes pas autorisé à valider les ventes.' using errcode='42501';
  end if;
  if p_action not in ('valider','demander_modification') then
    raise exception 'Action de validation inconnue.';
  end if;
  select * into v_acquisition from public.acquisitions where id=p_acquisition_id for update;
  if v_acquisition.id is null then raise exception 'Vente introuvable.'; end if;
  v_pdg:=private.has_role(v_user,'pdg');
  v_deferred_land:=coalesce((v_acquisition.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false)
    OR coalesce((v_acquisition.metadata->>'deferred_land_allocation')::boolean,false);
  if p_action='valider' then
    update public.acquisitions
       set validation_statut='valide',
           statut=CASE WHEN NOT coalesce(v_acquisition.necessite_foncier_client,false) OR v_deferred_land THEN 'active' ELSE statut END,
           metadata=CASE
             WHEN NOT coalesce(v_acquisition.necessite_foncier_client,false) OR v_deferred_land
             THEN coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
               'validation_acquisition_sans_foncier',true,
               'validation_pdg_sans_convention_active',v_pdg
             )
             ELSE coalesce(metadata,'{}'::jsonb)
           END,
           validation_commentaire=null,validation_par=v_user,validation_at=now(),
           validation_demande_at=null,updated_at=now()
     where id=p_acquisition_id;
  else
    if nullif(trim(coalesce(p_comment,'')),'') is null then
      raise exception 'Indiquez les corrections à effectuer.';
    end if;
    update public.acquisitions set validation_statut='modification_demandee',
      validation_commentaire=trim(p_comment),validation_demande_at=now(),
      validation_par=v_user,validation_at=null,updated_at=now()
    where id=p_acquisition_id;
  end if;
  return jsonb_build_object('acquisition_id',p_acquisition_id,'validation_statut',case when p_action='valider' then 'valide' else 'modification_demandee' end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.allow_deferred_land_acquisition_before_validation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_client_metadata jsonb;
BEGIN
  IF NEW.client_id IS NULL OR NEW.lot_id IS NOT NULL OR NEW.parcelle_id IS NOT NULL
     OR coalesce(NEW.necessite_foncier_client,false) THEN RETURN NEW; END IF;
  SELECT coalesce(metadata,'{}'::jsonb) INTO v_client_metadata
    FROM public.clients WHERE id=NEW.client_id;
  IF NOT coalesce((v_client_metadata->>'deferred_land_allocation')::boolean,false)
     OR upper(regexp_replace(coalesce(NEW.famille_offre,'') || ' ' || coalesce(NEW.offre_code,''),'[-_[:space:]]','','g')) NOT LIKE '%PALMINVEST%' THEN
    RETURN NEW;
  END IF;
  NEW.metadata := coalesce(NEW.metadata,'{}'::jsonb) ||
    jsonb_build_object('foncier_a_attribuer_plus_tard',true,'technical_intervention_pending',true);
  IF coalesce((v_client_metadata->>'commercial_validation_sans_foncier')::boolean,false)
     OR coalesce((NEW.metadata->>'validation_acquisition_sans_foncier')::boolean,false)
     OR coalesce((NEW.metadata->>'validation_pdg_sans_convention_active')::boolean,false) THEN
    NEW.statut := 'active'; NEW.validation_statut := 'valide';
    NEW.metadata := NEW.metadata || jsonb_build_object('validation_acquisition_sans_foncier',true);
  ELSE
    NEW.statut := 'souscrite'; NEW.validation_statut := 'a_valider';
  END IF;
  NEW.necessite_foncier_client := true;
  RETURN NEW;
END;
$function$;
