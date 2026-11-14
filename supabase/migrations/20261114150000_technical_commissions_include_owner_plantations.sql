-- Include the landowner's counterpart plantation in technical mise-en-terre remuneration.
-- One technical intervention can therefore generate two distinct commissions:
-- beneficiary plantation + owner plantation, each tied to the same intervention.

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS intervention_id uuid
  REFERENCES public.interventions_techniques(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commissions_technique_intervention_plantation
  ON public.commissions (intervention_id, plantation_id, type_commission)
  WHERE intervention_id IS NOT NULL
    AND plantation_id IS NOT NULL
    AND type_commission = 'technique';

CREATE OR REPLACE FUNCTION public.generer_commission_technique_mise_en_terre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_amount numeric;
  v_beneficiary_plantation_id uuid;
  v_owner_plantation_id uuid;
BEGIN
  IF NEW.statut <> 'realisee' OR NEW.type_intervention <> 'mise_en_terre' THEN
    RETURN NEW;
  END IF;

  v_profile_id := NEW.agent_technique_id;
  IF v_profile_id IS NULL OR NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.acquisition_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.acquisitions a
    WHERE a.id = NEW.acquisition_id
      AND a.client_id = NEW.client_id
      AND coalesce((a.metadata->>'commission_technique_exoneree')::boolean, false)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT gr.montant
    INTO v_amount
    FROM public.grille_remuneration gr
   WHERE gr.code_regle = 'TECHNIQUE_MISE_EN_TERRE'
     AND gr.actif
   ORDER BY gr.updated_at DESC
   LIMIT 1;

  IF coalesce(v_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.plantation_id IS NOT NULL THEN
    v_beneficiary_plantation_id := NEW.plantation_id;
  ELSIF NEW.acquisition_id IS NOT NULL THEN
    SELECT p.id
      INTO v_beneficiary_plantation_id
      FROM public.plantations p
     WHERE p.acquisition_id = NEW.acquisition_id
       AND p.client_id = NEW.client_id
       AND p.role_attribution <> 'proprietaire'
     ORDER BY p.created_at DESC
     LIMIT 1;
  ELSE
    SELECT p.id
      INTO v_beneficiary_plantation_id
      FROM public.plantations p
     WHERE p.client_id = NEW.client_id
       AND p.parcelle_id = NEW.parcelle_id
       AND p.acquisition_id IS NULL
       AND p.role_attribution <> 'proprietaire'
     ORDER BY p.date_plantation DESC NULLS LAST, p.created_at DESC
     LIMIT 1;
  END IF;

  IF v_beneficiary_plantation_id IS NOT NULL THEN
    INSERT INTO public.commissions (
      profile_id, plantation_id, client_id, type_commission,
      montant_base, taux_commission, montant_commission,
      periode, date_calcul, statut, intervention_id
    )
    VALUES (
      v_profile_id, v_beneficiary_plantation_id, NEW.client_id, 'technique',
      v_amount, 0, v_amount,
      coalesce(NEW.date_intervention, current_date), now(), 'validee', NEW.id
    )
    ON CONFLICT (intervention_id, plantation_id, type_commission)
      WHERE intervention_id IS NOT NULL
        AND plantation_id IS NOT NULL
        AND type_commission = 'technique'
    DO NOTHING;
  END IF;

  -- The same intervention also remunerates the technician for the owner's
  -- corresponding plantation surface on a shared parcel.
  IF NEW.parcelle_id IS NOT NULL THEN
    SELECT p.id
      INTO v_owner_plantation_id
      FROM public.plantations p
     WHERE p.parcelle_id = NEW.parcelle_id
       AND p.role_attribution = 'proprietaire'
       AND p.client_id IS NULL
       AND coalesce(p.statut, '') NOT IN ('annule', 'archive', 'supprime')
     ORDER BY p.created_at
     LIMIT 1;

    IF v_owner_plantation_id IS NOT NULL THEN
      INSERT INTO public.commissions (
        profile_id, plantation_id, client_id, type_commission,
        montant_base, taux_commission, montant_commission,
        periode, date_calcul, statut, intervention_id
      )
      VALUES (
        v_profile_id, v_owner_plantation_id, NULL, 'technique',
        v_amount, 0, v_amount,
        coalesce(NEW.date_intervention, current_date), now(), 'validee', NEW.id
      )
      ON CONFLICT (intervention_id, plantation_id, type_commission)
        WHERE intervention_id IS NOT NULL
          AND plantation_id IS NOT NULL
          AND type_commission = 'technique'
      DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generer_commission_technique_a_la_creation_plantation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_intervention record;
  v_amount numeric;
BEGIN
  IF NEW.role_attribution = 'proprietaire' AND NEW.client_id IS NULL THEN
    SELECT gr.montant
      INTO v_amount
      FROM public.grille_remuneration gr
     WHERE gr.code_regle = 'TECHNIQUE_MISE_EN_TERRE'
       AND gr.actif
     ORDER BY gr.updated_at DESC
     LIMIT 1;

    IF coalesce(v_amount, 0) <= 0 THEN
      RETURN NEW;
    END IF;

    -- Backfill the owner-side commission when the owner's plantation is
    -- synchronized after one or more beneficiary lots have been planted.
    FOR v_intervention IN
      SELECT i.id, i.agent_technique_id, i.date_intervention
        FROM public.interventions_techniques i
       WHERE i.parcelle_id = NEW.parcelle_id
         AND i.type_intervention = 'mise_en_terre'
         AND i.statut = 'realisee'
         AND i.agent_technique_id IS NOT NULL
         AND (
           i.acquisition_id IS NULL
           OR NOT EXISTS (
             SELECT 1
               FROM public.acquisitions a
              WHERE a.id = i.acquisition_id
                AND coalesce((a.metadata->>'commission_technique_exoneree')::boolean, false)
           )
         )
    LOOP
      INSERT INTO public.commissions (
        profile_id, plantation_id, client_id, type_commission,
        montant_base, taux_commission, montant_commission,
        periode, date_calcul, statut, intervention_id
      )
      VALUES (
        v_intervention.agent_technique_id, NEW.id, NULL, 'technique',
        v_amount, 0, v_amount,
        coalesce(v_intervention.date_intervention, current_date), now(), 'validee', v_intervention.id
      )
      ON CONFLICT (intervention_id, plantation_id, type_commission)
        WHERE intervention_id IS NOT NULL
          AND plantation_id IS NOT NULL
          AND type_commission = 'technique'
      DO NOTHING;
    END LOOP;

    RETURN NEW;
  END IF;

  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.acquisition_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.acquisitions a
     WHERE a.id = NEW.acquisition_id
       AND coalesce((a.metadata->>'commission_technique_exoneree')::boolean, false)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT i.id, i.agent_technique_id, i.date_intervention
    INTO v_intervention
    FROM public.interventions_techniques i
   WHERE i.client_id = NEW.client_id
     AND i.type_intervention = 'mise_en_terre'
     AND i.statut = 'realisee'
     AND (
       (NEW.acquisition_id IS NOT NULL AND i.acquisition_id = NEW.acquisition_id)
       OR (NEW.acquisition_id IS NULL AND i.parcelle_id = NEW.parcelle_id)
     )
   ORDER BY i.date_intervention DESC NULLS LAST, i.created_at DESC
   LIMIT 1;

  IF v_intervention.id IS NULL OR v_intervention.agent_technique_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT gr.montant
    INTO v_amount
    FROM public.grille_remuneration gr
   WHERE gr.code_regle = 'TECHNIQUE_MISE_EN_TERRE'
     AND gr.actif
   ORDER BY gr.updated_at DESC
   LIMIT 1;

  IF coalesce(v_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.commissions (
    profile_id, plantation_id, client_id, type_commission,
    montant_base, taux_commission, montant_commission,
    periode, date_calcul, statut, intervention_id
  )
  VALUES (
    v_intervention.agent_technique_id, NEW.id, NEW.client_id, 'technique',
    v_amount, 0, v_amount,
    coalesce(v_intervention.date_intervention, NEW.date_plantation, current_date),
    now(), 'validee', v_intervention.id
  )
  ON CONFLICT (intervention_id, plantation_id, type_commission)
    WHERE intervention_id IS NOT NULL
      AND plantation_id IS NOT NULL
      AND type_commission = 'technique'
  DO NOTHING;

  RETURN NEW;
END;
$function$;
