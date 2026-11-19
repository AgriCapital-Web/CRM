UPDATE public.acquisitions a
SET parcelle_id=coalesce(a.parcelle_id,p.parcelle_id),
    statut='active',
    validation_statut='valide',
    updated_at=now()
FROM public.plantations p
WHERE p.acquisition_id=a.id
  AND a.id IN (
    '011e3e08-201a-4e4b-8219-f1e49637283c'::uuid,
    '5aaeadb7-9638-45f8-9f94-7d487ad33dba'::uuid,
    '9063c3fa-143e-4420-a728-f47482232501'::uuid,
    '68a621b8-05be-48a3-8600-9d232af53199'::uuid
  )
  AND a.validation_statut='valide'
  AND a.statut_technique='mise_en_terre_realisee'
  AND p.statut IN ('actif','active','actif');

UPDATE public.clients c
SET parcelle_id=coalesce(c.parcelle_id,a.parcelle_id),
    updated_at=now()
FROM public.acquisitions a
WHERE a.client_id=c.id
  AND a.id IN (
    '011e3e08-201a-4e4b-8219-f1e49637283c'::uuid,
    '5aaeadb7-9638-45f8-9f94-7d487ad33dba'::uuid,
    '9063c3fa-143e-4420-a728-f47482232501'::uuid,
    '68a621b8-05be-48a3-8600-9d232af53199'::uuid
  )
  AND a.parcelle_id IS NOT NULL;

DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.acquisitions
    WHERE id IN (
      '011e3e08-201a-4e4b-8219-f1e49637283c'::uuid,
      '5aaeadb7-9638-45f8-9f94-7d487ad33dba'::uuid,
      '9063c3fa-143e-4420-a728-f47482232501'::uuid,
      '68a621b8-05be-48a3-8600-9d232af53199'::uuid
    )
    AND (statut<>'active' OR validation_statut<>'valide' OR parcelle_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Une acquisition déjà plantée et validée reste incomplète.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.acquisitions
    WHERE validation_statut='valide' AND statut<>'active'
  ) THEN
    RAISE EXCEPTION 'Une acquisition validée reste au statut non actif.';
  END IF;
END;
$assert$;