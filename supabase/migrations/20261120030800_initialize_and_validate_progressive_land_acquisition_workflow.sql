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
        'surface_non_plantee_ha',v_surface,'technical_intervention_pending',true
      )
      ELSE jsonb_build_object('source','clients','client_id',new.id,'created_from_client_workflow',true)
    END,
    new.created_by, 'a_valider'
  );
  return new;
end
$function$;

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
  if p_action='valider' then
    update public.acquisitions
       set validation_statut='valide',
           statut=CASE WHEN NOT coalesce(v_acquisition.necessite_foncier_client,false) THEN 'active' ELSE statut END,
           metadata=CASE
             WHEN NOT coalesce(v_acquisition.necessite_foncier_client,false)
              AND (
                coalesce((v_acquisition.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false)
                OR coalesce((v_acquisition.metadata->>'deferred_land_allocation')::boolean,false)
              )
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

CREATE OR REPLACE FUNCTION public.validate_client_acquisition_foncier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lot public.lots_hectares%rowtype;
  v_parcelle public.parcelles%rowtype;
  v_allocation jsonb;
  v_allocation_lot public.lots_hectares%rowtype;
  v_amount numeric;
  v_total numeric := 0;
  v_first_lot_id uuid;
  v_first_convention_id uuid;
  v_expected_lot_number integer;
  v_allocation_count integer := 0;
  v_family text;
  v_target_lot_id uuid;
  v_preassigned boolean := false;
  v_allocated_surface numeric;
  v_allocated_surface_actual numeric;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.client_id IS NOT DISTINCT FROM NEW.client_id
       AND OLD.lot_id IS NOT DISTINCT FROM NEW.lot_id
       AND OLD.parcelle_id IS NOT DISTINCT FROM NEW.parcelle_id
       AND OLD.necessite_foncier_client IS NOT DISTINCT FROM NEW.necessite_foncier_client
       AND OLD.superficie_ha IS NOT DISTINCT FROM NEW.superficie_ha
       AND OLD.metadata IS NOT DISTINCT FROM NEW.metadata
       AND OLD.statut IS NOT DISTINCT FROM NEW.statut
       AND OLD.validation_statut IS NOT DISTINCT FROM NEW.validation_statut THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.necessite_foncier_client THEN
    IF NEW.lot_id IS NOT NULL THEN
      RAISE EXCEPTION 'Une offre sur terrain propre ne peut pas réserver un lot partenaire.';
    END IF;
    RETURN NEW;
  END IF;

  v_family := regexp_replace(
    upper(coalesce(NEW.famille_offre,'') || ' ' || coalesce(NEW.offre_code,'')),
    '[-_[:space:]]','','g'
  );

  -- La direction autorise la validation métier même si la convention active est encore à rattacher.
  -- Le lot, la parcelle, le propriétaire et la quote-part restent contrôlés.
  IF coalesce((NEW.metadata->>'foncier_convention_en_attente')::boolean,false)
     OR coalesce((NEW.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false)
     OR coalesce((NEW.metadata->>'multi_parcelle_allocation')::boolean,false) THEN
    v_target_lot_id := coalesce(nullif(NEW.metadata->>'lot_cible_id','')::uuid,NEW.lot_id);
    IF v_target_lot_id IS NULL THEN
      IF coalesce((NEW.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false)
         OR coalesce((NEW.metadata->>'deferred_land_allocation')::boolean,false) THEN
        IF NEW.validation_statut='valide' THEN
          NEW.statut:='active';
          RETURN NEW;
        END IF;
        IF NEW.statut='souscrite' AND NEW.validation_statut='a_valider' THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Une acquisition sans lot doit rester en validation ou être explicitement validée par la direction.';
      END IF;
      RAISE EXCEPTION 'Le lot cible initial de l’acquisition foncière est absent.';
    END IF;
    IF NEW.lot_id IS NULL THEN NEW.lot_id:=v_target_lot_id; END IF;
    IF NEW.lot_id IS DISTINCT FROM v_target_lot_id THEN
      RAISE EXCEPTION 'Le lot cible initial de l’acquisition foncière est incohérent.';
    END IF;
    SELECT * INTO v_lot FROM public.lots_hectares WHERE id=v_target_lot_id FOR UPDATE;
    IF v_lot.id IS NULL THEN RAISE EXCEPTION 'Le lot foncier initial est introuvable.'; END IF;
    IF NEW.parcelle_id IS NULL THEN NEW.parcelle_id:=v_lot.parcelle_id; END IF;
    IF v_lot.parcelle_id IS DISTINCT FROM NEW.parcelle_id THEN
      RAISE EXCEPTION 'Le lot foncier initial ne correspond pas à la parcelle de référence.';
    END IF;
    IF coalesce(v_lot.part_type,'agricapital') <> 'agricapital' THEN
      RAISE EXCEPTION 'Le lot cible doit appartenir à la quote-part AgriCapital.';
    END IF;
    IF v_lot.client_id IS NULL THEN
      IF v_lot.acquisition_id IS NOT NULL
         OR lower(coalesce(v_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue')
         OR coalesce(v_lot.surface_disponible_ha,0) + 0.000001 < 1 THEN
        RAISE EXCEPTION 'Le lot cible initial n’est plus libre pour cette acquisition.';
      END IF;
    ELSE
      IF v_lot.client_id IS DISTINCT FROM NEW.client_id
         OR v_lot.acquisition_id IS DISTINCT FROM NEW.id
         OR lower(coalesce(v_lot.statut,'')) <> 'attribue' THEN
        RAISE EXCEPTION 'Le lot initial déjà affecté ne correspond pas à cette acquisition.';
      END IF;
    END IF;
    SELECT * INTO v_parcelle FROM public.parcelles WHERE id=v_lot.parcelle_id;
    IF v_parcelle.id IS NULL OR v_parcelle.proprietaire_id IS NULL THEN
      RAISE EXCEPTION 'Le propriétaire partenaire du lot initial doit être enregistré.';
    END IF;

    IF v_family LIKE '%PALMINVEST%' THEN
      SELECT COALESCE(SUM(al.surface_ha),0)
        INTO v_allocated_surface_actual
        FROM public.acquisition_lots al
       WHERE al.acquisition_id=NEW.id AND al.client_id=NEW.client_id;
      v_allocated_surface := COALESCE(
        NULLIF(NEW.metadata->>'surface_fonciere_allouee_ha','')::numeric,
        v_allocated_surface_actual
      );
      IF abs(v_allocated_surface_actual-v_allocated_surface)>0.000001 THEN
        RAISE EXCEPTION 'La surface foncière déclarée ne correspond pas au cumul des lots affectés.';
      END IF;
      IF v_allocated_surface>coalesce(NEW.superficie_ha,0)+0.000001 THEN
        RAISE EXCEPTION 'La surface foncière affectée dépasse la superficie contractuelle.';
      END IF;
      IF v_allocated_surface+0.000001<coalesce(NEW.superficie_ha,0)
         AND NOT coalesce((NEW.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false) THEN
        RAISE EXCEPTION 'La surface foncière restante doit être explicitement déclarée comme à affecter plus tard.';
      END IF;
      IF EXISTS (
        SELECT 1
          FROM public.acquisition_lots al
          JOIN public.lots_hectares lh ON lh.id=al.lot_id
         WHERE al.acquisition_id=NEW.id
           AND al.client_id=NEW.client_id
           AND (
             abs(coalesce(al.surface_ha,0)-1)>0.000001
             OR abs(coalesce(lh.surface_ha,0)-1)>0.000001
             OR lh.client_id IS DISTINCT FROM NEW.client_id
             OR lh.acquisition_id IS DISTINCT FROM NEW.id
             OR coalesce(lh.part_type,'agricapital')<>'agricapital'
           )
      ) THEN
        RAISE EXCEPTION 'Chaque lot PalmInvest affecté doit être un lot AgriCapital entier de 1 ha rattaché à cette acquisition.';
      END IF;
      IF EXISTS (
        SELECT 1
          FROM public.acquisition_lots al
          JOIN public.lots_hectares lh ON lh.id=al.lot_id
         WHERE al.acquisition_id=NEW.id
           AND al.client_id=NEW.client_id
           AND lh.id<>v_target_lot_id
           AND NOT EXISTS (
             SELECT 1 FROM public.conventions_foncieres cf
              WHERE cf.id=lh.convention_id
                AND cf.parcelle_id=lh.parcelle_id
                AND cf.proprietaire_id=(SELECT p.proprietaire_id FROM public.parcelles p WHERE p.id=lh.parcelle_id)
                AND cf.statut='active'
           )
      ) THEN
        RAISE EXCEPTION 'Chaque nouvelle parcelle doit être couverte par une convention foncière active.';
      END IF;
    ELSE
      IF coalesce(v_lot.surface_disponible_ha,0)+0.000001<coalesce(NEW.superficie_ha,0)
         AND NOT coalesce((NEW.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false) THEN
        RAISE EXCEPTION 'La superficie contractuelle dépasse le foncier affecté sans report explicite.';
      END IF;
    END IF;

    IF NEW.validation_statut='valide' THEN
      NEW.statut:='active';
      RETURN NEW;
    END IF;
    IF NEW.statut<>'souscrite' OR NEW.validation_statut<>'a_valider' THEN
      RAISE EXCEPTION 'Une acquisition sans convention initiale active doit rester souscrite tant qu’elle n’est pas validée.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.lot_id IS NULL THEN
    RAISE EXCEPTION 'Une offre partenaire doit être liée à un lot disponible.';
  END IF;

  IF jsonb_typeof(coalesce(NEW.metadata->'lot_allocations','[]'::jsonb))='array'
     AND jsonb_array_length(coalesce(NEW.metadata->'lot_allocations','[]'::jsonb))>0 THEN
    FOR v_allocation IN
      SELECT value FROM jsonb_array_elements(NEW.metadata->'lot_allocations')
    LOOP
      SELECT * INTO v_allocation_lot
        FROM public.lots_hectares
       WHERE id=(v_allocation->>'lot_id')::uuid
       FOR UPDATE;

      IF v_allocation_lot.id IS NULL THEN
        RAISE EXCEPTION 'Un des lots de la série est introuvable.';
      END IF;

      IF v_allocation_count=0 THEN
        v_first_lot_id:=v_allocation_lot.id;
        v_first_convention_id:=v_allocation_lot.convention_id;
      ELSIF v_allocation_lot.convention_id IS DISTINCT FROM v_first_convention_id
         OR v_allocation_lot.numero_h<>v_expected_lot_number THEN
        RAISE EXCEPTION 'Les lots sélectionnés doivent être contigus et appartenir à la même convention foncière.';
      END IF;

      IF v_allocation_lot.parcelle_id IS DISTINCT FROM NEW.parcelle_id
         OR coalesce(v_allocation_lot.part_type,'agricapital')<>'agricapital'
         OR v_allocation_lot.client_id IS NOT NULL
         OR v_allocation_lot.acquisition_id IS NOT NULL
         OR lower(coalesce(v_allocation_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue') THEN
        RAISE EXCEPTION 'Un des lots de la série n’est plus disponible pour cette acquisition.';
      END IF;

      v_amount:=coalesce((v_allocation->>'surface_ha')::numeric,0);
      IF v_family LIKE '%PALMINVEST%' THEN
        IF abs(v_amount-1)>0.000001 THEN
          RAISE EXCEPTION 'PalmInvest exige un lot entier de 1 ha.';
        END IF;
      ELSIF v_amount<0.5 OR abs(v_amount*2-round(v_amount*2))>0.000001 THEN
        RAISE EXCEPTION 'Chaque quote-part doit être un multiple de 0,50 ha.';
      END IF;

      IF v_amount>coalesce(v_allocation_lot.surface_disponible_ha,0)+0.000001 THEN
        RAISE EXCEPTION 'La quote-part demandée dépasse la superficie encore disponible du lot %.',v_allocation_lot.reference;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.conventions_foncieres cf
         WHERE cf.id=v_allocation_lot.convention_id
           AND cf.parcelle_id=v_allocation_lot.parcelle_id
           AND cf.statut='active'
      ) THEN
        RAISE EXCEPTION 'Chaque lot doit dépendre d’une convention foncière active.';
      END IF;

      v_total:=v_total+v_amount;
      v_expected_lot_number:=v_allocation_lot.numero_h+1;
      v_allocation_count:=v_allocation_count+1;
    END LOOP;

    IF v_first_lot_id IS DISTINCT FROM NEW.lot_id
       OR abs(v_total-coalesce(NEW.superficie_ha,0))>0.000001 THEN
      RAISE EXCEPTION 'La somme des quotes-parts des lots doit correspondre exactement à la superficie de l’acquisition.';
    END IF;

    SELECT * INTO v_parcelle FROM public.parcelles WHERE id=NEW.parcelle_id;
    IF v_parcelle.id IS NULL OR v_parcelle.proprietaire_id IS NULL THEN
      RAISE EXCEPTION 'Le propriétaire partenaire doit être enregistré.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_lot
    FROM public.lots_hectares
   WHERE id=NEW.lot_id;

  IF v_lot.id IS NULL OR v_lot.parcelle_id IS NULL THEN
    RAISE EXCEPTION 'Lot partenaire introuvable ou sans parcelle.';
  END IF;

  v_preassigned :=
    v_lot.client_id = NEW.client_id
    AND v_lot.acquisition_id = NEW.id
    AND lower(coalesce(v_lot.statut,''))='attribue'
    AND NEW.metadata->>'lot_cible_id'=v_lot.id::text;

  IF NOT v_preassigned THEN
    IF v_lot.client_id IS NOT NULL
       OR v_lot.acquisition_id IS NOT NULL
       OR lower(coalesce(v_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue')
       OR coalesce(v_lot.surface_disponible_ha,0)<=0 THEN
      RAISE EXCEPTION 'Le lot n’est plus disponible ou est réservé à une autre acquisition.';
    END IF;
    IF coalesce(v_lot.surface_disponible_ha,0)+0.000001 < coalesce(NEW.superficie_ha,0) THEN
      RAISE EXCEPTION 'La superficie disponible du lot est insuffisante.';
    END IF;
  END IF;

  SELECT * INTO v_parcelle FROM public.parcelles WHERE id=v_lot.parcelle_id;
  IF v_parcelle.id IS NULL OR v_parcelle.proprietaire_id IS NULL THEN
    RAISE EXCEPTION 'Le propriétaire partenaire doit être enregistré.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conventions_foncieres cf
     WHERE cf.id=v_lot.convention_id
       AND cf.parcelle_id=v_lot.parcelle_id
       AND cf.statut='active'
  ) THEN
    RAISE EXCEPTION 'Le lot doit dépendre d’une convention foncière active.';
  END IF;

  IF NEW.parcelle_id IS DISTINCT FROM v_lot.parcelle_id THEN
    RAISE EXCEPTION 'La parcelle de l’acquisition ne correspond pas au lot réservé.';
  END IF;

  IF v_family LIKE '%PALMINVEST%'
     AND (abs(coalesce(v_lot.surface_ha,0)-1)>0.000001
          OR abs(coalesce(NEW.superficie_ha,0)-1)>0.000001) THEN
    RAISE EXCEPTION 'PalmInvest exige un lot entier de 1 ha.';
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.allocate_acquisition_lot(p_acquisition_id uuid, p_lot_id uuid, p_surface_ha numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_acquisition public.acquisitions%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_lot public.lots_hectares%ROWTYPE;
  v_surface numeric;
  v_allocated numeric;
  v_contract numeric;
  v_remaining numeric;
  v_family text;
  v_allocation_id uuid;
  v_today date := current_date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise pour affecter un lot.';
  END IF;

  SELECT * INTO v_acquisition
  FROM public.acquisitions
  WHERE id=p_acquisition_id
  FOR UPDATE;
  IF v_acquisition.id IS NULL THEN
    RAISE EXCEPTION 'Acquisition introuvable.';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id=v_acquisition.client_id;
  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Client de l’acquisition introuvable.';
  END IF;

  SELECT * INTO v_lot FROM public.lots_hectares WHERE id=p_lot_id FOR UPDATE;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'Lot foncier introuvable.';
  END IF;

  IF NOT (
    private.crm_is_global_admin(auth.uid())
    OR private.has_role(auth.uid(),'responsable_operations')
    OR (
      (private.has_role(auth.uid(),'chef_equipe_technique') OR private.has_role(auth.uid(),'technicien'))
      AND private.can_access_parcelle(auth.uid(),v_lot.parcelle_id)
    )
  ) THEN
    RAISE EXCEPTION 'Vous ne pouvez pas affecter un lot hors de votre périmètre technique.';
  END IF;

  IF v_acquisition.statut<>'active' OR v_acquisition.validation_statut<>'valide' THEN
    RAISE EXCEPTION 'Seule une acquisition validée et active peut recevoir un lot supplémentaire.';
  END IF;

  IF NOT (
    coalesce((v_acquisition.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false)
    OR coalesce((v_acquisition.metadata->>'deferred_land_allocation')::boolean,false)
    OR coalesce((v_acquisition.metadata->>'foncier_convention_en_attente')::boolean,false)
  ) THEN
    RAISE EXCEPTION 'Cette acquisition ne permet pas encore une affectation foncière progressive.';
  END IF;

  v_family:=upper(coalesce(v_acquisition.famille_offre,'')||' '||coalesce(v_acquisition.offre_code,'')||' '||coalesce(v_acquisition.formule_code,''));
  v_contract:=coalesce(v_acquisition.superficie_ha,v_client.total_hectares,v_client.superficie_ha,0);
  v_surface:=coalesce(p_surface_ha,v_lot.surface_disponible_ha,v_lot.surface_ha,0);

  IF v_surface<=0 OR v_surface>coalesce(v_lot.surface_disponible_ha,0)+0.000001 THEN
    RAISE EXCEPTION 'La surface demandée dépasse la surface disponible sur ce lot.';
  END IF;

  IF v_family LIKE '%PALMINVEST%' AND (
    abs(coalesce(v_lot.surface_ha,0)-1)>0.000001 OR abs(v_surface-1)>0.000001
  ) THEN
    RAISE EXCEPTION 'Un lot PalmInvest doit être attribué en totalité, soit 1 ha.';
  END IF;

  IF coalesce(v_lot.part_type,'agricapital')<>'agricapital' THEN
    RAISE EXCEPTION 'Seule la quote-part foncière AgriCapital peut être affectée à cette acquisition.';
  END IF;

  IF v_lot.client_id IS NOT NULL OR v_lot.acquisition_id IS NOT NULL OR lower(coalesce(v_lot.statut,''))<>'disponible' THEN
    RAISE EXCEPTION 'Ce lot a déjà été affecté ou n’est plus disponible.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conventions_foncieres cf
    JOIN public.parcelles p ON p.id=cf.parcelle_id
    WHERE cf.id=v_lot.convention_id
      AND cf.parcelle_id=v_lot.parcelle_id
      AND cf.statut='active'
      AND p.proprietaire_id=cf.proprietaire_id
  ) THEN
    RAISE EXCEPTION 'Une convention foncière active et cohérente est requise pour cette nouvelle parcelle.';
  END IF;

  SELECT coalesce(sum(al.surface_ha),0) INTO v_allocated
  FROM public.acquisition_lots al
  WHERE al.acquisition_id=p_acquisition_id AND al.client_id=v_acquisition.client_id;

  IF v_allocated+v_surface>v_contract+0.000001 THEN
    RAISE EXCEPTION 'Cette affectation dépasserait la superficie contractuelle. Il reste % ha à affecter.',greatest(v_contract-v_allocated,0);
  END IF;

  INSERT INTO public.acquisition_lots(client_id,acquisition_id,lot_id,surface_ha,date_attribution,notes,created_by)
  VALUES(v_acquisition.client_id,p_acquisition_id,p_lot_id,v_surface,v_today,
    coalesce(p_notes,'Affectation foncière progressive.'),auth.uid())
  RETURNING id INTO v_allocation_id;

  UPDATE public.lots_hectares
  SET client_id=v_acquisition.client_id,
      acquisition_id=p_acquisition_id,
      statut='attribue',
      date_attribution=v_today,
      surface_attribuee_ha=coalesce(surface_attribuee_ha,0)+v_surface,
      updated_at=now()
  WHERE id=p_lot_id;

  v_allocated:=v_allocated+v_surface;
  v_remaining:=greatest(v_contract-v_allocated,0);

  UPDATE public.acquisitions
  SET lot_id=coalesce(lot_id,p_lot_id),
      parcelle_id=coalesce(parcelle_id,v_lot.parcelle_id),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'surface_contractuelle_ha',v_contract,
        'surface_fonciere_allouee_ha',v_allocated,
        'surface_fonciere_restante_ha',v_remaining,
        'foncier_a_attribuer_plus_tard',v_remaining>0.000001,
        'multi_parcelle_allocation',true,
        'lot_cible_id',coalesce(metadata->>'lot_cible_id',lot_id::text,p_lot_id::text),
        'technical_intervention_pending',true,
        'land_allocation_note',format('Contrat de %s ha. %s ha affectés sur plusieurs parcelles; %s ha restent à affecter.',v_contract,v_allocated,v_remaining)
      ),
      updated_at=now()
  WHERE id=p_acquisition_id;

  UPDATE public.clients
     SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
       'surface_contractuelle_ha',v_contract,'surface_fonciere_allouee_ha',v_allocated,
       'surface_fonciere_restante_ha',v_remaining,'foncier_a_attribuer_plus_tard',v_remaining>0.000001,
       'deferred_land_allocation',true,'technical_intervention_pending',true
     ),updated_at=now()
   WHERE id=v_acquisition.client_id;

  RETURN jsonb_build_object(
    'allocation_id',v_allocation_id,
    'acquisition_id',p_acquisition_id,
    'lot_id',p_lot_id,
    'parcelle_id',v_lot.parcelle_id,
    'surface_attribuee_ha',v_surface,
    'surface_fonciere_allouee_ha',v_allocated,
    'surface_fonciere_restante_ha',v_remaining,
    'surface_contractuelle_ha',v_contract
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_plantation_after_mise_en_terre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client public.clients%rowtype;
  v_parcelle public.parcelles%rowtype;
  v_lot public.lots_hectares%rowtype;
  v_sub public.acquisitions%rowtype;
  v_existing uuid;
  v_surface numeric;
  v_density integer;
  v_date date;
  v_name text;
  v_role text:='beneficiaire';
  v_active boolean;
  v_actor uuid;
  v_lot_id uuid;
  v_parcelle_id uuid;
  v_foncier_pending boolean := false;
  v_surface_intervention numeric := 0;
  v_surface_allouee numeric := 0;
  v_surface_plantee_totale numeric := 0;
BEGIN
  IF NEW.type_intervention<>'mise_en_terre' OR NEW.statut<>'realisee' THEN
    RETURN NEW;
  END IF;
  IF NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'La mise en terre doit être rattachée à un Client';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id=NEW.client_id;
  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Client du parcours technique introuvable';
  END IF;

  v_lot_id:=NEW.lot_id;
  v_parcelle_id:=NEW.parcelle_id;

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT * INTO v_sub
      FROM public.acquisitions
     WHERE id=NEW.acquisition_id
       AND client_id=NEW.client_id
     FOR UPDATE;

    IF v_sub.id IS NULL THEN
      RAISE EXCEPTION 'Souscription du client introuvable';
    END IF;

    IF v_sub.statut_technique='mise_en_terre_realisee' THEN
      IF EXISTS(SELECT 1 FROM public.plantations WHERE acquisition_id=v_sub.id) THEN
        RETURN NEW;
      END IF;
    END IF;

    v_lot_id:=coalesce(v_lot_id,v_sub.lot_id);
    v_parcelle_id:=coalesce(v_parcelle_id,v_sub.parcelle_id);

    v_surface:=NULL;
    v_role:='beneficiaire';
    v_active:=v_sub.montant_pi_total<=0 OR EXISTS(
      SELECT 1 FROM public.paiements p
       WHERE p.acquisition_id=v_sub.id
         AND coalesce(p.est_paiement_initial,false)
         AND lower(coalesce(p.statut,'')) IN ('valide','paye','paid','success','successful','completed')
    );
    v_foncier_pending:=coalesce((v_sub.metadata->>'foncier_convention_en_attente')::boolean,false)
    OR coalesce((v_sub.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false);
  END IF;

  IF v_lot_id IS NOT NULL THEN
    SELECT * INTO v_lot FROM public.lots_hectares WHERE id=v_lot_id FOR UPDATE;
    IF v_lot.id IS NULL THEN
      RAISE EXCEPTION 'Lot introuvable pour la mise en terre';
    END IF;
    IF v_lot.client_id IS DISTINCT FROM NEW.client_id THEN
      RAISE EXCEPTION 'Le lot n’est pas attribué à ce client';
    END IF;
    IF v_parcelle_id IS NOT NULL AND v_parcelle_id IS DISTINCT FROM v_lot.parcelle_id THEN
      RAISE EXCEPTION 'Le lot ne correspond pas à la parcelle de l’intervention';
    END IF;
    v_parcelle_id:=coalesce(v_parcelle_id,v_lot.parcelle_id);
    IF NEW.acquisition_id IS NULL THEN
      v_surface:=greatest(0,coalesce(v_lot.surface_ha,0));
    END IF;
  END IF;

  IF v_parcelle_id IS NULL THEN
    RAISE EXCEPTION 'La parcelle doit être précisée dans l’intervention technique';
  END IF;

  SELECT * INTO v_parcelle FROM public.parcelles WHERE id=v_parcelle_id FOR UPDATE;
  IF v_parcelle.id IS NULL THEN
    RAISE EXCEPTION 'Parcelle introuvable pour la mise en terre';
  END IF;

  IF NEW.acquisition_id IS NOT NULL THEN
    v_density:=coalesce(nullif(NEW.densite_plants,0),nullif(v_parcelle.plantation_densite_plants,0),143);
    v_surface_intervention:=coalesce(nullif(NEW.surface_reellement_plantee_ha,0),
      CASE WHEN coalesce(NEW.nombre_plants_realises,0)>0 THEN NEW.nombre_plants_realises::numeric/nullif(v_density,0) END,0);
    IF v_surface_intervention<=0 THEN
      RAISE EXCEPTION 'Renseignez la surface réellement plantée ou le nombre de plants effectivement mis en terre.';
    END IF;
    IF v_lot_id IS NULL THEN
      RAISE EXCEPTION 'Chaque mise en terre PalmInvest doit être rattachée à un lot précis.';
    END IF;
    SELECT coalesce(sum(al.surface_ha),0) INTO v_surface_allouee
      FROM public.acquisition_lots al
     WHERE al.acquisition_id=NEW.acquisition_id AND al.client_id=NEW.client_id AND al.lot_id=v_lot_id;
    IF v_surface_allouee<=0 AND v_sub.lot_id=v_lot_id AND v_sub.parcelle_id=v_parcelle_id THEN
      SELECT coalesce(lh.surface_attribuee_ha,lh.surface_ha,0) INTO v_surface_allouee
        FROM public.lots_hectares lh
       WHERE lh.id=v_lot_id AND lh.client_id=NEW.client_id AND lh.acquisition_id=NEW.acquisition_id;
    END IF;
    IF v_surface_allouee<=0 THEN
      RAISE EXCEPTION 'Le lot choisi doit être affecté à cette acquisition avant la mise en terre.';
    END IF;
    SELECT coalesce(sum(coalesce(nullif(it.surface_reellement_plantee_ha,0),
      CASE WHEN coalesce(it.nombre_plants_realises,0)>0
        THEN it.nombre_plants_realises::numeric/nullif(coalesce(nullif(it.densite_plants,0),v_density),0) END,0)),0)
      INTO v_surface
      FROM public.interventions_techniques it
     WHERE it.acquisition_id=NEW.acquisition_id AND it.client_id=NEW.client_id
       AND it.parcelle_id=v_parcelle_id AND it.lot_id=v_lot_id
       AND it.type_intervention='mise_en_terre' AND it.statut='realisee';
    IF v_surface<=0 THEN v_surface:=v_surface_intervention; END IF;
    IF v_surface>v_surface_allouee+0.000001 THEN
      RAISE EXCEPTION 'La surface plantée cumulée (%) dépasse la quote-part foncière affectée (%) sur ce lot.',v_surface,v_surface_allouee;
    END IF;
  END IF;

  IF NEW.acquisition_id IS NULL THEN
    IF v_lot_id IS NULL THEN
      v_surface:=greatest(0,coalesce(v_client.total_hectares,0));
    END IF;

    IF v_client.type_client='beneficiaire_particulier' AND v_lot_id IS NULL THEN
      SELECT coalesce(max(ba.surface_attribuee_ha),v_surface),
             coalesce(max(ba.role_attribution),'beneficiaire')
        INTO v_surface,v_role
        FROM public.beneficiaire_attributions ba
       WHERE ba.client_id=v_client.id
         AND ba.parcelle_id=v_parcelle.id
         AND ba.statut='active';
    END IF;

    v_active:=coalesce(v_client.compte_actif,false)
      OR v_client.paiement_initial_paye_at IS NOT NULL
      OR v_client.pi_paye_at IS NOT NULL;
  END IF;

  IF coalesce(v_surface,0)<=0 THEN
    RAISE EXCEPTION 'La superficie du dossier ou de l’acquisition doit être positive avant la mise en terre';
  END IF;

  v_density:=coalesce(nullif(NEW.densite_plants,0),nullif(v_parcelle.plantation_densite_plants,0),143);
  v_date:=NEW.date_intervention::date;
  v_name:='Plantation '||coalesce(nullif(v_client.nom_complet,''),v_client.id_unique);
  v_actor:=coalesce(auth.uid(),v_client.created_by);

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT p.id INTO v_existing
      FROM public.plantations p
     WHERE p.acquisition_id=NEW.acquisition_id AND p.parcelle_id=v_parcelle.id AND p.lot_id=v_lot_id
     ORDER BY p.created_at DESC LIMIT 1;
  ELSE
    SELECT p.id INTO v_existing
      FROM public.plantations p
     WHERE p.client_id=v_client.id
       AND p.parcelle_id=v_parcelle.id
       AND ((v_lot_id IS NOT NULL AND p.lot_id=v_lot_id)
         OR (v_lot_id IS NULL AND p.lot_id IS NULL))
     ORDER BY p.created_at DESC
     LIMIT 1;
  END IF;

  IF v_existing IS NULL THEN
    INSERT INTO public.plantations(
      client_id,parcelle_id,role_attribution,nom,nom_plantation,superficie_ha,superficie_activee,
      nombre_plants,densite_plants,district_id,region_id,departement_id,sous_prefecture_id,
      village,village_nom,localite,localisation_gps_lat,localisation_gps_lng,latitude,longitude,
      date_plantation,date_activation,statut,statut_global,type_culture,notes,created_by,updated_by,
      lot_id,acquisition_id,surface_reellement_plantee
    )
    VALUES(
      v_client.id,v_parcelle.id,v_role,v_name,v_name,v_surface,
      CASE WHEN v_active THEN v_surface ELSE 0 END,
      round(v_surface*v_density)::integer,v_density,
      v_parcelle.district_id,v_parcelle.region_id,v_parcelle.departement_id,v_parcelle.sous_prefecture_id,
      v_parcelle.village,v_parcelle.village,v_parcelle.village,
      v_parcelle.localisation_gps_lat,v_parcelle.localisation_gps_lng,
      v_parcelle.localisation_gps_lat,v_parcelle.localisation_gps_lng,
      v_date,CASE WHEN v_active THEN v_date ELSE NULL END,
      CASE WHEN v_active THEN 'actif' ELSE 'en_attente_pi' END,
      CASE WHEN v_active THEN 'actif' ELSE 'en_attente_pi' END,
      coalesce(v_parcelle.plantation_type_culture,'Palmier à huile'),
      CASE WHEN NEW.acquisition_id IS NOT NULL
        THEN 'Créée après validation technique de l’acquisition '||NEW.acquisition_id::text
        ELSE 'Créée automatiquement après validation technique de la mise en terre.'
      END,
      v_actor,v_actor,v_lot_id,NEW.acquisition_id,v_surface
    )
    RETURNING id INTO v_existing;
  ELSE
    UPDATE public.plantations
       SET date_plantation=coalesce(date_plantation,v_date),
           date_activation=CASE WHEN v_active THEN coalesce(date_activation,v_date) ELSE NULL END,
           superficie_ha=CASE WHEN NEW.acquisition_id IS NOT NULL THEN v_surface ELSE superficie_ha END,
           surface_reellement_plantee=CASE WHEN NEW.acquisition_id IS NOT NULL THEN v_surface ELSE surface_reellement_plantee END,
           superficie_activee=CASE WHEN v_active THEN v_surface ELSE 0 END,
           nombre_plants=round(v_surface*v_density)::integer,
           densite_plants=v_density,
           lot_id=coalesce(lot_id,v_lot_id),
           acquisition_id=coalesce(acquisition_id,NEW.acquisition_id),
           statut=CASE WHEN v_active THEN 'actif' ELSE 'en_attente_pi' END,
           statut_global=CASE WHEN v_active THEN 'actif' ELSE 'en_attente_pi' END,
           updated_at=now()
     WHERE id=v_existing;
  END IF;

  UPDATE public.clients
     SET parcelle_id=coalesce(parcelle_id,v_parcelle.id),
         nombre_plantations=(
           SELECT count(*) FROM public.plantations
            WHERE client_id=v_client.id
              AND statut NOT IN ('archive','supprime')
         ),
         phase_actuelle='plantation',
         updated_at=now()
   WHERE id=v_client.id;

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT coalesce(sum(coalesce(p.surface_reellement_plantee,p.superficie_ha,0)),0)
      INTO v_surface_plantee_totale
      FROM public.plantations p WHERE p.acquisition_id=NEW.acquisition_id AND p.client_id=NEW.client_id;
    UPDATE public.acquisitions
       SET parcelle_id=coalesce(parcelle_id,v_parcelle.id),
           statut_technique=CASE WHEN v_surface_plantee_totale+0.000001>=v_sub.superficie_ha
             THEN 'mise_en_terre_realisee' ELSE 'mise_en_terre_partielle' END,
           statut=CASE
             WHEN v_foncier_pending
              AND NOT (
                coalesce((v_sub.metadata->>'validation_commerciale_sans_foncier')::boolean,false)
                OR coalesce((v_sub.metadata->>'validation_pdg_sans_convention_active')::boolean,false)
                OR coalesce((v_sub.metadata->>'validation_acquisition_sans_foncier')::boolean,false)
              ) THEN 'souscrite'
             WHEN v_active THEN 'active'
             ELSE 'en_attente_paiement'
           END,
           validation_statut=CASE
             WHEN v_foncier_pending
              AND NOT (
                coalesce((v_sub.metadata->>'validation_commerciale_sans_foncier')::boolean,false)
                OR coalesce((v_sub.metadata->>'validation_pdg_sans_convention_active')::boolean,false)
              ) THEN 'a_valider'
             ELSE 'valide'
           END,
           updated_at=now()
     WHERE id=NEW.acquisition_id;
  ELSIF v_client.type_client='beneficiaire_particulier' THEN
    INSERT INTO public.beneficiaire_attributions(
      client_id,parcelle_id,plantation_id,surface_attribuee_ha,role_attribution,statut,notes
    )
    SELECT v_client.id,v_parcelle.id,v_existing,v_surface,v_role,'active',
           'Rattachement automatique de la plantation individuelle à la parcelle.'
     WHERE NOT EXISTS(
       SELECT 1 FROM public.beneficiaire_attributions ba
        WHERE ba.client_id=v_client.id
          AND ba.parcelle_id=v_parcelle.id
          AND ba.plantation_id=v_existing
          AND ba.statut='active'
     );
  END IF;

  IF NEW.acquisition_id IS NOT NULL AND v_existing IS NOT NULL THEN
    UPDATE public.interventions_techniques SET plantation_id=v_existing
     WHERE id=NEW.id AND plantation_id IS DISTINCT FROM v_existing;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_planting_to_acquisition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_foncier_pending boolean := false;
  v_commercial_approved boolean := false;
  v_pdg_approved boolean := false;
  v_contract_surface numeric := 0;
  v_planted_surface numeric := 0;
BEGIN
  IF lower(coalesce(NEW.type_intervention,'')) <> 'mise_en_terre'
     OR lower(coalesce(NEW.statut,'')) NOT IN ('realisee','valide','validee','terminee','completed') THEN
    RETURN NEW;
  END IF;

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT
      (coalesce((a.metadata->>'foncier_convention_en_attente')::boolean,false)
        OR coalesce((a.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false)),
      (coalesce((a.metadata->>'validation_commerciale_sans_foncier')::boolean,false)
        OR coalesce((a.metadata->>'validation_acquisition_sans_foncier')::boolean,false)),
      coalesce((a.metadata->>'validation_pdg_sans_convention_active')::boolean,false),
      coalesce(a.superficie_ha,0)
    INTO v_foncier_pending,v_commercial_approved,v_pdg_approved,v_contract_surface
    FROM public.acquisitions a
    WHERE a.id=NEW.acquisition_id AND a.client_id=NEW.client_id;

    SELECT coalesce(sum(coalesce(p.surface_reellement_plantee,p.superficie_ha,0)),0)
      INTO v_planted_surface
      FROM public.plantations p
     WHERE p.acquisition_id=NEW.acquisition_id AND p.client_id=NEW.client_id;

    UPDATE public.acquisitions
       SET statut_technique=CASE
             WHEN v_planted_surface+0.000001>=v_contract_surface THEN 'mise_en_terre_realisee'
             ELSE 'mise_en_terre_partielle'
           END,
           statut=CASE
             WHEN v_foncier_pending AND NOT (v_commercial_approved OR v_pdg_approved) THEN 'souscrite'
             ELSE 'active'
           END,
           validation_statut=CASE
             WHEN v_foncier_pending AND NOT (v_commercial_approved OR v_pdg_approved) THEN 'a_valider'
             ELSE 'valide'
           END,
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
             'surface_plantee_ha',v_planted_surface,
             'surface_non_plantee_ha',greatest(v_contract_surface-v_planted_surface,0)
           ),
           updated_at=now()
     WHERE id=NEW.acquisition_id AND client_id=NEW.client_id;

    UPDATE public.plantations
       SET statut='actif',
           statut_global='actif',
           date_plantation=coalesce(date_plantation,NEW.date_intervention),
           nombre_plants_mis_en_terre=coalesce(nombre_plants_mis_en_terre,nombre_plants),
           updated_at=now()
     WHERE acquisition_id=NEW.acquisition_id
       AND client_id=NEW.client_id;
  ELSIF NEW.plantation_id IS NOT NULL THEN
    UPDATE public.plantations
       SET statut='actif',
           statut_global='actif',
           date_plantation=coalesce(date_plantation,NEW.date_intervention),
           nombre_plants_mis_en_terre=coalesce(NEW.nombre_plants_realises,nombre_plants_mis_en_terre,nombre_plants),
           updated_at=now()
     WHERE id=NEW.plantation_id AND client_id=NEW.client_id;
  ELSE
    UPDATE public.plantations
       SET statut='actif',
           statut_global='actif',
           date_plantation=coalesce(date_plantation,NEW.date_intervention),
           nombre_plants_mis_en_terre=coalesce(NEW.nombre_plants_realises,nombre_plants_mis_en_terre,nombre_plants),
           updated_at=now()
     WHERE client_id=NEW.client_id
       AND (NEW.parcelle_id IS NULL OR parcelle_id=NEW.parcelle_id)
       AND acquisition_id IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_palminvest_lot_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_formula text;
  v_parcelle public.parcelles%rowtype;
  v_client public.clients%rowtype;
  v_acquisition public.acquisitions%rowtype;
  v_pending_foncier boolean := false;
  v_units integer;
  v_lot record;
  v_activation uuid;
  v_existing public.plantation_activations%rowtype;
  v_done integer := 0;
  v_available integer := 0;
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id=NEW.client_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT * INTO v_acquisition
      FROM public.acquisitions
     WHERE id=NEW.acquisition_id
       AND client_id=NEW.client_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Souscription PalmInvest introuvable pour la plantation.';
    END IF;

    v_formula:=upper(coalesce(v_acquisition.formule_code,''));
    v_pending_foncier:=coalesce((v_acquisition.metadata->>'foncier_convention_en_attente')::boolean,false)
      OR coalesce((v_acquisition.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false);

    IF v_pending_foncier AND NOT (
      (v_acquisition.statut='souscrite' AND v_acquisition.validation_statut='a_valider')
      OR (
        v_acquisition.statut='active' AND v_acquisition.validation_statut='valide'
        AND (
          coalesce((v_acquisition.metadata->>'validation_commerciale_sans_foncier')::boolean,false)
          OR coalesce((v_acquisition.metadata->>'validation_pdg_sans_convention_active')::boolean,false)
          OR coalesce((v_acquisition.metadata->>'validation_acquisition_sans_foncier')::boolean,false)
        )
      )
    ) THEN
      RAISE EXCEPTION 'Une acquisition foncière en attente doit être soit en validation, soit explicitement autorisée par la direction.';
    END IF;

  ELSE
    v_formula:=upper(coalesce(v_client.formule_code,''));
  END IF;

  IF coalesce(v_formula,'') NOT LIKE 'PALMINVEST%' OR NEW.parcelle_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_parcelle FROM public.parcelles WHERE id=NEW.parcelle_id;
  IF NOT FOUND OR NOT coalesce(v_parcelle.plantation_partagee_activee,false) THEN
    RAISE EXCEPTION 'La plantation PalmInvest doit être rattachée à une parcelle partagée activée.';
  END IF;
  IF v_parcelle.proprietaire_id IS NULL THEN
    RAISE EXCEPTION 'La parcelle de plantation partagée doit être liée à un propriétaire foncier validé.';
  END IF;

  IF (v_parcelle.convention_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.conventions_foncieres cf
     WHERE cf.id=v_parcelle.convention_id
       AND cf.parcelle_id=v_parcelle.id
       AND cf.proprietaire_id=v_parcelle.proprietaire_id
       AND cf.statut='active'
  )) AND NOT v_pending_foncier THEN
    RAISE EXCEPTION 'La plantation PalmInvest doit dépendre d’une convention foncière active ou d’une souscription explicitement en attente de convention.';
  END IF;

  -- Une ligne de plantation représente un lot PalmInvest de 1 ha.
  -- La surface plantée sur ce lot peut progresser par fractions.
  IF coalesce(NEW.superficie_ha,0)<=0 OR NEW.superficie_ha>1.000001 THEN
    RAISE EXCEPTION 'La surface plantée sur un lot PalmInvest doit être comprise entre 0 et 1 ha.';
  END IF;
  v_units:=1;
  IF v_units<=0 THEN
    RAISE EXCEPTION 'Superficie PalmInvest invalide pour une activation partagée.';
  END IF;

  IF NEW.acquisition_id IS NOT NULL THEN
    SELECT count(*)::integer
      INTO v_available
      FROM public.acquisition_lots al
      JOIN public.lots_hectares lh ON lh.id=al.lot_id
     WHERE al.acquisition_id=NEW.acquisition_id
       AND al.client_id=NEW.client_id
       AND lh.parcelle_id=NEW.parcelle_id
       AND coalesce(lh.part_type,'agricapital')='agricapital'
       AND abs(coalesce(al.surface_ha,lh.surface_ha,0)-1)<0.0001;

    IF v_available<>v_units THEN
      RAISE EXCEPTION 'L’acquisition PalmInvest doit avoir exactement % lot(s) AgriCapital de 1 ha associé(s); % trouvé(s).',v_units,v_available;
    END IF;
  ELSE
    SELECT count(*)::integer INTO v_available
      FROM (
        SELECT lh.id
          FROM public.lots_hectares lh
         WHERE lh.parcelle_id=NEW.parcelle_id
           AND coalesce(lh.part_type,'agricapital')='agricapital'
           AND lh.client_id=NEW.client_id
           AND lh.surface_ha=1
         ORDER BY lh.numero_h
         LIMIT v_units
      ) available_lots;

    IF v_available<>v_units THEN
      RAISE EXCEPTION 'Nombre de lots AgriCapital de 1 ha insuffisant : % requis, % trouvé(s).',v_units,v_available;
    END IF;
  END IF;

  FOR v_lot IN
    SELECT lh.*
      FROM public.lots_hectares lh
     WHERE lh.parcelle_id=NEW.parcelle_id
       AND coalesce(lh.part_type,'agricapital')='agricapital'
       AND (
         (
           NEW.acquisition_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM public.acquisition_lots al
              WHERE al.lot_id=lh.id
                AND al.acquisition_id=NEW.acquisition_id
                AND al.client_id=NEW.client_id
                AND abs(coalesce(al.surface_ha,lh.surface_ha,0)-1)<0.0001
           )
         )
         OR (
           NEW.acquisition_id IS NULL
           AND lh.client_id=NEW.client_id
           AND lh.surface_ha=1
         )
       )
     ORDER BY lh.numero_h
     LIMIT v_units
     FOR UPDATE OF lh
  LOOP
    v_activation:=NULL;

    SELECT * INTO v_existing
      FROM public.plantation_activations
     WHERE lot_id=v_lot.id
     FOR UPDATE;

    IF FOUND THEN
      IF v_existing.client_id IS DISTINCT FROM NEW.client_id
         OR v_existing.parcelle_id IS DISTINCT FROM NEW.parcelle_id
         OR v_existing.proprietaire_id IS DISTINCT FROM v_parcelle.proprietaire_id THEN
        RAISE EXCEPTION 'Le lot % possède déjà une activation incompatible.',v_lot.reference;
      END IF;
      v_activation:=v_existing.id;
    ELSE
      INSERT INTO public.plantation_activations(
        lot_id,parcelle_id,proprietaire_id,client_id,
        surface_client_ha,surface_proprietaire_ha,
        statut,date_activation,notes,created_by
      )
      VALUES(
        v_lot.id,NEW.parcelle_id,v_parcelle.proprietaire_id,NEW.client_id,
        1,1,'active',coalesce(NEW.date_activation::date,current_date),
        'Activation partagée PalmInvest : 1 ha client et 1 ha bénéficiaire propriétaire, sans offre ni échéancier propriétaire.',
        NEW.created_by
      )
      ON CONFLICT (lot_id) DO NOTHING
      RETURNING id INTO v_activation;

      IF v_activation IS NULL THEN
        SELECT * INTO v_existing
          FROM public.plantation_activations
         WHERE lot_id=v_lot.id
         FOR UPDATE;
        IF v_existing.id IS NULL
           OR v_existing.client_id IS DISTINCT FROM NEW.client_id
           OR v_existing.parcelle_id IS DISTINCT FROM NEW.parcelle_id
           OR v_existing.proprietaire_id IS DISTINCT FROM v_parcelle.proprietaire_id THEN
          RAISE EXCEPTION 'Conflit d’activation sur le lot %; attribution interrompue.',v_lot.reference;
        END IF;
        v_activation:=v_existing.id;
      END IF;
    END IF;

    UPDATE public.lots_hectares
       SET client_id=NEW.client_id,
           acquisition_id=coalesce(NEW.acquisition_id,acquisition_id),
           statut='attribue',
           date_attribution=coalesce(date_attribution,current_date),
           notes=concat_ws(' ',notes,'Activation PalmInvest liée à une parcelle partagée.')
     WHERE id=v_lot.id;

    v_done:=v_done+1;
    IF v_done=1 AND NEW.activation_id IS NULL THEN
      NEW.activation_id:=v_activation;
    END IF;
  END LOOP;

  IF v_done<>v_units THEN
    RAISE EXCEPTION 'Activation PalmInvest incomplète : % lot(s) requis, % traité(s).',v_units,v_done;
  END IF;

  PERFORM public.sync_owner_plantation_for_shared_parcel(
    NEW.parcelle_id,v_parcelle.proprietaire_id,coalesce(NEW.updated_by,NEW.created_by)
  );

  RETURN NEW;
END;
$function$;
