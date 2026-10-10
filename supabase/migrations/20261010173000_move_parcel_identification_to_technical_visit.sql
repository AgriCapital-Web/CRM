-- The commercial acquisition flow must not collect parcel identification.
-- The technician records and validates the parcel during the first technical visit.
UPDATE public.offre_formulaire_etapes
SET actif = false,
    updated_at = now()
WHERE code = 'parcelle'
  AND actif = true
  AND offre_id IN (
    SELECT id
    FROM public.offres
    WHERE lower(code) IN ('palm-invest', 'terrapalm', 'terra-palm', 'palmterroir')
  );
