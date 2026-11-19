
-- Preserve source map links and relative plantation references when GPS coordinates
-- are not available from the supplied Google Maps short links.
ALTER TABLE public.plantations
  ADD COLUMN IF NOT EXISTS localisation_source_url text,
  ADD COLUMN IF NOT EXISTS localisation_reference_plantation_id uuid,
  ADD COLUMN IF NOT EXISTS localisation_distance_m numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='plantations_localisation_reference_plantation_id_fkey'
      AND conrelid='public.plantations'::regclass
  ) THEN
    ALTER TABLE public.plantations
      ADD CONSTRAINT plantations_localisation_reference_plantation_id_fkey
      FOREIGN KEY (localisation_reference_plantation_id)
      REFERENCES public.plantations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- A deferred partner-land assignment is an explicit commercial workflow state:
-- the acquisition can be registered before technicians allocate the parcel/lot.
-- Commercial validation without a lot is allowed only when the direction flag is
-- present on the source client record; the real offer requirement is restored
-- after the existing land-validation trigger has run.
CREATE OR REPLACE FUNCTION public.allow_deferred_land_acquisition_before_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client_metadata jsonb;
BEGIN
  IF NEW.client_id IS NULL
     OR NEW.lot_id IS NOT NULL
     OR NEW.parcelle_id IS NOT NULL
     OR coalesce(NEW.necessite_foncier_client,false) THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(metadata,'{}'::jsonb)
    INTO v_client_metadata
    FROM public.clients
   WHERE id=NEW.client_id;

  IF NOT coalesce((v_client_metadata->>'deferred_land_allocation')::boolean,false)
     OR upper(regexp_replace(coalesce(NEW.famille_offre,'') || ' ' || coalesce(NEW.offre_code,''),'[-_[:space:]]','','g')) NOT LIKE '%PALMINVEST%' THEN
    RETURN NEW;
  END IF;

  NEW.metadata := coalesce(NEW.metadata,'{}'::jsonb) ||
    jsonb_build_object(
      'foncier_a_attribuer_plus_tard', true,
      'technical_intervention_pending', true
    );

  IF coalesce((v_client_metadata->>'commercial_validation_sans_foncier')::boolean,false) THEN
    NEW.statut := 'active';
    NEW.validation_statut := 'valide';
    NEW.metadata := NEW.metadata || jsonb_build_object('validation_commerciale_sans_foncier',true);
  ELSE
    NEW.statut := 'souscrite';
    NEW.validation_statut := 'a_valider';
  END IF;

  -- Temporarily let the existing validator skip partner-lot checks. The actual
  -- offer value is restored by the following BEFORE trigger.
  NEW.necessite_foncier_client := true;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_deferred_land_offer_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_required boolean;
BEGIN
  IF coalesce((NEW.metadata->>'foncier_a_attribuer_plus_tard')::boolean,false)
     AND NEW.lot_id IS NULL AND NEW.parcelle_id IS NULL THEN
    SELECT coalesce(necessite_foncier_client,false)
      INTO v_required
      FROM public.offres
     WHERE id=NEW.offre_id;
    NEW.necessite_foncier_client := coalesce(v_required,false);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_t_allow_deferred_land_acquisition ON public.acquisitions;
CREATE TRIGGER trg_t_allow_deferred_land_acquisition
BEFORE INSERT OR UPDATE OF necessite_foncier_client,lot_id,parcelle_id,client_id,superficie_ha,metadata,statut,validation_statut
ON public.acquisitions
FOR EACH ROW EXECUTE FUNCTION public.allow_deferred_land_acquisition_before_validation();

DROP TRIGGER IF EXISTS trg_z_restore_deferred_land_acquisition ON public.acquisitions;
CREATE TRIGGER trg_z_restore_deferred_land_acquisition
BEFORE INSERT OR UPDATE OF necessite_foncier_client,lot_id,parcelle_id,client_id,superficie_ha,metadata,statut,validation_statut
ON public.acquisitions
FOR EACH ROW EXECUTE FUNCTION public.restore_deferred_land_offer_requirement();

-- Daily rate is stored per hectare for catalogue contracts, except for legacy
-- records that explicitly carry a total daily-rate override in metadata.
DO $$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.compute_paiement_jours_couverts()'::regprocedure);
  v_old := 'v_taux := COALESCE(v_s.taux_journalier_ha, 0) * COALESCE(v_s.total_hectares, 0);';
  v_new := $replacement$
  v_taux := COALESCE(
    NULLIF(v_s.metadata->>'taux_journalier_total_override','')::numeric,
    NULLIF(v_s.taux_journalier_ha,0) * COALESCE(v_s.total_hectares,0),
    CASE WHEN COALESCE(v_s.mensualite_montant,0)>0 THEN v_s.mensualite_montant/30 ELSE 0 END
  );$replacement$;
  IF position(v_old in v_def)=0 THEN
    RAISE EXCEPTION 'La formule du taux journalier de compute_paiement_jours_couverts a changé; migration interrompue.';
  END IF;
  EXECUTE replace(v_def,v_old,v_new);
END $$;

DO $$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.calculer_monnaie_client_paiement()'::regprocedure);
  v_old := $old$
  select coalesce(
    nullif(cl.taux_journalier_ha,0),
    case when coalesce(cl.mensualite_montant,0)>0 then cl.mensualite_montant/30 else 0 end
  ) into v_rate
  from public.clients cl where cl.id=new.client_id;$old$;
  v_new := $new$
  select coalesce(
    nullif(cl.metadata->>'taux_journalier_total_override','')::numeric,
    nullif(cl.taux_journalier_ha,0) * coalesce(cl.total_hectares,0),
    case when coalesce(cl.mensualite_montant,0)>0 then cl.mensualite_montant/30 else 0 end
  ) into v_rate
  from public.clients cl where cl.id=new.client_id;$new$;
  IF position(v_old in v_def)=0 THEN
    RAISE EXCEPTION 'La formule du taux journalier de calcul de monnaie a changé; migration interrompue.';
  END IF;
  EXECUTE replace(v_def,v_old,v_new);
END $$;

-- Do not send a second welcome when a prospect was already welcomed immediately
-- before its conversion into a client.
DO $$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.trg_notification_client_created()'::regprocedure);
  v_old := 'if coalesce(new.is_internal,false)=false then';
  v_new := 'if coalesce(new.is_internal,false)=false and not coalesce((new.metadata->>''welcome_already_sent'')::boolean,false) then';
  IF position(v_old in v_def)=0 THEN
    RAISE EXCEPTION 'La condition de bienvenue client a changé; migration interrompue.';
  END IF;
  EXECUTE replace(v_def,v_old,v_new);
END $$;

-- Beneficiary files now accept the owner reference as well as legacy AC_B codes.
DO $$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.update_beneficiaire_particulier(uuid,jsonb,numeric)'::regprocedure);
  v_old := $old$and id_unique like 'AC_B%'$old$;
  v_new := $new$and (id_unique like 'AC_B%' or id_unique like 'OWNER-AC-P%')$new$;
  IF position(v_old in v_def)=0 THEN
    RAISE EXCEPTION 'Le filtre AC_B du parcours bénéficiaire a changé; migration interrompue.';
  END IF;
  EXECUTE replace(v_def,v_old,v_new);
END $$;

-- Future beneficiary records linked to the same person as their landowner receive
-- the OWNER- prefix; unrelated beneficiaries retain their own AC_B identifier.
DO $$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.set_generated_ids()'::regprocedure);
  v_old := 'NEW.id_unique := public.generate_client_id(NEW.type_client);';
  v_new := $replacement$
      IF lower(coalesce(NEW.type_client,''))='beneficiaire_particulier'
         AND NEW.proprietaire_id IS NOT NULL THEN
        SELECT 'OWNER-' || coalesce(nullif(trim(p.id_unique),''),p.id::text)
          INTO NEW.id_unique
          FROM public.proprietaires_terres p
         WHERE p.id=NEW.proprietaire_id
           AND to_tsvector('simple',coalesce(p.nom_complet,concat_ws(' ',p.nom,p.prenoms)))
               = to_tsvector('simple',coalesce(NEW.nom_complet,concat_ws(' ',NEW.nom,NEW.prenoms)));
      END IF;
      IF NEW.id_unique IS NULL OR NEW.id_unique='' THEN
        NEW.id_unique := public.generate_client_id(NEW.type_client);
      END IF;$replacement$;
  IF position(v_old in v_def)=0 THEN
    RAISE EXCEPTION 'La génération des identifiants clients a changé; migration interrompue.';
  END IF;
  EXECUTE replace(v_def,v_old,v_new);
END $$;

-- Correct the owner-beneficiary reference for ZAGBLE BOLOU JEAN-JACQUES.
UPDATE public.clients
   SET id_unique='OWNER-AC-P000001',
       updated_at=now()
 WHERE id='ef58c186-e6a9-4fdd-8c6c-21220f42e9cf'
   AND id_unique='AC_B000002'
   AND proprietaire_id='2702d6e0-3860-45a2-aa55-b1b2d3dbfabc';

-- Preserve the supplied map links. Short links are not converted to invented
-- coordinates; the dashboard will list them as source locations until GPS is known.
UPDATE public.plantations SET localisation_source_url='https://maps.app.goo.gl/A69sXcrsNZRXbkXL6'
 WHERE id='3f1df5b1-a35c-4409-a262-2c779ece17b8';

UPDATE public.plantations
   SET localisation_source_url='https://maps.app.goo.gl/a1mhn2Pe8txwC6SD7',
       latitude=NULL, longitude=NULL,
       localisation_gps_lat=NULL, localisation_gps_lng=NULL
 WHERE id='b48d3b4c-305d-4386-bbf4-30bf0e351673';

UPDATE public.parcelles
   SET localisation_gps_lat=NULL, localisation_gps_lng=NULL
 WHERE id='7ca44c42-3158-4583-b855-165dcd8d1248';

UPDATE public.parcelles
   SET localisation_gps_lat=6.97000, localisation_gps_lng=-6.22000
 WHERE id='dd3653c8-e591-4cba-a36b-a5236c2cf4f0';

UPDATE public.plantations
   SET latitude=6.97000, longitude=-6.22000,
       localisation_gps_lat=6.97000, localisation_gps_lng=-6.22000,
       localisation_source_url=NULL
 WHERE id='86da31b0-9a82-43b3-9aac-78f66aa7701b';

UPDATE public.plantations SET localisation_source_url='https://maps.app.goo.gl/Tq9LQN6q1P3Xh9Vd7'
 WHERE id='e41f2484-dcca-4fce-9ea9-27fb33a7d109';

UPDATE public.plantations SET localisation_source_url='https://maps.app.goo.gl/Vt8vzogcT3Pp12Va7'
 WHERE id='e8b99368-9415-418d-8399-4e0dbfb6df2c';

UPDATE public.plantations
   SET localisation_source_url=NULL,
       localisation_reference_plantation_id='e41f2484-dcca-4fce-9ea9-27fb33a7d109',
       localisation_distance_m=100,
       notes_internes=concat_ws(E'\n',nullif(notes_internes,''),'Localisation relative : environ 100 m de la plantation de PAULIN LOUKOU. Coordonnées exactes non fournies.')
 WHERE id='26c684b3-178a-40d5-9c2b-4eedd9de3b45';

UPDATE public.plantations SET localisation_source_url='https://maps.app.goo.gl/hMBuoTGj3yqtFgwd8'
 WHERE id='1ba1b803-592a-42bd-8ec5-1ddb269ee5b8';

-- The legacy Lambert daily rate is a total daily amount (210 FCFA), not a
-- per-hectare rate. Keep the exception explicit and auditable.
UPDATE public.clients
   SET contrat_debut_at=coalesce(contrat_debut_at,'2026-09-30'::date),
       metadata=coalesce(metadata,'{}'::jsonb) ||
         jsonb_build_object('taux_journalier_total_override',210,'date_debut_retenue_source','date_mise_en_terre','credit_jours',7,'reliquat_credit',30),
       updated_at=now()
 WHERE id='ecbe72e6-171e-4b78-923a-31b34e6f53bc'
   AND coalesce(metadata->>'date_mise_en_terre','')='2026-09-30';
