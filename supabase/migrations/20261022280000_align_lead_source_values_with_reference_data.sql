-- Keep the database source constraint synchronized with active source values shown by the CRM.
-- Legacy values remain accepted so historical/imported records are not invalidated.
alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads add constraint leads_source_check
check (source = any (array[
  'formulaire_public',
  'reseaux_sociaux',
  'site_web',
  'commercial_terrain',
  'reference',
  'autre',
  'recommandation',
  'salon_evenement',
  'appel_entrant'
]::text[]);
