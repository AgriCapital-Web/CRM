-- The client identity photo and both ID-card sides are captured once in the
-- canonical Client step and persisted in clients + documents_acquisition.
-- Remove their duplicate dynamic-form definitions after the application supports
-- writing canonical identity document records independently of this configuration.
delete from public.offre_formulaire_documents
where code in ('client_photo_profil', 'client_piece_recto', 'client_piece_verso');

-- An offer that has several configured formulas must not advertise its own offer
-- name/code as though it were a selectable formula.
update public.offres
set formule_code = null,
    formule_nom = null,
    updated_at = now()
where jsonb_typeof(formules_configuration) = 'array'
  and jsonb_array_length(formules_configuration) > 1
  and (formule_code = code or formule_nom = nom);

-- Repair client formula labels from the authoritative formula configuration
-- whenever a real formula code is already present.
update public.clients c
set formule_nom = formula.value->>'nom',
    updated_at = now()
from public.offres o
cross join lateral jsonb_array_elements(o.formules_configuration) as formula(value)
where c.offre_id = o.id
  and c.formule_code = formula.value->>'code'
  and c.formule_nom is distinct from formula.value->>'nom';

-- Safely infer a legacy formula only when its stored contract price matches
-- exactly one configured formula. Ambiguous legacy rows are left for review.
with formula_candidates as (
  select
    c.id as client_id,
    formula.value->>'code' as formula_code,
    formula.value->>'nom' as formula_nom,
    count(*) over (partition by c.id) as candidate_count
  from public.clients c
  join public.offres o on o.id = c.offre_id
  cross join lateral jsonb_array_elements(o.formules_configuration) as formula(value)
  where (c.formule_code is null or c.formule_code = o.code)
    and (c.formule_nom is null or c.formule_nom = o.nom)
    and coalesce(c.total_hectares, 0) > 0
    and coalesce(c.montant_total_contrat, 0) > 0
    and abs(
      (c.montant_total_contrat / nullif(c.total_hectares, 0))
      - coalesce(
          nullif(formula.value->>'montant_total_par_ha', '')::numeric,
          nullif(formula.value->>'montant_cash_par_ha', '')::numeric
        )
    ) < 0.01
)
update public.clients c
set formule_code = candidate.formula_code,
    formule_nom = candidate.formule_nom,
    updated_at = now()
from formula_candidates candidate
where candidate.client_id = c.id
  and candidate.candidate_count = 1;

-- Do not keep the offer's generic name as a false formula on old client rows.
-- Valid formula codes were normalized above; unresolved cases remain explicitly
-- blank and are displayed as "Formule à vérifier" by the CRM UI.
update public.clients c
set formule_code = null,
    formule_nom = null,
    updated_at = now()
from public.offres o
where c.offre_id = o.id
  and (c.formule_code = o.code or c.formule_nom = o.nom)
  and not exists (
    select 1
    from jsonb_array_elements(o.formules_configuration) as formula(value)
    where formula.value->>'code' = c.formule_code
  );

-- Repair offer links for legacy client rows where the stored parcours code maps
-- unambiguously to one offer, without guessing the selected formula.
with offer_matches as (
  select c.id as client_id, min(o.id::text)::uuid as offre_id, count(*) as match_count
  from public.clients c
  join public.offres o
    on regexp_replace(upper(coalesce(nullif(trim(o.parcours_code), ''), nullif(trim(o.famille_offre), ''), o.code)), '[^A-Z0-9]', '', 'g')
     = regexp_replace(upper(coalesce(nullif(trim(c.parcours_code), ''), '')), '[^A-Z0-9]', '', 'g')
  where c.offre_id is null
    and nullif(trim(c.parcours_code), '') is not null
  group by c.id
)
update public.clients c
set offre_id = matched.offre_id,
    famille_offre = coalesce(c.famille_offre, o.famille_offre),
    updated_at = now()
from offer_matches matched
join public.offres o on o.id = matched.offre_id
where c.id = matched.client_id
  and matched.match_count = 1;

-- Keep the residence text available in the canonical residence field for
-- older records that only populated domicile.
update public.clients
set domicile_residence = coalesce(nullif(trim(domicile_residence), ''), nullif(trim(domicile), ''), nullif(trim(localite), '')),
    updated_at = now()
where nullif(trim(domicile_residence), '') is null
  and coalesce(nullif(trim(domicile), ''), nullif(trim(localite), '')) is not null;
