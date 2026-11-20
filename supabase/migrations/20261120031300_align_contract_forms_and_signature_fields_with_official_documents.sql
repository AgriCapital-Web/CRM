ALTER TABLE public.proprietaires_terres
  ADD COLUMN IF NOT EXISTS co_titulaire_type text,
  ADD COLUMN IF NOT EXISTS president_cvgfr_nom text,
  ADD COLUMN IF NOT EXISTS president_cvgfr_qualite text,
  ADD COLUMN IF NOT EXISTS temoin_2_nom text,
  ADD COLUMN IF NOT EXISTS temoin_2_qualite text,
  ADD COLUMN IF NOT EXISTS voisin_3_nom text,
  ADD COLUMN IF NOT EXISTS voisin_3_cote text,
  ADD COLUMN IF NOT EXISTS voisin_4_nom text,
  ADD COLUMN IF NOT EXISTS voisin_4_cote text;

UPDATE public.offres o
SET formules_configuration=(
  SELECT coalesce(jsonb_agg(
    CASE
      WHEN o.famille_offre IN ('PALMINVEST','TERRAPALM') AND f.value->>'code' LIKE '%_AUTONOME'
        THEN jsonb_set(f.value,'{nom}',to_jsonb('Libre'::text))
      WHEN o.famille_offre IN ('PALMINVEST','TERRAPALM') AND f.value->>'code' LIKE '%_DELEGUE'
        THEN jsonb_set(f.value,'{nom}',to_jsonb('Sous gestion'::text))
      ELSE f.value
    END ORDER BY f.ordinality
  ),'[]'::jsonb)
  FROM jsonb_array_elements(o.formules_configuration) WITH ORDINALITY AS f(value,ordinality)
  WHERE NOT (o.famille_offre='PALMTERROIR' AND f.value->>'code'='PALMTERROIR_PERSONNALISEE')
),updated_at=now()
WHERE o.famille_offre IN ('PALMINVEST','TERRAPALM','PALMTERROIR')
  AND o.formules_configuration IS NOT NULL;
