CREATE OR REPLACE FUNCTION public.create_acquisition_for_new_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_offre public.offres%rowtype;
  v_formula jsonb;
  v_surface numeric;
  v_pi_par_ha numeric;
  v_total_par_ha numeric;
  v_mensualite_par_ha numeric;
  v_duree integer;
  v_echeancier jsonb;
  v_gestion_type text;
  v_mode text;
  v_use_shared boolean := false;
begin
  if coalesce(new.is_internal, false) then return new; end if;
  v_surface := coalesce(new.total_hectares, 0);
  if new.offre_id is null or v_surface <= 0 then return new; end if;
  if coalesce(new.montant_total_contrat, 0) <= 0 then
    raise exception 'Le montant contractuel doit être positif avant de créer une vente.';
  end if;
  if exists (select 1 from public.acquisitions a where a.client_id = new.id) then return new; end if;

  select * into v_offre from public.offres where id = new.offre_id;
  if not found or v_offre.code is null or v_offre.nom is null then
    raise exception 'Offre absente ou incomplète pour la création de l’acquisition du client %', new.id;
  end if;

  select item.value into v_formula
    from jsonb_array_elements(coalesce(v_offre.formules_configuration, '[]'::jsonb)) item(value)
   where item.value->>'code' = new.formule_code
   limit 1;
  if v_formula is null then
    raise exception 'Formule absente ou non configurée pour l’offre %. Aucun tarif générique ne sera appliqué.', v_offre.nom
      using errcode = '23514';
  end if;

  v_mode := coalesce(new.mode_paiement, 'echeancier');
  v_use_shared := coalesce((v_formula->>'utilise_tarif_commun')::boolean, false);
  v_pi_par_ha := coalesce(nullif(v_formula->>'montant_pi_par_ha', '')::numeric,
    case when v_use_shared then coalesce(v_offre.montant_pi_par_ha, v_offre.paiement_signature_par_ha) end);
  v_mensualite_par_ha := coalesce(nullif(v_formula->>'mensualite_par_ha', '')::numeric,
    case when v_use_shared then v_offre.mensualite_par_ha end);
  v_duree := coalesce(nullif(v_formula->>'duree_paiement_mois', '')::integer,
    case when v_use_shared then v_offre.duree_paiement_mois end);
  v_echeancier := coalesce(v_formula->'tranches_paiement',
    case when v_use_shared then v_offre.tranches_paiement end);
  v_gestion_type := coalesce(v_formula->>'gestion_type', v_offre.gestion_type);

  if v_mode = 'comptant' then
    v_pi_par_ha := new.montant_total_contrat / v_surface;
    v_mensualite_par_ha := 0;
    v_duree := 1;
    v_echeancier := '[]'::jsonb;
  end if;
  if v_pi_par_ha is null or v_mensualite_par_ha is null or v_duree is null
     or v_duree <= 0 or v_echeancier is null or jsonb_typeof(v_echeancier) <> 'array' then
    raise exception 'Les paramètres financiers de la formule % sont incomplets.', new.formule_code
      using errcode = '23514';
  end if;

  v_total_par_ha := new.montant_total_contrat / v_surface;

  IF NOT coalesce(v_offre.necessite_foncier_client,false)
     AND upper(coalesce(v_offre.famille_offre,'')||' '||coalesce(v_offre.code,'')) LIKE '%PALMINVEST%' THEN
    UPDATE public.clients
       SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
         'deferred_land_allocation',true,'foncier_a_attribuer_plus_tard',true,
         'surface_contractuelle_ha',v_surface,'surface_fonciere_allouee_ha',0,
         'surface_fonciere_restante_ha',v_surface,'surface_plantee_ha',0,
         'surface_non_plantee_ha',v_surface,'technical_intervention_pending',true,
         'land_allocation_note','Affectation fonciere progressive : les hectares contractuels pourront etre repartis sur plusieurs parcelles.'
       ),updated_at=now()
     WHERE id=new.id;
  END IF;

  insert into public.acquisitions (
    client_id, offre_id, offre_code, offre_nom, famille_offre, formule_code, formule_nom, gestion_type,
    necessite_foncier_client, superficie_ha, parcelle_id, lot_id, mode_paiement,
    montant_pi_par_ha, montant_pi_total, montant_total_par_ha, montant_total_contrat,
    mensualite_par_ha, mensualite_montant, duree_paiement_mois, echeancier,
    promotion_id, montant_promo_applique, statut, statut_technique, notes, metadata, created_by, validation_statut
  ) values (
    new.id, v_offre.id, v_offre.code, v_offre.nom, v_offre.famille_offre,
    new.formule_code, v_formula->>'nom', v_gestion_type,
    coalesce(v_offre.necessite_foncier_client, false), v_surface, new.parcelle_id, null, v_mode,
    v_pi_par_ha, coalesce(new.paiement_initial_montant, v_pi_par_ha * v_surface),
    v_total_par_ha, new.montant_total_contrat, v_mensualite_par_ha,
    coalesce(new.mensualite_montant, v_mensualite_par_ha * v_surface), v_duree, v_echeancier,
    new.promotion_id, coalesce(new.montant_promo_applique, 0), 'souscrite', 'en_attente_intervention',
    null, CASE
      WHEN NOT coalesce(v_offre.necessite_foncier_client,false)
       AND upper(coalesce(v_offre.famille_offre,'')||' '||coalesce(v_offre.code,'')) LIKE '%PALMINVEST%'
      THEN jsonb_build_object(
        'source','clients','client_id',new.id,'created_from_client_workflow',true,
        'deferred_land_allocation',true,'foncier_a_attribuer_plus_tard',true,
        'surface_contractuelle_ha',v_surface,'surface_fonciere_allouee_ha',0,
        'surface_fonciere_restante_ha',v_surface,'surface_plantee_ha',0,
        'surface_non_plantee_ha',v_surface,'technical_intervention_pending',true,
        'informations_foncieres',coalesce(new.metadata->'informations_foncieres','{}'::jsonb)
      )
      ELSE jsonb_build_object(
      'source','clients','client_id',new.id,'created_from_client_workflow',true,
      'informations_foncieres',coalesce(new.metadata->'informations_foncieres','{}'::jsonb)
    )
    END,
    new.created_by, 'a_valider'
  );
  return new;
end
$function$;
