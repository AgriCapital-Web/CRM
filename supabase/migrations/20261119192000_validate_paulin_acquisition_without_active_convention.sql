UPDATE public.acquisitions
SET validation_statut='valide',
    statut='active',
    validation_par='bd9579fd-1d07-4431-9cc4-b57dfeeab593'::uuid,
    validation_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'validation_pdg_sans_convention_active', true,
      'convention_fonciere_a_rattacher_par_direction', true
    )
WHERE id='39be445f-e724-45fa-9770-d779c5dda280'::uuid
  AND client_id='bd329d85-a259-477b-a98e-7058cd982d7f'::uuid
  AND coalesce((metadata->>'foncier_convention_en_attente')::boolean,false)=true;