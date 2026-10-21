-- Keep the selected offer separate from its configured formula and remove duplicate
-- identity-file payloads from saved acquisition drafts without discarding their previews.

with formula_matches as (
  select
    c.id as client_id,
    f.value->>'code' as formula_code,
    f.value->>'nom' as formula_name,
    row_number() over (
      partition by c.id
      order by abs(
        (c.montant_total_contrat / nullif(c.total_hectares, 0))
        - nullif(coalesce(f.value->>'montant_total_par_ha', f.value->>'montant_cash_par_ha'), '')::numeric
      )
    ) as rank
  from public.clients c
  join public.offres o on o.id = c.offre_id
  cross join lateral jsonb_array_elements(coalesce(o.formules_configuration, '[]'::jsonb)) as f(value)
  where c.total_hectares > 0
    and nullif(coalesce(f.value->>'montant_total_par_ha', f.value->>'montant_cash_par_ha'), '') is not null
    and abs(
      (c.montant_total_contrat / nullif(c.total_hectares, 0))
      - nullif(coalesce(f.value->>'montant_total_par_ha', f.value->>'montant_cash_par_ha'), '')::numeric
    ) < 0.01
    and (
      c.formule_code is null
      or c.formule_code = o.code
      or c.formule_nom = o.nom
    )
)
update public.clients c
set formule_code = m.formula_code,
    formule_nom = m.formula_name
from formula_matches m
where m.client_id = c.id
  and m.rank = 1;

-- If the old value was merely the offer name and no configured formula can be
-- proven from the recorded price, clear the false formula label rather than guess.
update public.clients c
set formule_code = null,
    formule_nom = null
from public.offres o
where o.id = c.offre_id
  and (c.formule_code = o.code or c.formule_nom = o.nom)
  and not exists (
    select 1
    from jsonb_array_elements(coalesce(o.formules_configuration, '[]'::jsonb)) as f(value)
    where c.total_hectares > 0
      and nullif(coalesce(f.value->>'montant_total_par_ha', f.value->>'montant_cash_par_ha'), '') is not null
      and abs(
        (c.montant_total_contrat / nullif(c.total_hectares, 0))
        - nullif(coalesce(f.value->>'montant_total_par_ha', f.value->>'montant_cash_par_ha'), '')::numeric
      ) < 0.01
  );

-- Older multi-step drafts stored the same three identity images twice: once in the
-- Client step and again as separate "Documents" fields. Keep canonical previews
-- and remove duplicate JSON keys. The client reconstructs File objects from previews.
update public.acquisitions_brouillon b
set donnees = (
  (
    b.donnees
    || jsonb_strip_nulls(jsonb_build_object(
      'photo_profil_preview', coalesce(nullif(b.donnees->>'photo_profil_preview', ''), b.donnees->>'doc_client_photo_profil_preview'),
      'photo_piece_recto_preview', coalesce(nullif(b.donnees->>'photo_piece_recto_preview', ''), b.donnees->>'doc_client_piece_recto_preview'),
      'photo_piece_verso_preview', coalesce(nullif(b.donnees->>'photo_piece_verso_preview', ''), b.donnees->>'doc_client_piece_verso_preview')
    ))
  )
  - array[
    'photo_profil_file','photo_piece_recto_file','photo_piece_verso_file',
    'doc_client_photo_profil_file','doc_client_photo_profil_preview',
    'doc_client_piece_recto_file','doc_client_piece_recto_preview',
    'doc_client_piece_verso_file','doc_client_piece_verso_preview'
  ]::text[]
)
where b.donnees ?| array[
  'doc_client_photo_profil_file','doc_client_photo_profil_preview',
  'doc_client_piece_recto_file','doc_client_piece_recto_preview',
  'doc_client_piece_verso_file','doc_client_piece_verso_preview'
];
