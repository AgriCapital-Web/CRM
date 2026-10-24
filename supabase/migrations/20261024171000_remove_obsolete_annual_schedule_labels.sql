begin;
update public.offres o
set formules_configuration = (
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(f.value->'tranches_paiement')='array' then
        jsonb_set(
          f.value - 'annee',
          '{tranches_paiement}',
          (select coalesce(jsonb_agg(t.value - 'annee' order by t.ord),'[]'::jsonb)
             from jsonb_array_elements(f.value->'tranches_paiement') with ordinality t(value,ord)),
          true
        )
      else f.value - 'annee'
    end order by f.ord
  ),'[]'::jsonb)
  from jsonb_array_elements(o.formules_configuration) with ordinality f(value,ord)
)
where jsonb_typeof(o.formules_configuration)='array';

update public.offres o
set tranches_paiement = (
  select coalesce(jsonb_agg(t.value - 'annee' order by t.ord),'[]'::jsonb)
  from jsonb_array_elements(o.tranches_paiement) with ordinality t(value,ord)
)
where jsonb_typeof(o.tranches_paiement)='array';

update public.acquisitions a
set echeancier = (
  select coalesce(jsonb_agg(t.value - 'annee' order by t.ord),'[]'::jsonb)
  from jsonb_array_elements(a.echeancier) with ordinality t(value,ord)
)
where jsonb_typeof(a.echeancier)='array';
commit;