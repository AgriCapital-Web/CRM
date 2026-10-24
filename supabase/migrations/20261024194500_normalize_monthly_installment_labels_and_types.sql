update public.offres
set tranches_paiement = replace(tranches_paiement::text, '"mensualite_unique"', '"mensualite"')::jsonb
where tranches_paiement::text like '%mensualite_unique%';
update public.offres
set formules_configuration = replace(formules_configuration::text, '"mensualite_unique"', '"mensualite"')::jsonb
where formules_configuration::text like '%mensualite_unique%';