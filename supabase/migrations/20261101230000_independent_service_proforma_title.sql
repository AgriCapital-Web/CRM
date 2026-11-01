alter table public.independent_service_proformas add column if not exists titre text;
update public.independent_service_proformas set titre = coalesce(nullif(titre, ''), 'Devis ' || reference) where titre is null or titre = '';
