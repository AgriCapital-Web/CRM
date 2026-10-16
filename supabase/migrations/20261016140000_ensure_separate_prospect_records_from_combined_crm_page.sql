-- Keep the combined Leads/Prospects CRM screen while storing each qualified prospect
-- in its own table. The lead remains the origin record and is linked by IDs.
CREATE OR REPLACE FUNCTION public.sync_lead_to_prospect_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_prospect_id uuid;
BEGIN
  IF NEW.etape_pipeline <> 'prospect' OR NEW.prospect_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO v_prospect_id
  FROM public.prospects p
  WHERE p.lead_id = NEW.id
  LIMIT 1;

  IF v_prospect_id IS NULL THEN
    INSERT INTO public.prospects (
      lead_id, client_id, proprietaire_id, nom, prenoms, civilite,
      telephone, whatsapp, email, district_id, region_id, departement_id,
      sous_prefecture_id, village_id, campement_id, region_residence,
      campement_quartier, type_lead, offre_code, formule_code, dispose_terrain,
      superficie_disponible_ha, superficie_a_valoriser_ha, superficie_souhaitee_ha,
      delai_demarrage, date_contact_souhaitee, creneau_prefere, mode_contact_prefere,
      statut, source, assigned_to, created_by, commentaire, created_at, updated_at
    ) VALUES (
      NEW.id, NEW.client_id, NEW.proprietaire_id, NEW.nom, NEW.prenoms, NEW.civilite,
      NEW.telephone, NEW.whatsapp, NEW.email, NEW.district_id, NEW.region_id,
      NEW.departement_id, NEW.sous_prefecture_id, NEW.village_id, NEW.campement_id,
      NEW.region_residence, NEW.campement_quartier, NEW.type_lead, NEW.offre_code,
      NEW.formule_code, COALESCE(NEW.dispose_terrain, false), NEW.superficie_disponible_ha,
      NEW.superficie_a_valoriser_ha, NEW.superficie_souhaitee_ha, NEW.delai_demarrage,
      NEW.date_contact_souhaitee, NEW.creneau_prefere, NEW.mode_contact_prefere,
      CASE WHEN NEW.statut IN ('nouveau','contacte') THEN 'qualifie' ELSE NEW.statut END,
      COALESCE(NEW.source, 'commercial_terrain'), NEW.assigned_to, NEW.created_by,
      NEW.commentaire, COALESCE(NEW.created_at, now()), now()
    )
    ON CONFLICT (lead_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_prospect_id;

    IF v_prospect_id IS NULL THEN
      SELECT p.id INTO v_prospect_id FROM public.prospects p WHERE p.lead_id = NEW.id;
    END IF;
  END IF;

  IF v_prospect_id IS NOT NULL THEN
    UPDATE public.leads SET prospect_id = v_prospect_id
    WHERE id = NEW.id AND prospect_id IS DISTINCT FROM v_prospect_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_to_prospect_record ON public.leads;
CREATE TRIGGER trg_sync_lead_to_prospect_record
AFTER INSERT OR UPDATE OF etape_pipeline, prospect_id ON public.leads
FOR EACH ROW
WHEN (NEW.etape_pipeline = 'prospect')
EXECUTE FUNCTION public.sync_lead_to_prospect_record();

-- Materialize existing leads already marked as prospects, preserving their IDs.
UPDATE public.leads
SET etape_pipeline = 'prospect'
WHERE etape_pipeline = 'prospect'
  AND prospect_id IS NULL;

-- Repair reverse links for prospect records that already existed.
UPDATE public.leads l
SET prospect_id = p.id, updated_at = now()
FROM public.prospects p
WHERE p.lead_id = l.id
  AND l.prospect_id IS DISTINCT FROM p.id;

CREATE INDEX IF NOT EXISTS prospects_lead_id_idx ON public.prospects(lead_id);
